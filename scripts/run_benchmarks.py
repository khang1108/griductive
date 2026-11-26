from __future__ import annotations

import argparse
from pathlib import Path
import sys
from typing import Sequence


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = REPOSITORY_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from griductive.engine import list_puzzles_from_sqlite
from griductive.experiments.benchmark import (
    BenchmarkRow,
    run_case,
    write_csv,
    write_markdown,
    write_metadata,
)


def _positive_int(value: str) -> int:
    try:
        number = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("must be an integer") from exc
    if number <= 0:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return number


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run isolated Griductive benchmarks.")
    parser.add_argument("--size", type=int, choices=(3, 4, 5), help="only benchmark this board size")
    parser.add_argument(
        "--puzzle-id",
        action="append",
        dest="puzzle_ids",
        help="benchmark a puzzle by ID; may be supplied more than once",
    )
    parser.add_argument("--repeats", type=_positive_int, default=1)
    parser.add_argument("--timeout-ms", type=_positive_int, default=10_000)
    parser.add_argument("--output-dir", type=Path, default=Path("."))
    parser.add_argument("--db-path", type=Path, default=None)
    return parser


def _select_puzzles(
    puzzles: Sequence[dict],
    *,
    size: int | None,
    puzzle_ids: Sequence[str] | None,
) -> list[dict]:
    by_id = {puzzle["puzzle_id"]: puzzle for puzzle in puzzles}
    requested_ids = set(puzzle_ids or ())
    unknown_ids = sorted(requested_ids - by_id.keys())
    if unknown_ids:
        raise ValueError(f"Unknown puzzle ID(s): {', '.join(unknown_ids)}")

    selected = [
        puzzle
        for puzzle in puzzles
        if (size is None or puzzle["size"] == size)
        and (not requested_ids or puzzle["puzzle_id"] in requested_ids)
    ]
    if not selected:
        raise ValueError("No puzzles match the selected filters.")
    return sorted(selected, key=lambda puzzle: (puzzle["size"], puzzle["puzzle_id"]))


def _unexpected_error_row(puzzle: dict, repeat: int, exc: Exception) -> BenchmarkRow:
    size = puzzle["size"]
    return BenchmarkRow(
        puzzle_id=puzzle["puzzle_id"],
        size=size,
        repeat=repeat,
        outcome="ERROR",
        solved_count=None,
        total_cells=size * size,
        primary_vars=None,
        aux_vars=None,
        clause_count=None,
        sat_queries=None,
        decisions=None,
        propagations=None,
        backtracks=None,
        deduction_steps=None,
        runtime_ms=None,
        process_elapsed_ms=None,
        error=f"{type(exc).__name__}: {exc}",
    )


def main(argv: Sequence[str] | None = None) -> int:
    parser = _build_parser()
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:
        return int(exc.code or 0)

    try:
        puzzles = list_puzzles_from_sqlite(args.db_path)
    except Exception as exc:
        print(f"Unable to read puzzle database: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1

    try:
        selected = _select_puzzles(
            puzzles,
            size=args.size,
            puzzle_ids=args.puzzle_ids,
        )
    except ValueError as exc:
        parser.print_usage(sys.stderr)
        print(f"{parser.prog}: error: {exc}", file=sys.stderr)
        return 2

    rows: list[BenchmarkRow] = []
    for puzzle in selected:
        for repeat in range(1, args.repeats + 1):
            try:
                row = run_case(
                    puzzle["puzzle_id"],
                    db_path=str(args.db_path) if args.db_path is not None else None,
                    repeat=repeat,
                    timeout_ms=args.timeout_ms,
                )
            except Exception as exc:
                row = _unexpected_error_row(puzzle, repeat, exc)
            rows.append(row)

    rows.sort(
        key=lambda row: (
            row.size if row.size is not None else 0,
            row.puzzle_id,
            row.repeat,
        )
    )

    output_dir = args.output_dir
    csv_path = output_dir / "benchmark_results.csv"
    markdown_path = output_dir / "benchmark_results.md"
    metadata_path = output_dir / "benchmark_metadata.json"
    try:
        write_csv(rows, csv_path)
        write_markdown(rows, markdown_path)
        write_metadata(metadata_path, args=vars(args))
    except OSError as exc:
        print(f"Unable to write benchmark outputs: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1

    print(f"Wrote {len(rows)} benchmark rows to {output_dir}")
    successful_outcomes = {"SOLVED", "STUCK_NO_FORCIBLE_MOVE"}
    if any(row.outcome not in successful_outcomes for row in rows):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
