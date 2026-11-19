from __future__ import annotations

from dataclasses import dataclass
from typing import TypeAlias

from griductive.domain.models import CellId

Literal: TypeAlias = int
Clause: TypeAlias = tuple[int, ...]


@dataclass(frozen=True)
class EncodedKB:
    """Encoded DIMACS-style CNF knowledge base for a given PublicState."""

    clauses: tuple[Clause, ...]
    primary_vars_count: int
    aux_vars_count: int
    variable_map: dict[CellId, int]

    @property
    def total_vars_count(self) -> int:
        """Total number of variables (primary + auxiliary) referenced in this KB."""
        return self.primary_vars_count + self.aux_vars_count
