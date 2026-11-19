# ADR-srs — Thuật toán lặp lại ngắt quãng (SRS)

> **Trạng thái:** `Accepted` — chốt cùng P3-SRS-01 (03/11/2026).
> **Cập nhật 18/11/2026 (commit `3b7141c`): thuật toán đang chạy là FSRS-4.5**, không còn SM-2 — xem mục "Cập nhật: chuyển sang FSRS-4.5" ngay dưới. Các mục SM-2 bên dưới giữ lại làm lịch sử quyết định.
> **Quyết định bởi:** Tôi (sản phẩm) + [CC] (thiết kế kỹ thuật).
> **Phạm vi:** P3 (Flashcards & SRS). Chốt Q-03; cập nhật dòng "Thuật toán
> SRS (chưa chốt)" trong `database.md` §4. (Không trùng với ADR-002 của
> plan §9 — cái đó là bộ phân tích hình thái cho P7; file này theo
> quy ước đặt tên `ADR-<domain>.md` như `ADR-auth-provider.md`.)

## Cập nhật: chuyển sang FSRS-4.5 (18/11/2026)

Lối thoát đã dự phòng ở bản đầu (state versioned) được dùng đúng như thiết kế:

- `src/srs/srs.algorithm.ts` (hàm thuần, không đồng hồ/IO/timezone) cài FSRS-4.5; 4 nút đánh giá giữ nguyên: `AGAIN`=0, `HARD`=1, `GOOD`=2, `EASY`=3. Độ nhớ có `stability` (ngày để retrievability tụt từ 100% về 90%) và `difficulty` (1–10); lịch kế tiếp nhắm retention 90%.
- `state` mới: `schemaVersion: 2`, `algorithm: "fsrs"`, thêm `stability`, `difficulty`, `lastReviewAt` (epoch ms). Các trường `ease` (suy ra từ `difficulty`), `repetitions`, `intervalDays`, `lapses` vẫn được ghi để phân loại hàng đợi (mới / đến hạn / khó nhớ / đã thuộc) không đổi.
- Thẻ SM-2 cũ (`schemaVersion: 1`, không có `stability`) **nâng cấp lười** ở lần ôn kế tiếp; không có migration hàng loạt.
- ~~Bản sao thuật toán phía client~~ — đã bỏ (NP-115): API và UI cùng import `@nihongo/shared/srs`. Test hành vi: `srs.algorithm.spec.ts`.
- Day anchoring theo timezone (`srs.days.ts`) và ghi đa thiết bị không đổi.
- **Chưa làm:** tối ưu tham số FSRS theo dữ liệu thật (đang dùng tham số mặc định) và đo chất lượng lịch ôn so với SM-2.

## Cập nhật: FSRS-6 (NP-115, 19/11/2026)

- Thư viện `ts-fsrs` **6.0.0** (MIT), ghim chính xác trong `packages/shared` (và devDependency của API cho test đối chiếu). 21 tham số mặc định lấy từ `default_w` của thư viện, không chép tay.
- Adapter `packages/shared/srs/index.ts` (build ra `dist/`, `pnpm -r build` build gói này trước app): `advanceSrs(prev, {grade, now}, params?)`, `previewIntervals`. `enable_short_term: false`, không fuzz; AGAIN → học lại 10 phút do adapter, giữ `intervalDays` (UX không đổi).
- `SrsState.schemaVersion: 3`, `algorithm: "fsrs6"`. Nâng lười: v2 dùng thẳng `stability`/`difficulty` (cùng nghĩa: S = số ngày R còn 90%); v1 (SM-2) như cũ (S = interval, D từ ease). Không migration hàng loạt.
- Số đo lệch lịch (S=20, D=5, ôn GOOD đúng hạn): FSRS-4.5 → 66 ngày, FSRS-6 → 59 ngày (−11%, trong ±25%).
- Lượt ôn đầu: GOOD = 3 ngày (trước đây 4).
- Nhật ký lượt ôn: `srs_review_logs` (NP-114), ghi `algorithm: "fsrs-6"`.
 03/11/2026)

Spec §4.4 yêu cầu lập lịch ôn theo phản hồi + lịch sử thẻ, "thuật toán cụ
thể là **chưa quyết định**; so sánh phương án, mô tả dữ liệu cần lưu và test
hành vi trước khi đổi". Q-03 liệt kê SM-2, FSRS, hoặc tự thiết kế. Đổi
thuật toán sau khi có dữ liệu người dùng thật rất tốn (risky với lịch ôn
đã tính), nên quyết định phải kèm **lối thoát migration**.

## So sánh phương án

| Tiêu chí | SM-2 | FSRS |
|---|---|---|
| Độ phức tạp | Thấp (EF + interval, ~20 dòng thuần) | Cao (bộ tham số, tối ưu hoá) |
| Dữ liệu cần lưu | `ease`, `reps`, `interval`, do hạn | thêm `due`, `stability`, `difficulty` + tham số |
| Kiểm chứng hành vi | Cùng chuỗi phản hồi → cùng lịch (deterministic, dễ test T-P3-04) | Cần benchmark dữ liệu lớn mới thấy lợi ích |
| Đổi sau này | State không đủ cho FSRS (thiếu stability) | — |
| Phù hợp MVP | ✅ Dễ triển khai, dễ thay thế | ❌ Cần nhiều dữ liệu trước khi chính xác hơn |

## Lựa chọn

- **SM-2 (Anki-thuật toán) cho MVP**, 4 nút đánh giá ứng với chất lượng:
  `Lặp lại (AGAIN, q=0)` · `Khó (HARD, q=2)` · `Tốt (GOOD, q=3)` ·
  `Thuộc (EASY, q=5)`.
- **Dự phòng FSRS:** state được lưu **versioned** —
  `state = { schemaVersion: 1, algorithm: "sm2", ease, repetitions,
  intervalDays, lapses }` embed trong `user_card_progress`. Khi FSRS được
  duyệt, thêm `schemaVersion: 2` + tham số FSRS, đọc state cũ qua
  `schemaVersion` (không migrate phá bản ghi cũ).

### Luồng SM-2 (như đã implement ở `src/srs/srs.algorithm.ts`)

- `ease` khởi tạo 2.5; sau mỗi đánh giá:
  `EF' = EF + (0.1 − (5−q)·(0.08 + (5−q)·0.02))`, sàn 1.3.
- Lapse (AGAIN): `repetitions` về 0, học lại sau **10 phút** trong cùng
  phiên (không phải ngày mai), `lapses += 1`.
- Interval: rep 1 → 1 ngày, rep 2 → 6 ngày, sau đó `round(prev·EF)` (sàn
  1 ngày).
- **Day anchoring (P3-SRS-05):** do hạn được đặt ở **0h00 ngày hôm sau theo
  timezone hồ sơ user** (`Intl.DateTimeFormat`, không bao giờ UTC ngầm) —
  2 user 2 timezone ôn cùng thời điểm vẫn có do hạn đúng lịch ngày của từng
  người. Đổi tz hồ sơ → chỉ ảnh hưởng lịch *tương lai* (T-P3-12).

## Ưu / nhược

- **Ưu:** đơn giản, deterministic (test T-P3-04 "cùng chuỗi phản hồi → cùng
  dueDate" chạy được bằng hàm thuần), hợp lệ ngay cho MVP, module `srs` tách
  riêng nên thay thuật toán không đụng schema deck/card.
- **Nhược:** SM-2 không tối ưu hơn FSRS về độ chính xác dài hạn; phải theo
  dõi chất lượng lịch trước khi cân nhắc FSRS thật.

## Quyết định

Chốt **SM-2** + state versioned cho FSRS. Người dùng chỉnh tz qua
`PATCH /users/me { timezone }` (validate IANA, mặc định `Asia/Ho_Chi_Minh`).

## Hậu quả / nguồn cần kiểm tra

- Collection `user_card_progress` + `study_sessions` (database.md §2/§3).
- UI 4 nút đánh giá + phím tắt 0–3 (P3-UI-01, `study-session.tsx`).
- ADR-002 của plan §9 (bộ phân tích + SRS): phần SRS nay do file này
  `Accepted`; phần bộ phân tích hình thái (Kuromoji vs Sudachi) vẫn
  `Proposed` tới P7.
