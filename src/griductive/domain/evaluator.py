from __future__ import annotations

from collections import deque
from typing import Mapping

from griductive.domain.clues import (
    AtLeastClue,
    AtMostClue,
    Clue,
    CompareClue,
    CompoundClue,
    ConnectedClue,
    DifferentClue,
    ExactlyClue,
    FactClue,
    FlavorClue,
    ParityClue,
    SameClue,
)
from griductive.domain.models import BoardLayout, CellId, CompareOp, Parity, Status
from griductive.domain.regions import resolve_region


def _is_criminal(status: Status | bool) -> bool:
    if isinstance(status, Status):
        return status == Status.CRIMINAL
    return bool(status)


class ClueEvaluator:
    """Direct semantic evaluator for clues against a complete variable assignment.
    
    Evaluates truth value of clues directly without CNF encoding or SAT solving.
    Acts as the ground-truth oracle for validating CNF encodings.
    """

    def evaluate(
        self,
        clue: Clue,
        layout: BoardLayout,
        assignment: Mapping[CellId, Status | bool],
    ) -> bool:
        match clue:
            case FactClue(target=target, status=expected_status):
                if target not in assignment:
                    raise KeyError(f"Cell {target} missing in assignment")
                return _is_criminal(assignment[target]) == _is_criminal(expected_status)

            case SameClue(left=left, right=right):
                if left not in assignment:
                    raise KeyError(f"Cell {left} missing in assignment")
                if right not in assignment:
                    raise KeyError(f"Cell {right} missing in assignment")
                return _is_criminal(assignment[left]) == _is_criminal(assignment[right])

            case DifferentClue(left=left, right=right):
                if left not in assignment:
                    raise KeyError(f"Cell {left} missing in assignment")
                if right not in assignment:
                    raise KeyError(f"Cell {right} missing in assignment")
                return _is_criminal(assignment[left]) != _is_criminal(assignment[right])

            case ExactlyClue(region=region, k=k):
                cells = resolve_region(region, layout)
                for cell in cells:
                    if cell not in assignment:
                        raise KeyError(f"Cell {cell} missing in assignment")
                criminal_count = sum(1 for c in cells if _is_criminal(assignment[c]))
                return criminal_count == k

            case AtLeastClue(region=region, k=k):
                cells = resolve_region(region, layout)
                for cell in cells:
                    if cell not in assignment:
                        raise KeyError(f"Cell {cell} missing in assignment")
                criminal_count = sum(1 for c in cells if _is_criminal(assignment[c]))
                return criminal_count >= k

            case AtMostClue(region=region, k=k):
                cells = resolve_region(region, layout)
                for cell in cells:
                    if cell not in assignment:
                        raise KeyError(f"Cell {cell} missing in assignment")
                criminal_count = sum(1 for c in cells if _is_criminal(assignment[c]))
                return criminal_count <= k

            case ParityClue(region=region, parity=parity):
                cells = resolve_region(region, layout)
                for cell in cells:
                    if cell not in assignment:
                        raise KeyError(f"Cell {cell} missing in assignment")
                criminal_count = sum(1 for c in cells if _is_criminal(assignment[c]))
                expected_rem = 0 if parity == Parity.EVEN else 1
                return criminal_count % 2 == expected_rem

            case CompareClue(
                left_region=left_region,
                right_region=right_region,
                op=op,
                target_status=target_status,
            ):
                left_cells = resolve_region(left_region, layout)
                right_cells = resolve_region(right_region, layout)
                for cell in (*left_cells, *right_cells):
                    if cell not in assignment:
                        raise KeyError(f"Cell {cell} missing in assignment")
                want_crim = target_status == Status.CRIMINAL
                left_count = sum(1 for c in left_cells if _is_criminal(assignment[c]) == want_crim)
                right_count = sum(1 for c in right_cells if _is_criminal(assignment[c]) == want_crim)
                if op == CompareOp.MORE:
                    return left_count > right_count
                if op == CompareOp.FEWER:
                    return left_count < right_count
                return left_count == right_count

            case ConnectedClue(region=region, target_status=target_status):
                cells = resolve_region(region, layout)
                for cell in cells:
                    if cell not in assignment:
                        raise KeyError(f"Cell {cell} missing in assignment")
                want_crim = target_status == Status.CRIMINAL
                matching = {c for c in cells if _is_criminal(assignment[c]) == want_crim}
                if len(matching) <= 1:
                    return True
                start = next(iter(matching))
                visited = {start}
                queue = deque([start])
                while queue:
                    cur = queue.popleft()
                    for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                        nxt = CellId(cur.row + dr, cur.col + dc)
                        if nxt in matching and nxt not in visited:
                            visited.add(nxt)
                            queue.append(nxt)
                return len(visited) == len(matching)

            case CompoundClue(clues=sub_clues):
                return all(self.evaluate(sub, layout, assignment) for sub in sub_clues)

            case FlavorClue():
                return True

            case _:
                raise TypeError(f"Unsupported clue type: {type(clue)}")


def evaluate_clue(
    clue: Clue,
    layout: BoardLayout,
    assignment: Mapping[CellId, Status | bool],
) -> bool:
    """Convenience helper function for semantic clue evaluation."""
    return ClueEvaluator().evaluate(clue, layout, assignment)

