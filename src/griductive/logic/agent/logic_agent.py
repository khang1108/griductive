"""Deductive Logic Agent using SAT-based refutation and strict no-guessing."""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Mapping

from griductive.domain.models import BoardLayout, CellId, Classification, Status
from griductive.domain.regions import resolve_region
from griductive.domain.state import PublicState, PuzzleDefinition
from griductive.engine.game_engine import GameEngine, VerifiedVerdict

from .models import (
    CNFEncoderProtocol,
    CompleteCluesPublicCell,
    CompleteCluesPublicState,
    DeductionResult,
    DeductionStepTrace,
    DPLLSolverProtocol,
    EncodedKBProtocol,
    HintResult,
    SATResultProtocol,
    SolverStatsSnapshot,
    TerminalStatus,
    VerdictAssessment,
    VerdictAssessmentType,
)

_CELL_STR_PATTERN = re.compile(r"^([A-Za-z]+)(\d+)$")


def _col_letters_to_index(letters: str) -> int:
    """Convert column letters (A=0, B=1, ..., Z=25, AA=26) to zero-based index."""
    idx = 0
    for ch in letters.upper():
        idx = idx * 26 + (ord(ch) - ord("A") + 1)
    return idx - 1


def _cell_sort_key(cell: Any) -> tuple[int, int, str]:
    """Return a deterministic row-major sort key (row_index, col_index, label)."""
    if hasattr(cell, "row") and hasattr(cell, "col"):
        return (int(cell.row), int(cell.col), str(cell))
    if isinstance(cell, str):
        match = _CELL_STR_PATTERN.match(cell.strip())
        if match:
            col_str, row_str = match.groups()
            return (int(row_str) - 1, _col_letters_to_index(col_str), cell)
    return (0, 0, str(cell))


def _format_cell(cell: Any) -> str:
    """Return human-readable coordinate label such as 'B1'."""
    if hasattr(cell, "to_label") and callable(cell.to_label):
        return str(cell.to_label())
    return str(cell)


def _normalize_status(raw_status: Any) -> Status:
    """Normalize an external Status enum or string into domain Status."""
    if isinstance(raw_status, Status):
        return raw_status
    val = raw_status.value if isinstance(raw_status, Enum) else raw_status
    return Status(str(val).upper())


def _to_stats_snapshot(raw_stats: Any) -> SolverStatsSnapshot:
    """Convert a solver stats object to SolverStatsSnapshot."""
    if raw_stats is None:
        return SolverStatsSnapshot()
    return SolverStatsSnapshot(
        decisions=int(getattr(raw_stats, "decisions", 0)),
        propagations=int(getattr(raw_stats, "propagations", 0)),
        backtracks=int(getattr(raw_stats, "backtracks", 0)),
        runtime_ms=float(getattr(raw_stats, "runtime_ms", 0.0)),
    )


def _extract_known_statuses(state: Any) -> dict[CellId, Status]:
    """Extract known/proved cell statuses from a PublicState."""
    raw = getattr(state, "known_statuses", None)
    if raw is not None:
        mapping = raw() if callable(raw) else raw
        if isinstance(mapping, Mapping):
            return {cell: _normalize_status(val) for cell, val in mapping.items()}
    return {}


def _extract_unresolved_cells(state: Any, kb: EncodedKBProtocol) -> list[Any]:
    """Return unresolved cells sorted in strict row-major order."""
    for attr in ("unresolved_cells", "unrevealed_cells"):
        raw = getattr(state, attr, None)
        if raw is not None:
            cells = list(raw() if callable(raw) else raw)
            return sorted(cells, key=_cell_sort_key)
    known = _extract_known_statuses(state)
    cells = [cell for cell in kb.variable_map if cell not in known]
    return sorted(cells, key=_cell_sort_key)


def _extract_revealed_clues(state: Any) -> tuple[Any, ...]:
    """Extract revealed clue objects from a PublicState."""
    raw = getattr(state, "revealed_clues", None)
    if raw is not None:
        vals = raw() if callable(raw) else raw
        if isinstance(vals, Mapping):
            return tuple(vals.values())
        return tuple(vals)
    return ()


def _get_clue_id(clue: Any, fallback_idx: int) -> str:
    """Extract a stable string identifier for a clue object."""
    if isinstance(clue, str):
        return clue
    for attr in ("clue_id", "id", "owner"):
        val = getattr(clue, attr, None)
        if val is not None:
            return str(val)
    return f"clue_{fallback_idx}"


def _extract_active_clue_ids(state: Any) -> tuple[str, ...]:
    """Extract active clue identifiers from a PublicState."""
    clues = _extract_revealed_clues(state)
    return tuple(_get_clue_id(clue, idx) for idx, clue in enumerate(clues))


def _clue_mentions_cell(
    clue: Any,
    cell: Any,
    board_size: int | None,
    board_cols: int | None = None,
) -> bool:
    """Check in pure Python whether a clue directly references the given cell."""
    for attr in ("target", "left", "right", "owner"):
        if getattr(clue, attr, None) == cell:
            return True

    if board_size and board_size > 0:
        layout = BoardLayout(board_size, cols=board_cols)
        for reg_attr in ("region", "left_region", "right_region"):
            region = getattr(clue, reg_attr, None)
            if region is not None:
                try:
                    if cell in resolve_region(region, layout):
                        return True
                except Exception:
                    pass
    sub_clues = getattr(clue, "clues", None)
    if sub_clues:
        return any(_clue_mentions_cell(sub, cell, board_size, board_cols) for sub in sub_clues)
    return False


def _find_related_clue_ids(state: Any, cell: Any) -> tuple[str, ...]:
    """Find active clue IDs that directly reference the target cell (zero SAT calls)."""
    board_size = getattr(state, "size", None)
    board_cols = getattr(state, "num_cols", board_size)
    clues = _extract_revealed_clues(state)
    return tuple(
        _get_clue_id(clue, idx)
        for idx, clue in enumerate(clues)
        if _clue_mentions_cell(clue, cell, board_size, board_cols)
    )


def _build_complete_clues_state(puzzle: PuzzleDefinition) -> CompleteCluesPublicState:
    """Build a public-only state with all clues and initial givens, never hidden answers."""
    initial_known = {
        cell: puzzle.get_status(cell)
        for cell in puzzle.initial_revealed
    }
    layout = puzzle.layout
    unresolved = tuple(
        cell for cell in layout.all_cells() if cell not in puzzle.initial_revealed
    )
    cells = tuple(
        CompleteCluesPublicCell(
            character=puzzle.get_character(cell),
            known_status=initial_known.get(cell),
        )
        for cell in layout.all_cells()
    )
    return CompleteCluesPublicState(
        size=puzzle.size,
        _clues=tuple(puzzle.clues),
        _known=initial_known,
        _unresolved=unresolved,
        cells=cells,
        cols=puzzle.num_cols,
    )


@dataclass(frozen=True)
class _ReferenceSATResult:
    is_sat: bool
    model: dict[int, bool] | None
    stats: SolverStatsSnapshot


class _ReferenceDPLLSolver:
    """Built-in deterministic DPLL solver with unit propagation and telemetry.

    Serves as the default solver until Member 2's griductive.logic.sat.dpll is integrated.
    """

    def solve(
        self,
        clauses: Sequence[Sequence[int]],
        assumptions: Sequence[int] = (),
    ) -> _ReferenceSATResult:
        start_ns = time.perf_counter_ns()
        decisions = 0
        propagations = 0
        backtracks = 0

        base_clauses = [tuple(c) for c in clauses]
        if any(len(c) == 0 for c in base_clauses):
            runtime_ms = (time.perf_counter_ns() - start_ns) / 1_000_000.0
            return _ReferenceSATResult(
                is_sat=False,
                model=None,
                stats=SolverStatsSnapshot(0, 0, 1, runtime_ms),
            )

        variables = sorted(
            {abs(lit) for clause in base_clauses for lit in clause}
            | {abs(lit) for lit in assumptions}
        )

        def _assign_literal(
            cur_clauses: list[tuple[int, ...]],
            cur_assign: dict[int, bool],
            lit: int,
        ) -> tuple[list[tuple[int, ...]] | None, dict[int, bool]]:
            var = abs(lit)
            val = lit > 0
            if var in cur_assign:
                if cur_assign[var] != val:
                    return None, cur_assign
                return list(cur_clauses), dict(cur_assign)

            assigned = dict(cur_assign)
            assigned[var] = val
            next_clauses: list[tuple[int, ...]] = []
            for c in cur_clauses:
                if lit in c:
                    continue
                if -lit in c:
                    reduced = tuple(x for x in c if x != -lit)
                    if not reduced:
                        return None, assigned
                    next_clauses.append(reduced)
                else:
                    next_clauses.append(c)
            return next_clauses, assigned

        def _unit_propagate(
            cur_clauses: list[tuple[int, ...]],
            cur_assign: dict[int, bool],
        ) -> tuple[list[tuple[int, ...]] | None, dict[int, bool]]:
            nonlocal propagations
            c_list = list(cur_clauses)
            assigned = dict(cur_assign)

            while True:
                unit = None
                for c in c_list:
                    if len(c) == 1:
                        unit = c[0]
                        break
                if unit is None:
                    break

                propagations += 1
                next_clauses, next_assigned = _assign_literal(c_list, assigned, unit)
                if next_clauses is None:
                    return None, next_assigned
                c_list = next_clauses
                assigned = next_assigned

            return c_list, assigned

        def _dpll(
            cur_clauses: list[tuple[int, ...]],
            cur_assign: dict[int, bool],
        ) -> dict[int, bool] | None:
            nonlocal decisions, backtracks
            reduced, new_assign = _unit_propagate(cur_clauses, cur_assign)
            if reduced is None:
                backtracks += 1
                return None
            if not reduced:
                for v in variables:
                    if v not in new_assign:
                        new_assign[v] = False
                return new_assign

            unassigned = [v for v in variables if v not in new_assign]
            if not unassigned:
                return new_assign

            branch_var = unassigned[0]
            decisions += 1

            for branch_val in (True, False):
                lit = branch_var if branch_val else -branch_var
                branch_clauses, branch_assign = _assign_literal(reduced, new_assign, lit)
                if branch_clauses is None:
                    backtracks += 1
                    continue

                sub_res = _dpll(branch_clauses, branch_assign)
                if sub_res is not None:
                    return sub_res

            return None

        init_clauses = base_clauses
        init_assign: dict[int, bool] = {}
        for lit in assumptions:
            next_init, init_assign = _assign_literal(init_clauses, init_assign, lit)
            if next_init is None:
                runtime_ms = (time.perf_counter_ns() - start_ns) / 1_000_000.0
                return _ReferenceSATResult(
                    is_sat=False,
                    model=None,
                    stats=SolverStatsSnapshot(0, 0, 1, runtime_ms),
                )
            init_clauses = next_init

        model = _dpll(init_clauses, init_assign)
        runtime_ms = (time.perf_counter_ns() - start_ns) / 1_000_000.0
        return _ReferenceSATResult(
            is_sat=model is not None,
            model=model,
            stats=SolverStatsSnapshot(decisions, propagations, backtracks, runtime_ms),
        )


def _load_default_encoder() -> CNFEncoderProtocol:
    """Lazily load Member 1's CNFEncoder when no encoder was injected."""
    from griductive.logic.cnf import CNFEncoder

    return CNFEncoder()


def _load_default_solver() -> DPLLSolverProtocol:
    """Lazily load Member 2's DPLLSolver if available, else use reference DPLL solver."""
    try:
        from griductive.logic.sat.dpll import DPLLSolver

        return DPLLSolver()
    except (ImportError, AttributeError):
        return _ReferenceDPLLSolver()


@dataclass
class _StepAnalysisContext:
    """Per-step SAT query accumulator and witness model cache (never shared across steps)."""

    kb: EncodedKBProtocol
    primary_vars: frozenset[int]
    enable_witness_cache: bool = True
    witness_models: list[Mapping[int, bool]] = field(default_factory=list)
    sat_queries: int = 0
    stats: SolverStatsSnapshot = field(default_factory=SolverStatsSnapshot)

    def is_witnessed(self, literal: int) -> bool:
        """Return True if any cached full model already satisfies the given literal."""
        if not self.enable_witness_cache:
            return False
        var = abs(literal)
        expected = literal > 0
        return any(model.get(var) is expected for model in self.witness_models)

    def query(self, solver: DPLLSolverProtocol, assumptions: tuple[int, ...]) -> SATResultProtocol:
        """Execute a SAT query, record telemetry, and cache complete satisfying models."""
        result = solver.solve(self.kb.clauses, assumptions)
        self.sat_queries += 1
        self.stats = self.stats + _to_stats_snapshot(getattr(result, "stats", None))
        if (
            self.enable_witness_cache
            and result.is_sat
            and result.model is not None
            and bool(result.model)
        ):
            self.witness_models.append(result.model)
        return result


class LogicAgent:
    """Refutation-based deductive agent enforcing strict no-guessing."""

    def __init__(
        self,
        encoder: CNFEncoderProtocol | None = None,
        solver: DPLLSolverProtocol | None = None,
        *,
        enable_witness_cache: bool = True,
    ) -> None:
        """Initialize the agent with a CNF encoder and a DPLL SAT solver."""
        self._encoder = encoder if encoder is not None else _load_default_encoder()
        self._solver = solver if solver is not None else _load_default_solver()
        self._enable_witness_cache = enable_witness_cache

    def _new_context(self, kb: EncodedKBProtocol) -> _StepAnalysisContext:
        """Create a fresh per-step analysis context."""
        return _StepAnalysisContext(
            kb=kb,
            primary_vars=frozenset(kb.variable_map.values()),
            enable_witness_cache=self._enable_witness_cache,
        )

    def _classify_cell_in_context(
        self,
        ctx: _StepAnalysisContext,
        cell: Any,
    ) -> Classification:
        """Classify a single cell via SAT refutation under the step context."""
        var_id = ctx.kb.variable_map[cell]

        neg_sat = (
            True
            if ctx.is_witnessed(-var_id)
            else ctx.query(self._solver, (-var_id,)).is_sat
        )
        pos_sat = (
            True
            if ctx.is_witnessed(var_id)
            else ctx.query(self._solver, (var_id,)).is_sat
        )

        if not neg_sat and not pos_sat:
            return Classification.INCONSISTENT
        if not neg_sat:
            return Classification.CRIMINAL
        if not pos_sat:
            return Classification.INNOCENT
        return Classification.UNKNOWN

    def classify_all(self, state: PublicState | Any) -> dict[Any, Classification]:
        """Classify every unresolved cell as CRIMINAL, INNOCENT, UNKNOWN, or INCONSISTENT."""
        kb = self._encoder.encode_knowledge_base(state)
        unresolved = _extract_unresolved_cells(state, kb)
        ctx = self._new_context(kb)
        classifications: dict[Any, Classification] = {}

        for idx, cell in enumerate(unresolved):
            classification = self._classify_cell_in_context(ctx, cell)
            classifications[cell] = classification
            if classification is Classification.INCONSISTENT:
                for remaining in unresolved[idx + 1 :]:
                    classifications[remaining] = Classification.INCONSISTENT
                break

        return classifications

    def suggest_next(self, state: PublicState | Any) -> HintResult | None:
        """Return the first deterministically provable cell in row-major order, or None."""
        kb = self._encoder.encode_knowledge_base(state)
        unresolved = _extract_unresolved_cells(state, kb)
        if not unresolved:
            return None

        ctx = self._new_context(kb)
        active_clue_ids = _extract_active_clue_ids(state)

        for cell in unresolved:
            classification = self._classify_cell_in_context(ctx, cell)
            if classification is Classification.INCONSISTENT:
                return None
            if classification in (Classification.CRIMINAL, Classification.INNOCENT):
                forced = Status(classification.value)
                cell_label = _format_cell(cell)
                related = _find_related_clue_ids(state, cell)
                lit_desc = f"¬{cell_label}" if forced is Status.CRIMINAL else f"{cell_label}"
                rel_suffix = f"; related clues: {', '.join(related)}" if related else ""
                reason = (
                    f"Forced {forced.value} for {cell_label} by refutation "
                    f"(KB ∧ {lit_desc} is UNSAT){rel_suffix}"
                )
                return HintResult(
                    cell=cell,
                    forced_status=forced,
                    reason=reason,
                    active_clue_ids=active_clue_ids,
                )

        return None

    def assess_verdict(
        self,
        state: PublicState | Any,
        cell: Any,
        status: Status,
    ) -> VerdictAssessment:
        """Assess whether a proposed verdict is provable, contradicted, or not provable."""
        proposed = _normalize_status(status)
        cell_label = _format_cell(cell)

        known = _extract_known_statuses(state)
        if cell in known:
            existing = known[cell]
            return VerdictAssessment(
                cell=cell,
                proposed_status=proposed,
                assessment=VerdictAssessmentType.ALREADY_SOLVED,
                forced_status=existing,
                reason=f"Cell {cell_label} is already solved as {existing.value}",
            )

        kb = self._encoder.encode_knowledge_base(state)
        ctx = self._new_context(kb)
        classification = self._classify_cell_in_context(ctx, cell)

        if classification is Classification.INCONSISTENT:
            return VerdictAssessment(
                cell=cell,
                proposed_status=proposed,
                assessment=VerdictAssessmentType.INCONSISTENT,
                forced_status=None,
                reason="Current knowledge base is inconsistent (UNSAT)",
                sat_queries=ctx.sat_queries,
                stats=ctx.stats,
            )

        if classification is Classification.UNKNOWN:
            return VerdictAssessment(
                cell=cell,
                proposed_status=proposed,
                assessment=VerdictAssessmentType.NOT_PROVABLE,
                forced_status=None,
                reason=f"Neither CRIMINAL nor INNOCENT is entailed for {cell_label}",
                sat_queries=ctx.sat_queries,
                stats=ctx.stats,
            )

        forced = Status(classification.value)
        if forced is proposed:
            return VerdictAssessment(
                cell=cell,
                proposed_status=proposed,
                assessment=VerdictAssessmentType.PROVABLE,
                forced_status=forced,
                reason=f"{cell_label} = {forced.value} is logically entailed by KB",
                sat_queries=ctx.sat_queries,
                stats=ctx.stats,
            )

        return VerdictAssessment(
            cell=cell,
            proposed_status=proposed,
            assessment=VerdictAssessmentType.CONTRADICTED,
            forced_status=forced,
            reason=f"Opposite verdict {forced.value} is logically entailed for {cell_label}",
            sat_queries=ctx.sat_queries,
            stats=ctx.stats,
        )

    def check_uniqueness(self, puzzle: PuzzleDefinition) -> bool:
        """Return True iff the complete clue set admits exactly one assignment of primary variables."""
        complete_state = _build_complete_clues_state(puzzle)
        kb = self._encoder.encode_knowledge_base(complete_state)
        primary_vars = tuple(kb.variable_map.values())
        if not primary_vars:
            return False

        first_res = self._solver.solve(kb.clauses)
        if not first_res.is_sat or first_res.model is None:
            return False

        for var_id in primary_vars:
            if var_id not in first_res.model:
                return False

        blocking_clause = tuple(-v if first_res.model[v] else v for v in primary_vars)
        second_res = self._solver.solve(kb.clauses + (blocking_clause,))
        return not second_res.is_sat

    def run_logic_loop(
        self,
        engine: GameEngine | Any,
        *,
        timeout_ms: float | None = None,
        max_steps: int | None = None,
    ) -> DeductionResult:
        """Run the strict no-guessing deduction loop until a terminal state is reached."""
        start_ns = time.perf_counter_ns()
        steps: list[DeductionStepTrace] = []
        total_queries = 0
        total_stats = SolverStatsSnapshot()
        max_primary = 0
        max_aux = 0
        max_clauses = 0

        def _build_result(terminal: TerminalStatus) -> DeductionResult:
            wall_ms = (time.perf_counter_ns() - start_ns) / 1_000_000.0
            return DeductionResult(
                terminal_status=terminal,
                steps=tuple(steps),
                total_sat_queries=total_queries,
                total_stats=total_stats,
                total_wall_time_ms=wall_ms,
                max_primary_vars=max_primary,
                max_aux_vars=max_aux,
                max_clauses=max_clauses,
            )

        while not engine.is_solved():
            elapsed_ms = (time.perf_counter_ns() - start_ns) / 1_000_000.0
            if timeout_ms is not None and elapsed_ms >= timeout_ms:
                return _build_result(TerminalStatus.TIMEOUT)
            if max_steps is not None and len(steps) >= max_steps:
                return _build_result(TerminalStatus.TIMEOUT)

            state = engine.get_public_state()
            kb = self._encoder.encode_knowledge_base(state)
            max_primary = max(max_primary, kb.primary_vars_count)
            max_aux = max(max_aux, kb.aux_vars_count)
            max_clauses = max(max_clauses, len(kb.clauses))

            unresolved = _extract_unresolved_cells(state, kb)
            if not unresolved:
                return _build_result(TerminalStatus.SOLVED)

            ctx = self._new_context(kb)
            active_clue_ids = _extract_active_clue_ids(state)
            forced_cell: Any = None
            forced_status: Status | None = None

            for cell in unresolved:
                classification = self._classify_cell_in_context(ctx, cell)
                if classification is Classification.INCONSISTENT:
                    total_queries += ctx.sat_queries
                    total_stats = total_stats + ctx.stats
                    return _build_result(TerminalStatus.INCONSISTENT)
                if classification in (Classification.CRIMINAL, Classification.INNOCENT):
                    forced_cell = cell
                    forced_status = Status(classification.value)
                    break

            total_queries += ctx.sat_queries
            total_stats = total_stats + ctx.stats

            if forced_cell is None or forced_status is None:
                return _build_result(TerminalStatus.STUCK_NO_FORCIBLE_MOVE)

            verdict = VerifiedVerdict(
                session_id=state.session_id,
                revision=state.revision,
                cell=forced_cell,
                status=forced_status,
            )
            try:
                reveal = engine.commit_verified_verdict(verdict)
            except (ValueError, RuntimeError):
                return _build_result(TerminalStatus.ENGINE_REJECTED)

            new_clue = getattr(reveal, "revealed_clue", None)
            new_clue_id = _get_clue_id(new_clue, len(steps)) if new_clue is not None else None

            steps.append(
                DeductionStepTrace(
                    step=len(steps) + 1,
                    active_clue_ids=active_clue_ids,
                    sat_queries=ctx.sat_queries,
                    verdict_cell=forced_cell,
                    verdict_status=forced_status,
                    new_clue_id=new_clue_id,
                    primary_vars_count=kb.primary_vars_count,
                    aux_vars_count=kb.aux_vars_count,
                    clause_count=len(kb.clauses),
                    stats=ctx.stats,
                )
            )

        return _build_result(TerminalStatus.SOLVED)

