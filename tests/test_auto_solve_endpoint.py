from __future__ import annotations

import importlib

import pytest

from griductive.domain.clues import ExactlyClue, FactClue
from griductive.domain.models import BoardLayout, CellId, Character, Status
from griductive.domain.regions import RowRegion
from griductive.domain.state import PuzzleDefinition
from griductive.engine.game_engine import GameEngine

app_module = importlib.import_module("griductive.server.app")


@pytest.fixture(autouse=True)
def isolated_session():
    original_session = app_module.session
    app_module.session = app_module.GameSession()
    try:
        yield app_module.session
    finally:
        app_module.session = original_session


def test_auto_solve_uses_dpll_to_reveal_entailed_verdicts() -> None:
    app_module.session.load_stage("daily_3x3_hard")

    result = app_module.auto_solve()

    assert result["status"] == "SOLVED"
    assert result["is_solved"]
    assert result["steps_taken"] > 0
    assert len(result["trace"]) == result["steps_taken"]
    assert all(entry.startswith("Step ") for entry in result["trace"])


def test_auto_solve_stops_when_no_verdict_is_forced() -> None:
    a1, b1, a2, b2 = CellId(0, 0), CellId(0, 1), CellId(1, 0), CellId(1, 1)
    chars = tuple(
        Character(cell_id=c, name=f"Char_{c.to_label()}", profession="Clerk")
        for c in BoardLayout(2).all_cells()
    )
    ambiguous_puzzle = PuzzleDefinition(
        puzzle_id="ambiguous_2x2",
        size=2,
        characters=chars,
        hidden_statuses=(Status.CRIMINAL, Status.INNOCENT, Status.CRIMINAL, Status.INNOCENT),
        clues=(
            ExactlyClue(clue_id="c_a1", owner=a1, region=RowRegion(1), k=1),
            FactClue(clue_id="c_b1", owner=b1, target=b1, status=Status.INNOCENT),
            FactClue(clue_id="c_a2", owner=a2, target=a2, status=Status.CRIMINAL),
            FactClue(clue_id="c_b2", owner=b2, target=b2, status=Status.INNOCENT),
        ),
        initial_revealed=frozenset({a1}),
    )
    app_module.session.engine = GameEngine(ambiguous_puzzle)

    result = app_module.auto_solve()

    assert result["status"] == "STALLED"
    assert not result["is_solved"]
    assert result["steps_taken"] == 0
    assert result["trace"] == []
    assert result["banner_type"] == "info"
