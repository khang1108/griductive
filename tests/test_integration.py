from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
import importlib

import pytest
from fastapi.testclient import TestClient

from griductive.domain.clues import (
    AtLeastClue,
    AtMostClue,
    DifferentClue,
    ExactlyClue,
    FactClue,
    ParityClue,
    SameClue,
)
from griductive.domain.models import BoardLayout, CellId, Character, Parity, Status
from griductive.domain.regions import (
    ColumnRegion,
    ExplicitRegion,
    IntersectionRegion,
    NeighborsRegion,
    RowRegion,
)
from griductive.domain.state import PuzzleDefinition
from griductive.engine.game_engine import GameEngine
from griductive.engine.puzzle_db import load_puzzle_from_sqlite
from griductive.server.serializers import (
    serialize_clue_descriptor,
    serialize_region_descriptor,
)

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


DESCRIPTOR_KEYS = {
    "kind",
    "targets",
    "target_status",
    "region_kind",
    "region_label",
    "region_params",
    "k",
    "parity",
}


def _assert_public_cells_do_not_leak_hidden_fields(state: dict) -> None:
    for cell in state["cells"]:
        if not cell["is_revealed"]:
            assert cell["status"] is None
            assert cell["clue_text"] is None
            assert cell["clue_type"] is None
            assert cell["clue_descriptor"] is None
            assert cell["referenced_coords"] == []
        else:
            assert isinstance(cell["clue_descriptor"], dict)
            assert set(cell["clue_descriptor"]) == DESCRIPTOR_KEYS
    for clue in state["active_clues"]:
        assert isinstance(clue["descriptor"], dict)
        assert set(clue["descriptor"]) == DESCRIPTOR_KEYS


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


def test_verdict_rejects_lucky_guess_without_mutating_state(client: TestClient) -> None:
    # In sample_3x3 at revision 0, only A1 is revealed ("B1 is CRIMINAL").
    # C3's hidden status is CRIMINAL, so claiming C3=CRIMINAL matches the hidden answer
    # but is NOT logically entailed by the public clues.
    before = client.get("/api/state").json()

    response = client.post(
        "/api/verdict",
        json={
            "coord": "C3",
            "status": "CRIMINAL",
            "session_id": before["session_id"],
            "expected_revision": before["revision"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["verdict_success"] is False
    assert payload["verdict_assessment"] == "NOT_PROVABLE"
    assert payload["banner_type"] == "warning"
    assert "Not provable — current clues do not force" in payload["banner_message"]
    assert "No guessing allowed." in payload["banner_message"]
    assert payload["revision"] == before["revision"]
    assert payload["solved_count"] == before["solved_count"]

    c3_cell = next(cell for cell in payload["cells"] if cell["coord"] == "C3")
    assert c3_cell["is_revealed"] is False
    assert c3_cell["status"] is None
    assert c3_cell["clue_descriptor"] is None
    _assert_public_cells_do_not_leak_hidden_fields(payload)
    assert client.get("/api/state").json() == before


def test_verdict_rejects_contradicted_claim_without_mutating_state(client: TestClient) -> None:
    # In sample_3x3 at revision 0, A1 states "B1 is CRIMINAL", so claiming B1=INNOCENT is disproved.
    before = client.get("/api/state").json()

    response = client.post(
        "/api/verdict",
        json={
            "coord": "B1",
            "status": "INNOCENT",
            "session_id": before["session_id"],
            "expected_revision": before["revision"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["verdict_success"] is False
    assert payload["verdict_assessment"] == "CONTRADICTED"
    assert payload["banner_type"] == "error"
    assert "Contradicted — current clues disprove" in payload["banner_message"]
    assert payload["revision"] == before["revision"]
    assert payload["solved_count"] == before["solved_count"]

    b1_cell = next(cell for cell in payload["cells"] if cell["coord"] == "B1")
    assert b1_cell["is_revealed"] is False
    assert b1_cell["clue_descriptor"] is None
    _assert_public_cells_do_not_leak_hidden_fields(payload)
    assert client.get("/api/state").json() == before


def test_verdict_accepts_provable_move_and_reveals_clue_descriptor(client: TestClient) -> None:
    before = client.get("/api/state").json()

    response = client.post(
        "/api/verdict",
        json={
            "coord": "B1",
            "status": "CRIMINAL",
            "session_id": before["session_id"],
            "expected_revision": before["revision"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["verdict_success"] is True
    assert payload["verdict_assessment"] == "PROVABLE"
    assert payload["banner_type"] == "success"
    assert payload["banner_message"] == "Proved! Binh (B1) is CRIMINAL."
    assert payload["revision"] == before["revision"] + 1
    assert payload["solved_count"] == before["solved_count"] + 1

    b1_cell = next(cell for cell in payload["cells"] if cell["coord"] == "B1")
    assert b1_cell["is_revealed"] is True
    assert b1_cell["status"] == "CRIMINAL"
    assert b1_cell["clue_descriptor"] == {
        "kind": "FACT",
        "targets": ["A2"],
        "target_status": "CRIMINAL",
        "region_kind": None,
        "region_label": None,
        "region_params": None,
        "k": None,
        "parity": None,
    }
    b1_clue = next(clue for clue in payload["active_clues"] if clue["owner_coord"] == "B1")
    assert b1_clue["descriptor"] == b1_cell["clue_descriptor"]
    _assert_public_cells_do_not_leak_hidden_fields(payload)


def test_verdict_already_solved_and_inconsistent_outcomes(client: TestClient) -> None:
    before = client.get("/api/state").json()

    already = client.post("/api/verdict", json={"coord": "A1", "status": "INNOCENT"})
    assert already.status_code == 200
    already_payload = already.json()
    assert already_payload["verdict_success"] is False
    assert already_payload["verdict_assessment"] == "ALREADY_SOLVED"
    assert already_payload["banner_type"] == "info"
    assert already_payload["banner_message"] == "Ada (A1) is already confirmed."
    assert already_payload["revision"] == before["revision"]
    assert client.get("/api/state").json() == before

    _install_inconsistent_engine()
    inconsistent_before = client.get("/api/state").json()
    inconsistent = client.post("/api/verdict", json={"coord": "B1", "status": "CRIMINAL"})
    assert inconsistent.status_code == 200
    inconsistent_payload = inconsistent.json()
    assert inconsistent_payload["verdict_success"] is False
    assert inconsistent_payload["verdict_assessment"] == "INCONSISTENT"
    assert inconsistent_payload["banner_type"] == "error"
    assert inconsistent_payload["banner_message"] == "Current public clues are inconsistent (UNSAT)."
    assert client.get("/api/state").json() == inconsistent_before


def test_verdict_rejects_stale_session_or_revision_with_409(client: TestClient) -> None:
    before = client.get("/api/state").json()
    token = {"session_id": before["session_id"], "expected_revision": before["revision"]}

    first = client.post("/api/verdict", json={"coord": "B1", "status": "CRIMINAL", **token})
    assert first.status_code == 200
    committed = client.get("/api/state").json()
    assert committed["revision"] == before["revision"] + 1

    stale_rev = client.post("/api/verdict", json={"coord": "A2", "status": "CRIMINAL", **token})
    assert stale_rev.status_code == 409
    assert stale_rev.json()["detail"] == "Stale revision"
    assert client.get("/api/state").json() == committed

    restarted = client.post("/api/restart")
    assert restarted.status_code == 200
    after_restart = client.get("/api/state").json()

    stale_session = client.post(
        "/api/verdict",
        json={
            "coord": "B1",
            "status": "CRIMINAL",
            "session_id": before["session_id"],
            "expected_revision": after_restart["revision"],
        },
    )
    assert stale_session.status_code == 409
    assert stale_session.json()["detail"] == "Stale session_id"
    assert client.get("/api/state").json() == after_restart


def test_verdict_rejects_out_of_bounds_and_invalid_revision_types(client: TestClient) -> None:
    before = client.get("/api/state").json()

    oob = client.post("/api/verdict", json={"coord": "D1", "status": "CRIMINAL"})
    assert oob.status_code == 400

    for bad_rev in (-1, "0", True):
        invalid = client.post(
            "/api/verdict",
            json={
                "coord": "B1",
                "status": "CRIMINAL",
                "session_id": before["session_id"],
                "expected_revision": bad_rev,
            },
        )
        assert invalid.status_code == 422

    assert client.get("/api/state").json() == before


def test_descriptors_cover_all_region_and_clue_types(client: TestClient) -> None:
    a1, b1, b2, c3 = CellId(0, 0), CellId(0, 1), CellId(1, 1), CellId(2, 2)

    assert serialize_region_descriptor(RowRegion(0)) == ("ROW", "Row 1", {"row": 0})
    assert serialize_region_descriptor(ColumnRegion(1)) == ("COLUMN", "Col B", {"col": 1})
    assert serialize_region_descriptor(NeighborsRegion(b2)) == (
        "NEIGHBORS",
        "Neighbors of B2",
        {"center": "B2"},
    )
    assert serialize_region_descriptor(ExplicitRegion((a1, c3))) == (
        "EXPLICIT",
        "[A1, C3]",
        {"cells": ["A1", "C3"]},
    )
    assert serialize_region_descriptor(IntersectionRegion(NeighborsRegion(b2), RowRegion(1))) == (
        "INTERSECTION",
        "Neighbors of B2 ∩ Row 2",
        {
            "left": {"kind": "NEIGHBORS", "label": "Neighbors of B2", "params": {"center": "B2"}},
            "right": {"kind": "ROW", "label": "Row 2", "params": {"row": 1}},
        },
    )

    descriptors = [
        serialize_clue_descriptor(FactClue(clue_id="c1", owner=a1, target=b1, status=Status.CRIMINAL)),
        serialize_clue_descriptor(SameClue(clue_id="c2", owner=a1, left=a1, right=b1)),
        serialize_clue_descriptor(DifferentClue(clue_id="c3", owner=a1, left=a1, right=b1)),
        serialize_clue_descriptor(ExactlyClue(clue_id="c4", owner=a1, region=RowRegion(0), k=2)),
        serialize_clue_descriptor(AtLeastClue(clue_id="c5", owner=a1, region=ColumnRegion(2), k=1)),
        serialize_clue_descriptor(AtMostClue(clue_id="c6", owner=a1, region=NeighborsRegion(b2), k=3)),
        serialize_clue_descriptor(
            ParityClue(
                clue_id="c7",
                owner=a1,
                region=IntersectionRegion(RowRegion(1), ExplicitRegion((a1, b2))),
                parity=Parity.ODD,
            )
        ),
    ]
    assert all(set(item) == DESCRIPTOR_KEYS for item in descriptors)
    assert [item["kind"] for item in descriptors] == [
        "FACT",
        "SAME",
        "DIFFERENT",
        "EXACTLY",
        "ATLEAST",
        "ATMOST",
        "PARITY",
    ]
    assert descriptors[0]["targets"] == ["B1"] and descriptors[0]["target_status"] == "CRIMINAL"
    assert descriptors[1]["targets"] == ["A1", "B1"] and descriptors[1]["target_status"] is None
    assert descriptors[2]["targets"] == ["A1", "B1"] and descriptors[2]["k"] is None
    assert descriptors[3]["k"] == 2 and descriptors[3]["region_kind"] == "ROW"
    assert descriptors[4]["k"] == 1 and descriptors[4]["region_kind"] == "COLUMN"
    assert descriptors[5]["k"] == 3 and descriptors[5]["region_kind"] == "NEIGHBORS"
    assert descriptors[6]["parity"] == "ODD" and descriptors[6]["region_kind"] == "INTERSECTION"

    # End-to-end check on full solved sample_3x3 via HTTP
    solved = client.post("/api/auto-solve")
    assert solved.status_code == 200
    _assert_public_cells_do_not_leak_hidden_fields(solved.json())
