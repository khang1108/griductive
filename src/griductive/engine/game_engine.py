from __future__ import annotations

import uuid
from dataclasses import dataclass

from griductive.domain.clues import Clue
from griductive.domain.models import BoardLayout, CellId, Status
from griductive.domain.state import PublicCell, PublicState, PuzzleDefinition


@dataclass(frozen=True)
class VerifiedVerdict:
    """Internal DTO constructed when LogicAgent proves that a cell has a forced status.
    
    Carries session_id and revision to prevent race conditions or stale commits.
    """
    session_id: str
    revision: int
    cell: CellId
    status: Status


@dataclass(frozen=True)
class RevealResult:
    """Result of successfully committing a verified verdict to the engine."""
    cell: CellId
    status: Status
    revealed_clue: Clue
    new_state: PublicState


class GameEngine:
    """Game Engine holding private ground-truth puzzle and controlling progressive card reveals.
    
    Separation of concerns:
    - Holds the complete PuzzleDefinition (hidden solution and unrevealed clues).
    - LogicAgent only ever receives immutable PublicState snapshots.
    - Only commits a card reveal via VerifiedVerdict, checking session_id and revision.
    - Rejected verdicts do not change state or revision.
    """

    def __init__(self, puzzle: PuzzleDefinition) -> None:
        self._puzzle: PuzzleDefinition = puzzle
        self._session_id: str = uuid.uuid4().hex[:8]
        self._revision: int = 0
        self._revealed_cells: set[CellId] = set(puzzle.initial_revealed)

    @property
    def session_id(self) -> str:
        return self._session_id

    @property
    def revision(self) -> int:
        return self._revision

    @property
    def puzzle_id(self) -> str:
        return self._puzzle.puzzle_id

    @property
    def size(self) -> int:
        return self._puzzle.size

    def get_public_state(self) -> PublicState:
        """Expose current public knowledge state snapshot."""
        return self._build_public_state()

    def restart(self) -> PublicState:
        """Reset puzzle state to initial reveals with a new session ID."""
        self._session_id = uuid.uuid4().hex[:8]
        self._revision = 0
        self._revealed_cells = set(self._puzzle.initial_revealed)
        return self._build_public_state()

    def is_solved(self) -> bool:
        """Check whether all cells have been revealed."""
        total_cells = self._puzzle.size * self._puzzle.size
        return len(self._revealed_cells) == total_cells

    def commit_verified_verdict(self, verified: VerifiedVerdict) -> RevealResult:
        """Commit an entailed verdict and reveal the card.
        
        Guarantees:
        1. Checks session_id and revision freshness.
        2. Checks that cell is currently unrevealed.
        3. Asserts consistency with ground-truth hidden solution.
        4. Increments revision by 1.
        5. Atomically reveals both status and clue.
        """
        if verified.session_id != self._session_id:
            raise ValueError(
                f"Stale session: engine session is {self._session_id}, got {verified.session_id}"
            )

        if verified.revision != self._revision:
            raise ValueError(
                f"Stale revision: engine is at revision {self._revision}, got {verified.revision}"
            )

        if verified.cell in self._revealed_cells:
            raise ValueError(f"Cell {verified.cell} is already revealed")

        actual_status = self._puzzle.get_status(verified.cell)
        if verified.status != actual_status:
            raise RuntimeError(
                f"Integrity Error: Proved verdict {verified.status} for {verified.cell} "
                f"contradicts hidden solution {actual_status}!"
            )

        # Atomic commit
        self._revealed_cells.add(verified.cell)
        self._revision += 1
        new_state = self._build_public_state()
        revealed_clue = self._puzzle.get_clue(verified.cell)

        return RevealResult(
            cell=verified.cell,
            status=actual_status,
            revealed_clue=revealed_clue,
            new_state=new_state,
        )

    def submit_manual_verdict(
        self,
        cell: CellId,
        status: Status,
    ) -> tuple[bool, str, RevealResult | None]:
        """Submit a manual verdict directly (for human manual play mode).
        
        Returns (is_correct, message, reveal_result_if_correct).
        """
        if cell in self._revealed_cells:
            return False, f"Cell {cell.to_label()} is already revealed.", None

        actual_status = self._puzzle.get_status(cell)
        char = self._puzzle.get_character(cell)

        if status != actual_status:
            return False, f"Incorrect! {char.name} is not {status.value}.", None

        # Correct verdict -> reveal
        self._revealed_cells.add(cell)
        self._revision += 1
        new_state = self._build_public_state()
        revealed_clue = self._puzzle.get_clue(cell)

        res = RevealResult(
            cell=cell,
            status=actual_status,
            revealed_clue=revealed_clue,
            new_state=new_state,
        )
        return True, f"Correct! {char.name} is {status.value}.", res


    def _build_public_state(self) -> PublicState:
        layout = BoardLayout(self._puzzle.size)
        public_cells: list[PublicCell] = []

        for cell in layout.all_cells():
            char = self._puzzle.get_character(cell)
            if cell in self._revealed_cells:
                known_status = self._puzzle.get_status(cell)
                revealed_clue = self._puzzle.get_clue(cell)
                public_cells.append(
                    PublicCell(
                        character=char,
                        known_status=known_status,
                        revealed_clue=revealed_clue,
                    )
                )
            else:
                public_cells.append(
                    PublicCell(
                        character=char,
                        known_status=None,
                        revealed_clue=None,
                    )
                )

        return PublicState(
            session_id=self._session_id,
            revision=self._revision,
            size=self._puzzle.size,
            cells=tuple(public_cells),
        )

