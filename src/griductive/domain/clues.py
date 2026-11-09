from __future__ import annotations

from dataclasses import dataclass
from typing import TypeAlias

from griductive.domain.models import CellId, Parity, Status
from griductive.domain.regions import RegionSpec


@dataclass(frozen=True, kw_only=True)
class ClueBase:
    """Base class for all structured clues."""
    clue_id: str
    owner: CellId

    def __post_init__(self) -> None:
        if not self.clue_id or not self.clue_id.strip():
            raise ValueError("clue_id cannot be empty")


@dataclass(frozen=True, kw_only=True)
class FactClue(ClueBase):
    """A named person has a given status: target = status."""
    target: CellId
    status: Status


@dataclass(frozen=True, kw_only=True)
class SameClue(ClueBase):
    """Two named people have the same status: left <-> right."""
    left: CellId
    right: CellId

    def __post_init__(self) -> None:
        super().__post_init__()
        if self.left == self.right:
            raise ValueError(f"SameClue left and right must be different cells, got {self.left}")


@dataclass(frozen=True, kw_only=True)
class DifferentClue(ClueBase):
    """Two named people have different statuses: left XOR right."""
    left: CellId
    right: CellId

    def __post_init__(self) -> None:
        super().__post_init__()
        if self.left == self.right:
            raise ValueError(f"DifferentClue left and right must be different cells, got {self.left}")


@dataclass(frozen=True, kw_only=True)
class ExactlyClue(ClueBase):
    """Exactly k people in region are Criminals."""
    region: RegionSpec
    k: int

    def __post_init__(self) -> None:
        super().__post_init__()
        if self.k < 0:
            raise ValueError(f"ExactlyClue count k must be non-negative, got {self.k}")


@dataclass(frozen=True, kw_only=True)
class AtLeastClue(ClueBase):
    """At least k people in region are Criminals."""
    region: RegionSpec
    k: int

    def __post_init__(self) -> None:
        super().__post_init__()
        if self.k < 0:
            raise ValueError(f"AtLeastClue count k must be non-negative, got {self.k}")


@dataclass(frozen=True, kw_only=True)
class AtMostClue(ClueBase):
    """At most k people in region are Criminals."""
    region: RegionSpec
    k: int

    def __post_init__(self) -> None:
        super().__post_init__()
        if self.k < 0:
            raise ValueError(f"AtMostClue count k must be non-negative, got {self.k}")


@dataclass(frozen=True, kw_only=True)
class ParityClue(ClueBase):
    """Regional parity constraint: sum(C_i for i in region) mod 2 == EVEN (0) / ODD (1)."""
    region: RegionSpec
    parity: Parity


Clue: TypeAlias = (
    FactClue
    | SameClue
    | DifferentClue
    | ExactlyClue
    | AtLeastClue
    | AtMostClue
    | ParityClue
)

