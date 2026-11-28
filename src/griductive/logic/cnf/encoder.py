from __future__ import annotations

from collections.abc import Sequence

from griductive.domain.clues import Clue
from griductive.domain.models import BoardLayout, Status
from griductive.domain.state import PublicState
from griductive.logic.cnf.algo import (
    AdvancedClueAlgo,
    BaseEncodingAlgo,
    BasicClueAlgo,
    CardinalityAlgo,
    ParityAlgo,
)
from griductive.logic.cnf.mapping import VariableMapper
from griductive.logic.cnf.types import Clause, EncodedKB


class CNFEncoder:
    """Translates a PublicState (known cell statuses and revealed clues) into CNF."""

    def __init__(self, algos: Sequence[BaseEncodingAlgo] | None = None) -> None:
        if algos is not None:
            self._algos: list[BaseEncodingAlgo] = list(algos)
        else:
            self._algos = [
                BasicClueAlgo(),
                CardinalityAlgo(),
                ParityAlgo(),
                AdvancedClueAlgo(sub_encoder=self),
            ]

    def register_algo(self, algo: BaseEncodingAlgo) -> None:
        """Register an additional encoding algorithm with highest dispatch priority."""
        self._algos.insert(0, algo)

    def encode_clue(
        self,
        clue: Clue,
        layout: BoardLayout,
        mapper: VariableMapper,
    ) -> list[Clause]:
        """Encode a single clue using the first supporting registered algorithm."""
        for algo in self._algos:
            if algo.supports(clue):
                return algo.encode_clue(clue, layout, mapper)
        raise TypeError(
            f"No registered encoding algorithm supports clue type: {type(clue).__name__}"
        )

    def encode_knowledge_base(self, state: PublicState) -> EncodedKB:
        """Convert all known cell statuses and revealed clues in state to an EncodedKB."""
        num_cols = getattr(state, "num_cols", state.size)
        layout = BoardLayout(state.size, cols=num_cols)
        mapper = VariableMapper(state.size, cols=num_cols)
        all_clauses: list[Clause] = []
        seen: set[Clause] = set()

        def _add_clause(clause: Clause) -> None:
            if clause not in seen:
                seen.add(clause)
                all_clauses.append(clause)

        for public_cell in state.cells:
            if public_cell.known_status is None:
                continue
            var = mapper.cell_to_var(public_cell.character.cell_id)
            unit_clause: Clause = (
                (var,) if public_cell.known_status == Status.CRIMINAL else (-var,)
            )
            _add_clause(unit_clause)

        for clue in state.revealed_clues():
            for clause in self.encode_clue(clue, layout, mapper):
                _add_clause(clause)

        return EncodedKB(
            clauses=tuple(all_clauses),
            primary_vars_count=mapper.primary_vars_count,
            aux_vars_count=mapper.aux_vars_count,
            variable_map=mapper.to_dict(),
        )


__all__ = ["CNFEncoder", "EncodedKB"]
