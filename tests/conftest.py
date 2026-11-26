from __future__ import annotations

import pytest

from griductive.engine.puzzle_loader import load_puzzle_from_dict


@pytest.fixture
def ambiguous_puzzle_data() -> dict:
    """A consistent board whose single public clue forces no unknown cell."""
    statuses = {"A1": "CRIMINAL", "B1": "INNOCENT", "A2": "CRIMINAL", "B2": "INNOCENT"}
    return {
        "puzzle_id": "ambiguous_2x2",
        "size": 2,
        "initial_revealed": ["A1"],
        "grid": [
            {
                "cell": cell,
                "name": f"Person {cell}",
                "profession": "Clerk",
                "status": status,
                "clue": (
                    {"type": "EXACTLY", "region": {"type": "ROW", "row": 1}, "k": 1}
                    if cell == "A1"
                    else {"type": "FACT", "target": cell, "status": status}
                ),
            }
            for cell, status in statuses.items()
        ],
    }


@pytest.fixture
def ambiguous_puzzle(ambiguous_puzzle_data):
    return load_puzzle_from_dict(ambiguous_puzzle_data)
