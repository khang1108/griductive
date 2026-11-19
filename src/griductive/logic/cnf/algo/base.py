from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Iterable

from griductive.domain.clues import Clue
from griductive.domain.models import BoardLayout
from griductive.domain.regions import RegionSpec, resolve_region
from griductive.logic.cnf.mapping import VariableMapper
from griductive.logic.cnf.types import Clause


class BaseEncodingAlgo(ABC):
    """Abstract base class for CNF clue encoding algorithms."""

    TAUTOLOGY: tuple[Clause, ...] = ()
    CONTRADICTION: tuple[Clause, ...] = ((),)

    @staticmethod
    def normalize_clause(literals: Iterable[int]) -> Clause | None:
        """Normalize a CNF clause to canonical sorted form.

        Removes duplicate literals, drops tautological clauses containing both
        a literal and its negation, and preserves empty contradiction clauses.
        """
        lit_tuple = tuple(literals)
        if not lit_tuple:
            return ()

        unique_lits: set[int] = set()
        for lit in lit_tuple:
            if lit == 0:
                raise ValueError("Literal 0 is invalid in DIMACS CNF")
            unique_lits.add(lit)

        for lit in unique_lits:
            if -lit in unique_lits:
                return None

        return tuple(sorted(unique_lits, key=lambda x: (abs(x), x)))

    def finalize_clauses(self, raw_clauses: Iterable[Iterable[int]]) -> list[Clause]:
        """Normalize and deduplicate raw clauses while short-circuiting contradictions."""
        result: list[Clause] = []
        seen: set[Clause] = set()
        for raw in raw_clauses:
            raw_tuple = tuple(raw)
            if not raw_tuple:
                return [()]
            norm = self.normalize_clause(raw_tuple)
            if norm is not None and norm not in seen:
                seen.add(norm)
                result.append(norm)
        return result

    @staticmethod
    def resolve_region_vars(
        region: RegionSpec,
        layout: BoardLayout,
        mapper: VariableMapper,
    ) -> tuple[int, ...]:
        """Resolve a RegionSpec to its ordered tuple of primary variable IDs."""
        cells = resolve_region(region, layout)
        return tuple(mapper.cell_to_var(c) for c in cells)

    @abstractmethod
    def supports(self, clue: Clue) -> bool:
        """Return True if this algorithm can encode the given clue."""
        ...

    @abstractmethod
    def encode_clue(
        self,
        clue: Clue,
        layout: BoardLayout,
        mapper: VariableMapper,
    ) -> list[Clause]:
        """Encode the given clue into normalized CNF clauses."""
        ...
