from __future__ import annotations

from collections.abc import Sequence

from griductive.domain.clues import Clue, ParityClue
from griductive.domain.models import BoardLayout, Parity
from griductive.logic.cnf.algo.base import BaseEncodingAlgo
from griductive.logic.cnf.mapping import VariableMapper
from griductive.logic.cnf.types import Clause


class ParityAlgo(BaseEncodingAlgo):
    """Linear O(m) CNF encoder for PARITY constraints via auxiliary XOR chains."""

    @staticmethod
    def encode_xor_equiv(out_var: int, in1: int, in2: int) -> list[Clause]:
        """Encode biconditional XOR gate: out_var <-> (in1 XOR in2) using 4 clauses."""
        return [
            (-in1, -in2, -out_var),
            (in1, in2, -out_var),
            (in1, -in2, out_var),
            (-in1, in2, out_var),
        ]

    def encode_parity(
        self,
        region_vars: Sequence[int],
        parity: Parity,
        mapper: VariableMapper,
    ) -> list[Clause]:
        """Encode sum(region_vars) mod 2 == EVEN(0)/ODD(1) in O(m) clauses."""
        m = len(region_vars)
        if m == 0:
            return [] if parity == Parity.EVEN else [()]

        if m == 1:
            v1 = region_vars[0]
            return self.finalize_clauses([(-v1,)] if parity == Parity.EVEN else [(v1,)])

        if m == 2:
            v1, v2 = region_vars[0], region_vars[1]
            if parity == Parity.EVEN:
                return self.finalize_clauses([(-v1, v2), (v1, -v2)])
            return self.finalize_clauses([(v1, v2), (-v1, -v2)])

        acc = mapper.new_aux_var()
        raw_clauses: list[Clause] = list(
            self.encode_xor_equiv(acc, region_vars[0], region_vars[1])
        )

        for idx in range(2, m - 1):
            next_acc = mapper.new_aux_var()
            raw_clauses.extend(
                self.encode_xor_equiv(next_acc, acc, region_vars[idx])
            )
            acc = next_acc

        last_var = region_vars[m - 1]
        if parity == Parity.EVEN:
            raw_clauses.extend([(-acc, last_var), (acc, -last_var)])
        else:
            raw_clauses.extend([(acc, last_var), (-acc, -last_var)])

        return self.finalize_clauses(raw_clauses)

    def supports(self, clue: Clue) -> bool:
        return isinstance(clue, ParityClue)

    def encode_clue(
        self,
        clue: Clue,
        layout: BoardLayout,
        mapper: VariableMapper,
    ) -> list[Clause]:
        if not isinstance(clue, ParityClue):
            raise TypeError(f"ParityAlgo does not support clue type: {type(clue).__name__}")
        vars_in_region = self.resolve_region_vars(clue.region, layout, mapper)
        return self.encode_parity(vars_in_region, clue.parity, mapper)
