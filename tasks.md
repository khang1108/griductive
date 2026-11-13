# Member 2 Tasks: DPLL SAT Solver

Work in the order below. Each task is complete when its checklist items and relevant tests pass.

## 1. Establish the solver contract

- [x] Create `src/griductive/logic/sat/` and `tests/test_dpll_solver.py` if they do not exist.
- [x] Define frozen `SolverStats` and `SATResult` dataclasses with the agreed fields and types.
- [x] Add the `DPLLSolver.solve(clauses, assumptions=())` public signature.
- [x] Export the public solver types from `src/griductive/logic/sat/__init__.py`.
- [x] Keep solver state and clause working data local to each call.

## 2. Implement unit propagation and conflicts

- [x] Simplify satisfied clauses and remove falsified literals from remaining clauses.
- [x] Find and assign unit literals until propagation reaches a fixed point.
- [x] Detect an empty clause and contradictory assignments as conflicts.
- [x] Count each unit-derived assignment as one propagation.
- [x] Test unit chains, initially empty clauses, and conflicts caused by propagation.

## 3. Implement recursive DPLL search

- [x] Detect SAT when all clauses are satisfied and UNSAT when a conflict is reached.
- [x] Select the smallest unassigned variable ID deterministically.
- [x] Try `True` before `False` for each decision variable.
- [x] Recurse on each branch and backtrack when a branch conflicts.
- [x] Count branch choices as decisions and failed branches as backtracks.
- [x] Test a satisfiable formula requiring branching and an unsatisfiable formula requiring both branches to fail.

## 4. Add assumptions and complete models

- [x] Apply assumptions as temporary assignments before search.
- [x] Return UNSAT for contradictory assumptions or assumptions that conflict with the clauses.
- [x] Ensure assumptions do not modify input clauses or affect a subsequent solve call.
- [x] Return a complete deterministic assignment for all variables appearing in clauses or assumptions.
- [x] Test SAT and UNSAT assumptions, conflicting assumptions, input preservation, and solve-call isolation.

## 5. Add metrics and finalize results

- [x] Measure each solve call with `time.perf_counter_ns()` and report milliseconds.
- [x] Return decisions, propagations, backtracks, and runtime in `SolverStats` for both SAT and UNSAT.
- [x] Return `model=None` only for UNSAT; verify every SAT model satisfies the clauses and assumptions.
- [x] Test metric types and non-negative values without asserting a fragile exact runtime.

## 6. Verify integration readiness

- [x] Run `python -m pytest tests/test_dpll_solver.py`.
- [x] Verify imports through `from griductive.logic.sat import DPLLSolver, SATResult, SolverStats`.
- [x] Review the solver against the interface in `docs/work/API.md` and the Member 2 requirements in `docs/work/TASK_DISTRIBUTION.md`.
- [x] Report any contract mismatch to the relevant teammate before changing the shared interface.

The implementation is in `src/griductive/solver/dpll.py`; `griductive.logic.sat` and `griductive.logic.sat.dpll` re-export the shared integration API.
