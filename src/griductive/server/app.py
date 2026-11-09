from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from griductive.domain.models import CellId, Status
from griductive.engine.game_engine import GameEngine
from griductive.engine.puzzle_db import (
    list_puzzles_from_sqlite,
    load_puzzle_from_sqlite,
    seed_database_from_json_dir,
)
from griductive.server.avatar_cache import get_avatar_png
from griductive.server.serializers import serialize_game_state

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
        self.engine: GameEngine | None = None
        self.current_stage: str = "sample_3x3"
        self.available_stages: list[str] = []
        self.stage_catalog: list[dict[str, Any]] = []
        self._refresh_stages()
        self.load_stage(self.current_stage)

    def _refresh_stages(self) -> None:
        if not PUZZLE_DB_PATH.exists() and DATA_PUZZLE_DIR.exists():
            seed_database_from_json_dir(DATA_PUZZLE_DIR, db_path=PUZZLE_DB_PATH)

        self.stage_catalog = list_puzzles_from_sqlite(db_path=PUZZLE_DB_PATH)
        self.available_stages = [p["puzzle_id"] for p in self.stage_catalog]
        if not self.available_stages:
            self.available_stages = ["sample_3x3"]

    def load_stage(self, stage_id: str) -> None:
        clean_id = stage_id.removesuffix(".json")
        self._refresh_stages()
        puzzle = load_puzzle_from_sqlite(clean_id, db_path=PUZZLE_DB_PATH)
        self.engine = GameEngine(puzzle)
        self.current_stage = clean_id


session = GameSession()


class VerdictRequest(BaseModel):
    coord: str
    status: str


class LoadRequest(BaseModel):
    stage: str


@app.get("/api/puzzles")
def get_puzzles() -> list[dict[str, Any]]:
    session._refresh_stages()
    return session.stage_catalog


@app.get("/api/state")
def get_state() -> dict[str, Any]:
    assert session.engine is not None
    return serialize_game_state(
        session.engine,
        session.current_stage,
        session.available_stages,
        stage_catalog=session.stage_catalog,
    )


@app.post("/api/verdict")
def submit_verdict(req: VerdictRequest) -> dict[str, Any]:
    assert session.engine is not None
    try:
        cell = CellId.from_label(req.coord)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid coordinate: {req.coord}") from e

    try:
        status = Status(req.status.upper())
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid status: {req.status}") from e

    ok, msg, _ = session.engine.submit_manual_verdict(cell, status)
    char_name = session.engine._puzzle.get_character(cell).name

    if ok:
        banner_msg = f"✓ Correct call! {char_name} is {status.value}."
        banner_type = "success"
    else:
        banner_msg = f"✗ Cannot prove {char_name} is {status.value}. Deduction rejected."
        banner_type = "error"

    state_data = serialize_game_state(
        session.engine,
        session.current_stage,
        session.available_stages,
        banner_message=banner_msg,
        banner_type=banner_type,
        stage_catalog=session.stage_catalog,
    )
    state_data["verdict_success"] = ok
    state_data["verdict_message"] = msg
    return state_data


@app.post("/api/restart")
def restart_game() -> dict[str, Any]:
    assert session.engine is not None
    session.engine.restart()
    return serialize_game_state(
        session.engine,
        session.current_stage,
        session.available_stages,
        banner_message="Game restarted. Fresh deduction slate.",
        banner_type="info",
        stage_catalog=session.stage_catalog,
    )


@app.post("/api/load")
def load_stage(req: LoadRequest) -> dict[str, Any]:
    try:
        session.load_stage(req.stage)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

    assert session.engine is not None
    return serialize_game_state(
        session.engine,
        session.current_stage,
        session.available_stages,
        banner_message=f"Loaded case {session.current_stage} ({session.engine.size}×{session.engine.size}).",
        banner_type="info",
        stage_catalog=session.stage_catalog,
    )


@app.post("/api/hint")
def get_hint() -> dict[str, Any]:
    assert session.engine is not None
    state = session.engine.get_public_state()
    active_clues = state.revealed_clues()
    hint_text = "Review the active clues in Case Evidence to deduce which suspect's status is forced next."
    if active_clues:
        last_clue = active_clues[-1]
        owner = session.engine._puzzle.get_character(last_clue.owner).name
        hint_text = f"Review statement from {owner} ({last_clue.owner.to_label()}) in Case Evidence!"

    return {
        "hint": hint_text,
    }


@app.post("/api/auto-solve")
def auto_solve() -> dict[str, Any]:
    # Extension point: connect your group's DPLL SAT Solver & Deductive Logic Agent here
    assert session.engine is not None
    state_data = serialize_game_state(
        session.engine,
        session.current_stage,
        session.available_stages,
        banner_message="⚡ AI Auto-Solve: Extension point reserved for your group's DPLL SAT Solver.",
        banner_type="info",
        stage_catalog=session.stage_catalog,
    )
    state_data["status"] = "RESERVED_FOR_GROUP"
    state_data["message"] = "Implement your DPLL and Logic Agent to automate case solving."
    return state_data


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

