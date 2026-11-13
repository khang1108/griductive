"""A deterministic DPLL SAT solver for integer-literal CNF formulas."""

from dataclasses import dataclass
from time import perf_counter_ns
from typing import Sequence


@dataclass(frozen=True)
class SolverStats:
    decisions: int
    propagations: int
    backtracks: int
    runtime_ms: float


@dataclass(frozen=True)
class SATResult:
    is_sat: bool
    model: dict[int, bool] | None
    stats: SolverStats


class DPLLSolver:
    def solve(
        self,
        clauses: Sequence[Sequence[int]],
        assumptions: Sequence[int] = (),
    ) -> SATResult:
        started_at = perf_counter_ns()
        normalized_clauses = tuple(tuple(clause) for clause in clauses)
        normalized_assumptions = tuple(assumptions)
        variables: set[int] = set()

        for clause_index, clause in enumerate(normalized_clauses):
            for literal in clause:
                self._validate_literal(literal, f"clauses[{clause_index}]")
                variables.add(abs(literal))
        for literal in normalized_assumptions:
            self._validate_literal(literal, "assumptions")
            variables.add(abs(literal))

        assignment: dict[int, bool] = {}
        decisions = 0
        propagations = 0
        backtracks = 0

        def finish(model: dict[int, bool] | None) -> SATResult:
            runtime_ms = (perf_counter_ns() - started_at) / 1_000_000
            return SATResult(
                is_sat=model is not None,
                model=model,
                stats=SolverStats(
                    decisions=decisions,
                    propagations=propagations,
                    backtracks=backtracks,
                    runtime_ms=runtime_ms,
                ),
            )

        for literal in normalized_assumptions:
            variable = abs(literal)
            value = literal > 0
            if variable in assignment and assignment[variable] != value:
                return finish(None)
            assignment[variable] = value

        def propagate(current: dict[int, bool]) -> dict[int, bool] | None:
            nonlocal propagations

            while True:
                unit_found = False
                for clause in normalized_clauses:
                    unresolved: list[int] = []
                    is_satisfied = False
                    for literal in clause:
                        value = current.get(abs(literal))
                        if value is None:
                            unresolved.append(literal)
                        elif value == (literal > 0):
                            is_satisfied = True
                            break

                    if is_satisfied:
                        continue
                    if not unresolved:
                        return None
                    if len(unresolved) == 1:
                        literal = unresolved[0]
                        current[abs(literal)] = literal > 0
                        propagations += 1
                        unit_found = True
                        break

                if not unit_found:
                    return current

        def search(current: dict[int, bool]) -> dict[int, bool] | None:
            nonlocal decisions, backtracks

            propagated = propagate(current)
            if propagated is None:
                return None

            if all(
                any(
                    abs(literal) in propagated
                    and propagated[abs(literal)] == (literal > 0)
                    for literal in clause
                )
                for clause in normalized_clauses
            ):
                return propagated

            variable = next(
                variable
                for variable in sorted(variables)
                if variable not in propagated
            )
            for value in (True, False):
                decisions += 1
                branch = propagated.copy()
                branch[variable] = value
                result = search(branch)
                if result is not None:
                    return result
                backtracks += 1
            return None

        result = search(assignment)
        if result is None:
            return finish(None)

        model = {variable: result.get(variable, False) for variable in sorted(variables)}
        return finish(model)

    @staticmethod
    def _validate_literal(literal: int, source: str) -> None:
        if isinstance(literal, bool) or not isinstance(literal, int) or literal == 0:
            raise ValueError(f"{source} must contain non-zero integer literals")
