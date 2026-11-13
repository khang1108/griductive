# Member 2 Plan: DPLL SAT Solver

## Objective

Implement the project's pure-Python DPLL SAT solver for propositional CNF. It must support recursive branching and backtracking, temporary assumptions, and per-solve performance statistics. The solver must return SAT with a complete model for the variables in the input formula, or return UNSAT.

## Scope and ownership

**Owned deliverables**

- `src/griductive/solver/dpll.py`
- `src/griductive/logic/sat/dpll.py` (contract-compatible import)
- `src/griductive/logic/sat/__init__.py`
- `tests/test_dpll_solver.py`

**In scope**

- DPLL with unit propagation and conflict detection.
- Deterministic variable selection: choose the smallest unassigned variable ID.
- Deterministic branch order: try `True`, then `False`.
- Solve-local assumptions that do not alter the caller's clauses or persist between calls.
- SAT/UNSAT results, a complete satisfying assignment for formula variables, and `SolverStats`.

**Out of scope**

- CNF encoding and variable mapping (Member 1).
- Entailment, deduction traces, uniqueness checks, and game integration (Member 3).
- API wiring, benchmark orchestration, and end-to-end integration (Member 4).
- Pure-literal elimination or advanced branching heuristics; the project specification makes these optional.
- Persistent telemetry output. Per the agreed interpretation of the interface, metrics are returned in `SATResult.stats`.

## Required interface

Implement the Member 2 contract:

```python
@dataclass(frozen=True)
class SolverStats:
    decisions: int
    propagations: int
    backtracks: int
    runtime_ms: float

@dataclass(frozen=True)
class SATResult:
    is_sat: bool
    model: dict[int, bool] | None
    stats: SolverStats

class DPLLSolver:
    def solve(
        self,
        clauses: Sequence[Sequence[int]],
        assumptions: Sequence[int] = (),
    ) -> SATResult: ...
```

`SolverStats` and `SATResult` should be immutable value objects. A SAT result must provide values for every variable occurring in the clauses or assumptions, including deterministic values for variables that are irrelevant after the formula is satisfied. An UNSAT result has no model.

## Implementation approach

1. Normalize the input into solver-owned clause data without changing caller-owned sequences. Keep assignments and counters local to each `solve` call.
2. Apply assumptions as temporary assignments before search. Detect contradictory assumptions or an assumption-induced conflict as UNSAT; never append assumptions to or otherwise modify the original clauses.
3. Repeatedly perform unit propagation:
   - Satisfy a clause by removing it from the active formula.
   - Remove falsified literals from remaining clauses.
   - Assign the literal of each unit clause and continue until no units remain.
   - Report conflict if a clause becomes empty or an assignment contradicts an existing assignment.
4. If unresolved clauses remain, select the smallest unassigned variable ID deterministically. Recursively try `True`; if that branch conflicts, backtrack and try `False`.
5. On SAT, complete any still-unassigned formula variables deterministically so the returned model is complete. On UNSAT, return `model=None`.
6. Measure elapsed solve time with `time.perf_counter_ns()` and convert to milliseconds. Return decisions, unit propagations, backtracks, and runtime in `SolverStats` for every result.

## Milestones

1. **Contract and data model** — add the SAT package, result/statistics types, input handling, and call-local solver state.
2. **Propagation and conflicts** — implement unit propagation and conflict detection; verify with focused cases.
3. **Recursive search** — add deterministic variable selection, two-polarity branching, and backtracking.
4. **Assumptions and result completeness** — support temporary assumptions, model completion, and repeated-call isolation.
5. **Telemetry and verification** — finalize metric semantics, run the focused solver tests, and check the package exports against the integration contract.

## Acceptance criteria

- Correctly solves empty formulas, empty clauses, unit clauses, satisfiable formulas, and unsatisfiable formulas.
- Unit propagation derives forced assignments and detects propagation conflicts.
- Recursive search finds a model when a decision branch succeeds and proves UNSAT when both branches fail.
- Repeated runs with the same input are deterministic in result and decision behavior.
- Assumptions can make a satisfiable formula SAT or UNSAT without mutating clauses or leaking assignments into later solves.
- Every SAT model assigns every variable found in the clauses or assumptions and satisfies all clauses and assumptions.
- SAT results include non-negative counts and runtime; UNSAT results include `model=None` and metrics.
- The public classes are importable from `griductive.logic.sat`.

## Dependencies and coordination

- The solver can be developed and tested independently using integer-literal clauses; it does not need the CNF encoder to be finished.
- Preserve the shared `solve(clauses, assumptions=()) -> SATResult` contract so Member 3 can issue entailment queries.
- Keep clauses as signed integer literals with variable IDs greater than zero; positive literals represent `True`, negative literals represent `False`.

## Risks and mitigations

- **Caller input mutation:** use solver-owned working data and add regression tests that compare inputs before and after solves.
- **Incorrect counter semantics:** count branch choices as decisions and unit-derived assignments as propagations; keep counter updates at the operations they describe.
- **Incomplete models:** track all observed variable IDs and explicitly complete unassigned ones before returning SAT.
- **State leakage:** keep assignments, working clauses, and metrics local to each solve call; test contradictory assumptions followed by a clean solve.
- **Recursion depth:** expected puzzle encodings are small; keep recursive search simple and test representative formulas. Revisit only if project benchmarks demonstrate a limitation.

## Source references

- `docs/AI - Project 2.pdf`, Section 4.3 (PDF page 6): required DPLL operations, complete SAT assignment or UNSAT, and solver metrics.
- Member 2 task image: assumption solving, `perf_counter_ns()` timing, result contract, and owned-file list.
- `docs/work/API.md` and `docs/work/TASK_DISTRIBUTION.md`: shared module interface and teammate boundaries.
