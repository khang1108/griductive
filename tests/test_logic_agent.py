"""Comprehensive tests for Member 3's Deductive Logic Agent integrated with upstream domain & engine."""

from __future__ import annotations

import itertools
from dataclasses import dataclass
from typing import Any, Mapping, Sequence

import pytest

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
from griductive.domain.models import (
    BoardLayout,
    CellId,
    Character,
    Classification,
    Parity,
    Status,
)
from griductive.domain.regions import NeighborsRegion, RowRegion, resolve_region
from griductive.domain.state import PublicCell, PublicState, PuzzleDefinition
from griductive.engine.game_engine import GameEngine
from griductive.engine.puzzle_db import load_puzzle_from_sqlite
from griductive.logic.agent import (
    DeductionResult,
    LogicAgent,
    TerminalStatus,
    VerdictAssessmentType,
)


# ---------------------------------------------------------------------------
# Reference test doubles matching Member 1 & Member 2 contracts
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ReferenceEncodedKB:
    clauses: tuple[tuple[int, ...], ...]
    primary_vars_count: int
    aux_vars_count: int
    variable_map: dict[CellId, int]


@dataclass(frozen=True)
class ReferenceSolverStats:
    decisions: int
    propagations: int
    backtracks: int
    runtime_ms: float


@dataclass(frozen=True)
class ReferenceSATResult:
    is_sat: bool
    model: dict[int, bool] | None
    stats: ReferenceSolverStats


class ReferenceCNFEncoder:
    """Exact reference CNF encoder over real griductive.domain clues for testing."""

    def __init__(self, *, extra_aux_clauses: tuple[tuple[int, ...], ...] = ()) -> None:
        self._extra_aux_clauses = extra_aux_clauses

    def encode_knowledge_base(self, state: Any) -> ReferenceEncodedKB:
        size = state.size
        layout = BoardLayout(size)
        var_map = {cell: cell.to_var(size) for cell in layout.all_cells()}
        clauses: list[tuple[int, ...]] = list(self._extra_aux_clauses)

        for cell, status in state.known_statuses().items():
            v = var_map[cell]
            clauses.append((v,) if status is Status.CRIMINAL else (-v,))

        for clue in state.revealed_clues():
            clauses.extend(self._encode_clue(clue, layout, var_map))

        aux_vars = {
            abs(lit)
            for c in self._extra_aux_clauses
            for lit in c
            if abs(lit) > size * size
        }
        return ReferenceEncodedKB(
            clauses=tuple(clauses),
            primary_vars_count=size * size,
            aux_vars_count=len(aux_vars),
            variable_map=var_map,
        )

    def _encode_clue(
        self,
        clue: Clue,
        layout: BoardLayout,
        var_map: dict[CellId, int],
    ) -> list[tuple[int, ...]]:
        if isinstance(clue, FactClue):
            v = var_map[clue.target]
            return [(v,) if clue.status is Status.CRIMINAL else (-v,)]
        if isinstance(clue, SameClue):
            a, b = var_map[clue.left], var_map[clue.right]
            return [(-a, b), (a, -b)]
        if isinstance(clue, DifferentClue):
            a, b = var_map[clue.left], var_map[clue.right]
            return [(a, b), (-a, -b)]
        if isinstance(clue, (AtLeastClue, AtMostClue, ExactlyClue)):
            cells = resolve_region(clue.region, layout)
            vars_in_reg = [var_map[c] for c in cells]
            out: list[tuple[int, ...]] = []
            if isinstance(clue, (AtLeastClue, ExactlyClue)):
                subset_size = len(vars_in_reg) - clue.k + 1
                if subset_size <= 0:
                    pass
                elif subset_size > len(vars_in_reg):
                    out.append(())
                else:
                    for comb in itertools.combinations(vars_in_reg, subset_size):
                        out.append(tuple(comb))
            if isinstance(clue, (AtMostClue, ExactlyClue)):
                subset_size = clue.k + 1
                if subset_size <= len(vars_in_reg):
                    for comb in itertools.combinations(vars_in_reg, subset_size):
                        out.append(tuple(-v for v in comb))
            return out
        if isinstance(clue, ParityClue):
            cells = resolve_region(clue.region, layout)
            vars_in_reg = [var_map[c] for c in cells]
            want_odd = clue.parity is Parity.ODD
            out = []
            for bits in itertools.product((False, True), repeat=len(vars_in_reg)):
                if (sum(bits) % 2 == 1) != want_odd:
                    out.append(tuple(-v if b else v for v, b in zip(vars_in_reg, bits)))
            return out
        raise TypeError(f"Unsupported clue type: {type(clue)}")


class ReferenceTruthTableSolver:
    """Exact SAT solver for testing LogicAgent without depending on Member 2."""

    def __init__(self, *, return_empty_model: bool = False) -> None:
        self.call_count = 0
        self._return_empty_model = return_empty_model

    def solve(
        self,
        clauses: Sequence[Sequence[int]],
        assumptions: Sequence[int] = (),
    ) -> ReferenceSATResult:
        self.call_count += 1
        all_clauses = tuple(tuple(c) for c in clauses) + tuple((lit,) for lit in assumptions)
        variables = sorted({abs(lit) for clause in all_clauses for lit in clause})

        if not variables:
            has_empty = any(len(c) == 0 for c in all_clauses)
            return ReferenceSATResult(
                is_sat=not has_empty,
                model={} if not has_empty else None,
                stats=ReferenceSolverStats(decisions=0, propagations=0, backtracks=0, runtime_ms=0.05),
            )

        backtracks = 0
        for bits in itertools.product((False, True), repeat=len(variables)):
            assignment = dict(zip(variables, bits))
            if all(
                any((assignment[abs(lit)] if lit > 0 else not assignment[abs(lit)]) for lit in c)
                for c in all_clauses
            ):
                return ReferenceSATResult(
                    is_sat=True,
                    model={} if self._return_empty_model else assignment,
                    stats=ReferenceSolverStats(
                        decisions=len(variables),
                        propagations=len(all_clauses),
                        backtracks=backtracks,
                        runtime_ms=0.1,
                    ),
                )
            backtracks += 1

        return ReferenceSATResult(
            is_sat=False,
            model=None,
            stats=ReferenceSolverStats(
                decisions=len(variables),
                propagations=len(all_clauses),
                backtracks=backtracks,
                runtime_ms=0.1,
            ),
        )


def _make_2x2_puzzle(
    statuses: tuple[Status, Status, Status, Status],
    clues: tuple[Clue, Clue, Clue, Clue],
    initial_revealed: frozenset[CellId],
) -> PuzzleDefinition:
    layout = BoardLayout(2)
    chars = tuple(
        Character(cell_id=c, name=f"Char_{c.to_label()}", profession="Clerk")
        for c in layout.all_cells()
    )
    return PuzzleDefinition(
        puzzle_id="test_2x2",
        size=2,
        characters=chars,
        hidden_statuses=statuses,
        clues=clues,
        initial_revealed=initial_revealed,
    )


# ---------------------------------------------------------------------------
# Integration & Behavioral Tests
# ---------------------------------------------------------------------------


def test_classify_all_and_inconsistent_with_real_public_state() -> None:
    a1, b1, a2, b2 = CellId(0, 0), CellId(0, 1), CellId(1, 0), CellId(1, 1)
    chars = tuple(
        Character(cell_id=c, name=f"P_{c.to_label()}", profession="Guard")
        for c in (a1, b1, a2, b2)
    )
    # A1 is revealed CRIMINAL with clue: SameClue(A1, B1) -> B1 forced CRIMINAL
    # A2, B2 are unrevealed with no constraints -> UNKNOWN
    state = PublicState(
        session_id="s1",
        revision=0,
        size=2,
        cells=(
            PublicCell(chars[0], Status.CRIMINAL, SameClue(clue_id="c_a1", owner=a1, left=a1, right=b1)),
            PublicCell(chars[1], None, None),
            PublicCell(chars[2], None, None),
            PublicCell(chars[3], None, None),
        ),
    )

    agent = LogicAgent(ReferenceCNFEncoder(), ReferenceTruthTableSolver())
    classified = agent.classify_all(state)

    assert list(classified.keys()) == [b1, a2, b2]
    assert classified[b1] is Classification.CRIMINAL
    assert classified[a2] is Classification.UNKNOWN
    assert classified[b2] is Classification.UNKNOWN

    # Contradictory state: A1 is CRIMINAL, but its clue says FactClue(A1, INNOCENT)
    bad_state = PublicState(
        session_id="s2",
        revision=0,
        size=2,
        cells=(
            PublicCell(chars[0], Status.CRIMINAL, FactClue(clue_id="bad", owner=a1, target=a1, status=Status.INNOCENT)),
            PublicCell(chars[1], None, None),
            PublicCell(chars[2], None, None),
            PublicCell(chars[3], None, None),
        ),
    )
    bad_classified = agent.classify_all(bad_state)
    assert bad_classified[b1] is Classification.INCONSISTENT
    assert bad_classified[a2] is Classification.INCONSISTENT


def test_suggest_next_row_major_and_strict_no_guessing() -> None:
    a1, b1, a2, b2 = CellId(0, 0), CellId(0, 1), CellId(1, 0), CellId(1, 1)
    chars = tuple(
        Character(cell_id=c, name=f"P_{c.to_label()}", profession="Cook")
        for c in (a1, b1, a2, b2)
    )
    # A1 forces A2=CRIMINAL, B2 forces B1=INNOCENT.
    # Unresolved are B1 (0, 1) and A2 (1, 0). Row-major MUST return B1 before A2!
    state = PublicState(
        session_id="s1",
        revision=0,
        size=2,
        cells=(
            PublicCell(chars[0], Status.INNOCENT, FactClue(clue_id="c_a1", owner=a1, target=a2, status=Status.CRIMINAL)),
            PublicCell(chars[1], None, None),
            PublicCell(chars[2], None, None),
            PublicCell(chars[3], Status.CRIMINAL, FactClue(clue_id="c_b2", owner=b2, target=b1, status=Status.INNOCENT)),
        ),
    )

    agent = LogicAgent(ReferenceCNFEncoder(), ReferenceTruthTableSolver())
    hint = agent.suggest_next(state)

    assert hint is not None
    assert hint.cell == b1
    assert hint.forced_status is Status.INNOCENT
    assert "c_b2" in hint.active_clue_ids
    assert "c_b2" in hint.reason

    # Strict no-guessing: ambiguous clue returns None
    ambiguous = PublicState(
        session_id="s1",
        revision=0,
        size=2,
        cells=(
            PublicCell(chars[0], Status.INNOCENT, DifferentClue(clue_id="diff", owner=a1, left=b1, right=a2)),
            PublicCell(chars[1], None, None),
            PublicCell(chars[2], None, None),
            PublicCell(chars[3], Status.INNOCENT, FactClue(clue_id="self", owner=b2, target=b2, status=Status.INNOCENT)),
        ),
    )
    assert agent.suggest_next(ambiguous) is None


def test_witness_cache_cuts_queries_and_handles_empty_mock_models() -> None:
    a1, b1, a2, b2 = CellId(0, 0), CellId(0, 1), CellId(1, 0), CellId(1, 1)
    chars = tuple(
        Character(cell_id=c, name=f"P_{c.to_label()}", profession="Farmer")
        for c in (a1, b1, a2, b2)
    )
    state = PublicState(
        session_id="s1",
        revision=0,
        size=2,
        cells=(
            PublicCell(chars[0], Status.INNOCENT, ExactlyClue(clue_id="n1", owner=a1, region=NeighborsRegion(a1), k=1)),
            PublicCell(chars[1], None, None),
            PublicCell(chars[2], None, None),
            PublicCell(chars[3], None, None),
        ),
    )

    solver_plain = ReferenceTruthTableSolver()
    solver_cached = ReferenceTruthTableSolver()
    res_plain = LogicAgent(ReferenceCNFEncoder(), solver_plain, enable_witness_cache=False).classify_all(state)
    res_cached = LogicAgent(ReferenceCNFEncoder(), solver_cached, enable_witness_cache=True).classify_all(state)

    assert res_plain == res_cached
    assert solver_cached.call_count < solver_plain.call_count

    mock_solver = ReferenceTruthTableSolver(return_empty_model=True)
    res_mock = LogicAgent(ReferenceCNFEncoder(), mock_solver, enable_witness_cache=True).classify_all(state)
    assert res_mock == res_plain


def test_assess_verdict_outcomes() -> None:
    a1, b1, a2, b2 = CellId(0, 0), CellId(0, 1), CellId(1, 0), CellId(1, 1)
    chars = tuple(
        Character(cell_id=c, name=f"P_{c.to_label()}", profession="Painter")
        for c in (a1, b1, a2, b2)
    )
    state = PublicState(
        session_id="s1",
        revision=0,
        size=2,
        cells=(
            PublicCell(chars[0], Status.CRIMINAL, FactClue(clue_id="c1", owner=a1, target=b1, status=Status.CRIMINAL)),
            PublicCell(chars[1], None, None),
            PublicCell(chars[2], None, None),
            PublicCell(chars[3], None, None),
        ),
    )
    agent = LogicAgent(ReferenceCNFEncoder(), ReferenceTruthTableSolver())

    assert agent.assess_verdict(state, b1, Status.CRIMINAL).assessment is VerdictAssessmentType.PROVABLE
    assert agent.assess_verdict(state, b1, Status.INNOCENT).assessment is VerdictAssessmentType.CONTRADICTED
    assert agent.assess_verdict(state, a2, Status.CRIMINAL).assessment is VerdictAssessmentType.NOT_PROVABLE
    already = agent.assess_verdict(state, a1, Status.CRIMINAL)
    assert already.assessment is VerdictAssessmentType.ALREADY_SOLVED
    assert already.sat_queries == 0


def test_check_uniqueness_with_aux_vars_and_real_puzzle_definition() -> None:
    a1, b1, a2, b2 = CellId(0, 0), CellId(0, 1), CellId(1, 0), CellId(1, 1)
    clues = (
        FactClue(clue_id="c1", owner=a1, target=b1, status=Status.INNOCENT),
        FactClue(clue_id="c2", owner=b1, target=a2, status=Status.CRIMINAL),
        FactClue(clue_id="c3", owner=a2, target=b2, status=Status.INNOCENT),
        FactClue(clue_id="c4", owner=b2, target=a1, status=Status.CRIMINAL),
    )
    puzzle = _make_2x2_puzzle(
        statuses=(Status.CRIMINAL, Status.INNOCENT, Status.CRIMINAL, Status.INNOCENT),
        clues=clues,
        initial_revealed=frozenset({a1}),
    )

    # Inject an unconstrained auxiliary variable 99 to verify aux vars are NOT negated in blocking clause
    encoder_with_aux = ReferenceCNFEncoder(extra_aux_clauses=((99, -99),))
    agent = LogicAgent(encoder_with_aux, ReferenceTruthTableSolver())
    assert agent.check_uniqueness(puzzle) is True

    # Non-unique puzzle: B2 is unconstrained
    non_unique = _make_2x2_puzzle(
        statuses=(Status.CRIMINAL, Status.INNOCENT, Status.CRIMINAL, Status.INNOCENT),
        clues=(
            FactClue(clue_id="c1", owner=a1, target=b1, status=Status.INNOCENT),
            FactClue(clue_id="c2", owner=b1, target=a2, status=Status.CRIMINAL),
            FactClue(clue_id="c3", owner=a2, target=a1, status=Status.CRIMINAL),
            FactClue(clue_id="c4", owner=b2, target=a1, status=Status.CRIMINAL),
        ),
        initial_revealed=frozenset({a1}),
    )
    assert agent.check_uniqueness(non_unique) is False


def test_run_logic_loop_on_real_game_engine_and_sqlite_puzzle() -> None:
    # 1. Test progressive solving on a 2x2 chain using REAL GameEngine
    a1, b1, a2, b2 = CellId(0, 0), CellId(0, 1), CellId(1, 0), CellId(1, 1)
    puzzle_2x2 = _make_2x2_puzzle(
        statuses=(Status.CRIMINAL, Status.INNOCENT, Status.CRIMINAL, Status.INNOCENT),
        clues=(
            FactClue(clue_id="c_a1", owner=a1, target=b1, status=Status.INNOCENT),
            FactClue(clue_id="c_b1", owner=b1, target=a2, status=Status.CRIMINAL),
            FactClue(clue_id="c_a2", owner=a2, target=b2, status=Status.INNOCENT),
            FactClue(clue_id="c_b2", owner=b2, target=a1, status=Status.CRIMINAL),
        ),
        initial_revealed=frozenset({a1}),
    )
    engine = GameEngine(puzzle_2x2)
    agent = LogicAgent(ReferenceCNFEncoder(), ReferenceTruthTableSolver())
    res: DeductionResult = agent.run_logic_loop(engine)

    assert res.terminal_status is TerminalStatus.SOLVED
    assert engine.is_solved() is True
    assert len(res.steps) == 3
    assert [s.verdict_cell for s in res.steps] == [b1, a2, b2]
    assert res.total_sat_queries == sum(s.sat_queries for s in res.steps)

    # 2. Test on real 3x3 tutorial puzzle loaded from data/puzzle/puzzles.db!
    real_puzzle = load_puzzle_from_sqlite("hoanglong_3x3_tutorial")
    real_engine = GameEngine(real_puzzle)
    real_res = agent.run_logic_loop(real_engine)

    assert real_res.terminal_status is TerminalStatus.SOLVED
    assert real_engine.is_solved() is True
    assert agent.check_uniqueness(real_puzzle) is True

    # 3. Verify timeout & stuck terminal states
    stuck_puzzle = _make_2x2_puzzle(
        statuses=(Status.CRIMINAL, Status.INNOCENT, Status.CRIMINAL, Status.INNOCENT),
        clues=(
            ExactlyClue(clue_id="c_a1", owner=a1, region=RowRegion(1), k=1),
            FactClue(clue_id="c_b1", owner=b1, target=b1, status=Status.INNOCENT),
            FactClue(clue_id="c_a2", owner=a2, target=a2, status=Status.CRIMINAL),
            FactClue(clue_id="c_b2", owner=b2, target=b2, status=Status.INNOCENT),
        ),
        initial_revealed=frozenset({a1}),
    )
    stuck_res = agent.run_logic_loop(GameEngine(stuck_puzzle))
    assert stuck_res.terminal_status is TerminalStatus.STUCK_NO_FORCIBLE_MOVE

    timeout_res = agent.run_logic_loop(GameEngine(puzzle_2x2), max_steps=1)
    assert timeout_res.terminal_status is TerminalStatus.TIMEOUT
    assert len(timeout_res.steps) == 1


def test_logic_agent_default_init_with_real_cnf_encoder() -> None:
    """Test LogicAgent() zero-args constructor using real CNFEncoder and default solver."""
    from griductive.logic.cnf import CNFEncoder

    agent = LogicAgent()  # Zero arguments, uses CNFEncoder() and default DPLL solver
    assert isinstance(agent._encoder, CNFEncoder)

    real_puzzle = load_puzzle_from_sqlite("hoanglong_3x3_tutorial")
    real_engine = GameEngine(real_puzzle)

    # 1. Test suggest_next
    hint = agent.suggest_next(real_engine.get_public_state())
    assert hint is not None
    assert hint.forced_status in (Status.CRIMINAL, Status.INNOCENT)

    # 2. Test run_logic_loop end-to-end
    res = agent.run_logic_loop(real_engine)
    assert res.terminal_status is TerminalStatus.SOLVED
    assert real_engine.is_solved() is True
    assert len(res.steps) > 0

    # 3. Test check_uniqueness with real CNFEncoder
    is_unique = agent.check_uniqueness(real_puzzle)
    assert is_unique is True
