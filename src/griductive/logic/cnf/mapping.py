from __future__ import annotations

from griductive.domain.models import BoardLayout, CellId


class VariableMapper:
    """Bijective deterministic mapping between grid CellIds and 1-based SAT variables.

    Primary variables occupy indices `1..size^2` in row-major order.
    Auxiliary variables are allocated sequentially starting at `size^2 + 1`.
    """

    def __init__(self, size: int, cols: int | None = None) -> None:
        if size < 1:
            raise ValueError(f"Board size/rows must be positive, got {size}")
        if cols is not None and cols < 1:
            raise ValueError(f"Board cols must be positive, got {cols}")
        self.size = size
        self.cols = size if cols is None else cols
        self.primary_vars_count = self.size * self.cols
        self._next_aux_var = self.primary_vars_count + 1

    def cell_to_var(self, cell: CellId) -> int:
        """Map a CellId to its deterministic primary variable index (1..rows*cols)."""
        return cell.to_var(self.size, cols=self.cols)

    def var_to_cell(self, var: int) -> CellId:
        """Inverse map from a primary variable index back to CellId."""
        return CellId.from_var(var, self.size, cols=self.cols)

    def new_aux_var(self) -> int:
        """Allocate and return a fresh positive auxiliary variable index."""
        aux = self._next_aux_var
        self._next_aux_var += 1
        return aux

    @property
    def aux_vars_count(self) -> int:
        """Number of auxiliary variables allocated so far."""
        return self._next_aux_var - 1 - self.primary_vars_count

    @property
    def total_vars_count(self) -> int:
        """Total number of primary and auxiliary variables allocated so far."""
        return self._next_aux_var - 1

    def to_dict(self) -> dict[CellId, int]:
        """Return a deterministic mapping of all board cells to their primary variables."""
        layout = BoardLayout(self.size, cols=self.cols)
        return {cell: self.cell_to_var(cell) for cell in layout.all_cells()}
