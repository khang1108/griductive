# Kịch Bản Thuyết Minh Video Demo — Griductive Solver (`05:18`)

- **Video tương ứng**: `docs/demo/griductive_demo_submission.mp4` (`1920×1080`, `30 fps`, `05:18`)
- **Tệp nhắc chữ / phụ đề rời**: `docs/demo/griductive_demo_subtitles_vi.srt` (có thể mở kèm trong VLC / CapCut để vừa xem hình vừa thu âm, hoặc đính kèm lên Google Drive).
- **Tốc độ đọc khuyến nghị**: ~125–135 từ/phút (vừa phải, rõ chữ; tại mỗi thẻ chuyển phần `3.8s` có khoảng nghỉ lấy hơi tự nhiên).

---

## Mở Đầu & Kiến Trúc Hệ Thống (`00:00 – 00:25`)

### `[00:00 – 00:06]` · Thẻ tiêu đề mở đầu
> *"Xin chào thầy cô. Hôm nay nhóm chúng em xin trình bày phần thực nghiệm hệ thống **Griductive Solver** — đồ án số 2 môn Cơ sở Trí tuệ Nhân tạo."*

### `[00:06 – 00:25]` · Sơ đồ kiến trúc 5 tầng cô lập (`PublicState Isolation`)
> *"Toàn bộ hệ thống được thiết kế theo kiến trúc năm tầng độc lập. Điểm cốt lõi là ranh giới cô lập một chiều: tầng `GameEngine` nắm giữ riêng đáp án bí mật và các lời khai đang úp, trong khi tác tử suy diễn `LogicAgent`, bộ mã hóa `CNFEncoder` và bộ giải `DPLL` chỉ được tiếp nhận bản ghi trạng thái công khai `PublicState` — đảm bảo mọi bước mở thẻ đều dựa trên chứng minh hệ quả logic."*

---

## Phần 1 — Không Gian Điều Tra Ba Chiều Midnight Archive (`00:25 – 01:09`)

### `[00:25 – 00:36]` · Thẻ Phần 1 & Toàn cảnh bàn làm việc 3D (`3×3 Starter Tutorial`)
> *"Trước hết là giao diện trực quan ba chiều **Midnight Archive**. Thay vì bảng lưới phẳng truyền thống, các hồ sơ nghi phạm được bố trí trên mặt bàn gỗ 3D kèm tọa độ cột `A–C`, hàng `1–3`, tên và nghề nghiệp của từng nhân vật."*

### `[00:36 – 00:46]` · Chọn thẻ `A1` (`Ada`) & chiếu sáng vùng manh mối
> *(Khi con trỏ bấm thẻ `A1` và nhấn `Highlight on Board`)*
> *"Khi nhấp vào một nghi phạm đã xác nhận như `A1`, thẻ hồ sơ bên trái hiển thị nguyên văn lời khai và cho phép chiếu sáng trực tiếp các ô liên quan ngay trên bàn cờ."*

### `[00:46 – 00:55]` · Sổ tay manh mối bên phải (`Clues`), Ghim (`Pin`) & Xóa vùng sáng
> *(Khi con trỏ chọn câu khai bên phải, bấm ghim `Pin`, rồi bấm nút tẩy ở thanh dưới)*
> *"Ở sổ tay `Clues` bên phải, người chơi có thể chọn hoặc ghim cố định các manh mối để đối chiếu giao vùng, và tắt nhanh hiệu ứng chiếu sáng từ thanh công cụ phía dưới."*

### `[00:55 – 01:09]` · Cài đặt (`Settings`), Tạm dừng (`Pause`) & Danh mục 14 màn chơi
> *(Khi mở `Settings`, `Pause`, rồi mở menu chọn màn ở góc trái trên)*
> *"Thanh điều khiển phía trên cung cấp tiến độ giải, đồng hồ ca trực, tùy chỉnh chất lượng đồ họa, chế độ tạm dừng và danh mục đầy đủ 14 vụ án chuẩn trải đều ba kích thước `3×3`, `4×4` và `5×5`."*

---

## Phần 2 — Chơi Thủ Công & Cơ Chế Không Suy Đoán (`01:09 – 02:22`)

### `[01:09 – 01:21]` · Thẻ Phần 2 & Ghi chú nháp trên thẻ `C1` (`Chi`)
> *(Khi mở thẻ `C1`, bấm `Crim?`, `Bookmark`, rồi xóa nháp)*
> *"Sang phần hai, chúng em minh họa chế độ chơi thủ công và quy tắc cốt lõi **không suy đoán**. Trên mỗi thẻ chưa mở như `C1`, người chơi có thể đánh dấu giả thuyết nháp hoặc gắn thẻ theo dõi cá nhân."*

### `[01:21 – 01:29]` · Phán quyết thiếu căn cứ trên `C1` ⇒ Dấu `NOT PROVABLE`
> *(Khi bấm `Criminal` trên `C1` và dấu hổ phách `NOT PROVABLE` dập xuống)*
> *"Nếu người chơi vội kết luận `C1` là tội phạm khi dữ kiện công khai hiện tại chưa đủ chứng minh, hệ thống lập tức đóng dấu **`NOT PROVABLE`**, giữ nguyên mặt thẻ úp mà không làm lộ lời khai ẩn."*

### `[01:29 – 01:38]` · Phán quyết ngược hệ quả logic trên `B1` ⇒ Dấu `CONTRADICTED`
> *(Khi mở `B1` và cố tình bấm `Innocent` — dấu đỏ `CONTRADICTED` xuất hiện)*
> *"Ngược lại, do lời khai tại `A1` đã khẳng định `B1` là tội phạm, nếu ta chọn `B1` vô tội, hệ thống phân biệt rõ và đóng dấu đỏ **`CONTRADICTED`** vì mâu thuẫn trực tiếp với cơ sở tri thức hiện hành."*

### `[01:38 – 01:48]` · Xác nhận đúng `B1 = Criminal` & soi lời khai mới mở
> *(Khi bấm `Criminal` trên `B1`, thẻ lật mở lời khai mới và chọn lời khai của `B1`)*
> *"Khi đưa ra phán quyết hợp lệ `B1` là `Criminal`, bộ giải xác nhận hệ quả logic, lật mở thẻ `B1` và bổ sung lời khai mới vào sổ tay để mở đường cho các bước suy luận kế tiếp."*

### `[01:48 – 02:11]` · Giải thủ công chuỗi 7 nghi phạm còn lại (`A2 → B2 → C2 → B3 → C3 → A3 → C1`)
> *(Khi lần lượt mở `A2`, `B2`, `C2`, `B3`, `C3`, `A3`, `C1`)*
> *"Từ chuỗi lời khai mở rộng đơn điệu này, ta lần lượt suy diễn chặt chẽ từng ô tiếp theo: xác nhận `A2` và `B2` là tội phạm, suy ra `C2` và `B3` vô tội theo ràng buộc đếm trên hàng và cột, tiếp tục chứng minh `C3` là tội phạm, và khép lại hai ô cuối `A3` cùng `C1` đều vô tội."*

### `[02:11 – 02:22]` · Hồ sơ tổng kết `CASE CLOSED — Verified Manual Deduction`
> *(Khi bảng `CASE CLOSED` hiện ra rồi bấm `View Board & Log`)*
> *"Khi cả 9 trên 9 nghi phạm đều được chứng minh, hồ sơ tổng kết đóng dấu **`CASE CLOSED`** với chứng nhận suy diễn thủ công hợp lệ."*

---

## Phần 3 — Trợ Lý Suy Diễn: Hint, AI Step & Auto-Solve Trên Lưới `4×4` (`02:22 – 03:26`)

### `[02:22 – 02:37]` · Thẻ Phần 3, chuyển sang `4×4 Scotland Yard Expert` & ghim 2 manh mối
> *(Khi mở màn `4×4` và ghim 2 lời khai đếm chẵn lẻ / khác trạng thái)*
> *"Ở phần ba, chúng em chuyển sang màn `4×4 Scotland Yard Expert` gồm 16 nghi phạm với cả ràng buộc chẵn lẻ `EVEN` và quan hệ khác trạng thái. Ta có thể ghim đồng thời hai manh mối để quan sát hai vùng màu giao nhau trên bàn cờ."*

### `[02:37 – 02:48]` · Tính năng `Hint` & mở thẻ `A4`
> *(Khi bấm `Hint`, ô `A4` phát sáng vàng, rồi người chơi mở `A4 = Innocent`)*
> *"Khi nhấn **`Hint`**, `LogicAgent` kiểm tra phản chứng trên tập mệnh đề công khai để chỉ ra ô bắt buộc kế tiếp là `A4` cùng manh mối liên quan mà hoàn toàn không đọc đáp án ẩn. Ta xác nhận `A4` vô tội để mở thêm dữ kiện."*

### `[02:48 – 03:00]` · Bật `SAT Solver Trace` & chạy từng bước `AI Step`
> *(Khi bấm biểu tượng nhịp xung mở `SAT Solver Trace` và nhấn `AI Step` 2 lần)*
> *"Chuyển sổ tay bên phải sang chế độ **`SAT Solver Trace`**, mỗi lần nhấn **`AI Step`**, tác tử tự động chứng minh một ô chắc chắn kế tiếp và ghi nhận minh bạch số truy vấn SAT, số mệnh đề CNF, số phép lan truyền đơn vị và thời gian giải."*

### `[03:00 – 03:26]` · Chạy `Auto-Solve`, nhấn `Stop` giữa chừng rồi giải đến `CASE CLOSED (16/16)`
> *(Khi bấm `Auto-Solve`, nhấn `Stop`, rồi bấm lại `Auto-Solve` tới khi hiện `CASE CLOSED`)*
> *"Với chế độ **`Auto-Solve`**, tác tử giải tuần tự từng bước và cho phép người chơi nhấn **`Stop`** tạm dừng an toàn ngay giữa chu trình. Khi kích hoạt lại `Auto-Solve`, toàn bộ 16 nghi phạm được giải hoàn tất kèm bảng thống kê chi tiết của bộ giải DPLL."*

---

## Phần 4 — Kiểm Thử Mở Rộng Trên Lưới `5×5` (`03:26 – 04:34`)

### `[03:26 – 03:58]` · Thẻ Phần 4 & Màn `5×5 Scalability Masterpiece` (`25` ô, `360` mệnh đề CNF)
> *(Khi chuyển sang `5×5 Scalability Masterpiece`, soi vùng, bật `SAT Solver Trace` và chạy `Auto-Solve`)*
> *"Sang phần bốn, nhóm kiểm thử khả năng mở rộng trên lưới lớn `5×5` gồm 25 nghi phạm. Ở màn `Scalability Masterpiece`, hệ thống tự động biên dịch các ràng buộc đếm vùng phức tạp lên đến 360 mệnh đề CNF. Nhờ cơ chế lan truyền đơn vị kết hợp bộ nhớ đệm nghiệm mẫu **Witness Cache**, tác tử cắt tỉa phần lớn các truy vấn dư thừa và giải trọn vẹn 25 ô một cách mượt mà."*

### `[03:58 – 04:34]` · Màn `5×5 Grand Master Detective` (Tua nhanh `2.0x` bằng `ffmpeg`)
> *(Khi xem bàn cờ đã giải, chuyển sang `5×5 Grand Master Detective` — đoạn giữa có nhãn `FAST-FORWARD x2.0`)*
> *"Tiếp tục thử sức với màn `5×5 Grand Master Detective`, video được tua nhanh hai lần ở các bước trung gian để tiết kiệm thời gian theo dõi. Dù số bước suy diễn kéo dài qua 23 lượt lật thẻ liên tiếp, toàn bộ thời gian tính toán thực tế trong bộ giải DPLL chỉ tốn chưa đến 30 mili-giây trước khi khép lại hồ sơ 25 trên 25 ô."*

---

## Phần 5 — Kiểm Định Tự Động & Thực Nghiệm Benchmark (`04:34 – 05:18`)

### `[04:34 – 04:50]` · Thẻ Phần 5 & Chạy `python -m pytest -q` (`290 passed`)
> *(Khi màn hình Terminal gõ `python -m pytest -q` và hiện `290 passed`)*
> *"Ở phần cuối, chúng em trình bày kết quả kiểm định tự động và thực nghiệm định lượng. Bộ kiểm thử `pytest` vượt qua toàn bộ **290 bài kiểm tra**, bao phủ đại số vùng, bộ mã hóa CNF, thuật toán DPLL và kiểm chứng nghiêm ngặt tính cô lập của `PublicState`."*

### `[04:50 – 05:12]` · Bảng Benchmark 14 màn chơi độc lập tiến trình
> *(Khi bảng kết quả 14 màn chạy xong và giữ trên màn hình để thuyết trình)*
> *"Khi chạy công cụ benchmark cô lập tiến trình trên toàn bộ 14 màn chơi chuẩn, hệ thống giải thành công 14 trên 14 vụ án mà không thực hiện bất kỳ bước suy đoán nào: nhóm `3×3` chỉ mất từ `2,7` đến `9,5` mili-giây; nhóm `4×4` từ `5,1` đến `23,5` mili-giây; và ngay cả màn `5×5` nặng nhất với 360 mệnh đề CNF cũng hoàn tất trong `60,3` mili-giây."*

### `[05:12 – 05:18]` · Thẻ kết thúc (`Outro`)
> *"Phần trình bày demo đồ án **Griductive Solver** của nhóm đến đây là kết thúc. Xin cảm ơn thầy cô đã lắng nghe và theo dõi!"*
