from __future__ import annotations

import json
from pathlib import Path
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
from griductive.domain.models import BoardLayout, CellId, Character, CompareOp, Parity, Status
from griductive.domain.regions import (
    ColumnRegion,
    ExplicitRegion,
    IntersectionRegion,
    NeighborsRegion,
    RegionSpec,
    RowRegion,
)
from griductive.domain.state import PuzzleDefinition


def _parse_region(data: dict[str, Any]) -> RegionSpec:
    reg_type = data.get("type", "").upper()
    match reg_type:
        case "ROW":
            return RowRegion(row=int(data["row"]))
        case "COLUMN" | "COL":
            return ColumnRegion(col=int(data["col"]))
        case "NEIGHBORS":
            return NeighborsRegion(center=CellId.from_label(data["center"]))
        case "EXPLICIT":
            cells = tuple(CellId.from_label(c) for c in data["cells"])
            return ExplicitRegion(cells=cells)
        case "INTERSECTION":
            left = _parse_region(data["left"])
            right = _parse_region(data["right"])
            return IntersectionRegion(left=left, right=right)
        case _:
            raise ValueError(f"Unknown region type in JSON: {reg_type}")


def _parse_clue(data: dict[str, Any], clue_id: str, owner: CellId) -> Clue:
    clue_type = data.get("type", "").upper()
    match clue_type:
        case "FACT":
            return FactClue(
                clue_id=clue_id,
                owner=owner,
                target=CellId.from_label(data["target"]),
                status=Status(data["status"].upper()),
            )
        case "SAME":
            return SameClue(
                clue_id=clue_id,
                owner=owner,
                left=CellId.from_label(data["left"]),
                right=CellId.from_label(data["right"]),
            )
        case "DIFFERENT":
            return DifferentClue(
                clue_id=clue_id,
                owner=owner,
                left=CellId.from_label(data["left"]),
                right=CellId.from_label(data["right"]),
            )
        case "EXACTLY":
            return ExactlyClue(
                clue_id=clue_id,
                owner=owner,
                region=_parse_region(data["region"]),
                k=int(data["k"]),
            )
        case "AT_LEAST":
            return AtLeastClue(
                clue_id=clue_id,
                owner=owner,
                region=_parse_region(data["region"]),
                k=int(data["k"]),
            )
        case "AT_MOST":
            return AtMostClue(
                clue_id=clue_id,
                owner=owner,
                region=_parse_region(data["region"]),
                k=int(data["k"]),
            )
        case "PARITY":
            return ParityClue(
                clue_id=clue_id,
                owner=owner,
                region=_parse_region(data["region"]),
                parity=Parity(data["parity"].upper()),
            )
        case "COMPARE":
            return CompareClue(
                clue_id=clue_id,
                owner=owner,
                left_region=_parse_region(data["left_region"]),
                right_region=_parse_region(data["right_region"]),
                op=CompareOp(data["op"].upper()),
                target_status=Status(data.get("target_status", "CRIMINAL").upper()),
                text=data.get("text"),
            )
        case "CONNECTED":
            return ConnectedClue(
                clue_id=clue_id,
                owner=owner,
                region=_parse_region(data["region"]),
                target_status=Status(data.get("target_status", "CRIMINAL").upper()),
                text=data.get("text"),
            )
        case "COMPOUND":
            sub_clues = tuple(
                _parse_clue(sub, clue_id=f"{clue_id}_{i}", owner=owner)
                for i, sub in enumerate(data["clues"])
            )
            return CompoundClue(
                clue_id=clue_id,
                owner=owner,
                clues=sub_clues,
                text=data.get("text"),
            )
        case "FLAVOR":
            return FlavorClue(
                clue_id=clue_id,
                owner=owner,
                text=str(data["text"]),
            )
        case _:
            raise ValueError(f"Unknown clue type in JSON: {clue_type}")


def load_puzzle_from_dict(data: dict[str, Any]) -> PuzzleDefinition:
    """Construct a PuzzleDefinition from a JSON-compatible dictionary."""
    puzzle_id = data["puzzle_id"]
    rows = int(data.get("rows", data["size"]))
    cols = int(data.get("cols", rows))
    layout = BoardLayout(rows, cols=cols)
    all_cells = layout.all_cells()

    initial_revealed = frozenset(
        CellId.from_label(c) for c in data.get("initial_revealed", [])
    )

    grid_entries = {
        CellId.from_label(entry["cell"]): entry
        for entry in data["grid"]
    }

    characters: list[Character] = []
    statuses: list[Status] = []
    clues: list[Clue] = []

    for idx, cell in enumerate(all_cells):
        if cell not in grid_entries:
            raise ValueError(f"Missing grid definition for cell {cell.to_label()}")
        entry = grid_entries[cell]
        char = Character(
            cell_id=cell,
            name=entry["name"],
            profession=entry["profession"],
        )
        characters.append(char)
        statuses.append(Status(entry["status"].upper()))

        clue_id = entry.get("clue_id", f"CLUE-{cell.to_label()}")
        clue = _parse_clue(entry["clue"], clue_id=clue_id, owner=cell)
        clues.append(clue)

    return PuzzleDefinition(
        puzzle_id=puzzle_id,
        size=rows,
        characters=tuple(characters),
        hidden_statuses=tuple(statuses),
        clues=tuple(clues),
        initial_revealed=initial_revealed,
        cols=cols,
    )


def load_puzzle_from_json(path: str | Path) -> PuzzleDefinition:
    """Load a PuzzleDefinition from a JSON file."""
    file_path = Path(path)
    if not file_path.exists():
        raise FileNotFoundError(f"Puzzle file not found: {file_path}")
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return load_puzzle_from_dict(data)

