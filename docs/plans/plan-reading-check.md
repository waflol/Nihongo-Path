# Plan: tăng tốc & chính xác hóa kiểm tra cách đọc (recheck deck)

Trạng thái: **đã triển khai** giai đoạn 1, 2, 3 (4.1, 4.2) ở `runRecheck`; đã làm cả 4.3 (nút "＋ Cách đọc phụ" và "⎘ Tách thẻ mới" trên cảnh báo cách đọc, PATCH thẻ có `learnReading`); chưa đo thời gian thực tế.
Đã thêm: `RECHECK_CONCURRENCY` (mặc định 2), 1 recheck/server (trả 409), `?force=1` + ô "Kiểm tra lại cả thẻ đã kiểm tra", `readingChecked`/`backChecked` trên thẻ, `readingMeanings` trong `reading_overrides`.
Môi trường: server 2 vCPU / 4 GB RAM, AI là dịch vụ ngoài (API cloud hoặc Ollama ở máy khác).

## 1. Vấn đề

`runRecheck` ([flashcards.service.ts](../../apps/api/src/flashcards/flashcards.service.ts), ~dòng 1118) chạy tuần tự:

1. Mỗi batch 15 thẻ gọi AI một lần, xong mới sang batch sau (điểm nghẽn chính).
2. `morph.analyze` (kuromoji) gọi lần lượt từng thẻ.
3. Mỗi thẻ đổi là một `updateOne`.
4. Lần nào cũng kiểm tra lại toàn bộ thẻ, kể cả thẻ không đổi.

Về độ đúng: kiểm tra dùng `some(...)` nên thẻ chỉ cần một cách đọc hợp lệ là qua; `reading_overrides` chỉ lưu `từ → readings[]`, không biết cách đọc nào đi với nghĩa nào.

## 2. Giai đoạn 1 — Tăng tốc (không đổi hành vi)

| # | Việc | Ghi chú |
|---|------|---------|
| 1.1 | Pool chạy song song N batch AI, `RECHECK_CONCURRENCY` (mặc định 2, tối đa 4) | Giữ nguyên pause/cancel; `job.done` tính theo batch đã xong |
| 1.2 | `bulkWrite` một lần mỗi batch | Thay các `updateOne` rời |
| 1.3 | Cache kết quả `morph.analyze` theo từ trong một lần chạy | **Không** song song hóa kuromoji (CPU/RAM hạn chế) |
| 1.4 | Nhường event loop (`setImmediate`) giữa các batch | API không bị đơ |
| 1.5 | Giới hạn 1 recheck chạy cùng lúc toàn server | Tránh nhiều deck gọi AI chồng nhau |

Rủi ro: thấp. Kết quả kiểm tra giữ nguyên.

## 3. Giai đoạn 2 — Giảm số thẻ phải hỏi AI

| # | Việc | Ghi chú |
|---|------|---------|
| 2.1 | Tra thêm `reading_overrides` trước khi hỏi AI | Từ đã học thì khỏi hỏi |
| 2.2 | Cache theo từ trong deck | Từ trùng chỉ hỏi một lần |
| 2.3 | Dấu "đã kiểm tra": `readingCheckedHash = hash(front + reading)` trên thẻ | Lần sau chỉ kiểm tra thẻ mới/đã sửa; giữ nút "kiểm tra lại tất cả" |

Rủi ro: trung bình (thêm field vào schema thẻ, cần migration nhẹ/field tùy chọn).

## 4. Giai đoạn 3 — Nhiều cách đọc

### 4.1 Cùng một nghĩa (昨日 きのう / さくじつ) — giữ một thẻ
- Đổi kiểm tra từ `some` sang **từng cách đọc**: chỉ cảnh báo những cách không hợp lệ ("cách đọc “まちがい” không hợp lệ").
- Cách đọc đứng đầu là cách đọc chính.

### 4.2 Mỗi cách đọc một nghĩa (人気 にんき / ひとけ) — tách thẻ
- Đổi `reading_overrides.readings` từ `string[]` sang `{ reading, meaning? }[]`; dữ liệu cũ vẫn đọc được (meaning trống).
- Khi bấm "Bỏ qua" ở cảnh báo, lưu kèm nghĩa của thẻ.
- Từ có từ 2 cách đọc trở lên có nghĩa gắn kèm: so khớp thêm nghĩa, cảnh báo "cách đọc khớp từ nhưng có vẻ thuộc nghĩa khác".
- Chỉ những từ này gửi AI cả `(word, reading, meaning)`.

### 4.3 Giao diện
- Khi AI gợi ý nhiều cách đọc, hỏi kèm nghĩa để phân loại: giống nghĩa → gợi ý gộp; khác nghĩa → gợi ý tách.
- Hai nút trong thẻ: "Thêm làm cách đọc phụ" và "Tách thành thẻ mới".

## 5. Thứ tự đề xuất

1. Giai đoạn 1 (1.1–1.5) + sửa `some` ở 4.1 → nhanh hơn, ít rủi ro, không đổi schema.
2. Giai đoạn 2 (2.1–2.3).
3. 4.2 rồi 4.3 (làm nếu deck có nhiều từ thuộc loại "mỗi cách đọc một nghĩa").

## 6. Kiểm thử
- Test đơn vị cho kiểm tra từng cách đọc (mở rộng `reading-multi.spec.ts`, `reading-variants.spec.ts`).
- Test pool song song: pause/cancel giữa chừng, lỗi AI ở một batch.
- Đo thời gian recheck deck mẫu trước/sau (đo thật, chưa có số liệu).

## 7. Câu hỏi còn mở
- AI đang dùng API cloud hay Ollama máy khác? (quyết định mức concurrency mặc định)
- Deck có nhiều từ kiểu "mỗi cách đọc một nghĩa" không? (quyết định có làm 4.2/4.3 không)
- Có chấp nhận thêm field `readingCheckedHash` vào thẻ không?
