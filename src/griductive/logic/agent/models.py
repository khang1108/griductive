"""Data models, enums, and structural contracts for the Deductive Logic Agent."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Mapping, Protocol, Sequence, runtime_checkable

from griductive.domain.clues import Clue
from griductive.domain.models import CellId, Character, Classification, Status


class VerdictAssessmentType(str, Enum):
    """Outcome when assessing a player-proposed verdict against public KB_t."""

    PROVABLE = "PROVABLE"
    NOT_PROVABLE = "NOT_PROVABLE"
    CONTRADICTED = "CONTRADICTED"
    INCONSISTENT = "INCONSISTENT"
    ALREADY_SOLVED = "ALREADY_SOLVED"


class TerminalStatus(str, Enum):
    """Terminal outcomes of the automated deduction loop."""

    SOLVED = "SOLVED"
    STUCK_NO_FORCIBLE_MOVE = "STUCK_NO_FORCIBLE_MOVE"
    INCONSISTENT = "INCONSISTENT"
    ENGINE_REJECTED = "ENGINE_REJECTED"
    TIMEOUT = "TIMEOUT"


@dataclass(frozen=True)
class SolverStatsSnapshot:
    """Aggregated SAT solver telemetry metrics."""

    decisions: int = 0
    propagations: int = 0
    backtracks: int = 0
    runtime_ms: float = 0.0

    def __add__(self, other: SolverStatsSnapshot) -> SolverStatsSnapshot:
        """Combine two telemetry snapshots component-wise."""
        return SolverStatsSnapshot(
            decisions=self.decisions + other.decisions,
            propagations=self.propagations + other.propagations,
            backtracks=self.backtracks + other.backtracks,
            runtime_ms=self.runtime_ms + other.runtime_ms,
        )


@dataclass(frozen=True)
class HintResult:
    """Hint identifying one deterministically provable cell (Contract TV3)."""

    cell: CellId
    forced_status: Status
    reason: str
    active_clue_ids: tuple[str, ...]


@dataclass(frozen=True)
class VerdictAssessment:
    """Result of evaluating a proposed verdict against current public knowledge."""

    cell: CellId
    proposed_status: Status
    assessment: VerdictAssessmentType
    forced_status: Status | None
    reason: str
    sat_queries: int = 0
    stats: SolverStatsSnapshot = field(default_factory=SolverStatsSnapshot)


@dataclass(frozen=True)
class DeductionStepTrace:
    """Audit record for a single step in the automated deduction loop."""

    step: int
    active_clue_ids: tuple[str, ...]
    sat_queries: int
    verdict_cell: CellId
    verdict_status: Status
    new_clue_id: str | None
    primary_vars_count: int
    aux_vars_count: int
    clause_count: int
    stats: SolverStatsSnapshot = field(default_factory=SolverStatsSnapshot)


@dataclass(frozen=True)
class DeductionResult:
    """Complete execution trace and aggregated benchmark metrics from a deduction run."""

    terminal_status: TerminalStatus
    steps: tuple[DeductionStepTrace, ...]
    total_sat_queries: int
    total_stats: SolverStatsSnapshot
    total_wall_time_ms: float
    max_primary_vars: int = 0
    max_aux_vars: int = 0
    max_clauses: int = 0


@dataclass(frozen=True)
class CompleteCluesPublicCell:
    """Minimal cell presentation for complete clue set encoding."""

    character: Character
    known_status: Status | None


@dataclass(frozen=True)
class CompleteCluesPublicState:
    """Public-only view containing all puzzle clues and initial givens for uniqueness checking."""

    size: int
    _clues: tuple[Clue, ...]
    _known: Mapping[CellId, Status]
    _unresolved: tuple[CellId, ...] = ()
    session_id: str = "uniqueness"
    revision: int = 0
    cells: tuple[Any, ...] = ()
    cols: int | None = None

    @property
    def num_cols(self) -> int:
        return self.size if self.cols is None else self.cols

    def revealed_clues(self) -> tuple[Clue, ...]:
        """Return all clues in the complete clue set."""
        return self._clues

    def known_statuses(self) -> dict[CellId, Status]:
        """Return only the initially revealed statuses (never hidden answers)."""
        return dict(self._known)

    def unresolved_cells(self) -> tuple[CellId, ...]:
        """Return unrevealed cells in row-major order."""
        return self._unresolved

    def is_solved(self) -> bool:
        """Return True iff no unresolved cells remain."""
        return len(self._unresolved) == 0


@runtime_checkable
class EncodedKBProtocol(Protocol):
    """Structural contract matching Member 1's EncodedKB."""

    clauses: tuple[tuple[int, ...], ...]
    primary_vars_count: int
    aux_vars_count: int
    variable_map: Mapping[CellId, int]


@runtime_checkable
class CNFEncoderProtocol(Protocol):
    """Structural contract matching Member 1's CNFEncoder."""

    def encode_knowledge_base(self, state: Any) -> EncodedKBProtocol:
        """Encode the given public state into CNF clauses."""
        ...


@runtime_checkable
class SolverStatsProtocol(Protocol):
    """Structural contract matching Member 2's SolverStats."""

    decisions: int
    propagations: int
    backtracks: int
    runtime_ms: float


@runtime_checkable
class SATResultProtocol(Protocol):
    """Structural contract matching Member 2's SATResult."""

    is_sat: bool
    model: Mapping[int, bool] | None
    stats: SolverStatsProtocol


@runtime_checkable
class DPLLSolverProtocol(Protocol):
    """Structural contract matching Member 2's DPLLSolver."""

    def solve(
        self,
        clauses: Sequence[Sequence[int]],
        assumptions: Sequence[int] = (),
    ) -> SATResultProtocol:
        """Solve CNF clauses under optional literal assumptions."""
        ...

