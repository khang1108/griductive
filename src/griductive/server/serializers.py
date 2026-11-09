from __future__ import annotations

from typing import Any

from griductive.domain.clues import (
    AtLeastClue,
    AtMostClue,
    Clue,
    DifferentClue,
    ExactlyClue,
    FactClue,
    ParityClue,
    SameClue,
)
from griductive.domain.models import BoardLayout, CellId
from griductive.domain.regions import (
    ColumnRegion,
    ExplicitRegion,
    IntersectionRegion,
    NeighborsRegion,
    RegionSpec,
    RowRegion,
    resolve_region,
)
from griductive.engine.game_engine import GameEngine


def format_region(region: RegionSpec) -> str:
    match region:
        case RowRegion(row):
            return f"row {row + 1}"
        case ColumnRegion(col):
            col_letter = chr(ord("A") + col)
            return f"column {col_letter}"
        case NeighborsRegion(center):
            return f"neighbors of {center.to_label()}"
        case ExplicitRegion(cells):
            cell_names = ", ".join(c.to_label() for c in cells)
            return f"[{cell_names}]"
        case IntersectionRegion(left, right):
            return f"{format_region(left)} ∩ {format_region(right)}"
        case _:
            return str(region)


def format_clue(clue: Clue) -> str:
    match clue:
        case FactClue(target=target, status=status):
            return f"{target.to_label()} is {status.value}."
        case SameClue(left=left, right=right):
            return f"{left.to_label()} and {right.to_label()} have the SAME status."
        case DifferentClue(left=left, right=right):
            return f"{left.to_label()} and {right.to_label()} have DIFFERENT statuses."
        case ExactlyClue(region=region, k=k):
            plural = "criminal" if k == 1 else "criminals"
            return f"Exactly {k} {plural} in {format_region(region)}."
        case AtLeastClue(region=region, k=k):
            plural = "criminal" if k == 1 else "criminals"
            return f"At least {k} {plural} in {format_region(region)}."
        case AtMostClue(region=region, k=k):
            plural = "criminal" if k == 1 else "criminals"
            return f"At most {k} {plural} in {format_region(region)}."
        case ParityClue(region=region, parity=parity):
            return f"Parity of criminals in {format_region(region)} is {parity.value}."
        case _:
            return f"Clue ({type(clue).__name__})"


def get_referenced_coords(clue: Clue, layout: BoardLayout) -> list[str]:
    try:
        match clue:
            case FactClue(target=target):
                return [target.to_label()]
            case SameClue(left=left, right=right):
                return [left.to_label(), right.to_label()]
            case DifferentClue(left=left, right=right):
                return [left.to_label(), right.to_label()]
            case ExactlyClue(region=region) | AtLeastClue(region=region) | AtMostClue(region=region) | ParityClue(region=region):
                cells = resolve_region(region, layout)
                return [c.to_label() for c in cells]
            case _:
                return []
    except Exception:
        return []


def serialize_game_state(
    engine: GameEngine,
    current_stage: str,
    available_stages: list[str],
    banner_message: str | None = None,
    banner_type: str | None = None,
    stage_catalog: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    state = engine.get_public_state()
    layout = BoardLayout(state.size)

    cells_data = []
    # Sort cells row-major (row 0..N-1, col 0..N-1)
    sorted_cells = sorted(state.cells, key=lambda c: (c.character.cell_id.row, c.character.cell_id.col))
    for pc in sorted_cells:
        cid = pc.character.cell_id
        clue_text = format_clue(pc.revealed_clue) if pc.revealed_clue else None
        clue_type = type(pc.revealed_clue).__name__.replace("Clue", "").upper() if pc.revealed_clue else None
        ref_coords = get_referenced_coords(pc.revealed_clue, layout) if pc.revealed_clue else []

        cells_data.append({
            "coord": cid.to_label(),
            "row": cid.row,
            "col": cid.col,
            "name": pc.character.name,
            "profession": pc.character.profession,
            "is_revealed": pc.is_revealed,
            "status": pc.known_status.value if pc.known_status else None,
            "clue_text": clue_text,
            "clue_type": clue_type,
            "referenced_coords": ref_coords,
            "avatar_url": f"/api/avatars/{pc.character.name}",
        })

    active_clues = []
    for clue in state.revealed_clues():
        owner_cid = clue.owner
        char = engine._puzzle.get_character(owner_cid)
        active_clues.append({
            "clue_id": clue.clue_id,
            "owner_coord": owner_cid.to_label(),
            "owner_name": char.name,
            "owner_avatar_url": f"/api/avatars/{char.name}",
            "type": type(clue).__name__.replace("Clue", "").upper(),
            "text": format_clue(clue),
            "referenced_coords": get_referenced_coords(clue, layout),
        })

    solved_count = len([c for c in state.cells if c.is_revealed])
    total_cells = len(state.cells)

    return {
        "size": engine.size,
        "current_stage": current_stage,
        "available_stages": available_stages,
        "stage_catalog": stage_catalog or [],
        "solved_count": solved_count,
        "total_cells": total_cells,
        "is_solved": engine.is_solved(),
        "is_contradicted": False,
        "revision": engine.revision,
        "banner_message": banner_message,
        "banner_type": banner_type,
        "cells": cells_data,
        "active_clues": active_clues,
    }
