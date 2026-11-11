# Luồng nhập flashcard từ file

> Nhập thẻ từ CSV / XLSX / PDF vào một bộ thẻ. Đối chiếu với code ngày 11/11/2026.

| Phần | File |
|---|---|
| Wizard (UI) | `apps/ui/components/admin/import-wizard.tsx` |
| Cổng Next | `apps/ui/app/api/import/route.ts` |
| API | `apps/api/src/import/import.controller.ts`, `import.service.ts` |
| Đọc PDF | `apps/api/src/import/parsers/pdf.ts` |

## 1. Tổng quan

```
Chọn file + bộ thẻ ─► Đọc file ─► Ánh xạ cột ─► Xem trước & xác nhận ─► Kết quả
     (bước 1)                      (bước 2)          (bước 3)            (bước 4)
```

- **Chỉ "Xác nhận nhập" (bước 3) mới ghi thẻ vào database.** Mọi bước trước đó chỉ đọc và tính.
- **AI chỉ chạy ở bước xem trước.** Xác nhận dùng lại kết quả đã có, không gọi AI.
- **Nhập file không tự sinh câu ví dụ.** Admin tự bấm "✨ Tạo ví dụ" sau khi kiểm tra thẻ (§6).
- **Thẻ trùng luôn bị bỏ qua**, không ghi đè thẻ có sẵn.

**Ai nhập được:** người dùng nhập vào deck cá nhân của mình (`/learn/import`); chỉ ADMIN / SUPER_ADMIN nhập được vào deck chia sẻ (`/admin/import`).

| Giới hạn | Giá trị |
|---|---|
| CSV / XLSX | ≤ 10 MB (vượt → 413) |
| PDF | ≤ 50 MB (vượt → 413) |
| Số dòng mỗi file | 10.000 |
| PDF scan | ≤ 300 trang |

## 2. Các bước trong wizard

Bước đang hiển thị suy ra từ state: có kết quả → 4; có preview và đã xem xét → 3; có preview → 2; còn lại → 1.

### Bước 1 — Chọn file và bộ thẻ đích

- Chọn file; chọn bộ thẻ có sẵn hoặc tạo bộ mới ngay trong wizard. Bộ mới luôn ở trạng thái nháp (DRAFT); admin tự công khai sau.
- Bản nháp của wizard (file, bộ thẻ, ánh xạ) lưu trong IndexedDB nên F5 không mất; tự xoá khi huỷ hoặc xác nhận xong.
- **CSV / XLSX:** "Đọc file (nháp, chưa nhập)" gọi `POST /flashcards/import/preview` **không kèm ánh xạ** → server chỉ trả tên cột và số dòng.
- **PDF:** "Đọc file" tạo một job chạy nền (§3). Khi job xong, wizard tự chạy tiếp như CSV / XLSX.

**Tự đoán ánh xạ.** Ngay khi có tên cột, giao diện đoán ánh xạ theo tên cột (front / back / hanViet / reading / pos / example…):

- Đoán được cả cột từ vựng và cột nghĩa → chạy luôn preview đầy đủ rồi nhảy sang bước 3.
- Không đoán được → dừng ở bước 2 để người dùng tự chọn.

### Bước 2 — Ánh xạ cột

- Cột bắt buộc phải chọn: **từ** (`front`) và **nghĩa** (`back`). Tuỳ chọn: STT, Hán Việt, tags, cách đọc, từ loại, ví dụ, nghĩa ví dụ.
- Bắt buộc là *có cột nghĩa*, không phải mọi dòng đều có nghĩa: ô nghĩa trống vẫn nhập được (§4, mục "Nghĩa").
- "Tiếp tục: xem trước" gọi preview kèm ánh xạ. Trong lúc chạy wizard **ở lại bước 2**, hiện thanh tiến độ và nút Hủy.

### Bước 3 — Xem trước và xác nhận

- Bảng từng dòng với trạng thái `ok` / `error` / `duplicate`; dòng bị loại hiện trong panel lỗi.
- Dòng có cảnh báo nằm trong danh sách "cần xem xét" (§5).
- **"Xác nhận nhập N thẻ"** gọi `POST /flashcards/import/confirm`: dựng lại đúng các dòng của preview rồi ghi thẻ. Thao tác idempotent — xác nhận lại cùng file không tạo thẻ trùng.

### Bước 4 — Kết quả

- Số thẻ đã nhập / bỏ qua vì trùng / lỗi; danh sách dòng cần xem xét và dòng thiếu nghĩa.
- Cảnh báo của từng thẻ đã được lưu vào `reviewIssues`; xem và sửa ở trang quản lý bộ thẻ (§5).
- Từ đây admin có thể bấm "✨ Tạo ví dụ" (§6).

## 3. Đọc PDF

| Loại PDF | Cách đọc |
|---|---|
| Có text layer | Đọc trực tiếp, không tốn AI. Cần bảng có cột STT |
| Text layer hỏng (rác do OCR cũ) | Phát hiện và bỏ trang đó, báo lỗi rõ |
| Scan (chỉ có ảnh) | OCR bằng dịch vụ AI có hỗ trợ ảnh. Không có dịch vụ nào → báo lỗi rõ |

**OCR PDF scan:**

- Mỗi trang render thành PNG (scale 2 ≈ 150 dpi) → gửi cho model → nhận JSON `{rows: […]}`.
- Tối đa 300 trang; 3 trang đọc song song; mỗi trang thử tối đa 4 lần.
- Kết quả cache theo hash nội dung file: nhập lại cùng file không OCR lần hai.

**Job đọc PDF:**

- Chạy trên server, lưu trong database (`pdfjobs`, `pdfjobpages`) nên sống qua F5, chuyển trang, và được chạy tiếp sau khi API khởi động lại.
- Có thanh tiến độ theo trang; hủy được.
- Admin xem từng trang (ảnh gốc bên trái, dữ liệu đọc được bên phải), đọc lại trang lỗi, hoặc xoá job.

## 4. Preview tính gì cho mỗi dòng

Nguyên tắc: **dữ liệu có sẵn trước, AI sau cùng.** Mỗi giai đoạn báo tiến độ và dừng được khi hủy.

**Trước hết — sửa ô bị tách đôi** (`repairSplitCells`, chạy ở cả preview và confirm): ghi chú trong ngoặc bị cắt ngang giữa cột cách đọc và cột nghĩa (ví dụ cách đọc `…)ふ`, nghĩa `…(sách`) được ghép về đúng ô; khoảng trắng chen giữa các ký tự Nhật (do PDF) được bỏ.

Sau đó lần lượt:

1. **Hán Việt** (`verifyHanViet`)
   - *Bảng kanji:* mọi chữ kanji của từ đều có trong bảng kanji của admin (hoặc `packages/shared/han-viet.json` cho chữ bảng chưa có) → tự điền / sửa ô, không tra thêm, không hỏi AI.
   - *Thẻ có sẵn:* nếu không, tìm thẻ cùng từ (ở mọi bộ) đã có Hán Việt. Ô trong file khớp → giữ; khác → dùng âm của thẻ có sẵn và cảnh báo "đã tự sửa thành …"; ô trống → điền.
   - *Bảng tra từng chữ:* không có thẻ cùng từ → ô trong file khớp bảng thì giữ.
   - *AI:* chỉ những ô còn chưa chắc (lệch bảng, hoặc trống mà bảng không có chữ đó). AI trả lời ô đó có phải một âm hợp lệ không (một chữ có thể có nhiều âm). Tối đa 200 từ mỗi lần.
2. **Cách đọc** (`knownOrAiReading`) — chỉ cho dòng không có cột cách đọc và từ có kanji: thẻ có sẵn → máy phân tích (kuromoji, kèm từ điển cách đọc đã học) → AI. Kết quả của máy phân tích chỉ được nhận khi toàn kana.
3. **Nghĩa** (`suggestMeanings`) — cho dòng nghĩa trống: thẻ cùng từ đã có nghĩa → AI (lô 20 từ, tối đa 100 từ mỗi lần). Thẻ nhận cảnh báo "nghĩa do AI gợi ý — cần kiểm tra". Không có AI và không có thẻ cùng từ → nghĩa để trống cho người học điền sau.
4. **AI kiểm tra lại thẻ** (`verifyCards`) — với từng thẻ hoàn chỉnh (cách đọc, Hán Việt, nghĩa đúng như sẽ lưu), AI chỉ trả về chỗ **sai rõ ràng** kèm gợi ý. Mỗi chỗ sai thành một cảnh báo dạng `cách đọc “…” có thể chưa đúng (AI gợi ý: …)`.
   - Nghĩa AI vừa viết ở bước 3 không kiểm tra lại (đã có cảnh báo riêng).
   - Trường đã có cảnh báo khác thì không thêm cảnh báo AI.
   - Thẻ giống hệt thẻ đã có trong database thì bỏ qua (đã kiểm tra lúc nhập trước).
   - Lô 15 thẻ, 3 lô song song, tối đa 600 thẻ mỗi lần; cache theo nội dung thẻ.
5. **Kiểm tra bằng luật** — nghĩa chứa chữ Nhật / ký tự lạ / từ nghi sai chính tả. Cách đọc trong file khác cách máy phân tích nhận ra: chỉ cảnh báo khi **không** có AI (có AI thì AI phán đoán ở bước 4, vì máy phân tích hay đọc sai, ví dụ 放っておく).
6. **Trùng** — khoá `(front, back, reading)`. Trùng với thẻ trong bộ hoặc với dòng trước đó trong file → bỏ qua và liệt kê.

Các trường còn lại: từ loại, ví dụ, STT lấy từ cột đã ánh xạ. Từ loại trống thì suy từ máy phân tích. Giá trị nhận: `verb` / `noun` / `adjective` / `phrase` (cụm từ, thành ngữ: `cụm từ`, `thành ngữ`, `慣用句`, `連語`, `expr`…).

### Confirm khác preview thế nào

| | Preview | Confirm |
|---|---|---|
| Ghi database | Không | Có |
| Gọi AI | Có | **Không** (`useAi = false`) |
| Bước 1–3 | Chạy đủ | Chạy lại, chỉ dùng database / máy phân tích / cache của preview |
| Bước 4 (`verifyCards`) | Chạy | Không chạy; dùng kết quả trong cache |

Nhờ cache theo từ và theo nội dung thẻ, confirm cho **cùng kết quả** với preview. Cache nằm trong bộ nhớ server: nếu API khởi động lại giữa preview và confirm, phần kết quả AI bị mất (§8, mục 4).

## 5. Cảnh báo cần xem xét

- **Hiển thị khi nhập:** bước 3 liệt kê dòng có cảnh báo; bước 4 liệt kê lại.
- **Lưu:** khi xác nhận, cảnh báo ghi vào `reviewIssues` của thẻ.
- **Trong bộ thẻ** (`/admin/decks/[id]`, `/learn/decks/[id]`): nút "⚠ Cần xem xét" (`?review=1`) lọc các thẻ có cảnh báo; mỗi cảnh báo hiện giá trị hiện tại → gợi ý.
  - **"Áp dụng":** sửa thẳng thẻ theo gợi ý (cách đọc / Hán Việt / nghĩa).
  - **"Bỏ qua":** đóng cảnh báo, giữ giá trị hiện tại.
  - Riêng cảnh báo cách đọc có thêm **"＋ Cách đọc phụ"** (giữ thêm cách đọc được gợi ý trên cùng thẻ) và **"⎘ Tách thẻ mới"** (tạo thẻ riêng cho cách đọc đó, dùng khi mỗi cách đọc một nghĩa).
  - **"Đã xem xét":** đóng mọi cảnh báo của thẻ (`reviewed: true`).
- **Hàng loạt:** "Áp dụng gợi ý tất cả / Bỏ qua tất cả" gọi `POST /flashcards/decks/:id/cards/review/resolve` với `field` (hanViet / reading / back), `action` (apply / dismiss), theo `ids` hoặc `filter`.

**Học từ "Bỏ qua" (chỉ cho cách đọc).** Bấm "Bỏ qua" ở cảnh báo *cách đọc* nghĩa là xác nhận cách đọc trên thẻ là đúng. Hệ thống thêm nó vào danh sách cách đọc của từ đó trong `reading_overrides`, kèm nghĩa của thẻ lúc đó (một từ có thể có nhiều cách đọc hợp lệ, ví dụ 人気 = にんき / ひとけ). Từ đó:

- `ReadingService.analyze` ưu tiên bảng này trước kuromoji.
- Thẻ đọc theo **một trong** các cách đã biết thì không còn bị cảnh báo — ở cả nhập file lẫn gợi ý trong bộ thẻ.
- AI cũng có thể gợi ý một danh sách cách đọc (`suggestReadings`).
- Khi kiểm tra lại cả deck, cách đọc đúng với từ nhưng đã được gắn với **nghĩa khác** sẽ bị cảnh báo "có vẻ thuộc nghĩa khác".
- Admin xem / xoá ở `/admin/reading-overrides` (`GET/DELETE /flashcards/admin/reading-overrides[/:word]`; thêm `?reading=` để chỉ quên một cách đọc).

Hán Việt và nghĩa **chưa** có cơ chế học tương tự.

## 6. Tạo câu ví dụ

Tách khỏi việc nhập. Admin bấm **"✨ Tạo ví dụ"** ở trang kết quả hoặc trang quản lý bộ thẻ:

- Job chạy nền trên server cho các thẻ chưa có ví dụ; thanh tiến độ nổi ở góc phải dưới với nút tạm dừng / tiếp tục / dừng (`POST /flashcards/import/examples/:deckId/:action`, `action` = `retry` để bắt đầu, `pause`, `resume`, `stop`).
- Mỗi thẻ thử lần lượt: cặp câu Nhật–Việt Tatoeba → câu Nhật Tatoeba + AI dịch → AI viết (kuromoji kiểm tra câu có thật sự dùng từ đó).
- Job dang dở được chạy tiếp sau khi API khởi động lại.
- **"AI chưa dùng":** thẻ vẫn trống ví dụ dù AI đã trả lời (câu bị bộ kiểm tra chặn, kèm lý do) → admin xem và thêm tay ở `/admin/decks/[id]`.

## 7. Tiến độ, popup và hủy

Có **hai loại** tác vụ nền, đừng nhầm:

| | Lượt preview / confirm | Job đọc PDF |
|---|---|---|
| Lưu ở | Bộ nhớ server | Database |
| Sau khi restart API | Mất | Chạy tiếp |
| Endpoint | `/flashcards/import/progress[/:id]` | `/flashcards/import/jobs[/:id]` |
| Server giữ sau khi xong | 10 phút | Đến khi xoá |

**Lượt preview / confirm:**

- Giao diện sinh `progressId`, gửi kèm form, rồi gọi `GET /flashcards/import/progress/:id` mỗi 0,7 giây để vẽ thanh tiến độ trong wizard.
- **Popup nổi** (`ImportJobTracker`, cùng chỗ với tiến độ PDF): tên file, giai đoạn đang chạy, %, nút Hủy. Chuyển trang khác vẫn theo dõi được vì lượt chạy nằm ở server.
- Khi xong, popup hiện "Đã kiểm tra xong · Xem kết quả →": mở lại wizard (`?task=id`), khôi phục file / ánh xạ từ bản nháp rồi chạy lại preview (nhanh nhờ cache).
- Popup chỉ hiện khi có giai đoạn tra cứu. Lượt chỉ đọc tên cột không có số liệu nên wizard chỉ hiện thanh chờ.
- **Hủy** (từ wizard hoặc popup): `DELETE /flashcards/import/progress/:id`; server dừng ở bước kế tiếp và trả `409 Đã hủy` (wizard bỏ qua lỗi này).
- Chỉ chủ của lượt chạy mới xem / hủy được.

**Job PDF:** nút ✕ trên thẻ job đã xong **xoá job khỏi database** (kèm các trang đã lưu), không chỉ ẩn thẻ.

## 8. Hạn chế đã biết

Hành vi hiện tại, chưa quyết định có sửa hay không:

1. **Cách đọc do AI điền** (bước 2 của §4) không có cảnh báo riêng; chỉ khi AI kiểm tra lại (bước 4) thấy sai mới có cảnh báo.
2. **Nghĩa lấy từ thẻ có sẵn vẫn mang cảnh báo "do AI gợi ý"** — nên tách thành "lấy từ thẻ có sẵn"?
3. **Với từ có chữ nằm ngoài bảng kanji, thẻ có sẵn được tin hơn cả bảng tra lẫn ô trong file:** thẻ cũ lưu sai sẽ "sửa" nhầm ô đúng trong file.
4. **Cache trong bộ nhớ server** (cách đọc, nghĩa, Hán Việt, kiểm tra thẻ): mất khi restart, không chia sẻ giữa nhiều instance.
5. **Giới hạn mỗi lần:** 200 từ Hán Việt, 100 từ nghĩa, 600 thẻ cho AI kiểm tra lại. Phần vượt **không được kiểm tra** và không có thông báo riêng.
6. **Khớp nghĩa theo từ nguyên văn:** thẻ ghi "洗練（する）" không khớp "洗練" trong file.
7. **Hủy khi đang xác nhận** chỉ dừng được ở giai đoạn tra cứu; khi đã bắt đầu ghi thẻ thì không dừng giữa chừng.
8. **Rời trang đúng lúc đang đọc tên cột** (trước khi lượt kiểm tra bắt đầu) thì lượt kiểm tra không tự chạy; quay lại bấm "Đọc file" là được.
9. **Khi không có AI:** Hán Việt chỉ theo bảng kanji / thẻ có sẵn, cách đọc theo máy phân tích, nghĩa trống không có gợi ý, không có bước kiểm tra lại — nhập vẫn chạy.
10. **Số lần gọi AI tăng mạnh với file lớn** (bước kiểm tra lại quét mọi thẻ); cân nhắc giới hạn theo kích thước file hoặc cho người dùng tắt bước này.

## 9. API

Tiền tố chung: `/flashcards/import`.

| Method | Đường dẫn | Việc |
|---|---|---|
| POST | `/preview` | Xem trước (không ghi). Không kèm ánh xạ → chỉ trả tên cột |
| POST | `/confirm` | Nhập (idempotent) |
| GET | `/progress` | Các lượt preview / confirm của tôi (cho popup) |
| GET / DELETE | `/progress/:id` | Tiến độ / hủy một lượt |
| POST | `/jobs` | Bắt đầu đọc PDF nền |
| GET | `/jobs`, `/jobs/:id` | Danh sách / tiến độ job PDF |
| DELETE | `/jobs/:id` | Hủy và xoá job PDF |
| GET | `/jobs/:id/pages/:n`, `/jobs/:id/pages/:n/image` | Dữ liệu / ảnh của một trang |
| POST | `/jobs/:id/retry`, `/jobs/:id/pages/:n/retry` | Đọc lại job / một trang |
| POST | `/examples/:deckId/:action` | `retry` / `pause` / `resume` / `stop` job tạo ví dụ |
| GET | `/decks/:deckId/review` | Bản kiểm tra từng trang lưu cùng bộ thẻ |

Cổng Next `/api/import`:

| Method | Tham số | Việc |
|---|---|---|
| POST | `?action=preview` / `confirm` / `job` / `retry` | Chuyển tiếp tới API |
| GET | `?job=`, `?progress=`, `?tasks=1` | Job PDF / tiến độ một lượt / danh sách lượt |
| DELETE | `?job=`, `?progress=` | Xoá job PDF / hủy lượt |
