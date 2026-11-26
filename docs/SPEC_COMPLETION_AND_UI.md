# Griductive Solver — Đặc Tả Hoàn Thiện Đồ Án & Brainstorm Nâng Cấp UI/UX

**Môn học:** CSC14003 — Introduction to Artificial Intelligence  
**Cơ sở đối chiếu:** `docs/AI - Project 2.pdf` & hiện trạng nhánh `main` (sau khi tích hợp TV1, TV2, TV3, TV4 — 283 tests passing).  
**Mục tiêu tài liệu:** Chốt các khoảng trống kỹ thuật (Gaps) để đạt chuẩn 100% yêu cầu đề bài (Phase 1) và định hướng nâng cấp giao diện Web UI/UX đẹp mắt phục vụ chấm điểm & quay Video Demo (Phase 2).

---

## 1. Đối chiếu với đề bài `AI - Project 2.pdf` (Gap Analysis)

Hiện tại cả 4 module cốt lõi (`domain/engine`, `logic/cnf`, `logic/sat`, `logic/agent`, `server`, `experiments`) đã hoạt động thông suốt. Tuy nhiên, đối chiếu chi tiết từng yêu cầu trong `AI - Project 2.pdf`, còn **4 khoảng trống (Gaps)** cần xử lý:

| # | Yêu cầu trong đề bài (`AI - Project 2.pdf`) | Hiện trạng trên `main` | Mức độ |
| :-: | :--- | :--- | :---: |
| **G1** | **Mục 2.2 & 4.1 (Bắt buộc):** Khi người chơi tự phán đoán, **phải từ chối mọi nước đoán mò** dù trùng đáp án ẩn, và **phân biệt rõ `NOT_PROVABLE` vs `CONTRADICTED`** trên giao diện. | `POST /api/verdict` trong `src/griductive/server/app.py` vẫn gọi `submit_manual_verdict()` so trực tiếp với đáp án ẩn $\rightarrow$ **người chơi đoán bừa vẫn trúng 50%** và chưa trả về `NOT_PROVABLE` / `CONTRADICTED`. | 🔴 **Bắt buộc fix** |
| **G2** | **Mục 3.2 (Extensions):** Cài đặt ít nhất **2 phần mở rộng** ngoài 6 clue cơ bản. | Đã code `ParityClue` (Extension 1) và `IntersectionRegion` (Extension 2), nhưng trong 14 màn chơi ở `data/puzzle/` **chưa có màn nào dùng `IntersectionRegion`** (khó demo & chứng minh trực tiếp khi chấm). | 🟠 **Nên bổ sung** |
| **G3** | **Mục 4.5 (Experiments):** *"Use the same puzzle set for all comparisons. Report failures and timeouts rather than removing them."* | `scripts/run_benchmarks.py` mới chạy 1 cấu hình đơn lẻ, chưa có chế độ chạy **so sánh** trên cùng tập puzzle (VD: `Baseline DPLL` vs `DPLL + Witness Cache`) và chưa có case minh hoạ failure/stuck trong bộ benchmark nếu muốn báo cáo. | 🟠 **Rất ăn điểm Report** |
| **G4** | **Vệ sinh kỹ thuật & Đóng gói (Mục 5):** | • `LogicService.hint()` chạy SAT 2 lần khi kẹt.<br>• `tests/test_auto_solve_endpoint.py` gán đè `session.engine` không restore sau test.<br>• `scripts/run_benchmarks.py` mặc định ghi output thẳng ra `.` (root repo).<br>• Khi đóng gói `Source/` theo Mục 5, cần đảm bảo có `frontend/dist/` để chạy thẳng `python main.py` không cần Node.js. | 🟡 **Nên dọn sạch** |

---

## 2. Phase 1 — Đặc tả kỹ thuật hoàn thiện Core (Specs 1–4)

### Spec 1: Nối `LogicAgent.assess_verdict()` vào `POST /api/verdict` (Fix G1)

#### 1.1. Backend (`src/griductive/server/logic_service.py` & `app.py`)
- Bổ sung phương thức `assess_and_commit_verdict(engine: GameEngine, cell: CellId, status: Status)` trong `LogicService`:
  1. Lấy snapshot công khai `state = engine.get_public_state()`.
  2. Gọi `assessment = self._agent.assess_verdict(state, cell, status)`.
  3. Xử lý theo `assessment.assessment`:
     - **`VerdictAssessmentType.PROVABLE`:**  
       Gọi `engine.commit_verified_verdict(VerifiedVerdict(state.session_id, state.revision, cell, status))` để lật thẻ, tăng `revision`, trả về `verdict_success = True`.
     - **`VerdictAssessmentType.NOT_PROVABLE`:**  
       **Không thay đổi `engine`**, trả về `verdict_success = False`, `assessment = "NOT_PROVABLE"`, thông điệp:
       `"NOT_PROVABLE — Cannot prove {name} ({coord}) is {status} from current clues. No guessing allowed!"`
     - **`VerdictAssessmentType.CONTRADICTED`:**  
       **Không thay đổi `engine`**, trả về `verdict_success = False`, `assessment = "CONTRADICTED"`, thông điệp:
       `"CONTRADICTED — Current clues logically prove {name} ({coord}) is NOT {status}!"`
     - **`INCONSISTENT` / `ALREADY_SOLVED`:**  
       **Không thay đổi `engine`**, trả về `verdict_success = False`, `assessment = assessment.assessment.value`, kèm `assessment.reason`.
- Đảm bảo `POST /api/verdict` trong `app.py` vẫn giữ `with session.lock:` và trả đầy đủ các trường chuẩn trong `GameState` +:
  - `verdict_success: bool`
  - `verdict_message: str`
  - `assessment: "PROVABLE" | "NOT_PROVABLE" | "CONTRADICTED" | "INCONSISTENT" | "ALREADY_SOLVED"`

#### 1.2. Frontend (`frontend/src/types.ts`, `api/client.ts`, `App.tsx`)
- Mở rộng kiểu `GameState` với `assessment?: VerdictAssessmentType`.
- Hiển thị phân biệt rõ trên Banner và Nhật ký điều tra (Case Evidence Log):
  - `PROVABLE`: Banner xanh lá (`success`), ghi log *(Entailed)*.
  - `NOT_PROVABLE`: Banner/cảnh báo **hổ phách/vàng (warning)**, tag `[NOT_PROVABLE]` — *"Đoán mò: chưa đủ dữ kiện để kết luận"*.
  - `CONTRADICTED`: Banner **đỏ (error)**, tag `[CONTRADICTED]` — *"Mâu thuẫn với manh mối đang có"*.

#### 1.3. Integration Tests (`tests/test_integration.py`)
- Bổ sung bộ test cho `POST /api/verdict` chứng minh đủ 3 kịch bản:
  1. Đoán đúng đáp án ẩn nhưng ô chưa bị ép buộc $\rightarrow$ bị từ chối với `verdict_success is False`, `assessment == "NOT_PROVABLE"`, `revision` và `is_revealed` giữ nguyên.
  2. Gọi ngược trạng thái đã bị ép buộc $\rightarrow$ bị từ chối với `verdict_success is False`, `assessment == "CONTRADICTED"`, `revision` giữ nguyên.
  3. Gọi đúng trạng thái đã bị ép buộc $\rightarrow$ được chấp nhận (`verdict_success is True`, `assessment == "PROVABLE"`), thẻ lật mở và `revision` tăng 1.

---

### Spec 2: Bổ sung Extension `IntersectionRegion` vào dữ liệu màn chơi (Fix G2)

- Bổ sung ít nhất 1 màn chơi sử dụng `IntersectionRegion` (thêm màn mới như `intersection_4x4.json` hoặc cập nhật 1 clue phù hợp trên màn `4×4`), đồng bộ vào `data/puzzle/puzzles.db`.
- Ví dụ manh mối giao cắt: *"Exactly 1 of (Neighbors of B2) ∩ (Row 2) is a Criminal."*
- Kiểm tra toàn diện:
  - `validate_puzzle(puzzle) == []`
  - `LogicAgent().check_uniqueness(puzzle) is True`
  - `LogicAgent().run_logic_loop(GameEngine(puzzle)).terminal_status is TerminalStatus.SOLVED`
  - `format_clue()` và `get_referenced_coords()` trong `src/griductive/server/serializers.py` diễn đạt câu văn tự nhiên và highlight đúng tập ô giao cắt trên GUI khi người dùng click chọn clue.

---

### Spec 3: Nâng cấp chế độ so sánh trong Benchmark (Fix G3)

- Nâng cấp `src/griductive/experiments/benchmark.py` và `scripts/run_benchmarks.py`:
  - Thêm cờ `--compare` để chạy **trên cùng một tập màn chơi** với 2 cấu hình để so sánh công bằng theo đúng Mục 4.5:
    1. **`baseline_dpll`**: `DPLLSolver` với `LogicAgent(..., enable_witness_cache=False)`
    2. **`witness_cached_dpll`**: `DPLLSolver` với `LogicAgent(..., enable_witness_cache=True)`
  - Xuất bảng so sánh Markdown (số `sat_queries` tiết kiệm được (%), `decisions`, `propagations`, `backtracks`, `median_runtime_ms`) để đưa trực tiếp vào Báo cáo Mục 4.5 & 4.6.
  - Hỗ trợ đưa vào ít nhất 1 trường hợp kiểm chứng báo cáo thất bại/bị kẹt hoặc timeout (`STUCK_NO_FORCIBLE_MOVE` / `TIMEOUT`) khi chạy chế độ stress/evaluation nếu cần số liệu cho mục *"Report failures and timeouts rather than removing them"*.
- Đổi giá trị mặc định `--output-dir` từ `.` sang `results/` và thêm `results/` vào `.gitignore` để tránh sinh file CSV/Markdown/JSON làm bẩn thư mục gốc.

---

### Spec 4: Vệ sinh kỹ thuật & Đóng gói (Fix G4)

1. **Tối ưu `LogicService.hint()` (`src/griductive/server/logic_service.py`):**
   - Tránh chạy encode + SAT lặp 2 lần khi không có nước đi bắt buộc: chỉ cần 1 lượt `classify_all(state)` (hoặc tìm `first_forced` và kiểm tra `INCONSISTENT` trong cùng 1 lần quét `kb` / `ctx`) rồi trích xuất `HintResult` từ đó.
2. **Cô lập fixture trong `tests/test_auto_solve_endpoint.py`:**
   - Sử dụng fixture `try/finally` khôi phục `app_module.session` sau mỗi test (tương tự `tests/test_integration.py`) để không làm nhiễm trạng thái toàn cục sang các file test khác.
3. **Đóng gói nộp bài chuẩn Mục 5:**
   - Kiểm tra trước khi nén `Source/`: đã chạy `cd frontend && npm run build` để tạo sẵn `frontend/dist/`, đảm bảo người chấm chỉ cần `pip install -r requirements.txt && python main.py` (không phụ thuộc Node.js lúc chấm).

---

## 3. Phase 2 — Brainstorm thiết kế & nâng cấp UI/UX

Sau khi Phase 1 hoàn tất và ổn định 100%, giao diện Web (`frontend/`) sẽ được nâng cấp nhằm mang lại trải nghiệm chơi trực quan, thẩm mỹ cao và tối ưu cho Video Demo (Mục 4.7 — 10 pts).

### 3.1. Lựa chọn định hướng thẩm mỹ (Aesthetic Direction)

- **Option A — Modern Detective Casefile (Nâng cấp trực tiếp từ theme hiện tại):**
  - **Bảng màu:** Dark mode tông gỗ/hồ sơ trầm (`#161311`, `#221D1A`) và Light mode tông giấy hồ sơ kem ấm (`#F5EFE6`, `#FFFDF9`), chữ serif cho tên nhân vật & tiêu đề hồ sơ, font monospace cho tọa độ (`A1`, `B2`) và thông số kỹ thuật.
  - **Thẻ nhân vật:** Hiệu ứng lật 3D mượt hơn, avatar rõ nét, badge trạng thái `CRIMINAL` / `INNOCENT` sắc sảo với viền phát sáng tinh tế.
- **Option B — Crisp Editorial Puzzle (Phong cách *Clues by Sam* / *NYT Games*):**
  - **Bảng màu:** Tối giản, độ tương phản cực cao trên nền sáng ngà/trắng, dùng cặp màu phân biệt tức thì: Xanh ngọc/Lam (`Innocent`), Đỏ san hô (`Criminal`), Vàng hổ phách (`Highlight` / `Hint` / `Not Provable`).
  - **Bố cục:** Siêu thoáng, ưu tiên diện tích tối đa cho lưới $4 \times 4$ và $5 \times 5$ để mọi câu manh mối hiển thị trọn vẹn không bị cắt chữ.

### 3.2. Các nâng cấp UX trọng tâm ("Ăn điểm" khi quay Video Demo)

1. **Visual Hint Spotlight & Card Pulse:**
   - Khi bấm **Hint**, ô được gợi ý sẽ phát sáng nhịp nhàng (pulse ring), đồng thời các ô hoặc thẻ manh mối liên quan ở panel bên phải cũng được highlight để người xem video hiểu ngay *tại sao* ô đó bị ép buộc.
2. **Phản hồi trực quan cho Luật No-Guessing (`NOT_PROVABLE` vs `CONTRADICTED`):**
   - Nếu người chơi đoán mò (`NOT_PROVABLE`): modal/banner hiện nhãn cảnh báo màu **vàng hổ phách** kèm hiệu ứng rung nhẹ trên thẻ, giải thích *"Chưa đủ dữ kiện chứng minh — không được đoán mò"*.
   - Nếu chọn mâu thuẫn (`CONTRADICTED`): hiện cảnh báo **đỏ** giải thích ngược trực tiếp với manh mối hiện tại.
3. **Live AI Deduction & SAT Telemetry Panel (Sidebar):**
   - Bổ sung một tab hoặc khu vực nhỏ gọn hiển thị trực tiếp số liệu thuật toán trong lúc chạy **Auto-Solve / Step**:
     - Số biến chính (`primary_vars`) + biến phụ (`aux_vars`)
     - Số mệnh đề CNF (`clause_count`)
     - Tổng SAT queries, Decisions, Propagations, Backtracks, Solver runtime (ms)
   - Giúp người xem video demo thấy rõ quy trình `CNF Encoding -> DPLL -> Refutation` chạy sống động ngay trên giao diện.
4. **Cụm điều khiển Auto-Solve linh hoạt:**
   - Tích hợp thanh chọn tốc độ chạy từng bước (`Chậm 1.2s` để thuyết minh / `Nhanh 0.3s` để xem kết quả), nút **Step** (chạy 1 bước), **Auto-Solve** (tự giải đến hết) và **Stop** (dừng giữa chừng).
5. **Làm sạch chi tiết hiển thị trên Board:**
   - Rà soát độ vừa vặn chữ trên lưới $5 \times 5$, hiển thị rõ tọa độ hàng/cột và số lượng thẻ đã giải.

---

## 4. Checklist & Các điểm cần chốt trước khi triển khai

- [ ] **Phase 1 — Spec 1 (`POST /api/verdict`):** Chốt nối `LogicAgent.assess_verdict()` để chặn đoán mò và trả về `NOT_PROVABLE` / `CONTRADICTED`.
- [ ] **Phase 1 — Spec 2 (`IntersectionRegion`):** Chốt chọn thêm 1 màn chơi mới (thành 15 màn) hay sửa clue trong màn $4 \times 4$ hiện có.
- [ ] **Phase 1 — Spec 3 & 4 (Benchmark & Cleanup):** Chốt thêm `--compare` (`Baseline` vs `Witness Cache`), mặc định `--output-dir results/`, tối ưu `LogicService.hint()` và dọn fixture test.
- [ ] **Phase 2 — UI/UX:** Chọn định hướng thẩm mỹ (**Option A — Modern Detective Casefile** hay **Option B — Crisp Editorial Puzzle**) trước khi thiết kế và chỉnh sửa Frontend.
