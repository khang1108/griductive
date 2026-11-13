from dataclasses import FrozenInstanceError

import pytest

from griductive.logic.sat import DPLLSolver, SATResult, SolverStats
from griductive.logic.sat.dpll import DPLLSolver as ModuleDPLLSolver
from griductive.solver import DPLLSolver as SolverPackageDPLLSolver


def test_public_types_are_frozen_and_exported() -> None:
    assert ModuleDPLLSolver is DPLLSolver
    assert SolverPackageDPLLSolver is DPLLSolver
    result = DPLLSolver().solve([])
    assert isinstance(result, SATResult)
    assert result.is_sat
    with pytest.raises(FrozenInstanceError):
        result.is_sat = False  # type: ignore[misc]
    with pytest.raises(FrozenInstanceError):
        SolverStats(0, 0, 0, 0.0).decisions = 1  # type: ignore[misc]


@pytest.mark.parametrize(
    ("clauses", "expected_sat"),
    [
        ([], True),
        ([[]], False),
        ([[1]], True),
        ([[1], [-1]], False),
    ],
)
def test_empty_and_unit_formulas(
    clauses: list[list[int]], expected_sat: bool
) -> None:
    result = DPLLSolver().solve(clauses)

    assert result.is_sat is expected_sat
    assert (result.model is not None) is expected_sat


def test_unit_propagation_follows_a_chain() -> None:
    result = DPLLSolver().solve([[1], [-1, 2], [-2, 3]])

    assert result.is_sat
    assert result.model == {1: True, 2: True, 3: True}
    assert result.stats.propagations == 3


def test_unit_propagation_detects_a_conflict() -> None:
    result = DPLLSolver().solve([[1], [-1, 2], [-2]])

    assert not result.is_sat
    assert result.model is None
    assert result.stats.propagations == 2


def test_branching_uses_smallest_variable_and_true_first() -> None:
    result = DPLLSolver().solve([[1, 2]])

    assert result.is_sat
    assert result.model == {1: True, 2: False}
    assert result.stats.decisions == 1


def test_sat_formula_can_require_a_successful_branch() -> None:
    result = DPLLSolver().solve([[1, 2], [-1, 2], [1, -2]])

    assert result.is_sat
    assert result.model is not None
    assert result.model[1] is True
    assert result.model[2] is True
    assert result.stats.decisions == 1
    assert result.stats.propagations == 1


def test_search_uses_false_branch_after_backtracking() -> None:
    clauses = [[-1, 2], [-1, -2]]
    result = DPLLSolver().solve(clauses)

    assert result.is_sat
    assert result.model == {1: False, 2: False}
    assert all(
        any(result.model[abs(literal)] == (literal > 0) for literal in clause)
        for clause in clauses
    )
    assert result.stats.decisions == 2
    assert result.stats.backtracks == 1


def test_unsatisfiable_formula_backtracks_from_both_branches() -> None:
    result = DPLLSolver().solve([[1, 2], [1, -2], [-1, 2], [-1, -2]])

    assert not result.is_sat
    assert result.model is None
    assert result.stats.decisions == 2
    assert result.stats.backtracks == 2


def test_assumptions_are_temporary_and_complete_the_model() -> None:
    clauses = [[1, 2]]
    original = [clause.copy() for clause in clauses]
    solver = DPLLSolver()

    assumed = solver.solve(clauses, assumptions=[-1, 7])
    clean = solver.solve(clauses)

    assert assumed.is_sat
    assert assumed.model == {1: False, 2: True, 7: True}
    assert clean.model == {1: True, 2: False}
    assert clauses == original


def test_contradictory_assumptions_return_unsat_without_leaking_state() -> None:
    solver = DPLLSolver()

    contradictory = solver.solve([[2]], assumptions=[1, -1])
    subsequent = solver.solve([[2]])

    assert not contradictory.is_sat
    assert contradictory.model is None
    assert subsequent.is_sat
    assert subsequent.model == {2: True}


def test_assumption_conflicting_with_formula_is_unsat() -> None:
    result = DPLLSolver().solve([[1]], assumptions=[-1])

    assert not result.is_sat
    assert result.model is None


@pytest.mark.parametrize("literal", [0, True, 1.5, "1"])
def test_invalid_literals_raise_value_error(literal: object) -> None:
    with pytest.raises(ValueError, match="non-zero integer literals"):
        DPLLSolver().solve([[literal]])  # type: ignore[list-item]


def test_both_import_paths_and_metrics_are_valid() -> None:
    result = DPLLSolver().solve([[1], [2, 3]])

    assert result.is_sat
    assert result.model is not None
    assert result.model[1] is True
    assert set(result.model) == {1, 2, 3}
    assert result.stats.decisions >= 0
    assert result.stats.propagations >= 0
    assert result.stats.backtracks >= 0
    assert isinstance(result.stats.runtime_ms, float)
    assert result.stats.runtime_ms >= 0
