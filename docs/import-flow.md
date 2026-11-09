# Flow: Nhập flashcard hàng loạt

Tài liệu mô tả luồng nhập thẻ từ file (CSV / XLSX / PDF) vào một bộ thẻ, để xem xét.
Code chính: `apps/ui/components/admin/import-wizard.tsx` (wizard),
`apps/ui/app/api/import/route.ts` (cổng Next), `apps/api/src/import/import.service.ts` + `import.controller.ts` (API).

## 1. Tổng quan

```
Chọn file + bộ thẻ ──► Đọc file (nháp) ──► Ánh xạ cột ──► Xem trước & xác nhận ──► Kết quả
     (bước 1)            tự chạy kiểm tra     (bước 2)          (bước 3)              (bước 4)
```

Bước hiển thị suy ra từ state: `kết quả → 4`, `có preview và đã review → 3`, `có preview → 2`, còn lại `→ 1`.
Không có bước nào ghi thẻ vào database ngoài **Xác nhận nhập** (bước 3).

| Giới hạn | Giá trị |
|---|---|
| CSV / XLSX | ≤ 10 MB |
| PDF | ≤ 50 MB |

## 2. Từng bước

### Bước 1 — Chọn file và bộ thẻ đích
- Chọn file, chọn bộ thẻ có sẵn hoặc tạo bộ mới ngay trong wizard (bộ mới ở trạng thái nháp đến khi sinh xong câu ví dụ).
- Bản nháp (file, bộ thẻ, ánh xạ) được giữ trong IndexedDB (`lib/import-draft.ts`) nên F5 không mất.
- **PDF**: bấm "Đọc file" tạo một *job* chạy nền (OCR bằng AI có hỗ trợ ảnh nếu là PDF scan), có thanh tiến độ theo trang, hủy được, chuyển trang khác vẫn chạy. Khi job xong, wizard tự chạy preview như bên dưới. Kết quả đọc được cache theo hash file.
- **CSV / XLSX**: bấm "Đọc file (nháp, chưa nhập)" gọi `POST /flashcards/import/preview` **không kèm ánh xạ** → server chỉ trả tên cột và số dòng.

### Đọc file nháp tự kiểm tra
Ngay sau khi có tên cột, giao diện **tự đoán ánh xạ** theo tên cột (front / back / hanViet / reading / pos / example…).
Nếu đoán được cả cột từ vựng và cột nghĩa, nó chạy luôn preview đầy đủ với ánh xạ đó (mục 3) rồi sang bước 3.
Nếu không, dừng ở bước 2 để người dùng tự chọn cột.

### Bước 2 — Ánh xạ cột
- Chọn cột cho: từ (bắt buộc), nghĩa (bắt buộc), STT, Hán Việt, tags, cách đọc, từ loại, ví dụ, nghĩa ví dụ.
- "Tiếp tục: xem trước" gọi preview kèm ánh xạ. Trong lúc chạy vẫn **ở lại bước 2** và hiện thanh tiến độ + nút Hủy.

### Bước 3 — Xem trước & xác nhận
- Bảng từng dòng với trạng thái `ok` / `error` / `duplicate`; dòng bị loại hiện trong panel lỗi.
- Dòng có cảnh báo (`issues`) cần xem lại: nghĩa lạ, Hán Việt lệch, cách đọc lệch, nghĩa trống, nghĩa do AI gợi ý.
- **Xác nhận nhập N thẻ** gọi `POST /flashcards/import/confirm`: dựng lại đúng các dòng của preview rồi ghi thẻ. Các bước **AI** (gợi ý nghĩa / Hán Việt / cách đọc, kiểm tra lại thẻ) **chỉ chạy ở preview sau khi ánh xạ cột**; confirm chỉ dùng lại kết quả đã có trong cache + database, không gọi AI lại.
- Trùng: luôn **bỏ qua**, không ghi đè thẻ có sẵn.

### Bước 4 — Kết quả
- Số thẻ đã nhập / bỏ qua trùng / lỗi, danh sách dòng cần xem xét và dòng thiếu nghĩa.
- Nếu có thẻ cần câu ví dụ, job sinh ví dụ chạy nền (có thanh tiến độ nổi, tạm dừng / tiếp tục / dừng).
- Thẻ có cảnh báo được lưu `reviewIssues`; xem lại và sửa ở trang quản lý bộ thẻ (nút "Áp dụng" / "Bỏ qua").

## 3. Preview / Confirm làm gì cho mỗi dòng

Preview chạy đủ đường tính (`rowExtras` → `extras` → `suggestMeanings` → `verifyCards`, có AI); confirm chạy lại `rowExtras` + `suggestMeanings` với `useAi = false` (chỉ database / máy phân tích / cache của preview, **không gọi AI**, không chạy `verifyCards`) nên **cho cùng kết quả**
(các cache trong server giữ kết quả theo từ / theo nội dung thẻ, không gọi AI lại).
Nguyên tắc chung: **database trước, AI sau cùng**. Mỗi giai đoạn báo tiến độ và dừng được khi hủy.

1. **Kiểm tra Hán Việt** (`verifyHanViet`)
   - *Database*: thẻ cùng từ (mọi bộ) có Hán Việt → ô trong file khớp thì giữ; khác thì dùng âm của database và cảnh báo "đã tự sửa thành …"; ô trống thì điền.
   - *Bảng tra* `packages/shared/han-viet.json`: từ database không có → ô khớp bảng thì giữ.
   - *AI*: chỉ những ô bảng không chắc (lệch bảng, hoặc ô trống mà bảng không có chữ đó). AI nói ô có phải một âm hợp lệ không (một chữ có thể nhiều âm).
2. **Cách đọc** (`knownOrAiReading`, chỉ cho dòng không có cột cách đọc, từ có kanji): **database → máy phân tích → AI**. Kết quả máy phân tích chỉ nhận khi toàn kana; còn sót kanji coi là không chính xác.
3. **Nghĩa** (`suggestMeanings`, dòng nghĩa trống): **database** (thẻ cùng từ có nghĩa) → **AI** (lô 20, tối đa 100 từ/lần). Thẻ nhận cảnh báo "nghĩa do AI gợi ý — cần kiểm tra" (nghĩa lấy từ database hiện cũng mang cảnh báo này).
4. **AI kiểm tra lại thẻ** (`verifyCards`) — *trước khi hiển thị*: với từng thẻ hoàn chỉnh (cách đọc, Hán Việt, nghĩa như sẽ lưu), AI chỉ trả về chỗ **sai rõ ràng** kèm gợi ý. Mỗi chỗ sai thành một cảnh báo dạng `cách đọc “…” có thể chưa đúng (AI gợi ý: …)`, tương tự cho Hán Việt và nghĩa.
   - Nghĩa do AI vừa viết ở bước 3 không kiểm tra lại (đã có cảnh báo riêng).
   - Một trường đã có cảnh báo khác thì không thêm cảnh báo AI.
   - Lô 15 thẻ, 3 lô chạy song song, tối đa 600 thẻ/lần; kết quả cache theo nội dung thẻ. Thẻ giống hệt thẻ đã có trong database thì bỏ qua (đã được kiểm tra lúc nhập).
5. **Kiểm tra còn lại** (`reviewIssues`): nghĩa chứa chữ Nhật / ký tự lạ / từ nghi sai chính tả; cách đọc trong file khác cách đọc máy nhận ra (chỉ khi không có AI — có AI thì AI phán đoán ở bước 4, vì máy phân tích hay đọc sai, vd 放っておく).
6. **Trùng**: khóa `(front, back, reading)`; trùng với thẻ trong bộ hoặc dòng trước đó trong file → bỏ qua và liệt kê.

Từ loại, ví dụ, STT lấy từ cột đã ánh xạ; từ loại trống thì suy từ máy phân tích. Từ loại nhận: `verb` / `noun` / `adjective` / `phrase` (cụm từ, thành ngữ: `cụm từ`, `thành ngữ`, `慣用句`, `連語`, `expr`…).

**Sửa ô bị tách đôi** (`repairSplitCells`, chạy trước mọi bước ở cả preview và confirm): ghi chú trong ngoặc bị cắt ngang giữa cột cách đọc và cột nghĩa (vd cách đọc `…)ふ`, nghĩa `…(sách`) được ghép lại về đúng ô; khoảng trắng chen giữa các ký tự Nhật (do PDF) được bỏ.

### Cảnh báo được báo và lưu thế nào
- **Hiển thị**: ở bước 3 mỗi dòng có cảnh báo hiện trong danh sách "cần xem xét"; ở bước 4 liệt kê lại.
- **Lưu**: khi xác nhận nhập, cảnh báo ghi vào `reviewIssues` của thẻ.
- **Học lại từ "Bỏ qua"**: nếu bấm "Bỏ qua" ở cảnh báo *cách đọc*, hệ thống coi cách đọc đang có trên thẻ là đúng và ghi vào collection `reading_overrides` (từ → hiragana). `ReadingService.analyze` ưu tiên bảng này, nên máy phân tích đọc đúng từ đó từ nay (cả ở import lẫn gợi ý trong bộ thẻ). Hán Việt và nghĩa chưa có cơ chế học. Admin xem và xóa các từ đã học ở `/admin/reading-overrides` (API `GET/DELETE /flashcards/admin/reading-overrides[/:word]`).
- **Trong bộ thẻ**: trang quản lý bộ thẻ hiện khung "Cần xem xét" với giá trị hiện tại → gợi ý. Cảnh báo do AI mang theo gợi ý của nó, nên "Áp dụng" sửa thẳng thẻ (cách đọc / Hán Việt / nghĩa), "Bỏ qua" đóng cảnh báo.

## 4. Tiến độ, popup và hủy (preview / confirm)

- Giao diện sinh `progressId`, gửi kèm form preview / confirm, và gọi `GET /flashcards/import/progress/:id` mỗi 0,7 giây để vẽ thanh tiến độ ngay trong wizard (bước 1, 2, 3).
- **Popup nổi** (`ImportJobTracker`, cùng chỗ với tiến độ PDF): hiện tên file, giai đoạn đang chạy, % và nút Hủy; qua trang khác vẫn theo dõi vì lượt chạy nằm ở server. Danh sách lấy từ `GET /flashcards/import/progress`.
  - Xong: thẻ "Đã kiểm tra xong · Xem kết quả →" mở lại wizard (`?task=id`), khôi phục file / ánh xạ từ bản nháp rồi chạy lại xem trước (nhanh nhờ cache).
  - Server giữ lượt đã xong 10 phút.
- Hủy (wizard hoặc popup): `DELETE /flashcards/import/progress/:id`, server dừng ở bước kế tiếp (trả `409 Đã hủy`, wizard bỏ qua lỗi này).
- Thẻ job PDF đã xong: nút ✕ **xoá job khỏi database** (kèm các trang đã lưu) chứ không chỉ ẩn thẻ (`DELETE /api/import?job=`).
- Popup chỉ hiện khi có giai đoạn tra cứu (có từ cần tra / kiểm tra). Đọc cột thuần không có số liệu: wizard hiện thanh chờ.
- Chỉ chủ của lượt chạy mới đọc / hủy được. Tiến độ nằm trong bộ nhớ server (mất khi restart).
- Khác với job PDF: job PDF có `GET/DELETE /import/jobs/:id`, lưu database, sống qua F5.

## 5. API

| Method | Đường dẫn | Việc |
|---|---|---|
| POST | `/flashcards/import/jobs` | Bắt đầu đọc PDF nền |
| GET | `/flashcards/import/jobs`, `/jobs/:id` | Danh sách / tiến độ job |
| DELETE | `/flashcards/import/jobs/:id` | Hủy job |
| POST | `/flashcards/import/jobs/:id/retry`, `/pages/:n/retry` | Đọc lại trang |
| POST | `/flashcards/import/preview` | Xem trước (không ghi) |
| POST | `/flashcards/import/confirm` | Nhập (idempotent) |
| GET | `/flashcards/import/progress` | Các lượt kiểm tra của tôi (cho popup nổi) |
| GET / DELETE | `/flashcards/import/progress/:id` | Tiến độ / hủy một lượt preview-confirm |
| POST | `/flashcards/import/examples/:deckId/:action` | pause / resume / stop / retry sinh ví dụ |
| GET | `/flashcards/import/decks/:deckId/review` | Bản kiểm tra từng trang lưu cùng bộ thẻ |

Cổng Next `/api/import`: `?action=preview|confirm|job|retry` (POST), `?job=`, `?progress=` (GET / DELETE), `?tasks=1` (GET danh sách).

## 6. Điểm cần xem xét

1. Cách đọc do AI gợi ý ở bước 2 (điền ô trống) chưa có cảnh báo riêng; chỉ khi bước 4 (AI kiểm tra lại) thấy sai mới có cảnh báo.
2. Nghĩa lấy từ database vẫn mang cảnh báo "do AI gợi ý" — nên tách thành "lấy từ thẻ có sẵn"?
3. Database được tin hơn bảng tra Hán Việt: thẻ có sẵn lưu sai sẽ "sửa" nhầm ô đúng trong file.
4. Giới hạn mỗi lần: 200 từ Hán Việt, 100 từ nghĩa, 600 thẻ cho AI kiểm tra lại; phần vượt không được kiểm tra.
5. Cache trong bộ nhớ server (cách đọc, nghĩa, Hán Việt, kiểm tra thẻ): mất khi restart, không chia sẻ giữa nhiều instance.
6. Nghĩa trong database khớp theo từ nguyên văn; thẻ ghi "洗練（する）" không khớp "洗練" trong file.
7. Hủy khi đang "Xác nhận nhập" chỉ dừng được ở giai đoạn tra cứu; khi đã ghi thẻ thì không dừng giữa chừng.
8. Rời trang đúng lúc đang đọc cột (trước khi lượt kiểm tra bắt đầu) thì lượt kiểm tra không tự chạy; quay lại bấm "Đọc file" là xong.
9. Khi AI không khả dụng: Hán Việt chỉ theo database/bảng tra, cách đọc theo máy phân tích, nghĩa trống không có gợi ý, không có bước kiểm tra lại — import vẫn chạy.
10. Số lần gọi AI tăng đáng kể với file lớn (thêm bước kiểm tra lại mọi thẻ); cân nhắc giới hạn theo kích thước file hoặc cho người dùng tắt bước này.
