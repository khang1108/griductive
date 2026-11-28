from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Self


class Status(str, Enum):
    """Hidden or revealed actual status of a character."""
    CRIMINAL = "CRIMINAL"
    INNOCENT = "INNOCENT"

    @property
    def is_criminal(self) -> bool:
        return self == Status.CRIMINAL


class Classification(str, Enum):
    """Entailment deduction classification derived by LogicAgent."""
    CRIMINAL = "CRIMINAL"
    INNOCENT = "INNOCENT"
    UNKNOWN = "UNKNOWN"
    INCONSISTENT = "INCONSISTENT"


class Parity(str, Enum):
    """Parity constraint values."""
    EVEN = "EVEN"
    ODD = "ODD"


class CompareOp(str, Enum):
    """Comparison operator between two regional counts."""
    MORE = "MORE"
    FEWER = "FEWER"
    EQUAL = "EQUAL"


@dataclass(frozen=True, order=True)
class CellId:
    """Internal zero-based coordinates for a grid cell.
    
    row: 0-indexed row (0 <= row < size)
    col: 0-indexed column (0 <= col < size)
    """
    row: int
    col: int

    def to_label(self) -> str:
        """Convert to external board label, e.g. (row=0, col=0) -> 'A1', (row=1, col=2) -> 'C2'."""
        col_letter = chr(ord("A") + self.col)
        row_number = self.row + 1
        return f"{col_letter}{row_number}"

    @classmethod
    def from_label(cls, label: str) -> Self:
        """Parse external board label, e.g. 'A1' -> CellId(0, 0), 'C2' -> CellId(1, 2)."""
        clean = label.strip().upper()
        if len(clean) < 2 or not clean[0].isalpha() or not clean[1:].isdigit():
            raise ValueError(f"Invalid cell label format: '{label}'")

        col = ord(clean[0]) - ord("A")
        row = int(clean[1:]) - 1
        
        if row < 0 or col < 0:
            raise ValueError(f"Cell coordinates must be non-negative: '{label}'")
        return cls(row=row, col=col)

    def to_var(self, size: int, cols: int | None = None) -> int:
        """Map cell to primary 1-based propositional variable deterministically in row-major order."""
        num_cols = size if cols is None else cols
        if not (0 <= self.row < size and 0 <= self.col < num_cols):
            raise ValueError(f"Cell {self} is outside board of size {num_cols}x{size}")
        return self.row * num_cols + self.col + 1

    @classmethod
    def from_var(cls, var: int, size: int, cols: int | None = None) -> Self:
        """Inverse map from primary propositional variable (1..rows*cols) back to CellId."""
        num_cols = size if cols is None else cols
        total = size * num_cols
        if not (1 <= var <= total):
            raise ValueError(f"Variable index {var} out of range for primary variables of size {num_cols}x{size}")
        var_idx = var - 1
        return cls(row=var_idx // num_cols, col=var_idx % num_cols)


@dataclass(frozen=True)
class Character:
    """Character presentation and metadata."""
    cell_id: CellId
    name: str
    profession: str


@dataclass(frozen=True)
class BoardLayout:
    """Board geometry and bounds (supports square size×size and rectangular cols×rows)."""
    size: int
    cols: int | None = None

    def __post_init__(self) -> None:
        if self.size < 1:
            raise ValueError(f"Board rows/size must be positive, got {self.size}")
        if self.cols is not None and self.cols < 1:
            raise ValueError(f"Board cols must be positive, got {self.cols}")

    @property
    def rows(self) -> int:
        return self.size

    @property
    def num_cols(self) -> int:
        return self.size if self.cols is None else self.cols

    @property
    def total_cells(self) -> int:
        return self.rows * self.num_cols

    def contains(self, cell: CellId) -> bool:
        return 0 <= cell.row < self.rows and 0 <= cell.col < self.num_cols

    def all_cells(self) -> tuple[CellId, ...]:
        """All cells in deterministic row-major order."""
        return tuple(
            CellId(r, c)
            for r in range(self.rows)
            for c in range(self.num_cols)
        )
