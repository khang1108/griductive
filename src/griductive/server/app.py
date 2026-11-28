from __future__ import annotations

from pathlib import Path
from threading import RLock
from typing import Annotated, Any

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from griductive.domain.models import BoardLayout, CellId, Status
from griductive.engine.game_engine import GameEngine
from griductive.engine.puzzle_db import (
    list_puzzles_from_sqlite,
    load_puzzle_from_sqlite,
    seed_database_from_json_dir,
)
from griductive.logic.agent import TerminalStatus
from griductive.server.avatar_cache import get_avatar_png
from griductive.server.logic_service import LogicService
from griductive.server.serializers import (
    serialize_game_state,
    serialize_run_metrics,
    serialize_trace_step,
)

app = FastAPI(title="Griductive Web API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATA_PUZZLE_DIR = PROJECT_ROOT / "data" / "puzzle"
PUZZLE_DB_PATH = DATA_PUZZLE_DIR / "puzzles.db"
FRONTEND_DIST_DIR = PROJECT_ROOT / "frontend" / "dist"


class GameSession:
    def __init__(self) -> None:
        self.lock = RLock()
        self.engine: GameEngine | None = None
        self.logic_service = LogicService()
        self.current_stage: str = "sample_3x3"
        self.available_stages: list[str] = []
        self.stage_catalog: list[dict[str, Any]] = []
        self._refresh_stages()
        self.load_stage(self.current_stage)

    def _refresh_stages(self) -> None:
        with self.lock:
            if not PUZZLE_DB_PATH.exists() and DATA_PUZZLE_DIR.exists():
                seed_database_from_json_dir(DATA_PUZZLE_DIR, db_path=PUZZLE_DB_PATH)

            self.stage_catalog = list_puzzles_from_sqlite(db_path=PUZZLE_DB_PATH)
            self.available_stages = [p["puzzle_id"] for p in self.stage_catalog]
            if not self.available_stages:
                self.available_stages = ["sample_3x3"]

    def load_stage(self, stage_id: str) -> None:
        with self.lock:
            clean_id = stage_id.removesuffix(".json")
            self._refresh_stages()
            puzzle = load_puzzle_from_sqlite(clean_id, db_path=PUZZLE_DB_PATH)
            self.engine = GameEngine(puzzle)
            self.current_stage = clean_id


session = GameSession()


class VerdictRequest(BaseModel):
    coord: str
    status: str
    session_id: str | None = None
    expected_revision: Annotated[int, Field(strict=True, ge=0)] | None = None


class LoadRequest(BaseModel):
    stage: str


class StepRequest(BaseModel):
    session_id: str
    revision: Annotated[int, Field(strict=True, ge=0)]


@app.get("/api/puzzles")
def get_puzzles() -> list[dict[str, Any]]:
    with session.lock:
        session._refresh_stages()
        return [dict(puzzle) for puzzle in session.stage_catalog]


@app.get("/api/state")
def get_state() -> dict[str, Any]:
    with session.lock:
        assert session.engine is not None
        return serialize_game_state(
            session.engine,
            session.current_stage,
            list(session.available_stages),
            stage_catalog=[dict(puzzle) for puzzle in session.stage_catalog],
        )


@app.post("/api/verdict")
def submit_verdict(req: VerdictRequest) -> dict[str, Any]:
    try:
        cell = CellId.from_label(req.coord)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid coordinate: {req.coord}") from e

    try:
        status = Status(req.status.upper())
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid status: {req.status}") from e

    with session.lock:
        assert session.engine is not None
        if req.session_id is not None and req.session_id != session.engine.session_id:
            raise HTTPException(status_code=409, detail="Stale session_id")
        if req.expected_revision is not None and req.expected_revision != session.engine.revision:
            raise HTTPException(status_code=409, detail="Stale revision")
        if not BoardLayout(session.engine.size, cols=session.engine.cols).contains(cell):
            raise HTTPException(
                status_code=400,
                detail=f"Coordinate {req.coord} is out of bounds for board size {session.engine.cols}×{session.engine.size}",
            )

        execution = session.logic_service.assess_and_commit_verdict(session.engine, cell, status)
        char_name = session.engine._puzzle.get_character(cell).name

        match execution.assessment:
            case "PROVABLE":
                banner_type = "success"
                banner_msg = f"Proved! {char_name} ({cell.to_label()}) is {status.value}."
            case "NOT_PROVABLE":
                banner_type = "warning"
                banner_msg = (
                    f"Not provable — current clues do not force {char_name} ({cell.to_label()}) "
                    f"to be {status.value}. No guessing allowed."
                )
            case "CONTRADICTED":
                banner_type = "error"
                banner_msg = (
                    f"Contradicted — current clues disprove {char_name} ({cell.to_label()}) "
                    f"being {status.value}."
                )
            case "ALREADY_SOLVED":
                banner_type = "info"
                banner_msg = f"{char_name} ({cell.to_label()}) is already confirmed."
            case _:
                banner_type = "error"
                banner_msg = "Current public clues are inconsistent (UNSAT)."

        state_data = serialize_game_state(
            session.engine,
            session.current_stage,
            list(session.available_stages),
            banner_message=banner_msg,
            banner_type=banner_type,
            stage_catalog=[dict(puzzle) for puzzle in session.stage_catalog],
        )
        state_data["verdict_success"] = execution.ok
        state_data["verdict_message"] = execution.reason
        state_data["verdict_assessment"] = execution.assessment
        return state_data


@app.post("/api/restart")
def restart_game() -> dict[str, Any]:
    with session.lock:
        assert session.engine is not None
        session.engine.restart()
        return serialize_game_state(
            session.engine,
            session.current_stage,
            list(session.available_stages),
            banner_message="Game restarted. Fresh deduction slate.",
            banner_type="info",
            stage_catalog=[dict(puzzle) for puzzle in session.stage_catalog],
        )


@app.post("/api/load")
def load_stage(req: LoadRequest) -> dict[str, Any]:
    with session.lock:
        try:
            session.load_stage(req.stage)
        except Exception as e:
            raise HTTPException(status_code=404, detail=str(e)) from e

        assert session.engine is not None
        return serialize_game_state(
            session.engine,
            session.current_stage,
            list(session.available_stages),
            banner_message=f"Loaded case {session.current_stage} ({session.engine.cols}×{session.engine.size}).",
            banner_type="info",
            stage_catalog=[dict(puzzle) for puzzle in session.stage_catalog],
        )


@app.post("/api/hint")
def get_hint() -> dict[str, Any]:
    with session.lock:
        assert session.engine is not None
        state = session.engine.get_public_state()
        outcome, hint = session.logic_service.hint(state)
        if hint is not None:
            hint_text = hint.reason
        elif outcome == "SOLVED":
            hint_text = "All cells are already solved."
        elif outcome == "INCONSISTENT":
            hint_text = "The current public clues are inconsistent."
        else:
            hint_text = "No forced move is available from the current public clues."

        return {
            "hint": hint_text,
            "cell": hint.cell.to_label() if hint is not None else None,
            "status": hint.forced_status.value if hint is not None else None,
            "active_clue_ids": list(hint.active_clue_ids) if hint is not None else [],
            "session_id": state.session_id,
            "revision": state.revision,
            "outcome": outcome,
        }


@app.post("/api/auto-solve/step")
def auto_solve_step(req: StepRequest) -> dict[str, Any]:
    with session.lock:
        assert session.engine is not None
        if req.session_id != session.engine.session_id:
            raise HTTPException(status_code=409, detail="Stale session_id")
        if req.revision != session.engine.revision:
            raise HTTPException(status_code=409, detail="Stale revision")

        execution = session.logic_service.step(session.engine)
        state_data = serialize_game_state(
            session.engine,
            session.current_stage,
            list(session.available_stages),
            stage_catalog=[dict(puzzle) for puzzle in session.stage_catalog],
        )
        trace_step = None
        if execution.result.steps:
            trace_step = serialize_trace_step(
                execution.result.steps[0],
                step_number=session.engine.revision,
            )
        return {
            "state": state_data,
            "outcome": execution.outcome,
            "step": trace_step,
            "metrics": serialize_run_metrics(execution.result),
        }


@app.post("/api/auto-solve")
def auto_solve() -> dict[str, Any]:
    with session.lock:
        assert session.engine is not None
        initial_revision = session.engine.revision
        result = session.logic_service.run(session.engine)
        if result.terminal_status is TerminalStatus.INCONSISTENT:
            raise HTTPException(
                status_code=409,
                detail="Current knowledge base is inconsistent (UNSAT).",
            )
        is_solved = session.engine.is_solved()
        message = (
            f"Auto-solve completed: {len(result.steps)} entailed verdict(s) revealed."
            if is_solved
            else f"Auto-solve stopped: {result.terminal_status.value}."
        )
        state_data = serialize_game_state(
            session.engine,
            session.current_stage,
            list(session.available_stages),
            banner_message=message,
            banner_type="success" if is_solved else "info",
            stage_catalog=[dict(puzzle) for puzzle in session.stage_catalog],
        )
        trace_steps = [
            serialize_trace_step(trace, step_number=initial_revision + index)
            for index, trace in enumerate(result.steps, start=1)
        ]
        trace = [
            f"Step {step['step']}: {step['verdict_cell']} is {step['verdict_status']}."
            for step in trace_steps
        ]
        return {
            **state_data,
            "status": "SOLVED" if is_solved else "STALLED",
            "outcome": result.terminal_status.value,
            "steps_taken": len(result.steps),
            "trace": trace,
            "trace_steps": trace_steps,
            "metrics": serialize_run_metrics(result),
        }


@app.get("/api/avatars/{name}")
def get_avatar(name: str):
    data = get_avatar_png(name, size=140)
    return Response(
        content=data,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )


# Serve built frontend static files if present
if FRONTEND_DIST_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST_DIR), html=True), name="static")

