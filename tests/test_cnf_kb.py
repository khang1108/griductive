"""Level 5–6: GAME SCENARIOS — full knowledge-base encoding from PublicState,
inference via refutation (KB ∧ ¬x ⊨ ⊥), contradictions, and all 14 real puzzles.
"""
from __future__ import annotations

import pytest

from cnf_helpers import cell, count_primary_models, entails, is_satisfiable, make_state, satisfied_by
from griductive.domain.clues import (
    AtLeastClue,
    AtMostClue,
    DifferentClue,
    ExactlyClue,
    FactClue,
    ParityClue,
    SameClue,
)
from griductive.domain.models import CellId, Parity, Status
from griductive.domain.regions import ColumnRegion, ExplicitRegion, NeighborsRegion, RowRegion
from griductive.engine.game_engine import GameEngine, VerifiedVerdict
from griductive.engine.puzzle_db import list_puzzles_from_sqlite, load_puzzle_from_sqlite
from griductive.logic.cnf import CNFEncoder, EncodedKB

C, I = Status.CRIMINAL, Status.INNOCENT
ENC = CNFEncoder()


def fact(owner: str, target: str, status: Status, cid: str = "f") -> FactClue:
    return FactClue(clue_id=f"{cid}_{owner}", owner=cell(owner), target=cell(target), status=status)


# ===========================================================================
# 1. EncodedKB contract
# ===========================================================================

class TestEncodedKBContract:
    def test_empty_board_has_no_clauses(self) -> None:
        kb = ENC.encode_knowledge_base(make_state(3))
        assert kb.clauses == ()
        assert kb.primary_vars_count == 9 and kb.aux_vars_count == 0
        assert len(kb.variable_map) == 9

    def test_empty_board_has_all_models(self) -> None:
        kb = ENC.encode_knowledge_base(make_state(2))
        assert count_primary_models(kb.clauses, 2) == 16

    def test_revealed_status_becomes_unit_clause(self) -> None:
        state = make_state(3, {cell("A1"): (I, fact("A1", "B1", C)), cell("C3"): (C, fact("C3", "C3", C))})
        kb = ENC.encode_knowledge_base(state)
        assert (-1,) in kb.clauses and (9,) in kb.clauses

    def test_kb_is_immutable_and_typed(self) -> None:
        kb = ENC.encode_knowledge_base(make_state(3, {cell("A1"): (I, fact("A1", "B1", C))}))
        assert isinstance(kb, EncodedKB)
        assert isinstance(kb.clauses, tuple) and all(isinstance(c, tuple) for c in kb.clauses)
        with pytest.raises(Exception):
            kb.clauses = ()  # type: ignore[misc]

    def test_all_literals_within_declared_var_range(self) -> None:
        state = make_state(3, {
            cell("B2"): (C, ParityClue(clue_id="p", owner=cell("B2"), region=NeighborsRegion(cell("B2")), parity=Parity.ODD)),
            cell("A1"): (I, ParityClue(clue_id="q", owner=cell("A1"), region=RowRegion(2), parity=Parity.EVEN)),
        })
        kb = ENC.encode_knowledge_base(state)
        assert kb.aux_vars_count == 6 + 1
        for clause in kb.clauses:
            for lit in clause:
                assert 1 <= abs(lit) <= kb.total_vars_count

    def test_duplicate_clues_are_deduplicated(self) -> None:
        state = make_state(3, {
            cell("A1"): (I, fact("A1", "B1", C)),
            cell("C1"): (I, fact("C1", "B1", C)),  # same information said twice
        })
        kb = ENC.encode_knowledge_base(state)
        assert kb.clauses.count((2,)) == 1
        assert len(kb.clauses) == len(set(kb.clauses))

    def test_encoding_same_state_twice_is_identical(self) -> None:
        state = make_state(3, {cell("B2"): (C, ParityClue(clue_id="p", owner=cell("B2"), region=RowRegion(0), parity=Parity.ODD))})
        assert ENC.encode_knowledge_base(state) == ENC.encode_knowledge_base(state)

    def test_encoder_is_stateless_between_calls(self) -> None:
        """Aux vars must restart at N²+1 for every new KB (no leakage between calls)."""
        s = make_state(3, {cell("B2"): (C, ParityClue(clue_id="p", owner=cell("B2"), region=RowRegion(0), parity=Parity.ODD))})
        a = ENC.encode_knowledge_base(s)
        b = ENC.encode_knowledge_base(s)
        assert a.aux_vars_count == b.aux_vars_count == 1


# ===========================================================================
# 2. Deduction scenarios (what TV2/TV3 will do with our CNF)
# ===========================================================================

class TestDeductionScenarios:
    def test_brainstorm_example_forces_b1_and_a2(self) -> None:
        """A1, C1 innocent; A1 says SAME(B1,A2); C1 says EXACTLY 1 in row 1."""
        state = make_state(3, {
            cell("A1"): (I, SameClue(clue_id="s", owner=cell("A1"), left=cell("B1"), right=cell("A2"))),
            cell("C1"): (I, ExactlyClue(clue_id="e", owner=cell("C1"), region=RowRegion(0), k=1)),
        })
        kb = ENC.encode_knowledge_base(state).clauses
        assert entails(kb, 2)    # B1 criminal
        assert entails(kb, 4)    # A2 criminal
        assert not entails(kb, 5) and not entails(kb, -5)  # B2 unknown

    def test_fact_chain(self) -> None:
        state = make_state(3, {cell("A1"): (I, fact("A1", "C3", C))})
        kb = ENC.encode_knowledge_base(state).clauses
        assert entails(kb, 9) and not entails(kb, -9)

    def test_same_propagates_known_status(self) -> None:
        state = make_state(3, {cell("A1"): (C, SameClue(clue_id="s", owner=cell("A1"), left=cell("A1"), right=cell("B3")))})
        assert entails(ENC.encode_knowledge_base(state).clauses, 8)

    def test_different_propagates_known_status(self) -> None:
        state = make_state(3, {cell("A1"): (C, DifferentClue(clue_id="d", owner=cell("A1"), left=cell("A1"), right=cell("B3")))})
        assert entails(ENC.encode_knowledge_base(state).clauses, -8)

    def test_different_chain_two_hops(self) -> None:
        state = make_state(3, {
            cell("A1"): (C, DifferentClue(clue_id="d1", owner=cell("A1"), left=cell("A1"), right=cell("B1"))),
            cell("C3"): (I, DifferentClue(clue_id="d2", owner=cell("C3"), left=cell("B1"), right=cell("C1"))),
        })
        kb = ENC.encode_knowledge_base(state).clauses
        assert entails(kb, -2) and entails(kb, 3)

    def test_at_most_zero_clears_neighbours(self) -> None:
        state = make_state(3, {cell("B2"): (I, AtMostClue(clue_id="a", owner=cell("B2"), region=NeighborsRegion(cell("B2")), k=0))})
        kb = ENC.encode_knowledge_base(state).clauses
        for v in (1, 2, 3, 4, 6, 7, 8, 9):
            assert entails(kb, -v)

    def test_exactly_remaining_slot_after_known_criminals(self) -> None:
        """Row has exactly 2 criminals, two already known criminal → third forced innocent."""
        state = make_state(3, {
            cell("A1"): (C, ExactlyClue(clue_id="e", owner=cell("A1"), region=RowRegion(0), k=2)),
            cell("B1"): (C, fact("B1", "B1", C)),
        })
        assert entails(ENC.encode_knowledge_base(state).clauses, -3)

    def test_at_least_with_only_one_unknown_left(self) -> None:
        state = make_state(3, {
            cell("A1"): (I, AtLeastClue(clue_id="a", owner=cell("A1"), region=ColumnRegion(0), k=1)),
            cell("A2"): (I, fact("A2", "A2", I)),
        })
        assert entails(ENC.encode_knowledge_base(state).clauses, 7)

    def test_parity_forces_last_cell(self) -> None:
        """Row 3 is ODD; A3 criminal, B3 criminal → C3 must be criminal (3 = odd)."""
        state = make_state(3, {
            cell("A3"): (C, ParityClue(clue_id="p", owner=cell("A3"), region=RowRegion(2), parity=Parity.ODD)),
            cell("B3"): (C, fact("B3", "B3", C)),
        })
        kb = ENC.encode_knowledge_base(state).clauses
        assert entails(kb, 9) and not entails(kb, -9)

    def test_parity_with_two_unknowns_forces_nothing_alone(self) -> None:
        state = make_state(3, {cell("A3"): (I, ParityClue(clue_id="p", owner=cell("A3"), region=RowRegion(2), parity=Parity.ODD))})
        kb = ENC.encode_knowledge_base(state).clauses
        for v in (8, 9):
            assert not entails(kb, v) and not entails(kb, -v)

    def test_combination_needs_two_clues(self) -> None:
        """Neither clue alone decides B1; together they do (the 'no guessing' essence)."""
        exact = ExactlyClue(clue_id="e", owner=cell("A1"), region=RowRegion(0), k=1)
        diff = DifferentClue(clue_id="d", owner=cell("B3"), left=cell("C1"), right=cell("B3"))
        only_exact = ENC.encode_knowledge_base(make_state(3, {cell("A1"): (I, exact)})).clauses
        assert not entails(only_exact, 2) and not entails(only_exact, -2)
        both = ENC.encode_knowledge_base(make_state(3, {cell("A1"): (I, exact), cell("B3"): (C, diff)})).clauses
        assert entails(both, 2)  # C1 innocent (≠ B3 criminal) → B1 is the only criminal

    def test_unknown_cell_stays_unknown(self) -> None:
        state = make_state(3, {cell("A1"): (I, fact("A1", "B1", C))})
        kb = ENC.encode_knowledge_base(state).clauses
        assert not entails(kb, 5) and not entails(kb, -5)

    def test_four_clue_combination(self) -> None:
        clues = {
            cell("A1"): (I, ExactlyClue(clue_id="e", owner=cell("A1"), region=RowRegion(0), k=1)),
            cell("A2"): (C, fact("A2", "B1", I)),
            cell("B2"): (I, DifferentClue(clue_id="d", owner=cell("B2"), left=cell("A2"), right=cell("B2"))),
            cell("A3"): (I, AtMostClue(clue_id="m", owner=cell("A3"), region=ColumnRegion(2), k=1)),
        }
        kb = ENC.encode_knowledge_base(make_state(2 + 1, clues)).clauses
        # A1=I, A2=C, B2=I, A3=I, B1=I → C1=C (exactly 1 in row 1)
        assert entails(kb, 3)


# ===========================================================================
# 3. Contradictions / inconsistent knowledge
# ===========================================================================

class TestContradictions:
    def test_clue_contradicts_revealed_status(self) -> None:
        state = make_state(3, {
            cell("A1"): (I, fact("A1", "B1", C)),
            cell("B1"): (I, fact("B1", "A1", I)),  # B1 revealed innocent, but A1 claims criminal
        })
        assert not is_satisfiable(ENC.encode_knowledge_base(state).clauses)

    def test_same_and_different_on_same_pair(self) -> None:
        state = make_state(3, {
            cell("A1"): (I, SameClue(clue_id="s", owner=cell("A1"), left=cell("B1"), right=cell("C1"))),
            cell("A2"): (I, DifferentClue(clue_id="d", owner=cell("A2"), left=cell("B1"), right=cell("C1"))),
        })
        assert not is_satisfiable(ENC.encode_knowledge_base(state).clauses)

    def test_impossible_count_in_kb(self) -> None:
        state = make_state(3, {cell("A1"): (I, AtLeastClue(clue_id="a", owner=cell("A1"), region=RowRegion(0), k=3))})
        assert not is_satisfiable(ENC.encode_knowledge_base(state).clauses)

    def test_cardinality_conflicts_with_parity(self) -> None:
        state = make_state(3, {
            cell("A1"): (I, ExactlyClue(clue_id="e", owner=cell("A1"), region=ColumnRegion(2), k=2)),
            cell("A2"): (I, ParityClue(clue_id="p", owner=cell("A2"), region=ColumnRegion(2), parity=Parity.ODD)),
        })
        assert not is_satisfiable(ENC.encode_knowledge_base(state).clauses)

    def test_exactly_vs_at_least(self) -> None:
        state = make_state(3, {
            cell("A1"): (I, ExactlyClue(clue_id="e", owner=cell("A1"), region=ExplicitRegion((cell("B2"), cell("C2"))), k=0)),
            cell("A2"): (I, AtLeastClue(clue_id="a", owner=cell("A2"), region=ExplicitRegion((cell("C2"),)), k=1)),
        })
        assert not is_satisfiable(ENC.encode_knowledge_base(state).clauses)


# ===========================================================================
# 4. Board sizes 1×1 .. 5×5
# ===========================================================================

@pytest.mark.parametrize("size", [1, 2, 3, 4, 5])
def test_every_board_size_fully_revealed(size: int) -> None:
    """Fully revealed board → KB has exactly one primary model (the revealed one)."""
    revealed = {}
    for r in range(size):
        for c in range(size):
            cid = CellId(r, c)
            status = C if (r + c) % 2 == 0 else I
            revealed[cid] = (status, FactClue(clue_id=f"f{r}{c}", owner=cid, target=cid, status=status))
    kb = ENC.encode_knowledge_base(make_state(size, revealed))
    assert kb.primary_vars_count == size * size
    for cid, (status, _) in revealed.items():
        v = kb.variable_map[cid]
        assert entails(kb.clauses, v if status == C else -v)


# ===========================================================================
# 5. All 14 real puzzles: soundness at every step + no-guess solvability
# ===========================================================================

PUZZLE_IDS = [p["puzzle_id"] for p in list_puzzles_from_sqlite()]


def test_database_has_14_puzzles() -> None:
    assert len(PUZZLE_IDS) == 14


@pytest.mark.parametrize("puzzle_id", PUZZLE_IDS)
def test_real_puzzle_ground_truth_satisfies_kb_at_every_step(puzzle_id: str) -> None:
    """Soundness: the hidden solution must always be a model of our KB."""
    puzzle = load_puzzle_from_sqlite(puzzle_id)
    engine = GameEngine(puzzle)
    solution = puzzle.full_solution()
    truth = {c.to_var(puzzle.size): s.is_criminal for c, s in solution.items()}

    state = engine.get_public_state()
    assert satisfied_by(ENC.encode_knowledge_base(state).clauses, truth)
    for target in state.unresolved_cells():
        cur = engine.get_public_state()
        res = engine.commit_verified_verdict(VerifiedVerdict(cur.session_id, cur.revision, target, solution[target]))
        assert satisfied_by(ENC.encode_knowledge_base(res.new_state).clauses, truth)


@pytest.mark.parametrize("puzzle_id", PUZZLE_IDS)
def test_real_puzzle_solvable_by_pure_deduction(puzzle_id: str) -> None:
    """Completeness: our CNF alone is enough to solve each puzzle without guessing.

    Simulates the TV3 loop with the reference checker: at each step find the first
    unresolved cell whose status is entailed, commit it, repeat.
    """
    puzzle = load_puzzle_from_sqlite(puzzle_id)
    engine = GameEngine(puzzle)
    solution = puzzle.full_solution()

    while not engine.is_solved():
        state = engine.get_public_state()
        kb = ENC.encode_knowledge_base(state)
        forced = None
        for target in state.unresolved_cells():
            v = kb.variable_map[target]
            if entails(kb.clauses, v):
                forced = (target, C)
                break
            if entails(kb.clauses, -v):
                forced = (target, I)
                break
        if forced is None:
            _explain_stuck_state(puzzle_id, state, kb)
        target, status = forced
        assert status == solution[target], f"{puzzle_id}: CNF forced a WRONG verdict on {target.to_label()}"
        engine.commit_verified_verdict(VerifiedVerdict(state.session_id, state.revision, target, status))


def _explain_stuck_state(puzzle_id: str, state, kb: EncodedKB) -> None:
    """When deduction gets stuck, decide who is to blame: the CNF or the puzzle.

    Brute-forces the unresolved cells with the *semantic oracle* (no CNF involved).
    - If oracle model count == CNF model count (> 1), the CNF is exact and the puzzle
      itself genuinely needs a guess at this point → xfail (puzzle-data issue).
    - Otherwise the CNF lost or invented information → hard failure.
    """
    from itertools import product

    from griductive.domain.evaluator import ClueEvaluator
    from griductive.domain.models import BoardLayout

    unresolved = state.unresolved_cells()
    if len(unresolved) > 16:
        pytest.fail(f"{puzzle_id}: stuck with {len(unresolved)} unknowns (too many to diagnose)")

    layout = BoardLayout(state.size)
    known = state.known_statuses()
    clues = state.revealed_clues()
    ev = ClueEvaluator()
    oracle = cnf = 0
    for bits in product((False, True), repeat=len(unresolved)):
        assignment = dict(known)
        assignment.update({c: (C if b else I) for c, b in zip(unresolved, bits)})
        if all(ev.evaluate(cl, layout, assignment) for cl in clues):
            oracle += 1
        if satisfied_by(kb.clauses, {c.to_var(state.size): s.is_criminal for c, s in assignment.items()}):
            cnf += 1

    assert cnf == oracle, f"{puzzle_id}: CNF has {cnf} models but oracle has {oracle} — encoding bug!"
    pytest.xfail(
        f"{puzzle_id}: puzzle needs a guess at revision {state.revision} "
        f"({oracle} consistent models; CNF matches oracle exactly) — puzzle-data issue, not CNF"
    )
