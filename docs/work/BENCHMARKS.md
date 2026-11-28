# Benchmark methodology and findings

## Run the experiment

Install `requirements-dev.txt`, then run from the repository root:

```bash
python scripts/run_benchmarks.py --repeats 3 --timeout-ms 10000 --output-dir docs/work/benchmark-results
python scripts/run_benchmarks.py --size 5 --output-dir /tmp/griductive-5x5
python scripts/run_benchmarks.py --puzzle-id daily_3x3_hard --repeats 2 --output-dir /tmp/griductive-repeat
```

The default selection is all 14 SQLite puzzles: six 3×3, five 4×4 and three
5×5. `--db-path` selects another database; `--puzzle-id` can be repeated, and
combines with `--size` by intersection. `--repeats` and `--timeout-ms` must be
positive integers. A fresh game and dependency stack is created for every attempt.

The benchmark explicitly instantiates the team's `CNFEncoder`,
`griductive.logic.sat.DPLLSolver`, and `LogicAgent`. It does not run a browser,
contact the web server, use its shared session, or wait for GUI animations.

## Metric definitions

| CSV field | Definition |
|---|---|
| `primary_vars`, `aux_vars`, `clause_count` | Maximum encoded KB size observed by the Agent during the run |
| `sat_queries` | All solver calls, including any final scan with no forced move |
| `decisions`, `propagations`, `backtracks` | Agent's accumulated solver counters over all calls |
| `deduction_steps` | Number of successful proved reveals, excluding initial reveals |
| `runtime_ms` | Agent deduction wall time, excluding process startup, puzzle loading and GUI delays |
| `process_elapsed_ms` | Parent-observed worker time, including startup and puzzle loading |
| `solved_count`, `total_cells` | Revealed cards and board area at termination |

The Agent encodes knowledge before a deduction scan. Its `max_*` metrics do not
include an extra encoding after the final successful reveal. `solver_runtime_ms`
in API responses is the sum of SAT-query durations; it is distinct from whole-run
wall time. Counter definitions follow the TV2 implementation (a decision counts
a tried branch), so comparisons with another solver need aligned definitions.

## Outcomes and deadlines

Each attempt runs in a separate process using multiprocessing spawn. The parent
enforces a hard deadline (default 10000 ms), including process startup and puzzle
loading, then terminates and joins an overdue worker. Remaining puzzles still
run. A worker failure is recorded as `ERROR`; an exceeded deadline is `TIMEOUT`.
Missing metrics are null/empty CSV cells, not fabricated zero counts.

`STUCK_NO_FORCIBLE_MOVE` means public knowledge does not force another move;
it is not a timeout. Normal `SOLVED` and `STUCK_NO_FORCIBLE_MOVE` results exit 0;
any non-success outcome (including inconsistent knowledge or engine rejection) exits 1; invalid CLI arguments exit 2.

CSV keeps one row per attempt. Markdown preserves individual outcomes and groups
median runtime by puzzle and outcome, so solved and timeout attempts are not
mixed. JSON metadata records the command arguments, UTC timestamp, interpreter,
platform/CPU information, solver class, commit and dirty paths. Run results from a
dirty checkout correspond to those recorded modifications as well as the commit;
commit the code first when collecting a clean release baseline.

## Interpretation and limits

The two `sample_*` puzzles have a known stopping point. Existing CNF tests enumerate
semantic models and compare them with CNF models at that point; matching multiple
models are marked expected failures for no-guess completeness. Keep these outcomes
visible and investigate any change instead of forcing a verdict or editing puzzle
data to obtain a green table.

Compare runtime together with clauses, SAT calls and search counters. A larger
board need not take longer than every smaller board: clue structure and forced
moves affect search. Three repeats on one machine describe this fixture set,
not a universal complexity bound. No official performance threshold was supplied;
a timeout alone does not establish combinatorial explosion.

## Recorded experiment — main integration refresh

The refreshed run used source commit `37f1ebc`, based on GitHub main `1ef81d1`,
Python 3.14.10 on Linux x86_64, and an AMD Ryzen AI 7 350 w/ Radeon 860M.
The full timestamp, environment and dirty paths are in
[metadata](benchmark-results/benchmark_metadata.json). Source was committed before
measurement; outstanding files were documentation/artifacts, untracked AGENTS.md,
and an npm lockfile package-name correction excluded from this PR.

Three attempts per puzzle produced **42 SOLVED rows across all 14 puzzles, with
no ERROR, TIMEOUT or STUCK outcomes**. All three 5×5 puzzles solved on every
attempt. Raw data: [CSV](benchmark-results/benchmark_results.csv) and
[full Markdown table](benchmark-results/benchmark_results.md).

| Puzzle | Outcome | Steps | SAT calls | Max clauses | Median solve time (ms) |
|---|---|---:|---:|---:|---:|
| daily_3x3_hard | SOLVED | 7 | 20 | 15 | 1.202 |
| daily_4x4_expert | SOLVED | 14 | 106 | 26 | 3.180 |
| daily_5x5_expert | SOLVED | 23 | 228 | 41 | 7.902 |
| daily_5x5_master | SOLVED | 23 | 188 | 38 | 7.267 |
| dragon_3x3_01 | SOLVED | 8 | 22 | 22 | 1.336 |
| dragon_3x3_02 | SOLVED | 8 | 21 | 126 | 3.184 |
| dragon_4x4_01 | SOLVED | 15 | 38 | 167 | 7.308 |
| dragon_5x5_01 | SOLVED | 24 | 67 | 360 | 17.562 |
| hoanglong_3x3_tutorial | SOLVED | 8 | 16 | 24 | 1.307 |
| hoanglong_4x4_chain_a | SOLVED | 15 | 30 | 16 | 1.536 |
| hoanglong_4x4_chain_b | SOLVED | 15 | 30 | 16 | 1.546 |
| kashyy_3x3_chain | SOLVED | 8 | 16 | 9 | 0.783 |
| sample_3x3 | SOLVED | 8 | 26 | 28 | 1.173 |
| sample_4x4 | SOLVED | 14 | 55 | 66 | 4.374 |

The 5×5 fixtures demonstrate scaling on this puzzle set but do not stress
backtracking heavily: all three recorded zero backtracks, and dragon_5x5_01
recorded one decision per attempt. Its 360-clause CNF took longer than the
other 5×5 cases despite fewer SAT calls. Many cases resolve by unit propagation;
this dataset does not establish performance on difficult general SAT instances.

Upstream commit `8fad8b4` repaired the deduction chains in sample_3x3 and
sample_4x4. They now solve in 8 and 14 steps respectively. The older experiment's
six STUCK rows described the previous puzzle data and have been replaced by
this refreshed dataset. TV4 does not modify puzzle definitions or solver/Agent
algorithms. Tests retain STUCK coverage through a separate ambiguous fixture.

Verification after integration: **283 Python tests passed**, no expected failures,
one upstream Starlette/httpx deprecation warning; frontend production build passed.
Historical browser scenarios and the refreshed browser checks are documented in
[GUI acceptance evidence](GUI_ACCEPTANCE.md). Millisecond-scale timings were
recorded on a development machine; close values are not statistically significant.
