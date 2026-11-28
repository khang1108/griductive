# Thiết kế tích hợp hệ thống và thực nghiệm

Trạng thái: bản thiết kế đi kèm kế hoạch để người dùng review; chưa triển khai. Hướng API giải từng bước đã được người dùng chọn. Các giá trị mặc định dưới đây là đề xuất kỹ thuật của người viết.

## Mục tiêu và phạm vi

Hoàn thành nhiệm vụ System & Experiment Engineer trong `docs/work/TASK_DISTRIBUTION.md`: nối Hint/Auto-solve với GUI, benchmark 14 puzzle SQLite, đánh giá 5×5, xuất CSV/Markdown và kiểm thử tích hợp. Người dùng phải thấy từng ô được chứng minh và lật lần lượt bằng yêu cầu API thật. Dùng CNF TV1, DPLL TV2 và Agent TV3 đã có trên nhánh `integration/logic-stack`.

Không viết lại CNF/DPLL/entailment, không sửa puzzle để ép benchmark thành công, không xây dựng tài khoản/multi-user, không thêm SSE/WebSocket. Không đọc hidden statuses để lựa chọn nước đi. Engine được giữ quyền kiểm chứng verdict với đáp án ẩn.

## Các hướng đã cân nhắc

1. API giải từng bước: frontend gọi một bước, hiển thị rồi gọi tiếp. Người dùng đã chọn; dễ dừng, kiểm thử và tận dụng engine hiện có.
2. SSE: truyền bước từ backend, thêm quản lý kết nối và hủy công việc; không chọn.
3. Giải hết rồi phát lại: đơn giản nhưng không đáp ứng tương tác với quá trình giải thật; không chọn.

## Ràng buộc

- Python 3.10+; React 19, TypeScript strict, Vite và Tailwind CSS hiện có.
- Dùng `griductive.logic.sat.DPLLSolver` chính thức; không âm thầm thay bằng reference solver trong benchmark.
- Mỗi yêu cầu giải từng bước lật tối đa một ô; Hint không thay đổi state/revision.
- Giữ `AGENTS.md` nguyên trạng theo yêu cầu trước đó.
- Thời gian hiệu ứng GUI không được cộng vào runtime benchmark.
- Single-process local server; giữ mô hình một `GameSession` chung hiện tại, không tuyên bố hỗ trợ nhiều người chơi độc lập.

## API và bảo vệ phiên chơi

Bổ sung `session_id` vào GameState. `POST /api/auto-solve/step` nhận `{session_id: str, revision: int >= 0}`; revision không phải boolean. So sánh trước khi tính toán; sai trả HTTP 409 và không đổi state. Dùng một RLock của session cho đọc trạng thái, suy luận/commit, manual verdict, restart và load. Nhận session/revision sai kiểu trả 422. Client chỉ có một request bước đang chạy, không tự retry request ghi sau lỗi mạng.

Hint vẫn dùng `POST /api/hint`, trả `hint`, `cell`, `status`, `active_clue_ids`, `session_id`, `revision`, `outcome`. Outcome là `AVAILABLE`, `SOLVED`, `STUCK_NO_FORCIBLE_MOVE`, `INCONSISTENT`; cell/status null nếu không có gợi ý. Chỉ khi suggest_next trả None và chưa solved mới dùng classify_all để phân biệt inconsistent với stuck.

Step trả `{state: GameState, outcome, step: TraceStep | null, metrics: RunMetrics}`. Outcome là `IN_PROGRESS` hoặc một giá trị `TerminalStatus` của Agent. TraceStep giữ `step`, `active_clue_ids`, `sat_queries`, `verdict_cell` (nhãn A1), `verdict_status`, `new_clue_id`, `primary_vars_count`, `aux_vars_count`, `clause_count`, `stats`. Gán step hiển thị theo revision sau commit để không lặp số 1 giữa các request.

RunMetrics có `sat_queries`, `decisions`, `propagations`, `backtracks`, `solver_runtime_ms`, `wall_time_ms`, `max_primary_vars`, `max_aux_vars`, `max_clauses`, `deduction_steps`; mỗi response phản ánh lần gọi đó.

Service gọi `LogicAgent.run_logic_loop(engine, max_steps=1)` với encoder/solver được truyền tường minh. Do Agent hiện trả TIMEOUT khi chạm max_steps, chỉ chuyển TIMEOUT thành IN_PROGRESS khi không truyền timeout_ms, đúng một trace được tạo và engine chưa solved. Các terminal khác giữ nguyên. Không thay đổi chữ ký Agent. Đây không phải cam kết timeout cứng cho API step.

Giữ `/api/auto-solve` cho chạy toàn bộ/kiểm thử tương thích, nối vòng lặp thật; response giữ GameState ở top level, bổ sung outcome, steps_taken, trace dạng chuỗi và trace_steps có cấu trúc, metrics. GUI tương tác dùng endpoint step.

## Trải nghiệm Auto-solve

Một bộ điều khiển frontend tuần tự hóa start/request/display/wait/next. Khoảng hiển thị mặc định 600 ms sau mỗi phản hồi (ít nhất dài hơn hiệu ứng 300 ms hiện có). Không gọi bước tiếp nếu người dùng đã Stop, Pause, lỗi mạng hay terminal. Stop để request đang chạy hoàn thành và hiển thị kết quả, rồi dừng; không tuyên bố rollback. Khóa Hint, manual verdict, Restart, stage selector khi request đang chạy hoặc auto còn hoạt động; muốn restart/đổi màn cần Stop trước. Pause yêu cầu Stop rồi mở pause modal. Theme vẫn hoạt động. Dùng generation token và cleanup timer để không cập nhật từ tác vụ cũ sau unmount hoặc thay phiên. Khi lỗi mạng/409, dừng và tải lại state trước khi cho tiếp tục; không tự gửi lại bước cũ.

## Benchmark và báo cáo

Tách module `griductive.experiments.benchmark` khỏi CLI `scripts/run_benchmarks.py`. CLI mặc định tất cả puzzle DB, một lượt/màn, timeout cứng 10000 ms/màn, output `benchmark_results.csv`, `benchmark_results.md`, `benchmark_metadata.json`; cho phép `--size`, `--puzzle-id`, `--repeats`, `--timeout-ms`, `--output-dir`, `--db-path`.

Mỗi lượt có process riêng theo spawn, encoder/solver/agent/engine mới. Parent dùng pipe (không join trước khi đọc một Queue lớn), deadline bao gồm khởi động process/nạp puzzle, terminate và join worker quá hạn. Runtime giải bình thường lấy `DeductionResult.total_wall_time_ms`, không tính nạp dữ liệu/khởi động; ghi thêm process_elapsed_ms để phân biệt. Timeout/error không có số liệu đầy đủ: metrics/solved_count để null, không bịa số 0; báo ERROR hoặc TIMEOUT, vẫn chạy màn tiếp theo. IPC error được chặn theo từng lượt. Chỉ số tổng SAT/stats dùng DeductionResult, gồm cả lượt quét cuối bị stuck; không chỉ cộng trace thành công. Max clauses/vars lấy max_* có sẵn, không tính KB cuối sau khi solved nếu Agent chưa encode nó.

CSV: puzzle_id, size, repeat, outcome, solved_count, total_cells, primary_vars, aux_vars, clause_count, sat_queries, decisions, propagations, backtracks, deduction_steps, runtime_ms, process_elapsed_ms, error. Markdown có dữ liệu từng lượt và trung vị runtime nhóm theo puzzle/outcome; không trộn timeout vào trung vị solved. Metadata ghi Python/platform, CPU nhận diện được, git HEAD, dirty paths, solver class, CLI args và thời điểm UTC. Default 14 lượt gồm 6 màn 3×3, 5 màn 4×4, 3 màn 5×5. Mã thoát 0 cho kết quả SOLVED/STUCK đã ghi nhận; 1 nếu có ERROR/TIMEOUT/INCONSISTENT/ENGINE_REJECTED; 2 cho đầu vào CLI không hợp lệ.

## Kiểm thử và tiêu chí bàn giao

Dùng pytest và FastAPI TestClient với httpx test dependency; GUI xác nhận bằng build và checklist trình duyệt, không thêm test framework frontend chỉ cho task này. Có thể dùng fake worker chậm/lỗi trong test timeout/error; luồng nghiệp vụ và benchmark thật dùng các module nhóm.

Kiểm tra real Hint không mutate, một step chỉ tăng revision một lần, trace đúng ô, stale/duplicate request 409, terminal solved/stuck không mutate, restart/load thay session, hidden answers không rò trong JSON; giữ kết quả solver/Agent cũ. Kiểm tra benchmark đủ hàng, schema CSV/Markdown, aggregation, timeout cứng, lỗi worker và lặp độc lập.

Tại thời điểm thiết kế ban đầu, hai puzzle sample stuck; test CNF đã có semantic oracle xác định nhiều mô hình khớp CNF và đánh dấu xfail. Ghi nhận dữ kiện này, không coi stuck là timeout và không sửa dữ liệu trong phạm vi tích hợp. Chạy lại trước khi chốt báo cáo. Chưa có ngưỡng hiệu năng pass/fail do đề bài cung cấp, không tự đặt chuẩn tốc độ. Bàn giao API docs, hướng dẫn chạy và báo cáo thực nghiệm 5×5.


Cập nhật 2026-11-22: main `8fad8b4` đã sửa hai puzzle sample; cả 14 màn giải được trong benchmark mới. TV4 giữ nguyên các thay đổi upstream này. API whole-run giữ legacy status SOLVED/STALLED và lỗi HTTP409 khi KB inconsistent.
