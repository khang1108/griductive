# System Integration and Benchmarking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tích hợp Hint và Auto-solve từng ô lên GUI, kiểm thử toàn luồng và xuất benchmark thật cho 14 puzzle.

**Architecture:** Một service dùng encoder TV1, solver TV2 và Agent TV3 để phục vụ cả API một bước lẫn API toàn vòng. React tuần tự gọi endpoint một bước và hiển thị kết quả trước khi tiếp tục. Benchmark gọi Agent trực tiếp trong worker process riêng, tách khỏi thời gian hiệu ứng GUI.

**Tech Stack:** Python 3.10+, FastAPI/Pydantic, pytest/httpx, SQLite, multiprocessing spawn, React 19, TypeScript strict, Vite, Tailwind CSS; thư viện chuẩn csv/json/statistics.

**Spec:** `docs/superpowers/specs/2026-11-20-system-integration-design.md`; đọc thêm `docs/work/TASK_DISTRIBUTION.md`, `docs/work/API.md`.

## Global Constraints

- Python 3.10+; React 19, TypeScript strict, Vite và Tailwind CSS hiện có.
- Dùng `griductive.logic.sat.DPLLSolver` chính thức; không âm thầm thay bằng reference solver trong benchmark.
- Mỗi yêu cầu giải từng bước lật tối đa một ô; Hint không thay đổi state/revision.
- Giữ `AGENTS.md` nguyên trạng theo yêu cầu trước đó.
- Thời gian hiệu ứng GUI không được cộng vào runtime benchmark.
- Single-process local server; giữ mô hình một `GameSession` chung hiện tại, không tuyên bố hỗ trợ nhiều người chơi độc lập.
- Các mặc định 600 ms hiển thị, 10000 ms timeout benchmark, một lượt/puzzle là đề xuất cần review cùng kế hoạch.
- Không đổi thuật toán TV1–TV3 hoặc dữ liệu puzzle để làm benchmark thành công; thay đổi tích hợp API và serializers trong phạm vi kế hoạch.

## Review Focus

1. Hai request trùng revision hoặc kết quả thuộc phiên cũ: chỉ một commit, request cũ 409; Task 3 có test cạnh tranh/stale.
2. Stop/Pause trong request đang chạy hoặc mất phản hồi sau commit: hiển thị tối đa bước đang chạy, không tự retry; Task 4 có browser checks.
3. Sample puzzle stuck và KB inconsistent: không đoán, không lật thêm ô, báo đúng terminal; Tasks 2–3 có test.
4. Worker SAT không trả lời hoặc chết: benchmark vẫn kết thúc, thu dọn process và ghi TIMEOUT/ERROR với metrics null; Task 5 có test.
5. Trace/JSON rò dữ liệu ẩn hoặc metrics bỏ sót scan cuối: chỉ public fields, aggregate dùng DeductionResult; Tasks 3 và 5 có test.

---

## Phạm vi, thứ tự và mốc bàn giao

Hai phần có thể review độc lập nhưng dùng chung stack hiện có:
- **A — Ứng dụng tương tác:** Tasks 1–4; bàn giao Hint và Auto-solve từng ô hoạt động từ GUI.
- **B — Thực nghiệm:** Tasks 5–7; bàn giao CLI, CSV/Markdown, tests và hướng dẫn tái lập.

Làm A trước rồi B; chưa triển khai cho đến khi người dùng review kế hoạch. Không thêm SSE/WebSocket hoặc framework frontend test. Tiêu chí của đề là đo/đánh giá 14 màn, không ép cả 14 phải SOLVED.

## File structure

| File | Trách nhiệm |
|---|---|
| `src/griductive/logic/sat/{__init__,dpll}.py`, `src/griductive/solver/{__init__,dpll}.py`, `tests/test_dpll_solver.py` | Solver TV2 đã nhập local, bảo toàn nguyên bản |
| `requirements-dev.txt` (mới) | `-r requirements.txt`, `httpx>=0.27.0` cho TestClient |
| `src/griductive/server/logic_service.py` (mới) | Khởi tạo Agent thật, Hint, step, full run, chuẩn hóa kết quả |
| `src/griductive/server/serializers.py` | session_id và chuyển trace/metrics thành JSON |
| `src/griductive/server/app.py` | Request DTO, khóa session, wiring routes |
| `frontend/src/types.ts`, `frontend/src/api/client.ts` | Hợp đồng API có kiểu |
| `frontend/src/hooks/useAutoSolve.ts` (mới) | Điều khiển vòng lặp tuần tự, Stop, timer/cleanup |
| `frontend/src/App.tsx`, `frontend/src/components/header/Header.tsx` | Gắn controller vào GUI và khóa thao tác xung đột |
| `src/griductive/experiments/__init__.py` (mới) | Package benchmark |
| `src/griductive/experiments/benchmark.py` (mới) | Một lượt, isolation/timeout, metrics, CSV/Markdown/metadata |
| `scripts/run_benchmarks.py` (mới) | CLI, import src từ repo root, validate args, chạy/export |
| `tests/test_logic_service.py`, `tests/test_integration.py`, `tests/test_benchmarks.py` (mới) | Service, HTTP và benchmark tests |
| `docs/work/GUI_ACCEPTANCE.md` (mới) | Các browser checks và kết quả thực thi |
| `docs/work/API.md`, `README.md`, `docs/work/BENCHMARKS.md` (mới) | Hướng dẫn API, thực nghiệm và giới hạn |

## Kiểm tra điểm xuất phát

Nhánh hiện tại: `integration/logic-stack`. Solver TV2 và test đang untracked; Agent TV3 đã ở HEAD. `AGENTS.md` cũng untracked và phải giữ nguyên. Lần kiểm tra trước: 233 passed, 2 xfailed; hai xfail là puzzle sample không đủ tri thức cho no-guess ở một revision, có oracle trong `tests/test_cnf_kb.py::_explain_stuck_state`.

Không giả định môi trường `/tmp` còn tồn tại. Khi thực thi, kiểm tra `git status --short`, tạo venv trong workspace hoặc `/tmp`, cài `requirements-dev.txt` sau khi task tạo file này; xin escalation nếu mạng/sandbox chặn. Không sửa Git toàn cục. Commit chỉ các đường dẫn của task, không dùng `git add .`.

### Task 1: Cố định solver thật và môi trường kiểm thử tích hợp

**Files:** Solver TV2 và test đã nhập ở bảng trên; Create `requirements-dev.txt`.

**Interfaces:**
- Consumes: `origin/sat_solver` làm nguồn đối chiếu; `LogicAgent(encoder=..., solver=...)` đã có.
- Produces: `from griductive.logic.sat import DPLLSolver, SATResult, SolverStats`; môi trường chạy `python -m pytest` và FastAPI TestClient.

- [x] **Step 1:** Đối chiếu byte của năm file solver/test với `git show origin/sat_solver:<path>`; xác nhận `AGENTS.md` không bị ghi đè. Không nhập Agent/API từ nhánh TV2.
- [x] **Step 2:** Tạo `requirements-dev.txt` gồm `-r requirements.txt` và `httpx>=0.27.0`, cài vào venv bằng pip hoặc uv. Không thêm dependency runtime chỉ để test.
- [x] **Step 3:** Chạy `python -m pytest -q`. Expected: 233 passed, 2 xfailed trên baseline hiện tại; nếu khác phải tìm nguyên nhân trước khi thay đổi nghiệp vụ.
- [x] **Step 4:** Smoke import `LogicAgent()` và xác nhận `_solver` là `griductive.solver.dpll.DPLLSolver`; đây là kiểm tra cấu hình hiện tại, không thêm test khóa chi tiết private.
- [x] **Step 5:** Commit riêng năm file solver/test và requirements-dev: `feat: integrate team DPLL solver for logic agent`. Ghi nguồn commit TV2 `8a9c2fe` trong commit body; không commit `AGENTS.md` ngoài yêu cầu.

### Task 2: Service cho Hint và một bước suy luận thật

**Files:** Create `src/griductive/server/logic_service.py`, `tests/test_logic_service.py`.

**Interfaces:**
- Consumes: `CNFEncoder()`, `DPLLSolver()`, `LogicAgent(encoder, solver)`, `run_logic_loop(engine, *, timeout_ms=None, max_steps=None) -> DeductionResult`, `suggest_next(state) -> HintResult | None`, `classify_all(state)`.
- Produces: `LogicService.__init__(self)`, `hint(self, state: PublicState) -> tuple[str, HintResult | None]`, `step(self, engine: GameEngine) -> StepExecution`, `run(self, engine: GameEngine, *, timeout_ms: float = 10000) -> DeductionResult`.
- `StepExecution` là frozen dataclass trong file service với `outcome: str`, `result: DeductionResult`. outcome step chỉ `IN_PROGRESS` hoặc TerminalStatus.value. hint outcome theo spec.

- [x] **Step 1:** Viết test real modules `test_hint_does_not_mutate_state`, `test_step_reveals_at_most_one_cell`, `test_step_solved_is_not_reported_as_timeout`, `test_stuck_has_no_extra_reveal`, `test_inconsistent_hint_has_no_suggestion`, `test_repeated_steps_match_full_run`. Dùng daily_3x3_hard, sample_3x3 và một puzzle nhỏ có các public facts mâu thuẫn. Assertions cốt lõi:

```python
before = engine.get_public_state()
outcome, hint = service.hint(before)
assert engine.get_public_state() == before
assert outcome == "AVAILABLE" and hint is not None
execution = service.step(engine)
assert engine.revision == before.revision + 1
assert len(execution.result.steps) == 1
assert execution.outcome == "IN_PROGRESS"
```

Với state solved: step có zero steps và SOLVED. Với stuck/inconsistent: revision giữ nguyên. Với repeated steps và full run: cùng các cặp `(verdict_cell, verdict_status)` và terminal; không so runtime.
- [x] **Step 2:** Run `python -m pytest tests/test_logic_service.py -q`; expected FAIL vì service chưa tồn tại.
- [x] **Step 3:** Implement signatures trên. Truyền encoder/solver tường minh. Step dùng `run_logic_loop(engine, max_steps=1)` không truyền timeout; normalize TIMEOUT chỉ nếu đúng một step và engine chưa solved. Hint dùng suggest_next trước, chỉ classify_all khi None/chưa solved để phân biệt INCONSISTENT. Không gọi solver thêm để tạo mô tả trace.
- [x] **Step 4:** Run `python -m pytest tests/test_logic_service.py tests/test_logic_agent.py tests/test_dpll_solver.py -q`; expected PASS.
- [x] **Step 5:** Commit hai file: `feat: add logic service for hints and single deduction steps`.

### Task 3: API, serialization và chống request cũ

**Files:** Modify `src/griductive/server/app.py` (GameSession, request models, các route state/verdict/restart/load/hint/auto-solve); Modify `src/griductive/server/serializers.py`; Create `tests/test_integration.py`.

**Interfaces:**
- Consumes: LogicService/StepExecution Task 2; `serialize_game_state(...)` hiện có.
- Produces: `StepRequest(session_id: str, revision: strict nonnegative int)`; `POST /api/auto-solve/step`; Hint/full-run JSON theo spec.
- Serializer mới: `serialize_trace_step(trace: DeductionStepTrace, *, step_number: int | None = None) -> dict[str, Any]`, `serialize_run_metrics(result: DeductionResult) -> dict[str, int | float]`. GameState thêm `session_id: str`.
- Step JSON `{state, outcome, step, metrics}`; Hint fields và full endpoint tương thích theo spec; status/outcome không dùng STALLED alias.

- [x] **Step 1:** Viết HTTP TestClient tests, fixture thay `session` bằng GameSession mới mỗi test và restore sau test. Test hint snapshot không đổi; step revision +1, solved_count +1, trace đúng ô và clue vừa mở; request trùng/stale trước và sau restart/load trả 409; revision âm/string/bool trả 422; request hợp lệ sau đó vẫn hoạt động.
- [x] **Step 2:** Thêm `test_two_requests_at_same_revision_commit_once` chạy hai HTTP requests đồng thời: status codes sorted bằng `[200, 409]`, revision tăng đúng một. Thêm solved/stuck/inconsistent, full-run trace/metrics và JSON không lộ hidden statuses/unrevealed clues (so từng cell chưa mở có status/clue_text null; không chỉ kiểm tên key).
- [x] **Step 3:** Run `python -m pytest tests/test_integration.py -q`; expected FAIL với endpoint/fields còn thiếu.
- [x] **Step 4:** Thêm service và `threading.RLock` vào GameSession; serialize session_id, trace và metrics. Khóa toàn critical section của đọc snapshot và mọi mutation hiện có, bao gồm full run, restart/load/manual verdict. Trong step, check token/revision dưới cùng lock trước khi suy luận. HTTP 409 không mutate. Không import API/exception riêng từ bản Agent TV2.
- [x] **Step 5:** Nối Hint và giữ `/api/auto-solve` chạy thật, trả top-level GameState, outcome, steps_taken, trace strings, trace_steps, metrics. Engine rejection/inconsistent là outcome nghiệp vụ, không đánh đồng stuck; lỗi bất ngờ vẫn báo server error. API step không cam kết ngắt solver đang chạy.
- [x] **Step 6:** Run `python -m pytest tests/test_integration.py tests/test_logic_service.py -q`; expected PASS, sau đó chạy toàn suite nếu có thay đổi engine/session ảnh hưởng rộng.
- [x] **Step 7:** Commit app/serializers/test: `feat: expose revision-safe hint and deduction step APIs`.

### Task 4: GUI giải từng ô, Stop và nhật ký

**Files:** Modify `frontend/src/types.ts`, `frontend/src/api/client.ts`, `frontend/src/App.tsx`, `frontend/src/components/header/Header.tsx`; Create `frontend/src/hooks/useAutoSolve.ts`, `docs/work/GUI_ACCEPTANCE.md`.

**Interfaces:**
- Consumes: Hint/Step API Task 3; `GameState.session_id`.
- Produces: TypeScript `LogicOutcome`, `TraceStep`, `RunMetrics`, `HintResponse`, `StepResponse` khớp JSON spec; `executeAutoSolveStep(sessionId: string, revision: number): Promise<StepResponse>`; `fetchHint(): Promise<HintResponse>`.
- Hook `useAutoSolve(options: {getState: () => GameState | null; onStep: (response: StepResponse) => void; onError: (error: unknown) => Promise<void>; delayMs?: number}): {isRunning: boolean; isStopping: boolean; start: () => void; stop: () => Promise<void>}`. delayMs mặc định 600.
- Header thêm `isAutoSolving`, `isStopping`, `actionsDisabled`, `onStopAutoSolve`; `stop()` resolve khi request hiện tại đã được áp dụng và không có request tiếp theo. Hook tự fetch step; App chịu banner/log/highlight và đồng bộ lại state khi lỗi.

- [x] **Step 1:** Ghi browser acceptance cases vào GUI_ACCEPTANCE và xác nhận baseline chưa đạt: mỗi phản hồi chỉ lật một ô; log/active clue tăng tương ứng; double-click Start không tạo hai vòng; Stop trong request chỉ cho hoàn tất bước đó; Stop trong 600 ms không gửi bước tiếp.
- [x] **Step 2:** Thêm các cases Pause, offline giữa request/response rồi refresh, 409 do tab khác restart, unmount, Stop rồi chạy tiếp, solved/stuck, Hint không lật ô. Expected: không request ghi tự retry, không state cũ ghi đè state mới, nút được mở lại sau resync hoặc cho phép retry GET khi GET lỗi.
- [x] **Step 3:** Định nghĩa types/client trên; với HTTP error giữ status trong lỗi để xử lý 409. Không dùng `any` hoặc cast response cũ thành StepResponse. API full-run giữ cho tương thích nhưng GUI không gọi nó.
- [x] **Step 4:** Implement hook tuần tự có ref khóa synchronous cho start, generation token và timer cleanup. Áp dụng phản hồi hợp lệ kể cả khi Stop vừa được yêu cầu; Stop không abort request ghi vì server có thể đã commit. Sau lỗi, không gọi bước tiếp; await onError resync trước khi mở lại thao tác.
- [x] **Step 5:** Nối App/Header: Start đổi thành Stop; khóa Hint/manual/restart/load khi auto hoạt động hoặc đang dừng; Pause await stop rồi mở modal; Theme vẫn dùng được. Close verdict modal khi Start. Highlight ô vừa giải, thêm log từ trace có cấu trúc và hiển thị terminal. Giữ nguyên giao diện tổng thể. Refresh solved count/victory state từ response thật.
- [x] **Step 6:** Run `cd frontend && npm run build`; expected exit 0. Chạy backend `python main.py --no-browser` và Vite, thực hiện toàn browser checklist với daily_3x3_hard, sample_3x3 và một màn 5×5; kiểm Network chứng minh một request một bước, khoảng chờ 600 ms sau response. Ghi PASS/FAIL và cách tái lập vào GUI_ACCEPTANCE. Không gọi các kiểm tra này là automated frontend tests.
- [x] **Step 7:** Commit đúng các file GUI/checklist: `feat: show live deduction steps with stop controls`.

### Task 5: Benchmark thật với timeout cứng và metrics trung thực

**Files:** Create `src/griductive/experiments/__init__.py`, `src/griductive/experiments/benchmark.py`, `tests/test_benchmarks.py`.

**Interfaces:**
- Consumes: `list_puzzles_from_sqlite(db_path=None)`, `load_puzzle_from_sqlite(puzzle_id, db_path=None)`, real encoder/solver/agent và DeductionResult.
- Produces: frozen `BenchmarkRow` với fields CSV trong spec; nullable metrics, solved_count và runtime_ms khi mất kết quả. `run_case(puzzle_id: str, *, db_path: str | None = None, repeat: int = 1, timeout_ms: int = 10000) -> BenchmarkRow`.
- Worker module-level `solve_case(puzzle_id: str, db_path: str | None, repeat: int) -> BenchmarkRow` và `case_worker(connection, puzzle_id: str, db_path: str | None, repeat: int) -> None`; entrypoint callable theo multiprocessing spawn. `run_case` đóng pipe/terminate/join trong finally.

- [x] **Step 1:** Test `test_real_solver_case_metrics_and_ground_truth`: daily_3x3_hard solved, 7 deduction steps trên dữ liệu hiện tại, solved_count 9, stats không âm; sample_3x3 STUCK, 4 steps và chưa solved. Test nhiều lượt độc lập có cùng verdict/count (không yêu cầu runtime giống nhau). Không đọc đáp án ẩn trong solve_case.
- [x] **Step 2:** Test mapping tổng metrics bằng DeductionResult fixture có queries scan cuối nhiều hơn tổng steps: assert sat_queries dùng total_sat_queries, backtracks dùng total_stats, clause_count dùng max_clauses. Test đã-solved không tạo bước giả, invalid puzzle trả ERROR và giữ error text.
- [x] **Step 3:** Test timeout/error với worker thật riêng cho tests: module-level slow worker chờ trên Event không được set, module-level crash worker thoát không gửi kết quả. Cho internal helper `_run_worker(worker, *, args: tuple, timeout_ms: int) -> tuple[str, BenchmarkRow | None, float, str | None]` nhận target để test, không expose injection trên CLI. Assert trả TIMEOUT/ERROR, process không còn sống, timeout null metrics; dùng giới hạn thời gian test rộng hơn deadline để tránh flaky. Với spawn startup chậm, cho success tests timeout 10000 ms, không dùng timeout vài ms để khẳng định success.
- [x] **Step 4:** Run `python -m pytest tests/test_benchmarks.py -q`; expected FAIL thiếu package/functions.
- [x] **Step 5:** Implement isolation/pipe/deadline theo spec. `run_case` parent lấy metadata puzzle/size từ DB để TIMEOUT vẫn có puzzle_id/size/total_cells; runtime_ms chỉ từ Agent, process_elapsed_ms từ parent. Spawn worker tạo dependencies thật và dùng run_logic_loop không có soft timeout để parent chịu hard timeout. Giới hạn payload chỉ row tổng hợp, không gửi toàn trace. Không truy cập session singleton của server.
- [x] **Step 6:** Run `python -m pytest tests/test_benchmarks.py -q`; expected PASS; xác nhận process thu dọn ở cả success, timeout và error.
- [x] **Step 7:** Commit experiments package và tests: `feat: benchmark real deduction runs with process timeouts`.

### Task 6: CLI, CSV, Markdown và thông tin tái lập

**Files:** Create `scripts/run_benchmarks.py`; Modify `src/griductive/experiments/benchmark.py`, `tests/test_benchmarks.py`.

**Interfaces:**
- Consumes: BenchmarkRow/run_case Task 5.
- Produces: `write_csv(rows: Sequence[BenchmarkRow], path: Path) -> None`, `write_markdown(rows: Sequence[BenchmarkRow], path: Path) -> None`, `write_metadata(path: Path, *, args: Mapping[str, Any]) -> None` trong benchmark module; `main(argv: Sequence[str] | None = None) -> int` trong script.
- CLI flags/defaults và cột CSV/Markdown/metadata dùng đúng spec. `--size` chỉ nhận 3/4/5; repeats/timeout số nguyên dương; puzzle-id lặp được, sai ID hoặc lựa chọn rỗng lỗi exit 2; filters size/IDs giao nhau. Kết quả sort size, puzzle_id, repeat.

- [x] **Step 1:** Test CSV roundtrip `csv.DictReader` đúng thứ tự cột spec, repeat rows và null là ô rỗng; Markdown có tất cả outcomes, median tách theo puzzle/outcome và escape ký tự `|`/newline của error. Metadata có solver class, HEAD/dirty paths và args; git unavailable ghi null, không làm mất benchmark.
- [x] **Step 2:** Test CLI subprocess thật: `--puzzle-id daily_3x3_hard --repeats 2` tạo 2 rows; `--size 5` chọn 3 màn; invalid ID/size/repeats exit 2, timeout/error exit 1. Test selector mặc định trả 14 puzzle chia 6/5/3; test toàn 14 CLI đặt ở Task 7 để tránh chạy lặp tốn thời gian trong unit suite.
- [x] **Step 3:** Run `python -m pytest tests/test_benchmarks.py -q`; expected FAIL trên exports/CLI mới.
- [x] **Step 4:** Implement exports và argparse main. Thêm repo `src/` vào sys.path bằng Path(__file__).resolve().parents[1] như main.py; đặt process entry trong `if __name__ == '__main__'`. Mỗi case TIMEOUT/ERROR vẫn ghi row và tiếp tục; lỗi I/O output trả exit 1 với stderr rõ ràng. Output không chứa kết quả giả của lượt chưa chạy.
- [x] **Step 5:** Run tests và `python scripts/run_benchmarks.py --puzzle-id daily_3x3_hard --output-dir /tmp/griductive-benchmark-smoke`; expected ba file CSV/MD/JSON, một row SOLVED, exit 0.
- [x] **Step 6:** Commit script/export/tests: `feat: export benchmark results and reproducibility metadata`.

### Task 7: Đối soát toàn hệ thống và bàn giao thực nghiệm

**Files:** Modify `docs/work/API.md`, `README.md`, `docs/work/GUI_ACCEPTANCE.md`; Create `docs/work/BENCHMARKS.md`; Create artifacts trong `docs/work/benchmark-results/`.

**Interfaces:**
- Consumes: endpoints Task 3, GUI Task 4, CLI Task 6.
- Produces: tài liệu chạy lại, kết quả thật đủ 14 màn, bảng phân tích 5×5 và giới hạn đã xác minh.

- [x] **Step 1:** Run `python -m pytest -q -rx` và `cd frontend && npm run build`. Expected: không có FAIL/ERROR mới; xác nhận lý do hai xfails bằng output oracle, không chỉ nhìn count. Chỉ so baseline 233 khi chưa thêm tests; tổng test sau triển khai phải tăng.
- [x] **Step 2:** Run `python scripts/run_benchmarks.py --repeats 3 --timeout-ms 10000 --output-dir docs/work/benchmark-results`; expected 42 rows (14 IDs × 3), đủ 6/5/3 IDs, có outcome mỗi lượt. Dừng đo nếu phát hiện sai mô hình/solver, không thay kết quả lỗi thành solved.
- [x] **Step 3:** Đọc CSV/MD/metadata và xác nhận runtime không gồm 600 ms GUI. Với dữ liệu hiện tại kỳ vọng 12 SOLVED và 2 sample STUCK mỗi lượt; nếu thay đổi, đối chiếu revision/puzzle/solver thay vì hardcode báo cáo. Kiểm tra không có hidden answers trong artifact. Không quy kết mọi timeout là bùng nổ tổ hợp khi chưa có bằng chứng.
- [x] **Step 4:** Viết BENCHMARKS: commands/flags, định nghĩa max_* và stats, phân biệt solver/runtime/process elapsed, timeout null fields, median grouping, môi trường đo và giới hạn một máy/14 puzzle. Phân tích ba màn 5×5 bằng số đo thật, so với 3×3/4×4; ghi hai sample stuck theo oracle và không có ngưỡng hiệu năng chính thức.
- [x] **Step 5:** Cập nhật API docs với JSON Hint, step request/response, 409/422, full endpoint và single-process shared-session limitation. README bổ sung install dev deps, test, build, chạy GUI, benchmark, Stop/Pause và resync khi lỗi. Không sửa AGENTS.md.
- [x] **Step 6:** Thực hiện lại browser checklist sau mọi thay đổi frontend mới; nếu không sửa frontend từ Task 4 chỉ xác nhận tài liệu vẫn khớp, không chạy lặp tests vô cớ. Kiểm `git diff --check` và `git status --short`, bảo đảm chỉ thay đổi được yêu cầu.
- [x] **Step 7:** Commit docs/artifacts: `docs: document deduction APIs and benchmark findings`. Báo cho người dùng kết quả test, artifact paths, giới hạn sample stuck và mọi lỗi chưa giải quyết; không push/merge ngoài yêu cầu.

## Self-review kế hoạch

- Coverage: Hint/Auto API → Tasks 2–3; từng ô/Stop/log → Task 4; 14 puzzle/sáu metrics → Tasks 5–6; 5×5/CSV/Markdown → Tasks 6–7; integration tests → Task 3.
- Type consistency: StepExecution chứa DeductionResult, serializer chuyển thành RunMetrics/TraceStep; StepResponse frontend dùng cùng tên fields. Full-run và step có response shape khác nhau được định nghĩa rõ.
- Review Focus: mỗi dòng có case kiểm thử hoặc browser check tại task sở hữu; không hứa hard timeout cho API step, chỉ cho benchmark worker.
- Chỉ tích hợp service quanh Agent có sẵn, không thêm phương thức Agent mới; tránh sửa logic TV3 để lấy metrics đã có.
- Không cần mock nghiệp vụ; fake slow/crash workers chỉ kiểm cơ chế lỗi hạ tầng. Tests định lượng dùng module thật.
- Chưa cài dependency, sửa code sản phẩm hay chạy benchmark báo cáo khi viết kế hoạch. Mọi checkbox task đang mở.

## Kết quả thực hiện — 2026-11-20

- Triển khai bằng ba agent Herdr (`backend`, `frontend`, `benchmark`), controller điều phối, giữ phạm vi file riêng và tạo commit tuần tự trên `integration/logic-stack`.
- Mốc source cuối: `5e13914`; không push/merge remote và không sửa `AGENTS.md`.
- Backend/API/service, GUI và benchmark đều được review chéo. Hai phát hiện Important được sửa: CLI mã thoát non-success (`8b6a7d3`), phản hồi GUI cũ/reset phiên/unmount (`5e13914`). Re-review xác nhận các finding đã được xử lý.
- Python: **276 passed, 2 xfailed**, một deprecation warning upstream Starlette/httpx. Hai xfails được oracle xác nhận16/512 mô hình còn phù hợp ở hai puzzle sample.
- Frontend production build PASS. Chromium real-backend acceptance PASS cho Hint, step/trace, Stop/Pause, double-click, mất phản hồi sau commit, GET retry, stale409, unmount và hai ca hồi quy phiên chơi.
- Pacing5×5:23 request/22 khoảng chờ, min601.127ms/max603.668ms, đúng mặc định600ms.
- Benchmark42 lượt tại source5e13914:36 SOLVED,6 sample STUCK,0 ERROR/TIMEOUT; CSV/Markdown/metadata tại `docs/work/benchmark-results/`.
- Tài liệu bàn giao: `README.md`, `docs/work/API.md`, `docs/work/BENCHMARKS.md`, `docs/work/GUI_ACCEPTANCE.md`. Các lựa chọn hiển thị600ms, timeout benchmark10000ms và worker riêng giữ đúng thiết kế.
- Kiểm thử GUI dùng Playwright điều khiển Chromium có sẵn; không thêm frontend test framework hay mock dữ liệu nghiệp vụ.


## Đồng bộ main và chuẩn bị PR TV4 — 2026-11-22

- Nhánh `feat/system-integration` bắt đầu tại GitHub main `1ef81d1`, đã có TV1/TV2/TV3.
- Source TV4 tại `37f1ebc`; giữ nhánh `integration/logic-stack` làm dự phòng.
- Không thay đổi domain, engine, CNF, SAT Solver, Logic Agent, dữ liệu puzzle hay tests upstream.
- Giữ legacy full-run status/banner và HTTP409 cho KB inconsistent; thêm regression test.
- Hai sample đã được upstream sửa; tests STUCK chuyển sang fixture ambiguous riêng.
- Python **283 passed**, không xfail; frontend build PASS.
- Benchmark mới **42 SOLVED/42 lượt** (14 puzzle × 3), không ERROR/TIMEOUT.
- `AGENTS.md` và thay đổi package-lock cục bộ nằm ngoài commit. Chưa push remote.
