from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

from griductive.domain.clues import Clue
from griductive.domain.models import BoardLayout, CellId, Character, Status


@dataclass(frozen=True)
class PuzzleDefinition:
    """Complete puzzle definition held privately by GameEngine.
    
    Contains the ground-truth hidden statuses and all clues.
    """
    puzzle_id: str
    size: int
    characters: tuple[Character, ...]
    hidden_statuses: tuple[Status, ...]
    clues: tuple[Clue, ...]
    initial_revealed: frozenset[CellId]

    def __post_init__(self) -> None:
        expected_len = self.size * self.size
        if len(self.characters) != expected_len:
            raise ValueError(f"Expected {expected_len} characters for {self.size}x{self.size}, got {len(self.characters)}")
        if len(self.hidden_statuses) != expected_len:
            raise ValueError(f"Expected {expected_len} hidden statuses, got {len(self.hidden_statuses)}")
        if len(self.clues) != expected_len:
            raise ValueError(f"Expected {expected_len} clues, got {len(self.clues)}")

        layout = BoardLayout(self.size)
        for cell in self.initial_revealed:
            if not layout.contains(cell):
                raise ValueError(f"Initial revealed cell {cell} is out of bounds for size {self.size}")

    def get_character(self, cell: CellId) -> Character:
        idx = cell.row * self.size + cell.col
        return self.characters[idx]

    def get_status(self, cell: CellId) -> Status:
        idx = cell.row * self.size + cell.col
        return self.hidden_statuses[idx]

    def get_clue(self, cell: CellId) -> Clue:
        idx = cell.row * self.size + cell.col
        return self.clues[idx]

    def full_solution(self) -> dict[CellId, Status]:
        """Mapping from CellId to Status for the complete hidden solution."""
        layout = BoardLayout(self.size)
        return {cell: self.get_status(cell) for cell in layout.all_cells()}


@dataclass(frozen=True)
class PublicCell:
    """Public view of a single grid cell.
    
    Invariant: (known_status is None) == (revealed_clue is None).
    """
    character: Character
    known_status: Status | None
    revealed_clue: Clue | None

    def __post_init__(self) -> None:
        if (self.known_status is None) != (self.revealed_clue is None):
            raise ValueError(
                f"Invalid PublicCell state for {self.character.cell_id}: "
                f"known_status={self.known_status}, revealed_clue={self.revealed_clue}. "
                "Both must be None (unrevealed) or both present (revealed)."
            )

    @property
    def is_revealed(self) -> bool:
        return self.known_status is not None


@dataclass(frozen=True)
class PublicState:
    """Immutable public game state snapshot at a given revision step t."""
    session_id: str
    revision: int
    size: int
    cells: tuple[PublicCell, ...]

    def __post_init__(self) -> None:
        expected_len = self.size * self.size
        if len(self.cells) != expected_len:
            raise ValueError(f"Expected {expected_len} public cells, got {len(self.cells)}")

    def get_cell(self, cell_id: CellId) -> PublicCell:
        idx = cell_id.row * self.size + cell_id.col
        return self.cells[idx]

    def revealed_clues(self) -> tuple[Clue, ...]:
        """All clues that have been revealed to the public KB so far."""
        return tuple(c.revealed_clue for c in self.cells if c.revealed_clue is not None)

    def known_statuses(self) -> dict[CellId, Status]:
        """Dictionary of all proven/revealed statuses so far."""
        return {
            c.character.cell_id: c.known_status
            for c in self.cells
            if c.known_status is not None
        }

    def unresolved_cells(self) -> tuple[CellId, ...]:
        """All cell IDs whose statuses are not yet revealed, ordered row-major."""
        return tuple(
            c.character.cell_id
            for c in self.cells
            if not c.is_revealed
        )

    def is_solved(self) -> bool:
        """True if all cells in the puzzle have been revealed."""
        return all(c.is_revealed for c in self.cells)

