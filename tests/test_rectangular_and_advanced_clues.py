from __future__ import annotations

from itertools import product

import pytest

from cnf_helpers import is_satisfiable, satisfied_by
from griductive.domain.clues import (
    AtLeastClue,
    CompareClue,
    CompoundClue,
    ConnectedClue,
    ExactlyClue,
    FactClue,
    FlavorClue,
)
from griductive.domain.evaluator import ClueEvaluator
from griductive.domain.models import BoardLayout, CellId, CompareOp, Status
from griductive.domain.regions import ColumnRegion, ExplicitRegion, RowRegion
from griductive.logic.cnf import CNFEncoder, VariableMapper

OWNER = CellId(0, 0)
EVAL = ClueEvaluator()


def test_rectangular_board_layout_and_var_mapping() -> None:
    layout = BoardLayout(5, cols=4)
    assert layout.rows == 5
    assert layout.num_cols == 4
    assert layout.total_cells == 20
    assert layout.contains(CellId(4, 3))
    assert not layout.contains(CellId(4, 4))

    mapper = VariableMapper(5, cols=4)
    assert mapper.primary_vars_count == 20
    assert mapper.cell_to_var(CellId(0, 0)) == 1
    assert mapper.cell_to_var(CellId(4, 3)) == 20
    assert mapper.var_to_cell(20) == CellId(4, 3)


@pytest.mark.parametrize("op", [CompareOp.MORE, CompareOp.FEWER, CompareOp.EQUAL])
@pytest.mark.parametrize("target_status", [Status.CRIMINAL, Status.INNOCENT])
def test_compare_clue_matches_semantic_evaluator(op: CompareOp, target_status: Status) -> None:
    layout = BoardLayout(3, cols=3)
    clue = CompareClue(
        clue_id="cmp",
        owner=OWNER,
        left_region=RowRegion(0),
        right_region=RowRegion(1),
        op=op,
        target_status=target_status,
    )
    mapper = VariableMapper(3, cols=3)
    clauses = CNFEncoder().encode_clue(clue, layout, mapper)
    cells = layout.all_cells()
    for bits in product((False, True), repeat=6):
        cell_map = {c: Status.INNOCENT for c in cells}
        for c, b in zip(cells[:6], bits):
            cell_map[c] = Status.CRIMINAL if b else Status.INNOCENT
        var_map = {mapper.cell_to_var(c): s.is_criminal for c, s in cell_map.items()}
        assert satisfied_by(clauses, var_map) is EVAL.evaluate(clue, layout, cell_map)


@pytest.mark.parametrize("target_status", [Status.CRIMINAL, Status.INNOCENT])
def test_connected_clue_1d_matches_semantic_evaluator(target_status: Status) -> None:
    layout = BoardLayout(5, cols=4)
    clue = ConnectedClue(
        clue_id="conn",
        owner=OWNER,
        region=ColumnRegion(1),
        target_status=target_status,
    )
    mapper = VariableMapper(5, cols=4)
    clauses = CNFEncoder().encode_clue(clue, layout, mapper)
    col_cells = tuple(CellId(r, 1) for r in range(5))
    all_cells = layout.all_cells()
    for bits in product((False, True), repeat=5):
        cell_map = {c: Status.INNOCENT for c in all_cells}
        for c, b in zip(col_cells, bits):
            cell_map[c] = Status.CRIMINAL if b else Status.INNOCENT
        var_map = {mapper.cell_to_var(c): s.is_criminal for c, s in cell_map.items()}
        assert satisfied_by(clauses, var_map) is EVAL.evaluate(clue, layout, cell_map)


def test_compound_and_flavor_clues() -> None:
    layout = BoardLayout(3)
    mapper = VariableMapper(3)
    enc = CNFEncoder()

    flavor = FlavorClue(clue_id="fl", owner=OWNER, text="Just a quiet chair.")
    assert enc.encode_clue(flavor, layout, mapper) == []
    assert EVAL.evaluate(flavor, layout, {c: Status.INNOCENT for c in layout.all_cells()}) is True

    comp = CompoundClue(
        clue_id="cmpd",
        owner=OWNER,
        clues=(
            FactClue(clue_id="f", owner=OWNER, target=CellId(0, 1), status=Status.CRIMINAL),
            AtLeastClue(clue_id="a", owner=OWNER, region=RowRegion(0), k=2),
        ),
    )
    clauses = enc.encode_clue(comp, layout, mapper)
    assert is_satisfiable(clauses)
    assert not is_satisfiable(clauses, [-mapper.cell_to_var(CellId(0, 1))])


def test_large_cardinality_polynomial_fallback() -> None:
    layout = BoardLayout(5, cols=4)
    mapper = VariableMapper(5, cols=4)
    all_cells = layout.all_cells()
    clue = ExactlyClue(
        clue_id="big",
        owner=OWNER,
        region=ExplicitRegion(all_cells),
        k=7,
    )
    clauses = CNFEncoder().encode_clue(clue, layout, mapper)
    assert len(clauses) < 2000
    good = {mapper.cell_to_var(c): (idx < 7) for idx, c in enumerate(all_cells)}
    bad = {mapper.cell_to_var(c): (idx < 6) for idx, c in enumerate(all_cells)}
    assert satisfied_by(clauses, good) is True
    assert satisfied_by(clauses, bad) is False
