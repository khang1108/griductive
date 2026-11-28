from __future__ import annotations

from collections.abc import Sequence
from itertools import combinations

from griductive.domain.clues import AtLeastClue, AtMostClue, Clue, ExactlyClue
from griductive.domain.models import BoardLayout
from griductive.logic.cnf.algo.base import BaseEncodingAlgo
from griductive.logic.cnf.mapping import VariableMapper
from griductive.logic.cnf.types import Clause


class CardinalityAlgo(BaseEncodingAlgo):
    """Combinatorial CNF encoder for AT_LEAST, AT_MOST, and EXACTLY constraints."""

    def encode_at_least(self, region_vars: Sequence[int], k: int) -> list[Clause]:
        """Encode sum(region_vars) >= k using subsets of size m - k + 1."""
        m = len(region_vars)
        if k <= 0:
            return []
        if k > m:
            return [()]

        subset_size = m - k + 1
        raw_clauses = combinations(region_vars, subset_size)
        return self.finalize_clauses(raw_clauses)

    def encode_at_most(self, region_vars: Sequence[int], k: int) -> list[Clause]:
        """Encode sum(region_vars) <= k using negated subsets of size k + 1."""
        m = len(region_vars)
        if k < 0:
            return [()]
        if k >= m:
            return []

        subset_size = k + 1
        raw_clauses = (
            tuple(-v for v in comb)
            for comb in combinations(region_vars, subset_size)
        )
        return self.finalize_clauses(raw_clauses)

    def encode_exactly(self, region_vars: Sequence[int], k: int) -> list[Clause]:
        """Encode sum(region_vars) == k as AT_LEAST(k) AND AT_MOST(k)."""
        m = len(region_vars)
        if k < 0 or k > m:
            return [()]

        raw_clauses = self.encode_at_least(region_vars, k) + self.encode_at_most(region_vars, k)
        return self.finalize_clauses(raw_clauses)

    def supports(self, clue: Clue) -> bool:
        return isinstance(clue, (AtLeastClue, AtMostClue, ExactlyClue))

    def _encode_large_cardinality(
        self,
        vars_in_region: Sequence[int],
        kind: str,
        k: int,
        mapper: VariableMapper,
    ) -> list[Clause]:
        """Polynomial O(m^2) sequential-counter fallback when m > 10."""
        from griductive.logic.cnf.algo.advanced import AdvancedClueAlgo

        m = len(vars_in_region)
        if k < 0:
            return [()] if kind in ("AT_MOST", "EXACTLY") else []
        if k == 0:
            if kind == "AT_LEAST":
                return []
            return self.finalize_clauses([(-v,) for v in vars_in_region])
        if k > m:
            return [] if kind == "AT_MOST" else [()]
        if k == m:
            if kind == "AT_MOST":
                return []
            return self.finalize_clauses([(v,) for v in vars_in_region])

        cnt, clauses = AdvancedClueAlgo.encode_unary_counter(vars_in_region, mapper)
        if kind in ("AT_LEAST", "EXACTLY"):
            clauses.append((cnt[k - 1],))
        if kind in ("AT_MOST", "EXACTLY"):
            clauses.append((-cnt[k],))
        return self.finalize_clauses(clauses)

    def encode_clue(
        self,
        clue: Clue,
        layout: BoardLayout,
        mapper: VariableMapper,
    ) -> list[Clause]:
        match clue:
            case AtLeastClue(region=region, k=k):
                vars_in_region = self.resolve_region_vars(region, layout, mapper)
                if len(vars_in_region) > 10:
                    return self._encode_large_cardinality(vars_in_region, "AT_LEAST", k, mapper)
                return self.encode_at_least(vars_in_region, k)
            case AtMostClue(region=region, k=k):
                vars_in_region = self.resolve_region_vars(region, layout, mapper)
                if len(vars_in_region) > 10:
                    return self._encode_large_cardinality(vars_in_region, "AT_MOST", k, mapper)
                return self.encode_at_most(vars_in_region, k)
            case ExactlyClue(region=region, k=k):
                vars_in_region = self.resolve_region_vars(region, layout, mapper)
                if len(vars_in_region) > 10:
                    return self._encode_large_cardinality(vars_in_region, "EXACTLY", k, mapper)
                return self.encode_exactly(vars_in_region, k)
            case _:
                raise TypeError(f"CardinalityAlgo does not support clue type: {type(clue).__name__}")
