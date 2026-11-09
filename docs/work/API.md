# Griductive Solver — API Specification Reference

**Môn học:** CSC14003 — Introduction to Artificial Intelligence  
**Đồ án:** Project 2 — Griductive Solver  
**Vị trí file:** `docs/API.md`  
**Phiên bản:** v2.0 (Hỗ trợ cấu trúc đa module + Web GUI TypeScript + SQLite Database)

---

## Mục lục
1. [Nguyên tắc thiết kế & Toạ độ](#1-nguyên-tắc-thiết-kế--toạ-độ)
2. [Domain Layer APIs (`griductive.domain`)](#2-domain-layer-apis-griductivedomain)
   - [Models & Toạ độ](#21-models--toạ-độ)
   - [Vùng tham chiếu (Regions)](#22-vùng-tham-chiếu-regions)
   - [Manh mối logic (Clues)](#23-manh-mối-logic-clues)
   - [Semantic Oracle (Đánh giá ngữ nghĩa)](#24-semantic-oracle-đánh-giá-ngữ-nghĩa)
   - [Trạng thái công khai (Public State)](#25-trạng-thái-công-khai-public-state)
3. [Game Engine APIs (`griductive.engine`)](#3-game-engine-apis-griductiveengine)
   - [GameEngine](#31-gameengine)
   - [DTOs: VerifiedVerdict & RevealResult](#32-dtos-verifiedverdict--revealresult)
   - [Puzzle Storage & Database (SQLite)](#33-puzzle-storage--database-sqlite)
   - [Puzzle Validator](#34-puzzle-validator)
4. [Server REST APIs (`griductive.server`)](#4-server-rest-apis-griductiveserver)
5. [Hợp đồng giao tiếp giữa 4 thành viên (Module Contracts)](#5-hợp-đồng-giao-tiếp-giữa-4-thành-viên-module-contracts)
   - [Hợp đồng TV 1: CNF Encoder](#hợp-đồng-tv-1-cnf-encoder)
   - [Hợp đồng TV 2: DPLL SAT Solver](#hợp-đồng-tv-2-dpll-sat-solver)
   - [Hợp đồng TV 3: Deductive Logic Agent](#hợp-đồng-tv-3-deductive-logic-agent)
   - [Hợp đồng TV 4: Integration & Benchmark Suite](#hợp-đồng-tv-4-integration--benchmark-suite)
6. [Mã nguồn mẫu: Vòng lặp suy luận hoàn chỉnh (End-to-End Deduction Loop)](#6-mã-nguồn-mẫu-vòng-lặp-suy-luận-hoàn-chỉnh-end-to-end-deduction-loop)

---

## 1. Nguyên tắc thiết kế & Toạ độ

### 1.1. Information Hiding (Giấu thông tin nghiệm ẩn)
- `GameEngine` nắm giữ `PuzzleDefinition` (chứa toàn bộ `hidden_statuses` và các manh mối chưa lật).
- **Tuyệt đối:** Logic Agent và CNF Encoder chỉ được phép truy cập dữ liệu thông qua đối tượng bất biến [`PublicState`](#25-trạng-thái-công-khai-public-state) (chỉ chứa các ô đã lật và manh mối công khai).

### 1.2. Hệ toạ độ bàn cờ
Bàn cờ có kích thước $N \times N$ ($N \in \{3, 4, 5\}$):
- **Toạ độ nội bộ (0-indexed):** `row` $\in [0, N-1]$ (từ trên xuống dưới), `col` $\in [0, N-1]$ (từ trái sang phải).
- **Nhãn hiển thị (Knotwise label):** Cột chữ cái `A, B, C, D, E`, Hàng số `1, 2, 3, 4, 5`.
  - Ví dụ: `(row=0, col=0) -> "A1"`, `(row=1, col=2) -> "C2"`.

---

## 2. Domain Layer APIs (`griductive.domain`)

### 2.1. Models & Toạ độ

```python
from griductive.domain.models import CellId, Status, Parity, Character, BoardLayout
```

#### `CellId`
Định danh toạ độ một ô trên bàn cờ. Bất biến (`frozen=True`).
- **Thuộc tính:** `row: int`, `col: int`
- **Phương thức:**
  - `CellId.from_label(label: str) -> CellId`: Chuyển chuỗi `"A1"`, `"C2"` thành `CellId`.
  - `cell.to_label() -> str`: Chuyển toạ độ thành `"A1"`, `"C2"`.

#### `Status`
Enum trạng thái tội phạm / vô tội:
- `Status.CRIMINAL = "CRIMINAL"`
- `Status.INNOCENT = "INNOCENT"`
- `Status.from_boolean(val: bool) -> Status`: `True` $\rightarrow$ `CRIMINAL`, `False` $\rightarrow$ `INNOCENT`.
- `status.to_boolean() -> bool`: `CRIMINAL` $\rightarrow$ `True`, `INNOCENT` $\rightarrow$ `False`.

#### `Parity`
Enum tính chẵn lẻ của số lượng Criminals:
- `Parity.EVEN = "EVEN"` (Tổng số là chẵn: $0, 2, 4, \dots$)
- `Parity.ODD = "ODD"` (Tổng số là lẻ: $1, 3, 5, \dots$)

#### `Character`
Thông tin hiển thị của nghi phạm tại một ô:
- `cell_id: CellId`
- `name: str` (VD: `"Ada"`, `"Binh"`, ...)
- `profession: str` (VD: `"Architect"`, `"Botanist"`, ...)

#### `BoardLayout`
Tiện ích tính toán không gian bàn cờ kích thước $N \times N$:
- `__init__(size: int)`
- `contains(cell: CellId) -> bool`: Kiểm tra toạ độ có nằm trong bàn cờ không.
- `all_cells() -> tuple[CellId, ...]`: Danh sách toàn bộ ô theo thứ tự row-major.
- `neighbors_of(cell: CellId) -> tuple[CellId, ...]`: Lấy danh sách tối đa 8 ô lân cận (không bao gồm chính nó).

---

### 2.2. Vùng tham chiếu (Regions)

```python
from griductive.domain.regions import (
    RowRegion, ColumnRegion, NeighborsRegion,
    ExplicitRegion, IntersectionRegion, RegionSpec, resolve_region
)
```

Tất cả các vùng đều kế thừa `RegionSpec` (bất biến):
- `RowRegion(row: int)`: Hàng thứ `row` (0-indexed).
- `ColumnRegion(col: int)`: Cột thứ `col` (0-indexed).
- `NeighborsRegion(center: CellId)`: Các ô tiếp giáp với ô trung tâm `center`.
- `ExplicitRegion(cells: tuple[CellId, ...])`: Danh sách tường minh các ô.
- `IntersectionRegion(left: RegionSpec, right: RegionSpec)`: Vùng giao cắt giữa 2 vùng.

#### Hàm giải vùng:
```python
resolve_region(spec: RegionSpec, layout: BoardLayout) -> tuple[CellId, ...]
```
Trả về danh sách các `CellId` hợp lệ thuộc vùng, đã được sắp xếp và loại bỏ trùng lặp.

---

### 2.3. Manh mối logic (Clues)

```python
from griductive.domain.clues import (
    FactClue, SameClue, DifferentClue,
    ExactlyClue, AtLeastClue, AtMostClue, ParityClue, Clue
)
```

Tất cả manh mối đều kế thừa `ClueBase(clue_id: str, owner: CellId)`:

| Class Manh mối | Các trường thuộc tính | Ý nghĩa logic |
| :--- | :--- | :--- |
| `FactClue` | `target: CellId`, `status: Status` | Ô `target` có trạng thái `status` ($C_{\text{target}}$ hoặc $\neg C_{\text{target}}$) |
| `SameClue` | `left: CellId`, `right: CellId` | Hai ô có cùng trạng thái ($C_{\text{left}} \leftrightarrow C_{\text{right}}$) |
| `DifferentClue` | `left: CellId`, `right: CellId` | Hai ô có trạng thái khác nhau ($C_{\text{left}} \oplus C_{\text{right}}$) |
| `ExactlyClue` | `region: RegionSpec`, `k: int` | Trong vùng có chính xác $k$ Criminals ($\sum C_i = k$) |
| `AtLeastClue` | `region: RegionSpec`, `k: int` | Trong vùng có ít nhất $k$ Criminals ($\sum C_i \ge k$) |
| `AtMostClue` | `region: RegionSpec`, `k: int` | Trong vùng có nhiều nhất $k$ Criminals ($\sum C_i \le k$) |
| `ParityClue` | `region: RegionSpec`, `parity: Parity` | Tính chẵn lẻ của số Criminals trong vùng ($\sum C_i \pmod 2$) |

---

### 2.4. Semantic Oracle (Đánh giá ngữ nghĩa)

```python
from griductive.domain.evaluator import ClueEvaluator, evaluate_clue
```

Được sử dụng làm **Ground Truth Oracle** để kiểm tra tính đúng đắn của công thức CNF mà không dùng SAT solver:

```python
evaluator = ClueEvaluator()
is_true = evaluator.evaluate(
    clue: Clue,
    layout: BoardLayout,
    assignment: Mapping[CellId, Status | bool]
) -> bool
```

---

### 2.5. Trạng thái công khai (Public State)

```python
from griductive.domain.state import PublicState, PublicCell
```

`PublicState` là snapshot bất biến đại diện cho toàn bộ thông tin người chơi/Agent nhìn thấy tại bước $t$:

```python
class PublicState:
    session_id: str               # ID phiên chơi (chống race condition)
    revision: int                 # Số thứ tự bước hiện tại t (0, 1, 2, ...)
    size: int                     # Kích thước bàn cờ N (3, 4, 5)
    cells: tuple[PublicCell, ...] # Danh sách tất cả N x N ô
    
    # Các hàm API hỗ trợ tiện lợi:
    def revealed_clues(self) -> tuple[Clue, ...]:
        """Trả về toàn bộ danh sách manh mối đã được lật mở tại bước t."""
        
    def known_statuses(self) -> dict[CellId, Status]:
        """Trả về dictionary {CellId: Status} các ô đã được chứng minh/lật."""
        
    def unresolved_cells(self) -> tuple[CellId, ...]:
        """Danh sách các CellId chưa được lật, sắp xếp theo thứ tự row-major."""
        
    def is_solved(self) -> bool:
        """Kiểm tra xem toàn bộ bàn cờ đã được giải hết chưa (100% cards revealed)."""
```

---

## 3. Game Engine APIs (`griductive.engine`)

### 3.1. GameEngine

```python
from griductive.engine.game_engine import GameEngine, VerifiedVerdict, RevealResult
```

```python
class GameEngine:
    def __init__(self, puzzle: PuzzleDefinition) -> None:
        """Khởi tạo engine với một đề bài đầy đủ (giữ private ground truth)."""
        
    def get_public_state(self) -> PublicState:
        """Lấy snapshot tri thức công khai hiện tại (dành cho Agent và UI)."""
        
    def commit_verified_verdict(self, verified: VerifiedVerdict) -> RevealResult:
        """
        DÀNH CHO LOGIC AGENT:
        Commit một phán quyết đã được chứng minh bắt buộc (forced verdict).
        Engine sẽ kiểm tra session_id, revision, đối soát với hidden solution.
        Nếu hợp lệ: lật thẻ, tăng revision, trả về RevealResult chứa clue mới.
        Nếu sai/đoán mò: raise RuntimeError("Integrity Error").
        """
        
    def submit_manual_verdict(
        self, cell: CellId, status: Status
    ) -> tuple[bool, str, RevealResult | None]:
        """
        DÀNH CHO WEB GUI (Chơi thủ công):
        Người dùng click gọi Criminal / Innocent.
        Trả về (is_correct, message, reveal_result_if_correct).
        """
        
    def restart(self) -> PublicState:
        """Reset ván chơi về trạng thái ban đầu (các thẻ ban đầu lật mở)."""
        
    def is_solved(self) -> bool:
        """Trả về True khi toàn bộ các ô đã được giải xong."""
```

---

### 3.2. DTOs: VerifiedVerdict & RevealResult

```python
@dataclass(frozen=True)
class VerifiedVerdict:
    """Phiếu kết luận do LogicAgent lập ra sau khi đã chứng minh KB |= C_i."""
    session_id: str  # Lấy từ state.session_id
    revision: int    # Lấy từ state.revision
    cell: CellId     # Ô kết luận (VD: CellId(0, 1))
    status: Status   # Trạng thái chứng minh được (Status.CRIMINAL hoặc Status.INNOCENT)

@dataclass(frozen=True)
class RevealResult:
    """Kết quả trả về sau khi lật thẻ thành công."""
    cell: CellId
    status: Status
    revealed_clue: Clue       # Manh mối vừa được mở ra
    new_state: PublicState    # Snapshot tri thức mới ở bước t + 1
```

---

### 3.3. Puzzle Storage & Database (SQLite)

```python
from griductive.engine.puzzle_db import (
    load_puzzle_from_sqlite,
    list_puzzles_from_sqlite,
    save_puzzle_to_sqlite
)
```

- `list_puzzles_from_sqlite() -> list[dict]`: Lấy danh sách 14 màn chơi đã được nạp trong `data/puzzle/puzzles.db`:
  ```python
  # Mỗi phần tử trong list có cấu trúc:
  {
      "puzzle_id": "dragon_4x4_01",
      "name": "4×4 Four Corners Mystery",
      "size": 4,
      "difficulty": "normal",
      "initial_revealed": ["B2"]
  }
  ```
- `load_puzzle_from_sqlite(puzzle_id: str) -> PuzzleDefinition`: Nạp đối tượng puzzle hoàn chỉnh để khởi tạo `GameEngine(puzzle)`.

---

### 3.4. Puzzle Validator

```python
from griductive.engine.puzzle_validator import validate_puzzle

errors = validate_puzzle(puzzle: PuzzleDefinition) -> list[str]
# Trả về [] nếu bài toán chuẩn 100%; trả về danh sách chuỗi mô tả lỗi nếu vi phạm.
```

---

## 4. Server REST APIs (`griductive.server`)

FastAPI server phục vụ giao tiếp giữa Web GUI và Backend Python tại cổng `8999`:

| Phương thức | Endpoint | Request Body | Response JSON |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/state` | *(Không)* | Trả về toàn bộ `GameState` hiện tại |
| `POST` | `/api/verdict` | `{"coord": "B1", "status": "CRIMINAL"}` | Kết quả phán quyết + `GameState` cập nhật |
| `POST` | `/api/restart` | *(Không)* | Khởi động lại ván chơi hiện tại |
| `POST` | `/api/load` | `{"stage": "dragon_4x4_01"}` | Nạp màn chơi mới theo `puzzle_id` |
| `GET` | `/api/puzzles` | *(Không)* | Danh sách 14 màn chơi kèm metadata |
| `POST` | `/api/hint` | *(Không)* | Gợi ý từ AI: `{"hint": "...", "cell": "B1", "status": "CRIMINAL"}` |
| `POST` | `/api/auto-solve`| *(Không)* | Chạy tự động Agent và trả về trace các bước |
| `GET` | `/api/avatars/{name}`| *(Param)* | Ảnh chân dung PNG của nghi phạm |

---

## 5. Hợp đồng giao tiếp giữa 4 thành viên (Module Contracts)

Để 4 thành viên trong nhóm code song song không bị xung đột, các module phải tuân thủ đúng các Interface (chữ ký hàm và kiểu dữ liệu) sau:

### Hợp đồng TV 1: CNF Encoder
- **Đường dẫn file:** `src/griductive/logic/cnf/encoder.py`
- **Interface bắt buộc:**
```python
@dataclass(frozen=True)
class EncodedKB:
    clauses: tuple[tuple[int, ...], ...]   # Các mệnh đề dạng CNF (VD: ((-1, 2), (1, -2)))
    primary_vars_count: int                # Số biến chính (N x N)
    aux_vars_count: int                    # Số biến phụ (sinh ra do Parity/Cardinality)
    variable_map: dict[CellId, int]        # Ánh xạ từ CellId sang biến nguyên dương 1..N^2

class CNFEncoder:
    def encode_knowledge_base(self, state: PublicState) -> EncodedKB:
        """Chuyển đổi toàn bộ active clues và proven statuses trong state sang CNF."""
        ...
```

---

### Hợp đồng TV 2: DPLL SAT Solver
- **Đường dẫn file:** `src/griductive/logic/sat/dpll.py`
- **Interface bắt buộc:**
```python
@dataclass(frozen=True)
class SolverStats:
    decisions: int       # Số lần rẽ nhánh gán giả thiết
    propagations: int    # Số lần lan truyền mệnh đề đơn (Unit propagation)
    backtracks: int      # Số lần quay lui khi gặp mâu thuẫn
    runtime_ms: float    # Thời gian giải tính bằng milliseconds

@dataclass(frozen=True)
class SATResult:
    is_sat: bool                     # True nếu thoả mãn, False nếu UNSAT
    model: dict[int, bool] | None    # Phép gán chân trị thoả mãn (nếu SAT)
    stats: SolverStats               # Bộ đo đạc chỉ số telemetry

class DPLLSolver:
    def solve(
        self,
        clauses: Sequence[Sequence[int]],
        assumptions: Sequence[int] = ()
    ) -> SATResult:
        """
        Giải bài toán SAT bằng DPLL.
        Hỗ trợ assumptions tạm thời (phục vụ Entailment checking của Agent).
        """
        ...
```

---

### Hợp đồng TV 3: Deductive Logic Agent
- **Đường dẫn file:** `src/griductive/logic/agent/logic_agent.py`
- **Interface bắt buộc:**
```python
@dataclass(frozen=True)
class HintResult:
    cell: CellId
    forced_status: Status
    reason: str
    active_clue_ids: tuple[str, ...]

class LogicAgent:
    def __init__(self, encoder: CNFEncoder | None = None, solver: DPLLSolver | None = None):
        ...

    def suggest_next(self, state: PublicState) -> HintResult | None:
        """
        Quét các ô chưa giải theo row-major order:
        - Kiểm tra KB ∧ ¬C_i có UNSAT không -> ép buộc CRIMINAL.
        - Kiểm tra KB ∧ C_i có UNSAT không -> ép buộc INNOCENT.
        Trả về ô đầu tiên bị ép buộc; trả về None nếu không thể suy luận (không đoán mò).
        """
        ...

    def check_uniqueness(self, puzzle: PuzzleDefinition) -> bool:
        """Kiểm tra đề bài có đúng 1 nghiệm duy nhất hay không."""
        ...
```

---

### Hợp đồng TV 4: Integration & Benchmark Suite
- **Đường dẫn file:** `scripts/run_benchmarks.py` và `src/griductive/server/app.py`
- **Interface bắt buộc:**
```python
# Trong src/griductive/server/app.py:
@app.post("/api/hint")
def get_hint() -> dict[str, Any]:
    state = session.engine.get_public_state()
    agent = LogicAgent()
    res = agent.suggest_next(state)
    if res:
        return {"hint": res.reason, "cell": res.cell.to_label(), "status": res.forced_status.value}
    return {"hint": "No forced verdict provable currently."}

@app.post("/api/auto-solve")
def auto_solve() -> dict[str, Any]:
    # Lặp lại commit_verified_verdict cho đến khi engine.is_solved()
    ...
```

---

## 6. Mã nguồn mẫu: Vòng lặp suy luận hoàn chỉnh (End-to-End Deduction Loop)

Dưới đây là đoạn code chuẩn mẫu thể hiện cách 4 module phối hợp với nhau qua các API trên:

```python
from griductive.engine.puzzle_db import load_puzzle_from_sqlite
from griductive.engine.game_engine import GameEngine, VerifiedVerdict
from griductive.logic.agent import LogicAgent

def solve_case(puzzle_id: str):
    # 1. Khởi tạo Engine từ database
    puzzle = load_puzzle_from_sqlite(puzzle_id)
    engine = GameEngine(puzzle)
    agent = LogicAgent()
    
    step = 0
    print(f"=== Bắt đầu phá án: {puzzle_id} ({engine.size}x{engine.size}) ===")
    
    # 2. Vòng lặp suy luận từng bước (No-Guess Deduction Loop)
    while not engine.is_solved():
        state = engine.get_public_state()
        
        # Agent phân tích và tìm phán quyết bị ép buộc tiếp theo
        hint = agent.suggest_next(state)
        if hint is None:
            print(f"[BẾ TẮC] Không còn ô nào được chứng minh ép buộc tại bước {step}. Dừng lại!")
            break
            
        # Lập phiếu phán quyết đã chứng minh
        verdict = VerifiedVerdict(
            session_id=state.session_id,
            revision=state.revision,
            cell=hint.cell,
            status=hint.forced_status,
        )
        
        # Commit lên engine để mở thẻ bài
        reveal = engine.commit_verified_verdict(verdict)
        step += 1
        print(f"Bước {step}: Chứng minh {reveal.cell.to_label()} = {reveal.status.value}. "
              f"Manh mối mới mở: {reveal.revealed_clue}")

    if engine.is_solved():
        print(f"🎉 PHÁ ÁN THÀNH CÔNG sau {step} bước suy luận hoàn toàn logic!")

if __name__ == "__main__":
    solve_case("dragon_3x3_01")
```
