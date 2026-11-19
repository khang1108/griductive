from __future__ import annotations

from griductive.domain.clues import Clue, DifferentClue, FactClue, SameClue
from griductive.domain.models import BoardLayout, Status
from griductive.logic.cnf.algo.base import BaseEncodingAlgo
from griductive.logic.cnf.mapping import VariableMapper
from griductive.logic.cnf.types import Clause


class BasicClueAlgo(BaseEncodingAlgo):
    """CNF encoder for unary and binary cell relationship clues (FACT, SAME, DIFFERENT)."""

    def encode_fact(self, var: int, status: Status) -> list[Clause]:
        """Encode a unary assignment fact: var = Criminal (var) or Innocent (-var)."""
        literal = var if status == Status.CRIMINAL else -var
        return self.finalize_clauses([(literal,)])

    def encode_same(self, left_var: int, right_var: int) -> list[Clause]:
        """Encode biconditional equivalence: (left <-> right)."""
        return self.finalize_clauses([
            (-left_var, right_var),
            (left_var, -right_var),
        ])

    def encode_different(self, left_var: int, right_var: int) -> list[Clause]:
        """Encode binary exclusive-OR: (left XOR right)."""
        return self.finalize_clauses([
            (left_var, right_var),
            (-left_var, -right_var),
        ])

    def supports(self, clue: Clue) -> bool:
        return isinstance(clue, (FactClue, SameClue, DifferentClue))

    def encode_clue(
        self,
        clue: Clue,
        layout: BoardLayout,
        mapper: VariableMapper,
    ) -> list[Clause]:
        match clue:
            case FactClue(target=target, status=status):
                return self.encode_fact(mapper.cell_to_var(target), status)
            case SameClue(left=left, right=right):
                return self.encode_same(
                    mapper.cell_to_var(left),
                    mapper.cell_to_var(right),
                )
            case DifferentClue(left=left, right=right):
                return self.encode_different(
                    mapper.cell_to_var(left),
                    mapper.cell_to_var(right),
                )
            case _:
                raise TypeError(f"BasicClueAlgo does not support clue type: {type(clue).__name__}")
