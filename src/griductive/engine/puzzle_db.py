from __future__ import annotations

import json
from pathlib import Path
import sqlite3
from typing import Any

from griductive.domain.state import PuzzleDefinition
from griductive.engine.puzzle_loader import load_puzzle_from_dict

DEFAULT_DB_PATH = Path(__file__).resolve().parents[3] / "data" / "puzzle" / "puzzles.db"


def get_connection(db_path: Path | str | None = None) -> sqlite3.Connection:
    if db_path is None:
        db_path = DEFAULT_DB_PATH
    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: Path | str | None = None) -> None:
    """Initialize SQLite tables for puzzle storage."""
    with get_connection(db_path) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS puzzles (
                puzzle_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                size INTEGER NOT NULL,
                difficulty TEXT DEFAULT 'normal',
                initial_revealed TEXT NOT NULL,
                data_json TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        conn.commit()


def save_puzzle_to_sqlite(
    puzzle_data: dict[str, Any],
    name: str | None = None,
    difficulty: str = "normal",
    db_path: Path | str | None = None,
) -> None:
    """Insert or update a puzzle definition in the SQLite database."""
    init_db(db_path)
    puzzle_id = puzzle_data.get("puzzle_id")
    if not puzzle_id:
        raise ValueError("puzzle_data missing required 'puzzle_id'")

    size = int(puzzle_data.get("size", 3))
    initial_revealed = json.dumps(puzzle_data.get("initial_revealed", []))
    data_json = json.dumps(puzzle_data)
    display_name = name or puzzle_data.get("name") or f"{size}×{size} Daily Mystery"

    with get_connection(db_path) as conn:
        conn.execute(
            """
            INSERT INTO puzzles (puzzle_id, name, size, difficulty, initial_revealed, data_json)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(puzzle_id) DO UPDATE SET
                name = excluded.name,
                size = excluded.size,
                difficulty = excluded.difficulty,
                initial_revealed = excluded.initial_revealed,
                data_json = excluded.data_json;
            """,
            (puzzle_id, display_name, size, difficulty, initial_revealed, data_json),
        )
        conn.commit()


def list_puzzles_from_sqlite(db_path: Path | str | None = None) -> list[dict[str, Any]]:
    """List metadata for all puzzles stored in the SQLite database."""
    init_db(db_path)
    with get_connection(db_path) as conn:
        rows = conn.execute(
            "SELECT puzzle_id, name, size, difficulty, initial_revealed FROM puzzles ORDER BY size ASC, puzzle_id ASC"
        ).fetchall()
        return [
            {
                "puzzle_id": row["puzzle_id"],
                "name": row["name"],
                "size": row["size"],
                "difficulty": row["difficulty"],
                "initial_revealed": json.loads(row["initial_revealed"]),
            }
            for row in rows
        ]


def load_puzzle_from_sqlite(
    puzzle_id: str,
    db_path: Path | str | None = None,
) -> PuzzleDefinition:
    """Retrieve and deserialize a PuzzleDefinition from the SQLite database."""
    init_db(db_path)
    # Strip .json suffix if passed by legacy client
    clean_id = puzzle_id.removesuffix(".json")

    with get_connection(db_path) as conn:
        row = conn.execute(
            "SELECT data_json FROM puzzles WHERE puzzle_id = ?",
            (clean_id,),
        ).fetchone()

        if not row:
            raise KeyError(f"Puzzle with id '{clean_id}' not found in database.")

        raw_data = json.loads(row["data_json"])
        return load_puzzle_from_dict(raw_data)


def seed_database_from_json_dir(json_dir: Path | str, db_path: Path | str | None = None) -> int:
    """Import all JSON puzzle files from a directory into SQLite."""
    init_db(db_path)
    count = 0
    p = Path(json_dir)
    if not p.exists():
        return 0

    for json_file in sorted(p.glob("*.json")):
        try:
            with open(json_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            pid = data.get("puzzle_id") or json_file.stem
            data["puzzle_id"] = pid
            save_puzzle_to_sqlite(data, db_path=db_path)
            count += 1
        except Exception as e:
            print(f"[puzzle_db] Error importing {json_file}: {e}")
    return count

