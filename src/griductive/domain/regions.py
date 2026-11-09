from __future__ import annotations

from dataclasses import dataclass
from typing import TypeAlias

from griductive.domain.models import BoardLayout, CellId


@dataclass(frozen=True)
class RowRegion:
    """All cells in a given row (0-indexed)."""
    row: int


@dataclass(frozen=True)
class ColumnRegion:
    """All cells in a given column (0-indexed)."""
    col: int


@dataclass(frozen=True)
class NeighborsRegion:
    """All horizontal, vertical, and diagonal adjacent cells, excluding center."""
    center: CellId


@dataclass(frozen=True)
class ExplicitRegion:
    """Explicitly listed cells."""
    cells: tuple[CellId, ...]

    def __post_init__(self) -> None:
        # Validate that cells are provided as a tuple
        if not isinstance(self.cells, tuple):
            object.__setattr__(self, "cells", tuple(self.cells))


@dataclass(frozen=True)
class IntersectionRegion:
    """Advanced region expression: set intersection of two regions."""
    left: RegionSpec
    right: RegionSpec


RegionSpec: TypeAlias = (
    RowRegion
    | ColumnRegion
    | NeighborsRegion
    | ExplicitRegion
    | IntersectionRegion
)


def resolve_region(region: RegionSpec, layout: BoardLayout) -> tuple[CellId, ...]:
    """Resolve a RegionSpec into a deterministic, sorted, deduplicated tuple of valid CellIds in row-major order."""
    match region:
        case RowRegion(row):
            if not (0 <= row < layout.size):
                raise ValueError(f"Row {row} is out of bounds for board size {layout.size}")
            return tuple(CellId(row, c) for c in range(layout.size))

        case ColumnRegion(col):
            if not (0 <= col < layout.size):
                raise ValueError(f"Column {col} is out of bounds for board size {layout.size}")
            return tuple(CellId(r, col) for r in range(layout.size))

        case NeighborsRegion(center):
            if not layout.contains(center):
                raise ValueError(f"Center cell {center} is out of bounds for board size {layout.size}")
            neighbors: list[CellId] = []
            for dr in (-1, 0, 1):
                for dc in (-1, 0, 1):
                    if dr == 0 and dc == 0:
                        continue
                    nr, nc = center.row + dr, center.col + dc
                    n_cell = CellId(nr, nc)
                    if layout.contains(n_cell):
                        neighbors.append(n_cell)
            neighbors.sort()
            return tuple(neighbors)

        case ExplicitRegion(cells):
            for cell in cells:
                if not layout.contains(cell):
                    raise ValueError(f"Explicit cell {cell} is out of bounds for board size {layout.size}")
            return tuple(sorted(set(cells)))

        case IntersectionRegion(left, right):
            left_cells = set(resolve_region(left, layout))
            right_cells = set(resolve_region(right, layout))
            return tuple(sorted(left_cells & right_cells))

        case _:
            raise TypeError(f"Unknown region type: {type(region)}")


class RegionResolver:
    """Service to resolve abstract RegionSpec into concrete cell tuples."""

    def resolve(self, region: RegionSpec, layout: BoardLayout) -> tuple[CellId, ...]:
        return resolve_region(region, layout)

