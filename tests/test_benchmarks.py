from __future__ import annotations

import json
import multiprocessing
import os
from pathlib import Path
import subprocess
import sys
import csv
import importlib.util
import json as json_module

import pytest

from griductive.domain.models import CellId, Status
from griductive.engine import list_puzzles_from_sqlite, save_puzzle_to_sqlite
from griductive.logic.agent.models import (
    DeductionResult,
    DeductionStepTrace,
    SolverStatsSnapshot,
    TerminalStatus,
)
from griductive.experiments.benchmark import (
    BenchmarkRow,
    _row_from_result,
    _run_worker,
    run_case,
    write_csv,
    write_markdown,
    write_metadata,
)
import griductive.experiments.benchmark as benchmark_module


def _slow_worker(connection, release_event, pid_path: str) -> None:
    Path(pid_path).write_text(str(os.getpid()), encoding="utf-8")
    release_event.wait()


def _crashing_worker(connection) -> None:
    os._exit(17)


def _benchmark_worker_is_alive() -> bool:
    return any(
        child.name == "GriductiveBenchmarkWorker" and child.is_alive()
        for child in multiprocessing.active_children()
    )


def test_real_solver_case_metrics_and_ground_truth() -> None:
    solved = run_case("daily_3x3_hard", repeat=1, timeout_ms=10_000)
    repeated = run_case("daily_3x3_hard", repeat=2, timeout_ms=10_000)
    sample = run_case("sample_3x3", repeat=1, timeout_ms=10_000)

    assert (solved.outcome, solved.deduction_steps, solved.solved_count) == (
        "SOLVED",
        7,
        9,
    )
    assert (repeated.outcome, repeated.deduction_steps, repeated.solved_count) == (
        solved.outcome,
        solved.deduction_steps,
        solved.solved_count,
    )
    assert (sample.outcome, sample.deduction_steps, sample.solved_count) == ("SOLVED", 8, 9)

    for row in (solved, repeated, sample):
        assert row.size == 3
        assert row.total_cells == 9
        for metric in (
            row.primary_vars,
            row.aux_vars,
            row.clause_count,
            row.sat_queries,
            row.decisions,
            row.propagations,
            row.backtracks,
            row.deduction_steps,
            row.runtime_ms,
            row.process_elapsed_ms,
        ):
            assert metric is not None and metric >= 0


def test_result_uses_aggregate_metrics_including_final_scan() -> None:
    trace = DeductionStepTrace(
        step=1,
        active_clue_ids=("CLUE-A1",),
        sat_queries=2,
        verdict_cell=CellId.from_label("A2"),
        verdict_status=Status.CRIMINAL,
        new_clue_id="CLUE-A2",
        primary_vars_count=9,
        aux_vars_count=3,
        clause_count=41,
        stats=SolverStatsSnapshot(decisions=1, propagations=2, backtracks=0),
    )
    result = DeductionResult(
        terminal_status=TerminalStatus.STUCK_NO_FORCIBLE_MOVE,
        steps=(trace,),
        total_sat_queries=13,
        total_stats=SolverStatsSnapshot(decisions=7, propagations=19, backtracks=4),
        total_wall_time_ms=12.5,
        max_primary_vars=9,
        max_aux_vars=5,
        max_clauses=83,
    )

    row = _row_from_result(
        puzzle_id="fixture",
        size=3,
        repeat=1,
        result=result,
        solved_count=4,
    )

    assert row.sat_queries == 13
    assert (row.decisions, row.propagations, row.backtracks) == (7, 19, 4)
    assert (row.primary_vars, row.aux_vars, row.clause_count) == (9, 5, 83)
    assert row.deduction_steps == 1
    assert row.sat_queries > sum(step.sat_queries for step in result.steps)


def test_initially_solved_puzzle_does_not_report_a_fake_step(tmp_path: Path) -> None:
    source_path = Path(__file__).resolve().parents[1] / "data" / "puzzle" / "sample_3x3.json"
    puzzle = json.loads(source_path.read_text(encoding="utf-8"))
    puzzle["puzzle_id"] = "benchmark_already_solved"
    puzzle["initial_revealed"] = [entry["cell"] for entry in puzzle["grid"]]
    db_path = tmp_path / "already-solved.db"
    save_puzzle_to_sqlite(puzzle, db_path=db_path)

    row = run_case("benchmark_already_solved", db_path=str(db_path), timeout_ms=10_000)

    assert row.outcome == "SOLVED"
    assert row.deduction_steps == 0
    assert row.solved_count == row.total_cells == 9
    assert row.sat_queries == 0


def test_invalid_puzzle_is_error_with_original_error_text() -> None:
    row = run_case("missing_benchmark_puzzle", timeout_ms=10_000)

    assert row.outcome == "ERROR"
    assert row.error is not None and "not found" in row.error.lower()
    assert row.solved_count is None
    assert row.runtime_ms is None
    assert row.process_elapsed_ms is not None
    assert all(
        getattr(row, field) is None
        for field in (
            "total_cells",
            "primary_vars",
            "aux_vars",
            "clause_count",
            "sat_queries",
            "decisions",
            "propagations",
            "backtracks",
            "deduction_steps",
        )
    )


def test_timeout_result_has_null_solver_metrics(monkeypatch: pytest.MonkeyPatch) -> None:
    def timeout_worker(*args, **kwargs):
        return "TIMEOUT", None, 23.0, "deadline exceeded"

    monkeypatch.setattr("griductive.experiments.benchmark._run_worker", timeout_worker)
    row = run_case("daily_3x3_hard", timeout_ms=1)

    assert row.outcome == "TIMEOUT"
    assert row.error == "deadline exceeded"
    assert row.size == 3 and row.total_cells == 9
    assert row.solved_count is None and row.runtime_ms is None
    assert all(
        getattr(row, field) is None
        for field in (
            "primary_vars",
            "aux_vars",
            "clause_count",
            "sat_queries",
            "decisions",
            "propagations",
            "backtracks",
            "deduction_steps",
        )
    )
    assert row.process_elapsed_ms == 23.0


def test_worker_timeout_terminates_and_joins_spawned_process(tmp_path: Path) -> None:
    release_event = multiprocessing.get_context("spawn").Event()
    pid_path = tmp_path / "worker.pid"

    status, row, elapsed_ms, error = _run_worker(
        _slow_worker,
        args=(release_event, str(pid_path)),
        timeout_ms=1_500,
    )

    assert status == "TIMEOUT"
    assert row is None
    assert elapsed_ms >= 0
    assert error is not None and "timed out" in error.lower()
    assert pid_path.exists()
    assert not _benchmark_worker_is_alive()


def test_worker_crash_returns_error_and_reaps_process() -> None:
    status, row, elapsed_ms, error = _run_worker(
        _crashing_worker,
        args=(),
        timeout_ms=10_000,
    )

    assert status == "ERROR"
    assert row is None
    assert elapsed_ms >= 0
    assert error is not None and "17" in error
    assert not _benchmark_worker_is_alive()


def _row(
    puzzle_id: str,
    size: int,
    repeat: int,
    outcome: str,
    runtime_ms: float | None,
    error: str | None = None,
) -> BenchmarkRow:
    has_metrics = outcome not in {"TIMEOUT", "ERROR"}
    return BenchmarkRow(
        puzzle_id=puzzle_id,
        size=size,
        repeat=repeat,
        outcome=outcome,
        solved_count=9 if has_metrics else None,
        total_cells=size * size,
        primary_vars=9 if has_metrics else None,
        aux_vars=2 if has_metrics else None,
        clause_count=30 if has_metrics else None,
        sat_queries=12 if has_metrics else None,
        decisions=3 if has_metrics else None,
        propagations=8 if has_metrics else None,
        backtracks=1 if has_metrics else None,
        deduction_steps=4 if has_metrics else None,
        runtime_ms=runtime_ms,
        process_elapsed_ms=10.0,
        error=error,
    )


def test_csv_roundtrip_has_spec_column_order_repeat_rows_and_blank_nulls(
    tmp_path: Path,
) -> None:
    rows = [
        _row("daily_3x3_hard", 3, 1, "SOLVED", 10.0),
        _row("daily_3x3_hard", 3, 2, "SOLVED", 12.0),
        _row("slow", 3, 1, "TIMEOUT", None, "Timed out"),
    ]
    path = tmp_path / "nested" / "results.csv"

    write_csv(rows, path)

    with path.open(encoding="utf-8", newline="") as stream:
        reader = csv.DictReader(stream)
        records = list(reader)
        assert reader.fieldnames == [
            "puzzle_id",
            "size",
            "repeat",
            "outcome",
            "solved_count",
            "total_cells",
            "primary_vars",
            "aux_vars",
            "clause_count",
            "sat_queries",
            "decisions",
            "propagations",
            "backtracks",
            "deduction_steps",
            "runtime_ms",
            "process_elapsed_ms",
            "error",
        ]
    assert [record["repeat"] for record in records] == ["1", "2", "1"]
    assert records[2]["runtime_ms"] == ""
    assert records[2]["solved_count"] == ""
    assert records[2]["sat_queries"] == ""


def test_markdown_lists_outcomes_and_separates_medians_and_escapes_errors(
    tmp_path: Path,
) -> None:
    rows = [
        _row("daily_3x3_hard", 3, 1, "SOLVED", 10.0),
        _row("daily_3x3_hard", 3, 2, "SOLVED", 20.0),
        _row("sample_3x3", 3, 1, "STUCK_NO_FORCIBLE_MOVE", 30.0),
        _row("slow", 3, 1, "TIMEOUT", None),
        _row("broken", 3, 1, "ERROR", None, "parse failed|line\nbreak"),
    ]
    path = tmp_path / "results.md"

    write_markdown(rows, path)

    markdown = path.read_text(encoding="utf-8")
    assert "SOLVED" in markdown
    assert "STUCK_NO_FORCIBLE_MOVE" in markdown
    assert "TIMEOUT" in markdown
    assert "ERROR" in markdown
    assert "parse failed\\|line break" in markdown
    assert "| daily_3x3_hard | SOLVED | 2 | 15.0 |" in markdown
    assert "| sample_3x3 | STUCK_NO_FORCIBLE_MOVE | 1 | 30.0 |" in markdown
    assert "| slow | TIMEOUT | 1 |  |" in markdown


def test_metadata_records_reproducibility_fields_when_git_is_unavailable(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def no_git(*args, **kwargs):
        raise FileNotFoundError("git is unavailable")

    monkeypatch.setattr(benchmark_module.subprocess, "run", no_git)
    path = tmp_path / "benchmark_metadata.json"

    write_metadata(path, args={"size": 5, "repeats": 2})

    metadata = json_module.loads(path.read_text(encoding="utf-8"))
    assert metadata["solver_class"].endswith("DPLLSolver")
    assert metadata["git_head"] is None
    assert metadata["git_dirty_paths"] is None
    assert metadata["args"] == {"size": 5, "repeats": 2}
    assert metadata["python"]
    assert metadata["platform"]
    assert metadata["cpu"]
    assert "timestamp_utc" in metadata


def _load_cli_module():
    script = Path(__file__).resolve().parents[1] / "scripts" / "run_benchmarks.py"
    spec = importlib.util.spec_from_file_location("griductive_run_benchmarks", script)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run_cli(*args: str, timeout: int = 60) -> subprocess.CompletedProcess[str]:
    script = Path(__file__).resolve().parents[1] / "scripts" / "run_benchmarks.py"
    return subprocess.run(
        [sys.executable, str(script), *args],
        cwd=Path(__file__).resolve().parents[1],
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def test_default_selector_returns_all_puzzles_by_size() -> None:
    cli = _load_cli_module()

    selected = cli._select_puzzles(list_puzzles_from_sqlite(), size=None, puzzle_ids=None)

    assert len(selected) == 26
    assert {size: sum(row["size"] == size for row in selected) for size in (3, 4, 5)} == {
        3: 10,
        4: 8,
        5: 8,
    }


def test_cli_repeats_real_solver_case_and_writes_three_outputs(tmp_path: Path) -> None:
    output_dir = tmp_path / "successful-run"

    completed = _run_cli(
        "--puzzle-id",
        "daily_3x3_hard",
        "--repeats",
        "2",
        "--output-dir",
        str(output_dir),
    )

    assert completed.returncode == 0, completed.stderr
    csv_path = output_dir / "benchmark_results.csv"
    markdown_path = output_dir / "benchmark_results.md"
    metadata_path = output_dir / "benchmark_metadata.json"
    assert csv_path.exists() and markdown_path.exists() and metadata_path.exists()
    with csv_path.open(encoding="utf-8", newline="") as stream:
        records = list(csv.DictReader(stream))
    assert len(records) == 2
    assert [record["repeat"] for record in records] == ["1", "2"]
    assert {record["outcome"] for record in records} == {"SOLVED"}
    assert json_module.loads(metadata_path.read_text(encoding="utf-8"))["args"]["repeats"] == 2


@pytest.mark.parametrize(
    "arguments",
    [
        ("--puzzle-id", "does-not-exist"),
        ("--size", "6"),
        ("--repeats", "0"),
        ("--timeout-ms", "0"),
        ("--size", "4", "--puzzle-id", "daily_3x3_hard"),
    ],
)
def test_cli_invalid_selection_or_numeric_arguments_exit_two(
    arguments: tuple[str, ...],
) -> None:
    completed = _run_cli(*arguments)

    assert completed.returncode == 2
    assert completed.stderr


def test_cli_size_five_selects_all_and_keeps_going_after_timeouts(
    tmp_path: Path,
) -> None:
    output_dir = tmp_path / "timed-out-run"

    completed = _run_cli(
        "--size",
        "5",
        "--timeout-ms",
        "1",
        "--output-dir",
        str(output_dir),
    )

    assert completed.returncode == 1
    with (output_dir / "benchmark_results.csv").open(encoding="utf-8", newline="") as stream:
        records = list(csv.DictReader(stream))
    assert len(records) == 8
    assert {record["outcome"] for record in records} == {"TIMEOUT"}
    assert all(record["runtime_ms"] == "" and record["solved_count"] == "" for record in records)


def test_cli_records_worker_error_and_continues_to_next_puzzle(tmp_path: Path) -> None:
    source = Path(__file__).resolve().parents[1] / "data" / "puzzle"
    daily = json.loads((source / "daily_3x3_hard.json").read_text(encoding="utf-8"))
    broken = {
        "puzzle_id": "broken_puzzle",
        "size": 3,
        "initial_revealed": [],
        "grid": [],
    }
    db_path = tmp_path / "benchmarks.db"
    save_puzzle_to_sqlite(daily, db_path=db_path)
    save_puzzle_to_sqlite(broken, db_path=db_path)
    output_dir = tmp_path / "error-run"

    completed = _run_cli(
        "--puzzle-id",
        "broken_puzzle",
        "--puzzle-id",
        "daily_3x3_hard",
        "--db-path",
        str(db_path),
        "--output-dir",
        str(output_dir),
    )

    assert completed.returncode == 1
    with (output_dir / "benchmark_results.csv").open(encoding="utf-8", newline="") as stream:
        records = list(csv.DictReader(stream))
    assert [record["puzzle_id"] for record in records] == ["broken_puzzle", "daily_3x3_hard"]
    assert [record["outcome"] for record in records] == ["ERROR", "SOLVED"]
    assert "Missing grid definition" in records[0]["error"]


@pytest.mark.parametrize(
    ("puzzle_id", "expected_outcome"),
    [
        ("benchmark_inconsistent", "INCONSISTENT"),
        ("benchmark_engine_rejected", "ENGINE_REJECTED"),
    ],
)
def test_cli_fails_for_each_non_success_terminal_and_keeps_solved_row(
    tmp_path: Path,
    puzzle_id: str,
    expected_outcome: str,
) -> None:
    puzzle_dir = Path(__file__).resolve().parents[1] / "data" / "puzzle"
    sample_path = puzzle_dir / "sample_3x3.json"
    db_path = tmp_path / "terminal-outcomes.db"
    output_dir = tmp_path / "terminal-outcomes"

    puzzle = json.loads(sample_path.read_text(encoding="utf-8"))
    puzzle["puzzle_id"] = puzzle_id
    puzzle["initial_revealed"] = ["A1"]
    if expected_outcome == "INCONSISTENT":
        puzzle["grid"][0]["clue"] = {
            "type": "FACT",
            "target": "A1",
            "status": "CRIMINAL",
        }
    else:
        puzzle["grid"][0]["clue"] = {
            "type": "FACT",
            "target": "A2",
            "status": "CRIMINAL",
        }
        puzzle["grid"][3]["status"] = "INNOCENT"
    save_puzzle_to_sqlite(puzzle, db_path=db_path)

    daily = json.loads((puzzle_dir / "daily_3x3_hard.json").read_text(encoding="utf-8"))
    save_puzzle_to_sqlite(daily, db_path=db_path)

    completed = _run_cli(
        "--puzzle-id",
        puzzle_id,
        "--puzzle-id",
        "daily_3x3_hard",
        "--db-path",
        str(db_path),
        "--output-dir",
        str(output_dir),
    )

    with (output_dir / "benchmark_results.csv").open(encoding="utf-8", newline="") as stream:
        records = list(csv.DictReader(stream))
    assert len(records) == 2
    assert {record["puzzle_id"]: record["outcome"] for record in records} == {
        puzzle_id: expected_outcome,
        "daily_3x3_hard": "SOLVED",
    }
    assert completed.returncode == 1


def test_ambiguous_benchmark_reports_stuck(tmp_path, ambiguous_puzzle_data) -> None:
    db_path = tmp_path / "ambiguous.db"
    save_puzzle_to_sqlite(ambiguous_puzzle_data, db_path=db_path)

    row = run_case("ambiguous_2x2", db_path=str(db_path), timeout_ms=10_000)

    assert row.outcome == "STUCK_NO_FORCIBLE_MOVE"
    assert row.deduction_steps == 0
    assert row.solved_count == 1
    assert row.total_cells == 4
    assert row.sat_queries > 0
