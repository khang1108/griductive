from __future__ import annotations

import csv
from dataclasses import dataclass, replace
from datetime import datetime, timezone
import json
import multiprocessing
from multiprocessing.connection import wait
import platform
from pathlib import Path
import statistics
import subprocess
import sys
import time
from typing import Any, Mapping, Sequence

from griductive.engine import GameEngine, list_puzzles_from_sqlite, load_puzzle_from_sqlite
from griductive.logic.agent import DeductionResult, LogicAgent
from griductive.logic.cnf import CNFEncoder
from griductive.logic.sat import DPLLSolver


CSV_COLUMNS = (
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
)

@dataclass(frozen=True)
class BenchmarkRow:
    puzzle_id: str
    size: int | None
    repeat: int
    outcome: str
    solved_count: int | None
    total_cells: int | None
    primary_vars: int | None
    aux_vars: int | None
    clause_count: int | None
    sat_queries: int | None
    decisions: int | None
    propagations: int | None
    backtracks: int | None
    deduction_steps: int | None
    runtime_ms: float | None
    process_elapsed_ms: float | None
    error: str | None


def _row_from_result(
    *,
    puzzle_id: str,
    size: int,
    repeat: int,
    result: DeductionResult,
    solved_count: int,
) -> BenchmarkRow:
    stats = result.total_stats
    return BenchmarkRow(
        puzzle_id=puzzle_id,
        size=size,
        repeat=repeat,
        outcome=result.terminal_status.value,
        solved_count=solved_count,
        total_cells=size * size,
        primary_vars=result.max_primary_vars,
        aux_vars=result.max_aux_vars,
        clause_count=result.max_clauses,
        sat_queries=result.total_sat_queries,
        decisions=stats.decisions,
        propagations=stats.propagations,
        backtracks=stats.backtracks,
        deduction_steps=len(result.steps),
        runtime_ms=result.total_wall_time_ms,
        process_elapsed_ms=None,
        error=None,
    )


def _error_row(
    puzzle_id: str,
    repeat: int,
    error: str,
    *,
    size: int | None = None,
    process_elapsed_ms: float | None = None,
) -> BenchmarkRow:
    return BenchmarkRow(
        puzzle_id=puzzle_id,
        size=size,
        repeat=repeat,
        outcome="ERROR",
        solved_count=None,
        total_cells=size * size if size is not None else None,
        primary_vars=None,
        aux_vars=None,
        clause_count=None,
        sat_queries=None,
        decisions=None,
        propagations=None,
        backtracks=None,
        deduction_steps=None,
        runtime_ms=None,
        process_elapsed_ms=process_elapsed_ms,
        error=error,
    )


def solve_case(
    puzzle_id: str,
    db_path: str | None,
    repeat: int,
) -> BenchmarkRow:
    """Run one puzzle using a fresh engine, CNF encoder, solver, and agent."""
    size: int | None = None
    try:
        puzzle = load_puzzle_from_sqlite(puzzle_id, db_path=db_path)
        size = puzzle.size
        engine = GameEngine(puzzle)
        agent = LogicAgent(encoder=CNFEncoder(), solver=DPLLSolver())
        result = agent.run_logic_loop(engine)
        solved_count = len(engine.get_public_state().known_statuses())
        return _row_from_result(
            puzzle_id=puzzle_id,
            size=size,
            repeat=repeat,
            result=result,
            solved_count=solved_count,
        )
    except Exception as exc:
        return _error_row(
            puzzle_id,
            repeat,
            f"{type(exc).__name__}: {exc}",
            size=size,
        )


def case_worker(
    connection: Any,
    puzzle_id: str,
    db_path: str | None,
    repeat: int,
) -> None:
    """Spawn entry point that returns a compact aggregate row over a pipe."""
    try:
        row = solve_case(puzzle_id, db_path, repeat)
        connection.send(("RESULT", row, None))
    except Exception as exc:
        connection.send(("ERROR", None, f"{type(exc).__name__}: {exc}"))
    finally:
        connection.close()


def _run_worker(
    worker: Any,
    *,
    args: tuple[Any, ...],
    timeout_ms: int,
) -> tuple[str, BenchmarkRow | None, float, str | None]:
    """Run a worker in a spawned process with a hard parent-enforced deadline."""
    started = time.monotonic()
    deadline = started + timeout_ms / 1000.0
    status = "ERROR"
    row: BenchmarkRow | None = None
    error: str | None = None
    process: multiprocessing.Process | None = None
    parent_connection = None
    child_connection = None

    try:
        context = multiprocessing.get_context("spawn")
        parent_connection, child_connection = context.Pipe(duplex=False)
        process = context.Process(
            target=worker,
            args=(child_connection, *args),
            name="GriductiveBenchmarkWorker",
        )
        process.start()
        child_connection.close()

        ready = wait(
            [parent_connection, process.sentinel],
            timeout=max(0.0, deadline - time.monotonic()),
        )
        if parent_connection in ready or parent_connection.poll(0):
            try:
                payload = parent_connection.recv()
            except EOFError:
                payload = None

            if (
                not isinstance(payload, tuple)
                or len(payload) != 3
                or payload[0] not in {"RESULT", "ERROR"}
            ):
                status = "ERROR"
                error = "Worker exited without a valid result."
            else:
                message_status, message_row, message_error = payload
                if message_status == "RESULT" and isinstance(message_row, BenchmarkRow):
                    status = "RESULT"
                    row = message_row
                    error = message_error
                else:
                    status = "ERROR"
                    error = str(message_error or "Worker reported an error.")

            exited = wait(
                [process.sentinel],
                timeout=max(0.0, deadline - time.monotonic()),
            )
            if not exited:
                status = "TIMEOUT"
                row = None
                error = f"Timed out after {timeout_ms} ms."
            else:
                process.join()
                if process.exitcode != 0:
                    status = "ERROR"
                    row = None
                    error = f"Worker exited with code {process.exitcode} after sending a result."
        elif process.sentinel in ready:
            process.join()
            if parent_connection.poll(0):
                try:
                    payload = parent_connection.recv()
                except EOFError:
                    payload = None
                if (
                    isinstance(payload, tuple)
                    and len(payload) == 3
                    and payload[0] == "RESULT"
                    and isinstance(payload[1], BenchmarkRow)
                ):
                    status, row, error = "RESULT", payload[1], payload[2]
                else:
                    status = "ERROR"
                    error = str(payload[2] if isinstance(payload, tuple) and len(payload) == 3 else "Worker exited without a result.")
            else:
                status = "ERROR"
                error = f"Worker exited with code {process.exitcode} without a result."
        else:
            status = "TIMEOUT"
            error = f"Timed out after {timeout_ms} ms."
    except Exception as exc:
        status = "ERROR"
        row = None
        error = f"{type(exc).__name__}: {exc}"
    finally:
        if child_connection is not None:
            child_connection.close()
        if parent_connection is not None:
            parent_connection.close()
        if process is not None and process.pid is not None:
            if process.is_alive():
                process.terminate()
                process.join(timeout=1.0)
                if process.is_alive():
                    process.kill()
            process.join()

    elapsed_ms = (time.monotonic() - started) * 1000.0
    return status, row, elapsed_ms, error


def run_case(
    puzzle_id: str,
    *,
    db_path: str | None = None,
    repeat: int = 1,
    timeout_ms: int = 10_000,
) -> BenchmarkRow:
    """Run one isolated benchmark case and preserve parent-side timing."""
    try:
        normalized_id = puzzle_id.removesuffix(".json")
        metadata = next(
            (
                puzzle
                for puzzle in list_puzzles_from_sqlite(db_path)
                if puzzle["puzzle_id"] == normalized_id
            ),
            None,
        )
        size = metadata["size"] if metadata is not None else None
    except Exception as exc:
        return _error_row(puzzle_id, repeat, f"{type(exc).__name__}: {exc}")

    status, result_row, elapsed_ms, error = _run_worker(
        case_worker,
        args=(puzzle_id, db_path, repeat),
        timeout_ms=timeout_ms,
    )

    if status == "RESULT" and result_row is not None:
        return replace(
            result_row,
            size=result_row.size if result_row.size is not None else size,
            total_cells=(result_row.total_cells if result_row.total_cells is not None else size * size if size is not None else None),
            process_elapsed_ms=elapsed_ms,
        )

    if status == "TIMEOUT":
        return BenchmarkRow(
            puzzle_id=puzzle_id,
            size=size,
            repeat=repeat,
            outcome="TIMEOUT",
            solved_count=None,
            total_cells=size * size if size is not None else None,
            primary_vars=None,
            aux_vars=None,
            clause_count=None,
            sat_queries=None,
            decisions=None,
            propagations=None,
            backtracks=None,
            deduction_steps=None,
            runtime_ms=None,
            process_elapsed_ms=elapsed_ms,
            error=error or f"Timed out after {timeout_ms} ms.",
        )

    return _error_row(
        puzzle_id,
        repeat,
        error or "Worker failed before returning a result.",
        size=size,
        process_elapsed_ms=elapsed_ms,
    )


def write_csv(rows: Sequence[BenchmarkRow], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        for row in rows:
            writer.writerow({column: getattr(row, column) for column in CSV_COLUMNS})


def _markdown_cell(value: Any) -> str:
    if value is None:
        return ""
    return (
        str(value)
        .replace("\\", "\\\\")
        .replace("\r\n", " ")
        .replace("\n", " ")
        .replace("\r", " ")
        .replace("|", "\\|")
    )


def write_markdown(rows: Sequence[BenchmarkRow], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = ["# Griductive benchmark results", "", "## Runs", ""]
    lines.append("| " + " | ".join(CSV_COLUMNS) + " |")
    lines.append("| " + " | ".join("---" for _ in CSV_COLUMNS) + " |")
    for row in rows:
        values = [_markdown_cell(getattr(row, column)) for column in CSV_COLUMNS]
        lines.append("| " + " | ".join(values) + " |")

    groups: dict[tuple[str, str], list[BenchmarkRow]] = {}
    for row in rows:
        groups.setdefault((row.puzzle_id, row.outcome), []).append(row)

    lines.extend(["", "## Median runtime by puzzle and outcome", ""])
    lines.append("| puzzle_id | outcome | runs | median_runtime_ms |")
    lines.append("| --- | --- | ---: | ---: |")
    for puzzle_id, outcome in sorted(groups):
        group = groups[(puzzle_id, outcome)]
        runtimes = [row.runtime_ms for row in group if row.runtime_ms is not None]
        median = statistics.median(runtimes) if runtimes else None
        lines.append(
            "| "
            + " | ".join(
                (
                    _markdown_cell(puzzle_id),
                    _markdown_cell(outcome),
                    str(len(group)),
                    _markdown_cell(median),
                )
            )
            + " |"
        )

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _git_metadata() -> tuple[str | None, list[str] | None]:
    repository_root = Path(__file__).resolve().parents[3]
    try:
        head = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=repository_root,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        status = subprocess.run(
            ["git", "status", "--short", "--untracked-files=all"],
            cwd=repository_root,
            check=True,
            capture_output=True,
            text=True,
        ).stdout
    except (OSError, subprocess.CalledProcessError):
        return None, None
    dirty_paths = [line[3:] for line in status.splitlines() if len(line) > 3]
    return head, dirty_paths


def _cpu_description() -> str | None:
    processor = platform.processor()
    if processor:
        return processor
    try:
        for line in Path("/proc/cpuinfo").read_text(encoding="utf-8").splitlines():
            if line.lower().startswith(("model name", "hardware")) and ":" in line:
                return line.split(":", 1)[1].strip()
    except OSError:
        pass
    return platform.machine() or None


def write_metadata(path: Path, *, args: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    git_head, git_dirty_paths = _git_metadata()
    metadata = {
        "timestamp_utc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "python": sys.version,
        "platform": platform.platform(),
        "cpu": _cpu_description(),
        "git_head": git_head,
        "git_dirty_paths": git_dirty_paths,
        "solver_class": f"{DPLLSolver.__module__}.{DPLLSolver.__qualname__}",
        "args": dict(args),
    }
    path.write_text(
        json.dumps(metadata, indent=2, sort_keys=True, default=str) + "\n",
        encoding="utf-8",
    )


__all__ = [
    "CSV_COLUMNS",
    "BenchmarkRow",
    "case_worker",
    "run_case",
    "solve_case",
    "write_csv",
    "write_markdown",
    "write_metadata",
]
