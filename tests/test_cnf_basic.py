"""Level 1–2: BASIC CASES — exact CNF output for every clue type and region type.

Board convention (3×3):
    A1=1  B1=2  C1=3
    A2=4  B2=5  C2=6
    A3=7  B3=8  C3=9
Positive literal = CRIMINAL, negative literal = INNOCENT.
"""
from __future__ import annotations

from math import comb

import pytest

from cnf_helpers import as_set, cell
from griductive.domain.clues import (
    AtLeastClue,
    AtMostClue,
    DifferentClue,
    ExactlyClue,
    FactClue,
    ParityClue,
    SameClue,
)
from griductive.domain.models import BoardLayout, CellId, Parity, Status
from griductive.domain.regions import (
    ColumnRegion,
    ExplicitRegion,
    IntersectionRegion,
    NeighborsRegion,
    RowRegion,
)
from griductive.logic.cnf import BaseEncodingAlgo, CNFEncoder, VariableMapper

OWNER = CellId(0, 0)


def encode(clue, size: int = 3):
    mapper = VariableMapper(size)
    clauses = CNFEncoder().encode_clue(clue, BoardLayout(size), mapper)
    return clauses, mapper


# ===========================================================================
# 1. Variable mapping
# ===========================================================================

class TestVariableMapping:
    def test_3x3_layout_matches_documented_numbering(self) -> None:
        m = VariableMapper(3)
        expected = {"A1": 1, "B1": 2, "C1": 3, "A2": 4, "B2": 5, "C2": 6, "A3": 7, "B3": 8, "C3": 9}
        for label, var in expected.items():
            assert m.cell_to_var(cell(label)) == var
            assert m.var_to_cell(var) == cell(label)

    @pytest.mark.parametrize("size", [1, 2, 3, 4, 5])
    def test_bijection_and_corners(self, size: int) -> None:
        m = VariableMapper(size)
        assert m.cell_to_var(CellId(0, 0)) == 1
        assert m.cell_to_var(CellId(size - 1, size - 1)) == size * size
        assert sorted(m.to_dict().values()) == list(range(1, size * size + 1))

    def test_aux_vars_never_collide_with_primary(self) -> None:
        m = VariableMapper(5)
        aux = [m.new_aux_var() for _ in range(10)]
        assert aux == list(range(26, 36))
        assert m.aux_vars_count == 10 and m.total_vars_count == 35

    @pytest.mark.parametrize("bad", [CellId(3, 0), CellId(0, 3), CellId(-1, 0)])
    def test_out_of_board_cell_rejected(self, bad: CellId) -> None:
        with pytest.raises(ValueError):
            VariableMapper(3).cell_to_var(bad)

    @pytest.mark.parametrize("bad_var", [0, -1, 10])
    def test_non_primary_var_cannot_map_back(self, bad_var: int) -> None:
        with pytest.raises(ValueError):
            VariableMapper(3).var_to_cell(bad_var)


# ===========================================================================
# 2. Core clues — exact clause output
# ===========================================================================

class TestFactClue:
    def test_criminal(self) -> None:
        clauses, _ = encode(FactClue(clue_id="c", owner=OWNER, target=cell("B1"), status=Status.CRIMINAL))
        assert clauses == [(2,)]

    def test_innocent(self) -> None:
        clauses, _ = encode(FactClue(clue_id="c", owner=OWNER, target=cell("C3"), status=Status.INNOCENT))
        assert clauses == [(-9,)]

    def test_self_reference_about_owner(self) -> None:
        """A person talking about themself is still a valid unit clause."""
        clauses, _ = encode(FactClue(clue_id="c", owner=cell("B2"), target=cell("B2"), status=Status.INNOCENT))
        assert clauses == [(-5,)]


class TestSameClue:
    def test_biconditional(self) -> None:
        clauses, _ = encode(SameClue(clue_id="c", owner=OWNER, left=cell("B1"), right=cell("A2")))
        assert as_set(clauses) == as_set([(-2, 4), (2, -4)])

    def test_symmetric(self) -> None:
        a, _ = encode(SameClue(clue_id="c", owner=OWNER, left=cell("B1"), right=cell("A2")))
        b, _ = encode(SameClue(clue_id="c", owner=OWNER, left=cell("A2"), right=cell("B1")))
        assert as_set(a) == as_set(b)

    def test_same_cell_is_rejected_by_domain(self) -> None:
        with pytest.raises(ValueError):
            SameClue(clue_id="c", owner=OWNER, left=cell("A1"), right=cell("A1"))


class TestDifferentClue:
    def test_xor(self) -> None:
        clauses, _ = encode(DifferentClue(clue_id="c", owner=OWNER, left=cell("C1"), right=cell("A3")))
        assert as_set(clauses) == as_set([(3, 7), (-3, -7)])

    def test_symmetric(self) -> None:
        a, _ = encode(DifferentClue(clue_id="c", owner=OWNER, left=cell("C1"), right=cell("A3")))
        b, _ = encode(DifferentClue(clue_id="c", owner=OWNER, left=cell("A3"), right=cell("C1")))
        assert as_set(a) == as_set(b)

    def test_same_cell_is_rejected_by_domain(self) -> None:
        with pytest.raises(ValueError):
            DifferentClue(clue_id="c", owner=OWNER, left=cell("B2"), right=cell("B2"))


# ===========================================================================
# 3. Cardinality clues — exact clause output on a 3-cell row {1,2,3}
# ===========================================================================

class TestCardinalityBasic:
    def test_exactly_one_in_row(self) -> None:
        """The worked example from the brainstorm: 'Row 1 has exactly 1 criminal'."""
        clauses, _ = encode(ExactlyClue(clue_id="c", owner=OWNER, region=RowRegion(0), k=1))
        assert as_set(clauses) == as_set([(1, 2, 3), (-1, -2), (-1, -3), (-2, -3)])

    def test_exactly_two_in_row(self) -> None:
        clauses, _ = encode(ExactlyClue(clue_id="c", owner=OWNER, region=RowRegion(0), k=2))
        assert as_set(clauses) == as_set([(1, 2), (1, 3), (2, 3), (-1, -2, -3)])

    def test_at_least_one(self) -> None:
        clauses, _ = encode(AtLeastClue(clue_id="c", owner=OWNER, region=RowRegion(0), k=1))
        assert clauses == [(1, 2, 3)]

    def test_at_least_two(self) -> None:
        clauses, _ = encode(AtLeastClue(clue_id="c", owner=OWNER, region=RowRegion(0), k=2))
        assert as_set(clauses) == as_set([(1, 2), (1, 3), (2, 3)])

    def test_at_most_one(self) -> None:
        clauses, _ = encode(AtMostClue(clue_id="c", owner=OWNER, region=RowRegion(0), k=1))
        assert as_set(clauses) == as_set([(-1, -2), (-1, -3), (-2, -3)])

    def test_at_most_two(self) -> None:
        clauses, _ = encode(AtMostClue(clue_id="c", owner=OWNER, region=RowRegion(0), k=2))
        assert clauses == [(-1, -2, -3)]

    def test_cardinality_uses_no_aux_vars(self) -> None:
        _, mapper = encode(ExactlyClue(clue_id="c", owner=OWNER, region=NeighborsRegion(cell("B2")), k=4))
        assert mapper.aux_vars_count == 0

    @pytest.mark.parametrize("m,k", [(3, 1), (5, 2), (8, 3), (8, 4), (5, 4)])
    def test_clause_counts_match_binomial_formula(self, m: int, k: int) -> None:
        """AT_LEAST k → C(m, m-k+1) clauses ; AT_MOST k → C(m, k+1) clauses."""
        region = ExplicitRegion(tuple(BoardLayout(3).all_cells()[:m]))
        al, _ = encode(AtLeastClue(clue_id="c", owner=OWNER, region=region, k=k))
        am, _ = encode(AtMostClue(clue_id="c", owner=OWNER, region=region, k=k))
        ex, _ = encode(ExactlyClue(clue_id="c", owner=OWNER, region=region, k=k))
        assert len(al) == comb(m, m - k + 1)
        assert len(am) == comb(m, k + 1)
        assert as_set(ex) == as_set(al) | as_set(am)


# ===========================================================================
# 4. Parity clue — exact structure
# ===========================================================================

class TestParityBasic:
    def test_single_cell_even_means_innocent(self) -> None:
        clauses, _ = encode(ParityClue(clue_id="c", owner=OWNER, region=ExplicitRegion((cell("C3"),)), parity=Parity.EVEN))
        assert clauses == [(-9,)]

    def test_single_cell_odd_means_criminal(self) -> None:
        clauses, _ = encode(ParityClue(clue_id="c", owner=OWNER, region=ExplicitRegion((cell("C3"),)), parity=Parity.ODD))
        assert clauses == [(9,)]

    def test_two_cells_even_is_same(self) -> None:
        clauses, m = encode(ParityClue(clue_id="c", owner=OWNER, region=ExplicitRegion((cell("A1"), cell("B1"))), parity=Parity.EVEN))
        assert as_set(clauses) == as_set([(-1, 2), (1, -2)]) and m.aux_vars_count == 0

    def test_two_cells_odd_is_different(self) -> None:
        clauses, m = encode(ParityClue(clue_id="c", owner=OWNER, region=ExplicitRegion((cell("A1"), cell("B1"))), parity=Parity.ODD))
        assert as_set(clauses) == as_set([(1, 2), (-1, -2)]) and m.aux_vars_count == 0

    def test_row_of_three_uses_one_aux_xor_gate(self) -> None:
        clauses, m = encode(ParityClue(clue_id="c", owner=OWNER, region=RowRegion(0), parity=Parity.EVEN))
        y = 10  # first aux var on 3x3
        assert m.aux_vars_count == 1
        assert as_set(clauses) == as_set([
            # y <-> (1 XOR 2)
            (-1, -2, -y), (1, 2, -y), (1, -2, y), (-1, 2, y),
            # EVEN: y <-> 3
            (-y, 3), (y, -3),
        ])


# ===========================================================================
# 5. Region resolution feeding the encoder
# ===========================================================================

def _region_vars(region, size: int = 3) -> tuple[int, ...]:
    return BaseEncodingAlgo.resolve_region_vars(region, BoardLayout(size), VariableMapper(size))


class TestRegions:
    @pytest.mark.parametrize("row,expected", [(0, (1, 2, 3)), (1, (4, 5, 6)), (2, (7, 8, 9))])
    def test_rows(self, row: int, expected: tuple[int, ...]) -> None:
        assert _region_vars(RowRegion(row)) == expected

    @pytest.mark.parametrize("col,expected", [(0, (1, 4, 7)), (1, (2, 5, 8)), (2, (3, 6, 9))])
    def test_columns(self, col: int, expected: tuple[int, ...]) -> None:
        assert _region_vars(ColumnRegion(col)) == expected

    @pytest.mark.parametrize(
        "center,expected",
        [
            ("A1", (2, 4, 5)),                    # corner → 3 neighbours
            ("B1", (1, 3, 4, 5, 6)),              # edge   → 5 neighbours
            ("B2", (1, 2, 3, 4, 6, 7, 8, 9)),     # centre → 8 neighbours
            ("C3", (5, 6, 8)),                    # opposite corner
        ],
    )
    def test_neighbors_exclude_center_and_clip_borders(self, center: str, expected: tuple[int, ...]) -> None:
        assert _region_vars(NeighborsRegion(cell(center))) == expected

    def test_neighbors_on_1x1_board_is_empty(self) -> None:
        assert _region_vars(NeighborsRegion(CellId(0, 0)), size=1) == ()

    def test_explicit_region_is_sorted_and_deduplicated(self) -> None:
        region = ExplicitRegion((cell("C3"), cell("A1"), cell("C3"), cell("B2")))
        assert _region_vars(region) == (1, 5, 9)

    def test_intersection(self) -> None:
        region = IntersectionRegion(RowRegion(1), NeighborsRegion(cell("A1")))
        assert _region_vars(region) == (4, 5)

    def test_nested_intersection(self) -> None:
        region = IntersectionRegion(IntersectionRegion(RowRegion(1), ColumnRegion(1)), NeighborsRegion(cell("A1")))
        assert _region_vars(region) == (5,)

    def test_empty_intersection(self) -> None:
        assert _region_vars(IntersectionRegion(RowRegion(0), RowRegion(2))) == ()

    def test_5x5_row_and_column(self) -> None:
        assert _region_vars(RowRegion(4), size=5) == (21, 22, 23, 24, 25)
        assert _region_vars(ColumnRegion(4), size=5) == (5, 10, 15, 20, 25)

    @pytest.mark.parametrize(
        "region",
        [RowRegion(3), ColumnRegion(-1), NeighborsRegion(CellId(5, 5)), ExplicitRegion((CellId(0, 3),))],
    )
    def test_out_of_bounds_regions_raise(self, region) -> None:
        with pytest.raises(ValueError):
            encode(ExactlyClue(clue_id="c", owner=OWNER, region=region, k=1))
