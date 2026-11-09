from __future__ import annotations

from griductive.domain.evaluator import ClueEvaluator
from griductive.domain.models import BoardLayout
from griductive.domain.state import PuzzleDefinition


def validate_puzzle_integrity(puzzle: PuzzleDefinition) -> list[str]:
    """Validate structure and indexing of a PuzzleDefinition."""
    errors: list[str] = []
    size = puzzle.size
    layout = BoardLayout(size)
    total_cells = size * size

    if len(puzzle.characters) != total_cells:
        errors.append(f"Expected {total_cells} characters, got {len(puzzle.characters)}")
    if len(puzzle.hidden_statuses) != total_cells:
        errors.append(f"Expected {total_cells} statuses, got {len(puzzle.hidden_statuses)}")
    if len(puzzle.clues) != total_cells:
        errors.append(f"Expected {total_cells} clues, got {len(puzzle.clues)}")

    all_cells = layout.all_cells()
    for idx, cell in enumerate(all_cells):
        if idx < len(puzzle.characters):
            char = puzzle.characters[idx]
            if char.cell_id != cell:
                errors.append(f"Character at index {idx} has cell_id {char.cell_id}, expected {cell}")
        if idx < len(puzzle.clues):
            clue = puzzle.clues[idx]
            if clue.owner != cell:
                errors.append(f"Clue at index {idx} has owner {clue.owner}, expected {cell}")

    if not puzzle.initial_revealed:
        errors.append("Initial revealed cells set cannot be empty")
    for cell in puzzle.initial_revealed:
        if not layout.contains(cell):
            errors.append(f"Initial revealed cell {cell} is out of bounds")

    return errors


def validate_clue_truthfulness(puzzle: PuzzleDefinition) -> list[str]:
    """Validate that every clue is true under the puzzle's hidden ground-truth solution."""
    errors: list[str] = []
    layout = BoardLayout(puzzle.size)
    evaluator = ClueEvaluator()
    solution = puzzle.full_solution()

    for clue in puzzle.clues:
        try:
            is_true = evaluator.evaluate(clue, layout, solution)
            if not is_true:
                errors.append(
                    f"Clue '{clue.clue_id}' (owner: {clue.owner.to_label()}, type: {type(clue).__name__}) "
                    "evaluates to FALSE under the hidden solution!"
                )
        except Exception as e:
            errors.append(
                f"Error evaluating clue '{clue.clue_id}' at {clue.owner.to_label()}: {e}"
            )

    return errors


def validate_puzzle(puzzle: PuzzleDefinition) -> list[str]:
    """Perform full offline validation of puzzle integrity and clue truthfulness."""
    errors = validate_puzzle_integrity(puzzle)
    if not errors:
        errors.extend(validate_clue_truthfulness(puzzle))
    return errors

