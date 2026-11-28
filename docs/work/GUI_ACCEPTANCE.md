# GUI Acceptance: Live Auto-solve

## Baseline before implementation

Baseline review date: 2026-11-20. The controller verified the original GUI loaded using local Chromium and Playwright. Baseline failures below were identified from source inspection; no pre-implementation per-step endpoint existed. The default browser connector lacked Chrome, so final checks used `/usr/bin/chromium` with the cached Playwright package instead of changing system browser configuration.

The following baseline outcomes are confirmed from the existing frontend source. They describe behavior failures even though the controller confirmed the app itself loaded:

| Acceptance case | Baseline | Evidence |
| --- | --- | --- |
| A step response reveals at most one cell | FAIL | `App.tsx` calls the full-run `/api/auto-solve` endpoint and applies its final `GameState`. |
| Each revealed cell adds its trace and clue in order | FAIL | The existing UI appends the string trace only after the full-run response. |
| Double-clicking Start starts only one loop | FAIL | The full-run button remains enabled while its handler awaits the request; there is no synchronous start lock. |
| Stop during a request applies that response and sends no next step | FAIL | There is no Stop control or step request loop. |
| Stop during the display delay prevents another request | FAIL | There is no per-step display delay or stop state. |
| Pause waits for the current step before opening its modal | FAIL | Pause opens immediately and does not coordinate with auto-solve. |
| Offline or stale-revision errors resync without retrying a write | FAIL | The UI uses one full-run request and has no state resync flow for solve errors. |
| Hint does not reveal a cell; solved/stuck outcomes are visible | FAIL | Current Hint uses the legacy response shape; no structured outcome is consumed. |

## Browser checklist after implementation (historical 2026-11-20 run)

Run the backend with `python main.py --no-browser` and Vite with `cd frontend && npm run dev`. Use `daily_3x3_hard` and one 5×5 puzzle. A stuck state now requires a separate ambiguous fixture; the updated sample puzzles solve fully. These are manual browser acceptance checks, not automated frontend tests.

| Case | Expected result | Result / reproduction |
| --- | --- | --- |
| One-step request | Each `POST /api/auto-solve/step` changes no more than one cell; the board shows that cell before another request. | PASS — daily_3x3_hard: 7 responses; each revision/solved count increased by exactly one. |
| Trace and clue order | Each applied structured trace entry is logged in order and its newly revealed clue appears with the matching board state. | PASS — response trace matched revealed cell/clue; structured log includes new clue ID and public text. |
| Double-click Start | Only one step loop is created. | PASS — two synchronous clicks produced one request before Stop. |
| Stop during request | Let the current response apply, then observe no subsequent step request. | PASS — held response after server commit; Stop applied that one reveal and sent no next request. |
| Stop during 600 ms display delay | Stop; observe no subsequent step request after the delay would have elapsed. | PASS — stopped after first response; no next request after 900 ms. |
| Pause during a request or delay | Pause stops the loop as above, then opens the pause modal. | PASS for display delay — Pause stopped the loop, opened modal, and Resume allowed another run. In-flight Stop separately verified. |
| Offline during request | Take the network offline before the response; observe no automatic write retry, then state is refreshed when GET succeeds. | PASS — aborted response after real server commit; UI performed GET resync without retrying POST. |
| Stale revision from another tab | Restart/load in a second tab during a run; the first tab handles 409 by GET resync and does not overwrite newer state. | PASS — changed server case while UI held old token; step returned 409; GET restored new case without a reveal. |
| Failed state resync | Make GET fail after a solve error; solve controls stay locked and a retry GET action is available. | PASS — aborted step and GET; controls stayed disabled until Retry state refresh succeeded. |
| Unmount with a pending request or delay | Navigate/unmount while a request or timer is pending; no stale response updates the removed view or a later run. | PASS for in-flight response — navigated away after commit; reload showed revision 1 with no extra POST. Timer cancellation separately exercised by Stop. |
| Stop and run again | Stop, then start again; the next request uses the latest session ID and revision. | PASS — resumed with latest state after stopping; no duplicate revision request. |
| Solved and stuck terminal states | Solved opens the victory state using the response counts; stuck shows a terminal explanation and does not request another step. | PASS — daily_3x3_hard solved, sample_3x3 stopped at 5/9, daily_5x5_expert solved at 25/25. |
| Hint | Hint reports `AVAILABLE`, `SOLVED`, `STUCK_NO_FORCIBLE_MOVE`, or `INCONSISTENT` without changing board state or revision. | PASS AVAILABLE/no mutation in browser; SOLVED/STUCK/INCONSISTENT response shapes covered by HTTP tests. |
| Theme while auto-solving | Theme toggle remains available and continues to work during a run. | PASS — Theme toggle worked while loop was active. |
| 5×5 pacing and payloads | Network panel shows one step request per revealed cell, with at least 600 ms between a response and the next request. | PASS — daily_5x5_expert: 23 requests, 22 measured response-to-next-request intervals; min 601.127 ms, max 603.668 ms (configured delay 600 ms). |

Controller owns the full post-implementation browser validation. Record the browser, puzzle, outcome, and reproduction notes in the final column as each case is run.

## Historical execution evidence

Controller ran real Chromium headlessly against Vite on port 5173 and FastAPI on
port 8000. Browser checks were scripted through Playwright; they are acceptance
checks, not a new repository frontend unit-test framework. Temporary runners:
`/tmp/griductive-gui-acceptance.cjs` and `/tmp/griductive-gui-resilience.cjs`.
Core run reported no page errors; screenshot:
`/tmp/griductive-autosolve-verified.png`. No production API responses were mocked;
network failure tests intercepted transport delivery around real server work.

The final victory modal covers the board as in the existing UI. Select Deduction
Log before running to watch entries arrive; the final 5×5 check did this before
the victory modal appeared. No claim is made that every rare terminal outcome was
visually induced; API tests cover inconsistent/solved Hint states.

## Post-review regressions

- Delayed stage-load response: reproduced an old case overwriting a newer case;
  final App serializes pending state-changing actions and rejects stale/unmounted
  completions. `/tmp/griductive-gui-state-race.cjs` now passes.
- Failed resync followed by another tab changing the case: reproduced old trace
  history retained after Retry; shared guarded resync resets per-session timer,
  step counter and log. `/tmp/griductive-gui-resync-session.cjs` now passes.
- Pacing on final App: `/tmp/griductive-gui-pacing.cjs` observed all 22 intervals
  above 600 ms (601.127–603.668 ms); 23 requests solved daily_5x5_expert.
- Production build passed after the App fix. Python final suite: 276 passed,
  2 oracle-confirmed expected failures, one upstream Starlette/httpx deprecation.

## Refresh after upstream integration — 2026-11-22

Source `37f1ebc` starts from main `1ef81d1` and keeps the upstream removal of the
startup Loaded mystery banner. Built production assets were served by FastAPI at
port 8081 and checked with local Chromium/Playwright using the real backend.

- sample_3x3: SOLVED through 8 separate step responses.
- sample_4x4: SOLVED through 14 separate step responses (two cells initially revealed).
- daily_5x5_expert: SOLVED through 23 separate step responses.
- Every response increased revision and solved count by exactly one; each carried
  a structured trace step. Hint was AVAILABLE and did not change revision.
- No startup Loaded mystery banner and no JavaScript page errors were observed.
- Python: 283 passed, no expected failures, one upstream deprecation warning;
  frontend production build passed.

The historical sample_3x3 STUCK result above belongs to the old dataset.
Upstream repaired both sample puzzles; current HTTP/service/benchmark tests use
an independent ambiguous fixture for STUCK coverage. Earlier Stop, recovery and
pacing evidence remains historical; those browser scenarios were not rerun in
this refresh.
