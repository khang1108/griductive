"""A no-guessing agent that uses DPLL to find entailed verdicts."""

from dataclasses import dataclass
from itertools import combinations

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
from griductive.domain.models import BoardLayout, CellId, Parity, Status
from griductive.domain.regions import resolve_region
from griductive.domain.state import PublicState
from griductive.solver import DPLLSolver


@dataclass(frozen=True)
class HintResult:
    cell: CellId
    forced_status: Status
    reason: str
    active_clue_ids: tuple[str, ...]


class InconsistentKnowledgeBaseError(ValueError):
    """Raised when public clues and known verdicts cannot all be true."""


class LogicAgent:
    def __init__(self, solver: DPLLSolver | None = None) -> None:
        self._solver = solver or DPLLSolver()

    def suggest_next(self, state: PublicState) -> HintResult | None:
        clauses = self._encode_public_state(state)
        if not self._solver.solve(clauses).is_sat:
            raise InconsistentKnowledgeBaseError(
                "The revealed clues and known verdicts are inconsistent."
            )

        for cell in state.unresolved_cells():
            variable = cell.to_var(state.size)
            criminal_possible = self._solver.solve(
                clauses, assumptions=(variable,)
            ).is_sat
            innocent_possible = self._solver.solve(
                clauses, assumptions=(-variable,)
            ).is_sat

            if not criminal_possible and not innocent_possible:
                raise InconsistentKnowledgeBaseError(
                    f"Neither verdict is satisfiable for {cell.to_label()}."
                )
            if criminal_possible == innocent_possible:
                continue

            status = Status.CRIMINAL if criminal_possible else Status.INNOCENT
            clue_ids = tuple(clue.clue_id for clue in state.revealed_clues())
            source = ", ".join(clue_ids) if clue_ids else "known verdicts"
            return HintResult(
                cell=cell,
                forced_status=status,
                reason=f"{cell.to_label()} is forced {status.value} by {source}.",
                active_clue_ids=clue_ids,
            )

        return None

    @staticmethod
    def _encode_public_state(state: PublicState) -> tuple[tuple[int, ...], ...]:
        layout = BoardLayout(state.size)
        clauses: list[tuple[int, ...]] = []
        next_auxiliary = state.size * state.size + 1

        def variable(cell: CellId) -> int:
            return cell.to_var(state.size)

        def add_at_least(variables: list[int], count: int) -> None:
            if count <= 0:
                return
            if count > len(variables):
                clauses.append(())
                return
            subset_size = len(variables) - count + 1
            clauses.extend(
                tuple(subset)
                for subset in combinations(variables, subset_size)
            )

        def add_at_most(variables: list[int], count: int) -> None:
            if count < 0:
                clauses.append(())
                return
            if count >= len(variables):
                return
            subset_size = count + 1
            clauses.extend(
                tuple(-literal for literal in subset)
                for subset in combinations(variables, subset_size)
            )

        def add_xor_equivalence(left: int, right: int, result: int) -> None:
            clauses.extend(
                (
                    (-left, -right, -result),
                    (left, right, -result),
                    (left, -right, result),
                    (-left, right, result),
                )
            )

        def encode_clue(clue: Clue) -> None:
            nonlocal next_auxiliary

            match clue:
                case FactClue(target=target, status=status):
                    literal = variable(target)
                    clauses.append(
                        (literal if status == Status.CRIMINAL else -literal,)
                    )
                case SameClue(left=left, right=right):
                    left_var, right_var = variable(left), variable(right)
                    clauses.extend(((-left_var, right_var), (left_var, -right_var)))
                case DifferentClue(left=left, right=right):
                    left_var, right_var = variable(left), variable(right)
                    clauses.extend(((left_var, right_var), (-left_var, -right_var)))
                case ExactlyClue(region=region, k=count):
                    variables = [variable(cell) for cell in resolve_region(region, layout)]
                    add_at_least(variables, count)
                    add_at_most(variables, count)
                case AtLeastClue(region=region, k=count):
                    variables = [variable(cell) for cell in resolve_region(region, layout)]
                    add_at_least(variables, count)
                case AtMostClue(region=region, k=count):
                    variables = [variable(cell) for cell in resolve_region(region, layout)]
                    add_at_most(variables, count)
                case ParityClue(region=region, parity=parity):
                    variables = [
                        variable(cell) for cell in resolve_region(region, layout)
                    ]
                    is_odd = parity == Parity.ODD
                    if not variables:
                        if is_odd:
                            clauses.append(())
                        return
                    if len(variables) == 1:
                        literal = variables[0]
                        clauses.append((literal if is_odd else -literal,))
                        return

                    accumulator = variables[0]
                    for current in variables[1:-1]:
                        auxiliary = next_auxiliary
                        next_auxiliary += 1
                        add_xor_equivalence(accumulator, current, auxiliary)
                        accumulator = auxiliary

                    final = variables[-1]
                    if is_odd:
                        clauses.extend(((accumulator, final), (-accumulator, -final)))
                    else:
                        clauses.extend(((-accumulator, final), (accumulator, -final)))
                case _:
                    raise TypeError(f"Unsupported clue type: {type(clue).__name__}")

        for clue in state.revealed_clues():
            encode_clue(clue)
        for cell, status in state.known_statuses().items():
            literal = variable(cell)
            clauses.append(
                (literal if status == Status.CRIMINAL else -literal,)
            )

        return tuple(clauses)
