from __future__ import annotations

from typing import Any

from griductive.domain.clues import (
    AtLeastClue,
    AtMostClue,
    Clue,
    CompareClue,
    CompoundClue,
    ConnectedClue,
    DifferentClue,
    ExactlyClue,
    FactClue,
    FlavorClue,
    ParityClue,
    SameClue,
)
from griductive.domain.models import BoardLayout, CellId, CompareOp
from griductive.server.avatar_cache import NAME_TO_INDEX
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
from griductive.logic.agent.models import DeductionResult, DeductionStepTrace


def serialize_region_descriptor(region: RegionSpec) -> tuple[str, str, dict[str, Any]]:
    """Return structured (region_kind, region_label, region_params) for a RegionSpec."""
    match region:
        case RowRegion(row):
            return ("ROW", f"Row {row + 1}", {"row": row})
        case ColumnRegion(col):
            return ("COLUMN", f"Col {chr(ord('A') + col)}", {"col": col})
        case NeighborsRegion(center):
            label = center.to_label()
            return ("NEIGHBORS", f"Neighbors of {label}", {"center": label})
        case ExplicitRegion(cells):
            cell_labels = [c.to_label() for c in cells]
            return ("EXPLICIT", f"[{', '.join(cell_labels)}]", {"cells": cell_labels})
        case IntersectionRegion(left, right):
            lk, left_label, lp = serialize_region_descriptor(left)
            rk, right_label, rp = serialize_region_descriptor(right)
            return (
                "INTERSECTION",
                f"{left_label} ∩ {right_label}",
                {
                    "left": {"kind": lk, "label": left_label, "params": lp},
                    "right": {"kind": rk, "label": right_label, "params": rp},
                },
            )
        case _:
            raise TypeError(f"Unknown region type: {type(region)}")


def serialize_clue_descriptor(clue: Clue) -> dict[str, Any]:
    """Return a structured descriptor payload for a revealed Clue."""
    targets: list[str] = []
    target_status: str | None = None
    region_kind: str | None = None
    region_label: str | None = None
    region_params: dict[str, Any] | None = None
    k: int | None = None
    parity: str | None = None

    match clue:
        case FactClue(target=target, status=status):
            kind = "FACT"
            targets = [target.to_label()]
            target_status = status.value
        case SameClue(left=left, right=right):
            kind = "SAME"
            targets = [left.to_label(), right.to_label()]
        case DifferentClue(left=left, right=right):
            kind = "DIFFERENT"
            targets = [left.to_label(), right.to_label()]
        case ExactlyClue(region=region, k=count):
            kind = "EXACTLY"
            region_kind, region_label, region_params = serialize_region_descriptor(region)
            k = count
        case AtLeastClue(region=region, k=count):
            kind = "ATLEAST"
            region_kind, region_label, region_params = serialize_region_descriptor(region)
            k = count
        case AtMostClue(region=region, k=count):
            kind = "ATMOST"
            region_kind, region_label, region_params = serialize_region_descriptor(region)
            k = count
        case ParityClue(region=region, parity=clue_parity):
            kind = "PARITY"
            region_kind, region_label, region_params = serialize_region_descriptor(region)
            parity = clue_parity.value
        case CompareClue(left_region=left_region, right_region=right_region, op=op):
            kind = "COMPARE"
            lk, ll, lp = serialize_region_descriptor(left_region)
            rk, rl, rp = serialize_region_descriptor(right_region)
            region_kind = "INTERSECTION"
            region_label = f"{ll} vs {rl}"
            region_params = {
                "left": {"kind": lk, "label": ll, "params": lp},
                "right": {"kind": rk, "label": rl, "params": rp},
                "op": op.value,
            }
        case ConnectedClue(region=region):
            kind = "CONNECTED"
            region_kind, region_label, region_params = serialize_region_descriptor(region)
        case CompoundClue(clues=sub_clues):
            kind = "COMPOUND"
            if sub_clues:
                first_desc = serialize_clue_descriptor(sub_clues[0])
                region_kind = first_desc.get("region_kind")
                region_label = first_desc.get("region_label")
                region_params = first_desc.get("region_params")
        case FlavorClue():
            kind = "FLAVOR"
        case _:
            raise TypeError(f"Unknown clue type: {type(clue)}")

    return {
        "kind": kind,
        "targets": targets,
        "target_status": target_status,
        "region_kind": region_kind,
        "region_label": region_label,
        "region_params": region_params,
        "k": k,
        "parity": parity,
    }


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
        case CompareClue(left_region=left_region, right_region=right_region, op=op, target_status=target_status, text=text):
            if text:
                return text
            op_word = {CompareOp.MORE: "more", CompareOp.FEWER: "fewer", CompareOp.EQUAL: "an equal number of"}[op]
            noun = f"{target_status.value.lower()}s"
            conj = "as" if op == CompareOp.EQUAL else "than"
            return f"There are {op_word} {noun} in {format_region(left_region)} {conj} {format_region(right_region)}."
        case ConnectedClue(region=region, target_status=target_status, text=text):
            if text:
                return text
            noun = f"{target_status.value.lower()}s"
            return f"All {noun} in {format_region(region)} are connected."
        case CompoundClue(clues=sub_clues, text=text):
            if text:
                return text
            return " ".join(format_clue(sub) for sub in sub_clues)
        case FlavorClue(text=text):
            return text
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
            case ExactlyClue(region=region) | AtLeastClue(region=region) | AtMostClue(region=region) | ParityClue(region=region) | ConnectedClue(region=region):
                cells = resolve_region(region, layout)
                return [c.to_label() for c in cells]
            case CompareClue(left_region=left_region, right_region=right_region):
                seen: dict[str, None] = {}
                for c in (*resolve_region(left_region, layout), *resolve_region(right_region, layout)):
                    seen[c.to_label()] = None
                return list(seen.keys())
            case CompoundClue(clues=sub_clues):
                seen_sub: dict[str, None] = {}
                for sub in sub_clues:
                    for coord in get_referenced_coords(sub, layout):
                        seen_sub[coord] = None
                return list(seen_sub.keys())
            case FlavorClue():
                return []
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
    layout = BoardLayout(state.size, cols=getattr(state, "num_cols", state.size))

    cells_data = []
    # Sort cells row-major (row 0..N-1, col 0..N-1)
    sorted_cells = sorted(state.cells, key=lambda c: (c.character.cell_id.row, c.character.cell_id.col))
    for idx, pc in enumerate(sorted_cells):
        cid = pc.character.cell_id
        clue_text = format_clue(pc.revealed_clue) if pc.revealed_clue else None
        clue_type = type(pc.revealed_clue).__name__.replace("Clue", "").upper() if pc.revealed_clue else None
        clue_descriptor = serialize_clue_descriptor(pc.revealed_clue) if pc.revealed_clue else None
        ref_coords = get_referenced_coords(pc.revealed_clue, layout) if pc.revealed_clue else []
        avatar_key = pc.character.name if pc.character.name.strip().lower() in NAME_TO_INDEX else str(idx % 25)

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
            "clue_descriptor": clue_descriptor,
            "referenced_coords": ref_coords,
            "avatar_url": f"/api/avatars/{avatar_key}",
        })

    active_clues = []
    coord_to_idx = {pc.character.cell_id: i for i, pc in enumerate(sorted_cells)}
    for clue in state.revealed_clues():
        owner_cid = clue.owner
        char = engine._puzzle.get_character(owner_cid)
        owner_avatar_key = (
            char.name
            if char.name.strip().lower() in NAME_TO_INDEX
            else str(coord_to_idx.get(owner_cid, 0) % 25)
        )
        active_clues.append({
            "clue_id": clue.clue_id,
            "owner_coord": owner_cid.to_label(),
            "owner_name": char.name,
            "owner_avatar_url": f"/api/avatars/{owner_avatar_key}",
            "type": type(clue).__name__.replace("Clue", "").upper(),
            "text": format_clue(clue),
            "descriptor": serialize_clue_descriptor(clue),
            "referenced_coords": get_referenced_coords(clue, layout),
        })

    solved_count = len([c for c in state.cells if c.is_revealed])
    total_cells = len(state.cells)

    return {
        "session_id": engine.session_id,
        "size": engine.size,
        "rows": engine.size,
        "cols": engine.cols,
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


def serialize_trace_step(
    trace: DeductionStepTrace,
    *,
    step_number: int | None = None,
) -> dict[str, Any]:
    return {
        "step": trace.step if step_number is None else step_number,
        "active_clue_ids": list(trace.active_clue_ids),
        "sat_queries": trace.sat_queries,
        "verdict_cell": trace.verdict_cell.to_label(),
        "verdict_status": trace.verdict_status.value,
        "new_clue_id": trace.new_clue_id,
        "primary_vars_count": trace.primary_vars_count,
        "aux_vars_count": trace.aux_vars_count,
        "clause_count": trace.clause_count,
        "stats": {
            "decisions": trace.stats.decisions,
            "propagations": trace.stats.propagations,
            "backtracks": trace.stats.backtracks,
            "runtime_ms": trace.stats.runtime_ms,
        },
    }


def serialize_run_metrics(result: DeductionResult) -> dict[str, int | float]:
    return {
        "sat_queries": result.total_sat_queries,
        "decisions": result.total_stats.decisions,
        "propagations": result.total_stats.propagations,
        "backtracks": result.total_stats.backtracks,
        "solver_runtime_ms": result.total_stats.runtime_ms,
        "wall_time_ms": result.total_wall_time_ms,
        "max_primary_vars": result.max_primary_vars,
        "max_aux_vars": result.max_aux_vars,
        "max_clauses": result.max_clauses,
        "deduction_steps": len(result.steps),
    }
