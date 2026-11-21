from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
import importlib

import pytest
from fastapi.testclient import TestClient

from griductive.domain.clues import FactClue
from griductive.domain.models import BoardLayout, Character, Status
from griductive.domain.state import PuzzleDefinition
from griductive.engine.game_engine import GameEngine
from griductive.engine.puzzle_db import load_puzzle_from_sqlite

app_module = importlib.import_module("griductive.server.app")

TRACE_STEP_KEYS = {
    "step",
    "active_clue_ids",
    "sat_queries",
    "verdict_cell",
    "verdict_status",
    "new_clue_id",
    "primary_vars_count",
    "aux_vars_count",
    "clause_count",
    "stats",
}
TRACE_STATS_KEYS = {"decisions", "propagations", "backtracks", "runtime_ms"}
METRICS_KEYS = {
    "sat_queries",
    "decisions",
    "propagations",
    "backtracks",
    "solver_runtime_ms",
    "wall_time_ms",
    "max_primary_vars",
    "max_aux_vars",
    "max_clauses",
    "deduction_steps",
}


@pytest.fixture
def client():
    original_session = app_module.session
    app_module.session = app_module.GameSession()
    try:
        with TestClient(app_module.app) as test_client:
            yield test_client
    finally:
        app_module.session = original_session


def _install_solved_engine() -> None:
    puzzle = load_puzzle_from_sqlite("daily_3x3_hard")
    solved_puzzle = replace(
        puzzle,
        initial_revealed=frozenset(BoardLayout(puzzle.size).all_cells()),
    )
    app_module.session.engine = GameEngine(solved_puzzle)


def _install_inconsistent_engine() -> None:
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
    app_module.session.engine = GameEngine(puzzle)
    app_module.session.current_stage = puzzle.puzzle_id


def _assert_public_cells_do_not_leak_hidden_fields(state: dict) -> None:
    for cell in state["cells"]:
        if not cell["is_revealed"]:
            assert cell["status"] is None
            assert cell["clue_text"] is None
            assert cell["clue_type"] is None
            assert cell["referenced_coords"] == []


def test_hint_returns_real_forced_move_without_mutating_snapshot(client: TestClient) -> None:
    before = client.get("/api/state").json()

    response = client.post("/api/hint")

    assert response.status_code == 200
    hint = response.json()
    after = client.get("/api/state").json()
    assert hint["outcome"] == "AVAILABLE"
    assert hint["cell"] is not None
    assert hint["status"] in {"CRIMINAL", "INNOCENT"}
    assert hint["active_clue_ids"]
    assert hint["session_id"] == before["session_id"]
    assert hint["revision"] == before["revision"]
    assert after == before


def test_step_commits_one_trace_cell_and_its_new_clue(client: TestClient) -> None:
    loaded = client.post("/api/load", json={"stage": "daily_3x3_hard"})
    assert loaded.status_code == 200
    before = client.get("/api/state").json()

    response = client.post(
        "/api/auto-solve/step",
        json={"session_id": before["session_id"], "revision": before["revision"]},
    )

    assert response.status_code == 200
    payload = response.json()
    state = payload["state"]
    trace = payload["step"]
    assert payload["outcome"] == "IN_PROGRESS"
    assert state["revision"] == before["revision"] + 1
    assert state["solved_count"] == before["solved_count"] + 1
    assert trace["verdict_cell"] in {
        cell["coord"] for cell in before["cells"] if not cell["is_revealed"]
    }
    revealed = next(cell for cell in state["cells"] if cell["coord"] == trace["verdict_cell"])
    assert revealed["is_revealed"] is True
    assert revealed["status"] == trace["verdict_status"]
    assert revealed["clue_text"] is not None
    assert trace["new_clue_id"] in {clue["clue_id"] for clue in state["active_clues"]}
    assert set(trace) == TRACE_STEP_KEYS
    assert set(trace["stats"]) == TRACE_STATS_KEYS
    assert set(payload["metrics"]) == METRICS_KEYS
    _assert_public_cells_do_not_leak_hidden_fields(state)


def test_stale_step_is_rejected_before_and_after_restart(client: TestClient) -> None:
    before = client.get("/api/state").json()
    token = {"session_id": before["session_id"], "revision": before["revision"]}

    first = client.post("/api/auto-solve/step", json=token)
    assert first.status_code == 200
    committed_state = first.json()["state"]
    duplicate = client.post("/api/auto-solve/step", json=token)
    assert duplicate.status_code == 409
    assert client.get("/api/state").json() == committed_state

    restarted = client.post("/api/restart")
    assert restarted.status_code == 200
    assert restarted.json()["session_id"] != before["session_id"]
    after_restart = client.post("/api/auto-solve/step", json=token)
    assert after_restart.status_code == 409
    current = client.get("/api/state").json()
    valid_after_restart = client.post(
        "/api/auto-solve/step",
        json={"session_id": current["session_id"], "revision": current["revision"]},
    )
    assert valid_after_restart.status_code == 200


def test_stale_step_is_rejected_after_load_without_mutating_new_state(client: TestClient) -> None:
    before = client.get("/api/state").json()
    token = {"session_id": before["session_id"], "revision": before["revision"]}
    loaded = client.post("/api/load", json={"stage": "daily_3x3_hard"})
    assert loaded.status_code == 200
    state_after_load = client.get("/api/state").json()

    stale = client.post("/api/auto-solve/step", json=token)

    assert stale.status_code == 409
    assert client.get("/api/state").json() == state_after_load
    valid = client.post(
        "/api/auto-solve/step",
        json={
            "session_id": state_after_load["session_id"],
            "revision": state_after_load["revision"],
        },
    )
    assert valid.status_code == 200


@pytest.mark.parametrize("revision", [-1, "0", True])
def test_step_rejects_non_strict_nonnegative_revision(client: TestClient, revision: object) -> None:
    state = client.get("/api/state").json()

    response = client.post(
        "/api/auto-solve/step",
        json={"session_id": state["session_id"], "revision": revision},
    )

    assert response.status_code == 422
    valid = client.post(
        "/api/auto-solve/step",
        json={"session_id": state["session_id"], "revision": state["revision"]},
    )
    assert valid.status_code == 200


@pytest.mark.parametrize("session_id", [42, True, None])
def test_step_rejects_non_string_session_id_without_mutation(
    client: TestClient,
    session_id: object,
) -> None:
    before = client.get("/api/state").json()

    response = client.post(
        "/api/auto-solve/step",
        json={"session_id": session_id, "revision": before["revision"]},
    )

    assert response.status_code == 422
    assert client.get("/api/state").json() == before
    valid = client.post(
        "/api/auto-solve/step",
        json={"session_id": before["session_id"], "revision": before["revision"]},
    )
    assert valid.status_code == 200
    assert valid.json()["state"]["revision"] == before["revision"] + 1


def test_two_requests_at_same_revision_commit_once(client: TestClient) -> None:
    before = client.get("/api/state").json()
    request = {"session_id": before["session_id"], "revision": before["revision"]}

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [
            executor.submit(client.post, "/api/auto-solve/step", json=request)
            for _ in range(2)
        ]
        responses = [future.result() for future in futures]

    assert sorted(response.status_code for response in responses) == [200, 409]
    assert client.get("/api/state").json()["revision"] == before["revision"] + 1


def test_solved_step_and_hint_are_terminal_without_mutation(client: TestClient) -> None:
    _install_solved_engine()
    before = client.get("/api/state").json()
    token = {"session_id": before["session_id"], "revision": before["revision"]}

    hint = client.post("/api/hint").json()
    step = client.post("/api/auto-solve/step", json=token)

    assert hint["outcome"] == "SOLVED"
    assert hint["cell"] is None and hint["status"] is None
    assert step.status_code == 200
    assert step.json()["outcome"] == "SOLVED"
    assert step.json()["step"] is None
    assert step.json()["state"] == before
    assert set(step.json()["metrics"]) == METRICS_KEYS


def test_stuck_step_and_hint_do_not_reveal_an_extra_cell(client: TestClient, ambiguous_puzzle) -> None:
    app_module.session.engine = GameEngine(ambiguous_puzzle)
    full_run = client.post("/api/auto-solve")
    assert full_run.status_code == 200
    assert full_run.json()["outcome"] == "STUCK_NO_FORCIBLE_MOVE"
    before = client.get("/api/state").json()
    token = {"session_id": before["session_id"], "revision": before["revision"]}

    hint = client.post("/api/hint").json()
    step = client.post("/api/auto-solve/step", json=token)

    assert hint["outcome"] == "STUCK_NO_FORCIBLE_MOVE"
    assert hint["cell"] is None and hint["status"] is None
    assert step.status_code == 200
    assert step.json()["outcome"] == "STUCK_NO_FORCIBLE_MOVE"
    assert step.json()["step"] is None
    assert client.get("/api/state").json() == before


def test_inconsistent_hint_and_step_are_distinct_from_stuck(client: TestClient) -> None:
    _install_inconsistent_engine()
    before = client.get("/api/state").json()
    token = {"session_id": before["session_id"], "revision": before["revision"]}

    hint = client.post("/api/hint").json()
    step = client.post("/api/auto-solve/step", json=token)

    assert hint["outcome"] == "INCONSISTENT"
    assert hint["cell"] is None and hint["status"] is None
    assert step.status_code == 200
    assert step.json()["outcome"] == "INCONSISTENT"
    assert step.json()["step"] is None
    assert client.get("/api/state").json() == before


def test_full_run_returns_legacy_state_trace_and_exact_metrics(client: TestClient) -> None:
    loaded = client.post("/api/load", json={"stage": "daily_3x3_hard"})
    assert loaded.status_code == 200

    response = client.post("/api/auto-solve")

    assert response.status_code == 200
    payload = response.json()
    assert "cells" in payload and "state" not in payload
    assert payload["outcome"] == "SOLVED"
    assert payload["steps_taken"] == len(payload["trace_steps"])
    assert len(payload["trace"]) == payload["steps_taken"]
    assert all(isinstance(line, str) for line in payload["trace"])
    assert set(payload["metrics"]) == METRICS_KEYS
    assert payload["metrics"]["deduction_steps"] == payload["steps_taken"]
    assert all(set(trace) == TRACE_STEP_KEYS for trace in payload["trace_steps"])
    assert all(set(trace["stats"]) == TRACE_STATS_KEYS for trace in payload["trace_steps"])
    _assert_public_cells_do_not_leak_hidden_fields(payload)


def test_initial_state_marks_every_unrevealed_cell_public_fields_null(client: TestClient) -> None:
    state = client.get("/api/state").json()

    _assert_public_cells_do_not_leak_hidden_fields(state)



def test_legacy_full_run_preserves_inconsistent_http_error(client: TestClient) -> None:
    _install_inconsistent_engine()
    before = client.get("/api/state").json()

    response = client.post("/api/auto-solve")

    assert response.status_code == 409
    assert response.json()["detail"] == "Current knowledge base is inconsistent (UNSAT)."
    assert client.get("/api/state").json() == before
