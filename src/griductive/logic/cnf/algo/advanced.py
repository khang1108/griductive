from __future__ import annotations

from collections.abc import Sequence

from griductive.domain.clues import (
    Clue,
    CompareClue,
    CompoundClue,
    ConnectedClue,
    FlavorClue,
)
from griductive.domain.models import BoardLayout, CompareOp, Status
from griductive.domain.regions import resolve_region
from griductive.logic.cnf.algo.base import BaseEncodingAlgo
from griductive.logic.cnf.mapping import VariableMapper
from griductive.logic.cnf.types import Clause


class AdvancedClueAlgo(BaseEncodingAlgo):
    """CNF encoder for CompareClue, ConnectedClue, CompoundClue, and FlavorClue."""

    def __init__(self, sub_encoder: object | None = None) -> None:
        self._sub_encoder = sub_encoder

    @staticmethod
    def encode_unary_counter(
        lits: Sequence[int],
        mapper: VariableMapper,
    ) -> tuple[list[int], list[Clause]]:
        """Encode sequential unary prefix counter s[k] <-> (sum(lits) >= k+1)."""
        m = len(lits)
        if m == 0:
            return [], []

        raw_clauses: list[Clause] = []
        prev: list[int] = []
        for i, lit in enumerate(lits):
            cur: list[int] = []
            # j = 1
            s1 = mapper.new_aux_var()
            if i == 0:
                raw_clauses.extend([(-s1, lit), (s1, -lit)])
            else:
                p1 = prev[0]
                raw_clauses.extend([(-s1, p1, lit), (-p1, s1), (-lit, s1)])
            cur.append(s1)

            # 1 < j <= i
            for j_idx in range(1, i):
                sj = mapper.new_aux_var()
                pj = prev[j_idx]
                pj_prev = prev[j_idx - 1]
                raw_clauses.extend([
                    (-sj, pj, pj_prev),
                    (-sj, pj, lit),
                    (-pj, sj),
                    (-pj_prev, -lit, sj),
                ])
                cur.append(sj)

            # j = i + 1 (when i > 0)
            if i > 0:
                top = mapper.new_aux_var()
                p_last = prev[i - 1]
                raw_clauses.extend([(-top, p_last), (-top, lit), (-p_last, -lit, top)])
                cur.append(top)

            prev = cur

        return prev, raw_clauses

    @staticmethod
    def _encode_ge(left_cnt: Sequence[int], right_cnt: Sequence[int]) -> list[Clause]:
        clauses: list[Clause] = []
        for idx, r_var in enumerate(right_cnt):
            if idx < len(left_cnt):
                clauses.append((-r_var, left_cnt[idx]))
            else:
                clauses.append((-r_var,))
        return clauses

    @staticmethod
    def _encode_gt(left_cnt: Sequence[int], right_cnt: Sequence[int]) -> list[Clause]:
        if not left_cnt:
            return [()]
        clauses: list[Clause] = [(left_cnt[0],)]
        for idx, r_var in enumerate(right_cnt):
            nxt = idx + 1
            if nxt < len(left_cnt):
                clauses.append((-r_var, left_cnt[nxt]))
            else:
                clauses.append((-r_var,))
        return clauses

    def encode_compare(
        self,
        clue: CompareClue,
        layout: BoardLayout,
        mapper: VariableMapper,
    ) -> list[Clause]:
        left_vars = self.resolve_region_vars(clue.left_region, layout, mapper)
        right_vars = self.resolve_region_vars(clue.right_region, layout, mapper)
        sign = 1 if clue.target_status == Status.CRIMINAL else -1
        left_lits = [sign * v for v in left_vars]
        right_lits = [sign * v for v in right_vars]

        left_cnt, c1 = self.encode_unary_counter(left_lits, mapper)
        right_cnt, c2 = self.encode_unary_counter(right_lits, mapper)
        clauses = c1 + c2

        if clue.op == CompareOp.MORE:
            clauses.extend(self._encode_gt(left_cnt, right_cnt))
        elif clue.op == CompareOp.FEWER:
            clauses.extend(self._encode_gt(right_cnt, left_cnt))
        else:
            clauses.extend(self._encode_ge(left_cnt, right_cnt))
            clauses.extend(self._encode_ge(right_cnt, left_cnt))

        return self.finalize_clauses(clauses)

    def encode_connected(
        self,
        clue: ConnectedClue,
        layout: BoardLayout,
        mapper: VariableMapper,
    ) -> list[Clause]:
        cells = resolve_region(clue.region, layout)
        m = len(cells)
        if m <= 2:
            return []

        rows = {c.row for c in cells}
        cols = {c.col for c in cells}
        if len(rows) > 1 and len(cols) > 1:
            raise ValueError("ConnectedClue CNF encoding currently requires a 1D row or column region")

        ordered = sorted(cells)
        vars_ordered = [mapper.cell_to_var(c) for c in ordered]
        raw_clauses: list[Clause] = []
        want_crim = clue.target_status == Status.CRIMINAL

        for i in range(m):
            for j in range(i + 1, m):
                for k in range(j + 1, m):
                    vi, vj, vk = vars_ordered[i], vars_ordered[j], vars_ordered[k]
                    if want_crim:
                        raw_clauses.append((-vi, vj, -vk))
                    else:
                        raw_clauses.append((vi, -vj, vk))

        return self.finalize_clauses(raw_clauses)

    def supports(self, clue: Clue) -> bool:
        return isinstance(clue, (CompareClue, ConnectedClue, CompoundClue, FlavorClue))

    def encode_clue(
        self,
        clue: Clue,
        layout: BoardLayout,
        mapper: VariableMapper,
    ) -> list[Clause]:
        if isinstance(clue, FlavorClue):
            return []
        if isinstance(clue, CompareClue):
            return self.encode_compare(clue, layout, mapper)
        if isinstance(clue, ConnectedClue):
            return self.encode_connected(clue, layout, mapper)
        if isinstance(clue, CompoundClue):
            if self._sub_encoder is None:
                raise RuntimeError("AdvancedClueAlgo requires sub_encoder for CompoundClue")
            raw: list[Clause] = []
            for sub in clue.clues:
                raw.extend(self._sub_encoder.encode_clue(sub, layout, mapper))
            return self.finalize_clauses(raw)
        raise TypeError(f"AdvancedClueAlgo does not support clue type: {type(clue).__name__}")
