"""Shared helpers for CNF encoding tests.

These helpers are an *independent* test oracle: they do not depend on the
team's DPLL solver (TV2), so CNF tests can run before the solver exists.
"""
from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from itertools import product

from griductive.domain.clues import Clue
from griductive.domain.models import BoardLayout, CellId, Character, Status
from griductive.domain.state import PublicCell, PublicState
from griductive.logic.cnf import Clause, VariableMapper

Clauses = Sequence[Sequence[int]]


# ---------------------------------------------------------------------------
# Minimal reference SAT checker (DPLL with unit propagation)
# ---------------------------------------------------------------------------

def _simplify(clauses: list[tuple[int, ...]], lit: int) -> list[tuple[int, ...]] | None:
    """Assign `lit` = True. Return simplified clauses, or None on conflict."""
    out: list[tuple[int, ...]] = []
    for clause in clauses:
        if lit in clause:
            continue
        if -lit in clause:
            reduced = tuple(x for x in clause if x != -lit)
            if not reduced:
                return None
            out.append(reduced)
        else:
            out.append(clause)
    return out


def _dpll(clauses: list[tuple[int, ...]]) -> bool:
    while True:
        if not clauses:
            return True
        unit = next((c[0] for c in clauses if len(c) == 1), None)
        if unit is None:
            break
        nxt = _simplify(clauses, unit)
        if nxt is None:
            return False
        clauses = nxt
    branch = clauses[0][0]
    for lit in (branch, -branch):
        nxt = _simplify(clauses, lit)
        if nxt is not None and _dpll(nxt):
            return True
    return False


def is_satisfiable(clauses: Clauses, assumptions: Iterable[int] = ()) -> bool:
    """True if `clauses` ∧ `assumptions` is satisfiable (aux vars existentially free)."""
    work = [tuple(c) for c in clauses]
    if any(len(c) == 0 for c in work):
        return False
    for lit in assumptions:
        nxt = _simplify(work, lit)
        if nxt is None:
            return False
        work = nxt
    return _dpll(work)


def satisfied_by(clauses: Clauses, primary: Mapping[int, bool]) -> bool:
    """True if the fixed primary assignment can be extended (over aux vars) to a model."""
    assumptions = [v if val else -v for v, val in primary.items()]
    return is_satisfiable(clauses, assumptions)


def entails(clauses: Clauses, lit: int) -> bool:
    """KB ⊨ lit  ⟺  KB ∧ ¬lit is UNSAT (refutation)."""
    return not is_satisfiable(clauses, [-lit])


def count_primary_models(clauses: Clauses, size: int) -> int:
    """Brute-force count of primary assignments (1..size²) extendable to a model."""
    n = size * size
    total = 0
    for bits in product((False, True), repeat=n):
        if satisfied_by(clauses, {i + 1: b for i, b in enumerate(bits)}):
            total += 1
    return total


# ---------------------------------------------------------------------------
# Assignment / state builders
# ---------------------------------------------------------------------------

def all_assignments(size: int) -> list[tuple[dict[CellId, Status], dict[int, bool]]]:
    """Every (cell→Status, var→bool) assignment of a size×size board."""
    cells = BoardLayout(size).all_cells()
    mapper = VariableMapper(size)
    out = []
    for bits in product((False, True), repeat=len(cells)):
        cell_map = {c: Status.CRIMINAL if b else Status.INNOCENT for c, b in zip(cells, bits)}
        var_map = {mapper.cell_to_var(c): b for c, b in zip(cells, bits)}
        out.append((cell_map, var_map))
    return out


def make_state(
    size: int,
    revealed: Mapping[CellId, tuple[Status, Clue]] | None = None,
) -> PublicState:
    """Build a PublicState by hand: `revealed` maps cell → (known status, its clue)."""
    revealed = revealed or {}
    cells = []
    for cell in BoardLayout(size).all_cells():
        char = Character(cell_id=cell, name=cell.to_label(), profession="Tester")
        if cell in revealed:
            status, clue = revealed[cell]
            cells.append(PublicCell(character=char, known_status=status, revealed_clue=clue))
        else:
            cells.append(PublicCell(character=char, known_status=None, revealed_clue=None))
    return PublicState(session_id="test", revision=0, size=size, cells=tuple(cells))


def cell(label: str) -> CellId:
    return CellId.from_label(label)


def as_set(clauses: Iterable[Clause]) -> set[frozenset[int]]:
    """Order-insensitive view of a clause list for structural comparisons."""
    return {frozenset(c) for c in clauses}
