"""Game Engine package: owns hidden puzzle state and controls card reveals."""

from griductive.engine.game_engine import GameEngine, RevealResult, VerifiedVerdict
from griductive.engine.puzzle_db import (
    init_db,
    list_puzzles_from_sqlite,
    load_puzzle_from_sqlite,
    save_puzzle_to_sqlite,
)
from griductive.engine.puzzle_loader import (
    load_puzzle_from_dict,
    load_puzzle_from_json,
)
from griductive.engine.puzzle_validator import (
    validate_clue_truthfulness,
    validate_puzzle,
    validate_puzzle_integrity,
)

__all__ = [
    "GameEngine",
    "VerifiedVerdict",
    "RevealResult",
    "validate_puzzle",
    "validate_puzzle_integrity",
    "validate_clue_truthfulness",
    "load_puzzle_from_dict",
    "load_puzzle_from_json",
    "init_db",
    "save_puzzle_to_sqlite",
    "list_puzzles_from_sqlite",
    "load_puzzle_from_sqlite",
]
