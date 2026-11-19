"""Level 3–4: EDGE CASES — boundary values, degenerate regions, normalization,
error handling, and exhaustive semantic-oracle equivalence.

Correctness criterion (semantic equivalence):
    for every assignment A of primary vars:
        ClueEvaluator(clue, A)  ==  ∃ aux. CNF(clue)[A]
"""
from __future__ import annotations

import random
from itertools import product

import pytest

from cnf_helpers import all_assignments, cell, is_satisfiable, satisfied_by
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
from griductive.domain.evaluator import ClueEvaluator
from griductive.domain.models import BoardLayout, CellId, Parity, Status
from griductive.domain.regions import (
    ColumnRegion,
    ExplicitRegion,
    IntersectionRegion,
    NeighborsRegion,
    RegionSpec,
    resolve_region,
)
from griductive.logic.cnf import (
    BaseEncodingAlgo,
    BasicClueAlgo,
    CardinalityAlgo,
    CNFEncoder,
    ParityAlgo,
    VariableMapper,
)

OWNER = CellId(0, 0)
EMPTY = IntersectionRegion(ColumnRegion(0), ColumnRegion(2))  # resolves to ()
EVAL = ClueEvaluator()


def encode(clue: Clue, size: int = 3):
    mapper = VariableMapper(size)
    return CNFEncoder().encode_clue(clue, BoardLayout(size), mapper), mapper


def assert_equivalent_on_region(clue: Clue, size: int, region_cells: tuple[CellId, ...]) -> None:
    """Exhaustively compare oracle vs CNF over all 2^|region| assignments.

    Cells outside the region are fixed to INNOCENT (they cannot affect the clue).
    """
    clauses, _ = encode(clue, size)
    layout = BoardLayout(size)
    mapper = VariableMapper(size)
    for bits in product((False, True), repeat=len(region_cells)):
        cell_map = {c: Status.INNOCENT for c in layout.all_cells()}
        for c, b in zip(region_cells, bits):
            cell_map[c] = Status.CRIMINAL if b else Status.INNOCENT
        var_map = {mapper.cell_to_var(c): s.is_criminal for c, s in cell_map.items()}
        assert satisfied_by(clauses, var_map) is EVAL.evaluate(clue, layout, cell_map), (
            f"{clue} disagrees with oracle at {cell_map}"
        )


# ===========================================================================
# 1. Cardinality boundaries: k ∈ {0, 1, m-1, m, m+1}, region sizes 0..8
# ===========================================================================

CARD_TYPES = [AtLeastClue, AtMostClue, ExactlyClue]


class TestCardinalityBoundaries:
    @pytest.mark.parametrize("clue_type", CARD_TYPES)
    @pytest.mark.parametrize("k", [0, 1, 2])
    def test_empty_region(self, clue_type, k: int) -> None:
        """Region with 0 cells: count is always 0."""
        clauses, _ = encode(clue_type(clue_id="c", owner=OWNER, region=EMPTY, k=k))
        expected_sat = {AtLeastClue: k <= 0, AtMostClue: True, ExactlyClue: k == 0}[clue_type]
        assert is_satisfiable(clauses) is expected_sat
        if expected_sat:
            assert clauses == []  # pure tautology → no clauses at all
        else:
            assert clauses == [()]  # explicit contradiction

    def test_at_least_zero_is_tautology(self) -> None:
        assert encode(AtLeastClue(clue_id="c", owner=OWNER, region=NeighborsRegion(cell("B2")), k=0))[0] == []

    def test_at_most_m_is_tautology(self) -> None:
        assert encode(AtMostClue(clue_id="c", owner=OWNER, region=NeighborsRegion(cell("B2")), k=8))[0] == []

    def test_at_most_above_m_is_tautology(self) -> None:
        assert encode(AtMostClue(clue_id="c", owner=OWNER, region=NeighborsRegion(cell("A1")), k=7))[0] == []

    def test_at_least_above_m_is_contradiction(self) -> None:
        assert encode(AtLeastClue(clue_id="c", owner=OWNER, region=NeighborsRegion(cell("A1")), k=4))[0] == [()]

    def test_exactly_above_m_is_contradiction(self) -> None:
        assert encode(ExactlyClue(clue_id="c", owner=OWNER, region=NeighborsRegion(cell("A1")), k=4))[0] == [()]

    def test_at_most_zero_forces_all_innocent(self) -> None:
        clauses, _ = encode(AtMostClue(clue_id="c", owner=OWNER, region=NeighborsRegion(cell("A1")), k=0))
        assert sorted(clauses) == sorted([(-2,), (-4,), (-5,)])

    def test_exactly_zero_forces_all_innocent(self) -> None:
        clauses, _ = encode(ExactlyClue(clue_id="c", owner=OWNER, region=NeighborsRegion(cell("A1")), k=0))
        assert sorted(clauses) == sorted([(-2,), (-4,), (-5,)])

    def test_at_least_m_forces_all_criminal(self) -> None:
        clauses, _ = encode(AtLeastClue(clue_id="c", owner=OWNER, region=NeighborsRegion(cell("A1")), k=3))
        assert sorted(clauses) == sorted([(2,), (4,), (5,)])

    def test_exactly_m_forces_all_criminal(self) -> None:
        clauses, _ = encode(ExactlyClue(clue_id="c", owner=OWNER, region=NeighborsRegion(cell("A1")), k=3))
        assert sorted(clauses) == sorted([(2,), (4,), (5,)])

    @pytest.mark.parametrize("clue_type", CARD_TYPES)
    @pytest.mark.parametrize("k", [0, 1])
    def test_single_cell_region(self, clue_type, k: int) -> None:
        """Very common in the real puzzles: EXPLICIT region with exactly one cell."""
        region = ExplicitRegion((cell("C2"),))
        clue = clue_type(clue_id="c", owner=OWNER, region=region, k=k)
        assert_equivalent_on_region(clue, 3, (cell("C2"),))

    @pytest.mark.parametrize("clue_type", CARD_TYPES)
    def test_negative_k_rejected_by_domain(self, clue_type) -> None:
        with pytest.raises(ValueError):
            clue_type(clue_id="c", owner=OWNER, region=EMPTY, k=-1)

    def test_negative_k_at_algorithm_level(self) -> None:
        """The raw algorithm must stay safe even if domain validation is bypassed."""
        algo = CardinalityAlgo()
        assert algo.encode_at_least([1, 2], -3) == []
        assert algo.encode_at_most([1, 2], -1) == [()]
        assert algo.encode_exactly([1, 2], -1) == [()]

    @pytest.mark.parametrize("clue_type", CARD_TYPES)
    @pytest.mark.parametrize("center", ["A1", "B1", "B2"])  # sizes 3, 5, 8
    def test_every_k_on_every_neighbour_shape(self, clue_type, center: str) -> None:
        region = NeighborsRegion(cell(center))
        cells = resolve_region(region, BoardLayout(3))
        for k in range(0, len(cells) + 2):
            assert_equivalent_on_region(clue_type(clue_id="c", owner=OWNER, region=region, k=k), 3, cells)


# ===========================================================================
# 2. Parity edge cases
# ===========================================================================

class TestParityEdges:
    @pytest.mark.parametrize("parity", [Parity.EVEN, Parity.ODD])
    def test_empty_region(self, parity: Parity) -> None:
        clauses, m = encode(ParityClue(clue_id="c", owner=OWNER, region=EMPTY, parity=parity))
        assert m.aux_vars_count == 0
        assert clauses == ([] if parity == Parity.EVEN else [()])

    @pytest.mark.parametrize("parity", [Parity.EVEN, Parity.ODD])
    @pytest.mark.parametrize("size_m", range(1, 10))
    def test_every_region_size_1_to_9(self, parity: Parity, size_m: int) -> None:
        cells = BoardLayout(3).all_cells()[:size_m]
        clue = ParityClue(clue_id="c", owner=OWNER, region=ExplicitRegion(cells), parity=parity)
        clauses, m = encode(clue)
        expected_aux = max(0, size_m - 2)
        assert m.aux_vars_count == expected_aux
        if size_m >= 3:
            assert len(clauses) == 4 * (size_m - 2) + 2  # linear, not 2^(m-1)
        assert_equivalent_on_region(clue, 3, cells)

    def test_parity_on_5x5_full_row_and_neighbours(self) -> None:
        for region in (ColumnRegion(4), NeighborsRegion(cell("C3"))):
            cells = resolve_region(region, BoardLayout(5))
            for parity in Parity:
                assert_equivalent_on_region(ParityClue(clue_id="c", owner=OWNER, region=region, parity=parity), 5, cells)

    def test_two_parity_clues_get_disjoint_aux_vars(self) -> None:
        mapper = VariableMapper(3)
        enc = CNFEncoder()
        layout = BoardLayout(3)
        c1 = enc.encode_clue(ParityClue(clue_id="p1", owner=OWNER, region=ColumnRegion(0), parity=Parity.EVEN), layout, mapper)
        c2 = enc.encode_clue(ParityClue(clue_id="p2", owner=OWNER, region=ColumnRegion(1), parity=Parity.ODD), layout, mapper)
        aux1 = {abs(l) for c in c1 for l in c if abs(l) > 9}
        aux2 = {abs(l) for c in c2 for l in c if abs(l) > 9}
        assert aux1 == {10} and aux2 == {11}
        assert aux1.isdisjoint(aux2)

    def test_even_and_odd_on_same_region_is_unsat(self) -> None:
        mapper = VariableMapper(3)
        enc = CNFEncoder()
        layout = BoardLayout(3)
        clauses = enc.encode_clue(ParityClue(clue_id="p1", owner=OWNER, region=NeighborsRegion(cell("B2")), parity=Parity.EVEN), layout, mapper)
        clauses += enc.encode_clue(ParityClue(clue_id="p2", owner=OWNER, region=NeighborsRegion(cell("B2")), parity=Parity.ODD), layout, mapper)
        assert not is_satisfiable(clauses)

    def test_xor_gate_truth_table(self) -> None:
        gate = ParityAlgo.encode_xor_equiv(3, 1, 2)
        for a, b, out in product((False, True), repeat=3):
            assert satisfied_by(gate, {1: a, 2: b, 3: out}) is (out == (a != b))


# ===========================================================================
# 3. Clause normalization & algorithm-level robustness
# ===========================================================================

class TestNormalization:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ([3, 1, 2], (1, 2, 3)),
            ([-2, 1], (1, -2)),
            ([2, -1, 2, 2], (-1, 2)),
            ([5], (5,)),
            ([], ()),
            ([1, -1], None),
            ([4, 2, -4], None),
        ],
    )
    def test_normalize_clause(self, raw, expected) -> None:
        assert BaseEncodingAlgo.normalize_clause(raw) == expected

    def test_literal_zero_rejected(self) -> None:
        with pytest.raises(ValueError):
            BaseEncodingAlgo.normalize_clause([1, 0, 2])

    def test_finalize_drops_tautologies_and_duplicates(self) -> None:
        algo = BasicClueAlgo()
        assert algo.finalize_clauses([[2, 1], [1, 2], [1, -1], [-3]]) == [(1, 2), (-3,)]

    def test_finalize_short_circuits_on_empty_clause(self) -> None:
        assert BasicClueAlgo().finalize_clauses([[1], [], [2]]) == [()]

    @pytest.mark.parametrize("clue_type", [SameClue, DifferentClue])
    def test_output_is_canonical(self, clue_type) -> None:
        clauses, _ = encode(clue_type(clue_id="c", owner=OWNER, left=cell("C3"), right=cell("A1")))
        for c in clauses:
            assert list(c) == sorted(c, key=lambda x: (abs(x), x))
            assert 0 not in c

    def test_encoding_is_deterministic(self) -> None:
        clue = ParityClue(clue_id="c", owner=OWNER, region=NeighborsRegion(cell("B2")), parity=Parity.ODD)
        assert encode(clue)[0] == encode(clue)[0]


class TestDispatchAndErrors:
    def test_unsupported_clue_raises_type_error(self) -> None:
        encoder = CNFEncoder(algos=[CardinalityAlgo()])
        with pytest.raises(TypeError):
            encoder.encode_clue(
                FactClue(clue_id="c", owner=OWNER, target=OWNER, status=Status.CRIMINAL),
                BoardLayout(3), VariableMapper(3),
            )

    @pytest.mark.parametrize("algo", [BasicClueAlgo(), CardinalityAlgo(), ParityAlgo()])
    def test_each_algo_rejects_foreign_clue(self, algo: BaseEncodingAlgo) -> None:
        foreign = {
            BasicClueAlgo: ParityClue(clue_id="c", owner=OWNER, region=EMPTY, parity=Parity.EVEN),
            CardinalityAlgo: FactClue(clue_id="c", owner=OWNER, target=OWNER, status=Status.CRIMINAL),
            ParityAlgo: ExactlyClue(clue_id="c", owner=OWNER, region=EMPTY, k=0),
        }[type(algo)]
        assert not algo.supports(foreign)
        with pytest.raises(TypeError):
            algo.encode_clue(foreign, BoardLayout(3), VariableMapper(3))

    def test_registered_algo_takes_priority(self) -> None:
        class AlwaysTrue(BaseEncodingAlgo):
            def supports(self, clue): return isinstance(clue, ExactlyClue)
            def encode_clue(self, clue, layout, mapper): return []

        enc = CNFEncoder()
        enc.register_algo(AlwaysTrue())
        clue = ExactlyClue(clue_id="c", owner=OWNER, region=EMPTY, k=5)  # normally a contradiction
        assert enc.encode_clue(clue, BoardLayout(3), VariableMapper(3)) == []

    def test_base_class_is_abstract(self) -> None:
        with pytest.raises(TypeError):
            BaseEncodingAlgo()  # type: ignore[abstract]


# ===========================================================================
# 4. Exhaustive oracle on full 3×3 board (all 512 assignments)
# ===========================================================================

ASSIGNMENTS_3X3 = all_assignments(3)

FULL_BOARD_CLUES: list[Clue] = [
    FactClue(clue_id="fact", owner=OWNER, target=cell("B2"), status=Status.CRIMINAL),
    SameClue(clue_id="same", owner=OWNER, left=cell("A1"), right=cell("C3")),
    DifferentClue(clue_id="diff", owner=OWNER, left=cell("C1"), right=cell("A3")),
    ExactlyClue(clue_id="ex_nb", owner=OWNER, region=NeighborsRegion(cell("B2")), k=4),
    AtLeastClue(clue_id="al_col", owner=OWNER, region=ColumnRegion(1), k=2),
    AtMostClue(clue_id="am_nb", owner=OWNER, region=NeighborsRegion(cell("B1")), k=2),
    ParityClue(clue_id="par_all", owner=OWNER, region=ExplicitRegion(BoardLayout(3).all_cells()), parity=Parity.ODD),
    ExactlyClue(clue_id="ex_inter", owner=OWNER, region=IntersectionRegion(ColumnRegion(2), NeighborsRegion(cell("B2"))), k=2),
]


@pytest.mark.parametrize("clue", FULL_BOARD_CLUES, ids=lambda c: c.clue_id)
def test_full_board_oracle_equivalence(clue: Clue) -> None:
    clauses, _ = encode(clue)
    layout = BoardLayout(3)
    for cell_map, var_map in ASSIGNMENTS_3X3:
        assert satisfied_by(clauses, var_map) is EVAL.evaluate(clue, layout, cell_map)


# ===========================================================================
# 5. Randomized fuzzing on 4×4 and 5×5 (seeded → reproducible)
# ===========================================================================

def _random_region(rng: random.Random, size: int) -> RegionSpec:
    layout = BoardLayout(size)
    kind = rng.choice(["row", "col", "nb", "explicit", "inter"])
    if kind == "row":
        from griductive.domain.regions import RowRegion
        return RowRegion(rng.randrange(size))
    if kind == "col":
        return ColumnRegion(rng.randrange(size))
    if kind == "nb":
        return NeighborsRegion(rng.choice(layout.all_cells()))
    if kind == "explicit":
        return ExplicitRegion(tuple(rng.sample(layout.all_cells(), rng.randint(1, 7))))
    return IntersectionRegion(NeighborsRegion(rng.choice(layout.all_cells())), ColumnRegion(rng.randrange(size)))


def _random_clue(rng: random.Random, size: int, idx: int) -> Clue:
    layout = BoardLayout(size)
    cells = layout.all_cells()
    kind = rng.choice(["fact", "same", "diff", "ex", "al", "am", "par"])
    cid = f"r{idx}"
    if kind == "fact":
        return FactClue(clue_id=cid, owner=OWNER, target=rng.choice(cells), status=rng.choice(list(Status)))
    if kind in ("same", "diff"):
        a, b = rng.sample(cells, 2)
        cls = SameClue if kind == "same" else DifferentClue
        return cls(clue_id=cid, owner=OWNER, left=a, right=b)
    region = _random_region(rng, size)
    if kind == "par":
        return ParityClue(clue_id=cid, owner=OWNER, region=region, parity=rng.choice(list(Parity)))
    m = len(resolve_region(region, layout))
    k = rng.randint(0, m + 1)
    return {"ex": ExactlyClue, "al": AtLeastClue, "am": AtMostClue}[kind](clue_id=cid, owner=OWNER, region=region, k=k)


@pytest.mark.parametrize("size", [4, 5])
def test_randomized_clue_fuzzing(size: int) -> None:
    rng = random.Random(20261119 + size)
    layout = BoardLayout(size)
    mapper = VariableMapper(size)
    for i in range(150):
        clue = _random_clue(rng, size, i)
        clauses, _ = encode(clue, size)
        for _ in range(40):
            cell_map = {c: rng.choice(list(Status)) for c in layout.all_cells()}
            var_map = {mapper.cell_to_var(c): s.is_criminal for c, s in cell_map.items()}
            assert satisfied_by(clauses, var_map) is EVAL.evaluate(clue, layout, cell_map), clue
