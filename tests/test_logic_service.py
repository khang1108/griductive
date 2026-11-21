from __future__ import annotations

from dataclasses import replace

from griductive.domain.clues import FactClue
from griductive.domain.models import BoardLayout, CellId, Character, Status
from griductive.domain.state import PuzzleDefinition
from griductive.engine.game_engine import GameEngine
from griductive.engine.puzzle_db import load_puzzle_from_sqlite
from griductive.server.logic_service import LogicService


def _inconsistent_engine() -> GameEngine:
    layout = BoardLayout(2)
    cells = layout.all_cells()
    chars = tuple(
        Character(cell_id=cell, name=f"Person {cell.to_label()}", profession="Clerk")
        for cell in cells
    )
    clues = tuple(
        FactClue(
            clue_id=f"clue_{cell.to_label()}",
            owner=cell,
            target=cell,
            status=Status.INNOCENT if cell == cells[0] else Status.CRIMINAL,
        )
        for cell in cells
    )
    puzzle = PuzzleDefinition(
        puzzle_id="public_facts_conflict",
        size=2,
        characters=chars,
        hidden_statuses=(Status.CRIMINAL, Status.CRIMINAL, Status.INNOCENT, Status.INNOCENT),
        clues=clues,
        initial_revealed=frozenset({cells[0]}),
    )
    return GameEngine(puzzle)


def test_hint_does_not_mutate_state() -> None:
    engine = GameEngine(load_puzzle_from_sqlite("daily_3x3_hard"))
    service = LogicService()
    before = engine.get_public_state()

    outcome, hint = service.hint(before)

    assert engine.get_public_state() == before
    assert outcome == "AVAILABLE"
    assert hint is not None
    assert hint.cell == CellId(0, 0)
    assert hint.active_clue_ids


def test_step_reveals_at_most_one_cell() -> None:
    engine = GameEngine(load_puzzle_from_sqlite("daily_3x3_hard"))
    service = LogicService()
    before = engine.get_public_state()

    execution = service.step(engine)

    assert engine.revision == before.revision + 1
    assert len(execution.result.steps) == 1
    assert execution.outcome == "IN_PROGRESS"
    assert execution.result.steps[0].verdict_cell in before.unresolved_cells()


def test_step_solved_is_not_reported_as_timeout() -> None:
    puzzle = load_puzzle_from_sqlite("daily_3x3_hard")
    solved_puzzle = replace(
        puzzle,
        initial_revealed=frozenset(BoardLayout(puzzle.size).all_cells()),
    )
    engine = GameEngine(solved_puzzle)

    execution = LogicService().step(engine)

    assert execution.outcome == "SOLVED"
    assert execution.result.terminal_status.value == "SOLVED"
    assert execution.result.steps == ()
    assert engine.revision == 0


def test_stuck_has_no_extra_reveal(ambiguous_puzzle) -> None:
    engine = GameEngine(ambiguous_puzzle)
    service = LogicService()
    run_result = service.run(engine)
    assert run_result.terminal_status.value == "STUCK_NO_FORCIBLE_MOVE"
    before = engine.get_public_state()

    execution = service.step(engine)

    assert execution.outcome == "STUCK_NO_FORCIBLE_MOVE"
    assert execution.result.steps == ()
    assert engine.get_public_state() == before


def test_inconsistent_hint_has_no_suggestion() -> None:
    engine = _inconsistent_engine()
    service = LogicService()
    before = engine.get_public_state()

    outcome, hint = service.hint(before)

    assert outcome == "INCONSISTENT"
    assert hint is None
    assert engine.get_public_state() == before


def test_repeated_steps_match_full_run() -> None:
    puzzle = load_puzzle_from_sqlite("daily_3x3_hard")
    full_engine = GameEngine(puzzle)
    full_result = LogicService().run(full_engine)

    stepped_engine = GameEngine(puzzle)
    service = LogicService()
    step_pairs: list[tuple[CellId, Status]] = []
    terminal = "IN_PROGRESS"
    while terminal == "IN_PROGRESS":
        execution = service.step(stepped_engine)
        step_pairs.extend(
            (trace.verdict_cell, trace.verdict_status)
            for trace in execution.result.steps
        )
        terminal = execution.outcome

    full_pairs = [
        (trace.verdict_cell, trace.verdict_status)
        for trace in full_result.steps
    ]
    assert step_pairs == full_pairs
    assert terminal == full_result.terminal_status.value
