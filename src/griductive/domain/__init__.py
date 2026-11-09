"""Domain entities, enums, clues, regions, and evaluation."""

from griductive.domain.clues import (
    AtLeastClue,
    AtMostClue,
    Clue,
    ClueBase,
    DifferentClue,
    ExactlyClue,
    FactClue,
    ParityClue,
    SameClue,
)
from griductive.domain.evaluator import ClueEvaluator, evaluate_clue
from griductive.domain.models import (
    BoardLayout,
    CellId,
    Character,
    Classification,
    Parity,
    Status,
)
from griductive.domain.regions import (
    ColumnRegion,
    ExplicitRegion,
    IntersectionRegion,
    NeighborsRegion,
    RegionResolver,
    RegionSpec,
    RowRegion,
    resolve_region,
)
from griductive.domain.state import (
    PublicCell,
    PublicState,
    PuzzleDefinition,
)

__all__ = [
    # Models & enums
    "Status",
    "Classification",
    "Parity",
    "CellId",
    "Character",
    "BoardLayout",
    # Regions
    "RowRegion",
    "ColumnRegion",
    "NeighborsRegion",
    "ExplicitRegion",
    "IntersectionRegion",
    "RegionSpec",
    "resolve_region",
    # Clues
    "ClueBase",
    "FactClue",
    "SameClue",
    "DifferentClue",
    "ExactlyClue",
    "AtLeastClue",
    "AtMostClue",
    "ParityClue",
    "Clue",
    # Evaluator
    "ClueEvaluator",
    "evaluate_clue",
    # State
    "PuzzleDefinition",
    "PublicCell",
    "PublicState",
]

