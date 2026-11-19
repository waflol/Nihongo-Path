# Plan — Nâng SRS từ FSRS-4.5 lên FSRS-6 + tối ưu tham số theo người học

> **Ngày lập:** 19/11/2026. **Người lập:** [CC]. **Người thực hiện:** agent khác (plan tự đủ).
> **Trạng thái:** chưa bắt đầu. **Liên quan:** [ADR-srs](../adr/ADR-srs.md) (mục "Chưa làm"), [NP-026](../issues/NP-026.md), [NP-101](../issues/NP-101.md), issue GitHub #2.

## 1. Mục tiêu

1. **Ghi nhật ký từng lượt ôn** — điều kiện bắt buộc để đo và tối ưu; hiện **chưa có** (xem §2).
2. **Chuyển lịch ôn sang FSRS-6** với tham số mặc định: 21 tham số, độ dốc đường quên học được (`w20`), xử lý ôn lại trong ngày (`w17`–`w19`).
3. **Tối ưu tham số theo từng người học** khi đủ dữ liệu, chỉ dùng bộ mới nếu đo được tốt hơn.
4. **Một bản thuật toán duy nhất** cho API và UI (bỏ bản sao tay trong `study-session.tsx`).

Ngoài phạm vi: cho người học tự chọn tỉ lệ nhớ mục tiêu (desired retention) trên UI — để tham số `requestRetention` sẵn (mặc định 0,9), làm UI sau.

## 2. Hiện trạng (đã khảo sát 19/11)

| Thành phần | File | Ghi chú |
|---|---|---|
| Thuật toán | `apps/api/src/srs/srs.algorithm.ts` | FSRS-4.5 viết tay, 17 tham số mặc định, `DECAY = -0.5`, `FACTOR = 19/81`. Hàm thuần `advanceSrs(prev, {grade, now})`. Lượt AGAIN → học lại sau 10 phút, `intervalDays` giữ nguyên. |
| Bản sao client | `apps/ui/components/learn/study-session.tsx` (dòng ~45–145) | Chép tay cùng công thức + tham số, chú thích "MUST stay in lockstep". Dùng để hiện khoảng cách trên nút và cập nhật lạc quan. |
| Trạng thái thẻ | `apps/api/src/srs/schemas/progress.schema.ts` | `user_card_progress.state` = `SrsState` (`schemaVersion` 1 = SM-2, 2 = FSRS), một document / (user, card). |
| Ghi lượt ôn | `apps/api/src/srs/srs.service.ts` `reviewBatch()` (~dòng 826) | Mọi lượt trong một batch dùng **cùng `now = Date.now()` của server** — thời điểm thật của từng lượt bị mất khi client gom lượt rồi gửi sau. Không có id lượt ôn → client gửi lại batch khi lỗi mạng sẽ áp dụng hai lần. |
| Phiên học | `apps/api/src/srs/schemas/session.schema.ts` | Chỉ có **histogram điểm** theo ngày — **không có nhật ký từng lượt**. |
| Test | `apps/api/src/srs/srs.algorithm.spec.ts` | 6 test hành vi FSRS-4.5. |
| Gói dùng chung | `packages/shared` (`@nihongo/shared`) | Hiện chỉ chứa `han-viet.json`, exports dạng JSON. |
| DTO | `apps/api/src/srs/srs.controller.ts` `ReviewDto`, `BatchReviewItemDto`, `BatchReviewDto`; route `POST srs/reviews`, `POST srs/reviews/batch` | |

## 3. Ràng buộc

1. **VPS 4 GB RAM, không swap.** Tối ưu tham số chạy **tuần tự từng người**, ngoài giờ cao điểm, có giới hạn số lượt ôn đưa vào; không chạy song song với build/test.
2. **Không đổi UX:** 4 nút AGAIN/HARD/GOOD/EASY; AGAIN → học lại sau 10 phút; các nút khác → số ngày. Hàng đợi (mới / đến hạn / khó nhớ / đã thuộc) dựa trên `ease`, `repetitions`, `intervalDays`, `lapses` → vẫn phải ghi các trường này.
3. **Không migration hàng loạt** thẻ cũ — nâng cấp lười như lần chuyển SM-2 → FSRS-4.5.
4. **Thuật toán là hàm thuần** (không đồng hồ, không IO) — giữ nguyên nguyên tắc ADR-srs/T-P3-04.
5. Dependency mới phải **ghim phiên bản chính xác** và có giấy phép cho phép dùng thương mại.

## 4. Quyết định thiết kế

**D1 — Dùng thư viện `ts-fsrs` (open-spaced-repetition, MIT) thay vì tự viết công thức FSRS-6.** Lý do: công thức FSRS-6 dài hơn (short-term stability, decay học được, damping độ khó); tự chép dễ sai và lại phải giữ hai bản. Agent phải:
- Chọn phiên bản `ts-fsrs` **đầu tiên hỗ trợ FSRS-6 (21 tham số)** còn mới nhất ổn định, ghim chính xác (không `^`), ghi phiên bản + ngày vào ADR.
- Nếu `ts-fsrs` không giữ được UX §3.2 (bước học lại 10 phút, lượt trong ngày) bằng cấu hình (`learning_steps`/`relearning_steps`/`enable_short_term`… — kiểm tài liệu đúng phiên bản), **dừng và ghi lý do vào ticket**, rồi chuyển phương án B: tự cài công thức FSRS-6 theo mã nguồn `ts-fsrs` cùng phiên bản và dùng chính test vector của thư viện để đối chiếu.

**D2 — Đặt adapter trong `packages/shared`** (`@nihongo/shared/srs`), API và UI cùng import. Adapter giữ chữ ký hiện tại `advanceSrs(prev: SrsState, review: {grade, now}, params?: SrsParams): SrsOutcome` để `srs.service.ts` và UI đổi ít nhất. Xoá bản sao tay trong `study-session.tsx`.

**D3 — `SrsState` thêm `schemaVersion: 3`, `algorithm: "fsrs6"`.** `stability`/`difficulty` của bản v2 (FSRS-4.5) dùng thẳng làm trạng thái khởi đầu cho FSRS-6 ở lần ôn kế tiếp (cùng ý nghĩa: S là số ngày để R tụt về 90%). Hệ quả kiểm được: với retention 0,9, khoảng cách kế tiếp ≈ S ở **mọi** giá trị decay, nên lịch đến hạn hiện có không nhảy vọt khi chuyển. v1 (SM-2) vẫn nâng như cũ (`stability = intervalDays`, `difficulty` từ `ease`).

**D4 — Nhật ký lượt ôn là collection append-only `srs_review_logs`**, ghi trong cùng `reviewBatch`. Mỗi lượt có `reviewId` do client sinh (UUID) → unique index → gửi lại batch không áp dụng hai lần (sửa luôn lỗi áp dụng trùng hiện có).

**D5 — Thời điểm thật của lượt ôn:** client gửi `reviewedAt` (epoch ms) từng lượt; server chấp nhận nếu trong `[now − 7 ngày, now + 2 phút]` và không lùi so với lượt trước của cùng thẻ, ngoài khoảng → dùng `now` server và ghi `clockAdjusted: true`.

**D6 — Tham số theo người học trong `user_srs_params`**, chỉ dùng khi **đánh giá trên dữ liệu giữ lại (hold-out) tốt hơn** bộ mặc định. Không có bản ghi → tham số mặc định FSRS-6.

**D7 — Bộ tối ưu:** dùng `@open-spaced-repetition/binding` (bản Node của `fsrs-rs`, có hàm tính tham số) nếu cài được trên VPS (linux-x64, có binary dựng sẵn — nếu cần build native phải thêm vào `allowBuilds` trong `pnpm-workspace.yaml`). Không dùng bộ tối ưu Python (kéo theo PyTorch, quá nặng RAM). Nếu binding không chạy được: dừng giai đoạn 3, ghi lý do, giữ tham số mặc định — **không tự viết bộ tối ưu**.

## 5. Các giai đoạn

Mỗi giai đoạn: test xanh, lint/typecheck sạch, cập nhật ADR-srs + `docs/database.md` + `docs/TICKETS.md` + file ticket, commit riêng. Ticket gợi ý: NP-114 (GĐ1), NP-115 (GĐ2), NP-116 (GĐ3) — mục "Đã làm ngoài checklist" vì không có hàng checklist.

### Giai đoạn 1 — Nhật ký lượt ôn + thời điểm thật + chống áp dụng trùng (NP-114)

**Làm trước, triển khai sớm** — dữ liệu cần thời gian tích luỹ trước khi tối ưu được.

Change list:

- `apps/api/src/srs/schemas/review-log.schema.ts` — **Create.** Collection `srs_review_logs`:
  ```ts
  user: ObjectId; card: ObjectId; deck: ObjectId
  reviewId: string                 // UUID từ client
  grade: "AGAIN"|"HARD"|"GOOD"|"EASY"
  reviewedAt: number               // epoch ms (sau khi kiểm D5)
  clockAdjusted?: boolean
  day: string                      // YYYY-MM-DD theo timezone người học
  timezone: string
  elapsedDays: number              // từ lượt trước của thẻ (0 cho lượt đầu)
  before: { stability?: number; difficulty?: number; schemaVersion: number }
  after:  { stability: number; difficulty: number; intervalDays: number; relearnHours: number }
  algorithm: string                // "fsrs-4.5" | "fsrs-6" | "fsrs-6:user"
  ```
  Index: `{user:1, reviewId:1}` unique; `{user:1, card:1, reviewedAt:1}`; `{user:1, reviewedAt:1}`. Không TTL. *Risk: medium — collection mới tăng dần (~200 B/lượt), ghi trong luồng ôn chính.*
- `apps/api/src/srs/srs.controller.ts` — **Modify.** `ReviewDto` + `BatchReviewItemDto` thêm `reviewId?: string` (`@IsUUID()`) và `reviewedAt?: number` (`@IsInt()`). Optional để client cũ (PWA đã cài, cache cũ) vẫn chạy: thiếu `reviewId` → server sinh, thiếu `reviewedAt` → `now`.
- `apps/api/src/srs/srs.service.ts` — **Modify** `reviewBatch()`:
  - Trước khi áp dụng: tra `srs_review_logs` theo `{user, reviewId ∈ batch}`; lượt đã có → bỏ qua, trả lại kết quả từ trạng thái hiện tại (idempotent).
  - Sắp lượt theo `reviewedAt` trong cùng thẻ; dùng `reviewedAt` (đã kiểm D5) làm `now` cho `advanceSrs` và để tính `dueAt`.
  - Ghi log bằng một `insertMany(ordered: false)` sau khi ghi progress; lỗi trùng khoá (E11000) bỏ qua. Không bọc transaction (Mongo đơn node — kiểm `database.md`); thứ tự ghi: progress trước, log sau, chấp nhận thiếu log hiếm khi crash giữa chừng (ghi rõ trong comment).
- `apps/api/src/srs/srs.module.ts` — **Modify.** Đăng ký schema.
- `apps/ui/components/learn/study-session.tsx` — **Modify.** Mỗi lượt trong hàng đợi gửi kèm `reviewId: crypto.randomUUID()` (sinh **một lần** khi chấm, giữ khi gửi lại) và `reviewedAt: Date.now()`.
- `docs/database.md` — **Modify.** Thêm `srs_review_logs`.

Test:

- `apps/api/src/srs/srs.review-log.spec.ts` — **Create** (dùng cùng kiểu Mongo test các spec service hiện có; nếu repo chỉ có test hàm thuần thì tách logic chọn `reviewedAt`/lọc trùng thành hàm thuần và test hàm đó):
  - gửi cùng batch hai lần → progress chỉ đổi một lần, log một bản;
  - `reviewedAt` quá cũ / ở tương lai → dùng giờ server, `clockAdjusted: true`;
  - hai lượt cùng thẻ trong batch, gửi lệch thứ tự → áp dụng theo `reviewedAt`;
  - batch không có `reviewId` (client cũ) vẫn chạy.

### Giai đoạn 2 — FSRS-6 tham số mặc định, một bản thuật toán dùng chung (NP-115)

Change list:

- `packages/shared/package.json` — **Modify.** Thêm dependency `ts-fsrs` (ghim chính xác), `exports` thêm `"./srs": "./srs/index.ts"` (kiểm cách API (Nest, build `tsc`) và UI (Next) đang tiêu thụ gói này — hiện chỉ JSON; nếu một bên không biên dịch được TS từ workspace, thêm bước build cho gói hoặc cấu hình `transpilePackages` của Next). *Risk: medium — đổi cách hai app phụ thuộc vào gói chung.*
- `packages/shared/srs/index.ts` — **Create.** Adapter:
  - Xuất `REVIEW_GRADES`, `SrsState` (thêm `schemaVersion: 3`, `algorithm: "fsrs6"`), `SRS_DEFAULT_STATE`, `SrsParams = { w: number[]; requestRetention: number }`, `DEFAULT_SRS_PARAMS` (21 tham số mặc định **lấy từ `ts-fsrs`**, không chép tay), `advanceSrs(prev, review, params = DEFAULT_SRS_PARAMS)`, `previewIntervals(prev, now, params)` (khoảng cách cho 4 nút).
  - Chuyển `SrsState` ↔ thẻ của `ts-fsrs`; nâng v1/v2 như D3.
  - Giữ các trường cũ: `ease` suy từ `difficulty` (giữ công thức `difficultyToEase` hiện tại, thay `initDifficulty(3)` bằng độ khó khởi đầu cho GOOD theo FSRS-6), `repetitions`, `intervalDays`, `lapses`.
  - AGAIN → `relearnHours = 10/60`, `intervalDays` giữ nguyên (UX §3.2).
  - Giới hạn `MAX_INTERVAL_DAYS = 36500`, tối thiểu 1 ngày như cũ.
- `apps/api/src/srs/srs.algorithm.ts` — **Modify.** Thành lớp mỏng re-export từ `@nihongo/shared/srs` (giữ đường import cũ cho các file khác).
- `apps/api/src/srs/srs.service.ts` — **Modify.** Ghi `algorithm: "fsrs-6"` vào log; chưa dùng tham số người học (GĐ3).
- `apps/ui/components/learn/study-session.tsx` — **Modify.** Xoá bản sao `advanceSrs` + `W`/`DECAY`/`FACTOR`; import từ `@nihongo/shared/srs`. Khoảng cách hiển thị trên nút dùng `previewIntervals`.
- `docs/adr/ADR-srs.md` — **Modify.** Mục mới "Cập nhật: FSRS-6": phiên bản thư viện, ngày, cách nâng v2 → v3, vì sao lịch hiện có không nhảy (D3).

Test:

- `packages/shared/srs/srs.spec.ts` hoặc giữ ở `apps/api/src/srs/srs.algorithm.spec.ts` (chọn nơi vitest của repo đang chạy được; `packages/shared` hiện không có script test):
  - **Đối chiếu thư viện:** chuỗi 20 lượt ôn cố định (các khoảng cách 0, 1, 3, 10, 30 ngày, đủ 4 nút) → `stability`/`difficulty`/khoảng cách khớp kết quả gọi `ts-fsrs` trực tiếp (sai số ≤ 1e-3).
  - **Tính chất:** với cùng trạng thái, `interval(AGAIN) ≤ interval(HARD) ≤ interval(GOOD) ≤ interval(EASY)`; AGAIN luôn `relearnHours = 1/6`; thuần (gọi hai lần cùng đầu vào → cùng kết quả).
  - **Nâng cấp:** trạng thái v2 có S = 20 ôn GOOD đúng hạn → khoảng cách mới trong ±25% so với FSRS-4.5 cũ cho cùng đầu vào (ghi số thực tế vào ticket); v1 SM-2 nâng được; `SRS_DEFAULT_STATE` lượt đầu cho 4 nút ra khoảng cách hợp lệ.
  - 6 test cũ của `srs.algorithm.spec.ts`: giữ test nào vẫn đúng về hành vi; test nào gắn với số liệu riêng của FSRS-4.5 thì cập nhật số và ghi lý do trong commit.
- Bấm thử trình duyệt: ôn 10 thẻ, số ngày trên nút khớp `dueDay` server trả về sau khi flush.

### Giai đoạn 3 — Đánh giá và tối ưu tham số theo người học (NP-116)

**Chỉ bắt đầu khi** có ít nhất một người dùng thật có đủ lượt ôn trong `srs_review_logs` (ngưỡng mặc định **1.000 lượt** trên ≥ 100 thẻ — kiểm khuyến nghị tối thiểu trong tài liệu `fsrs-rs` phiên bản đã chọn và ghi lại). Trước đó có thể làm code + test với dữ liệu giả, nhưng không bật job.

Change list:

- `apps/api/src/srs/schemas/user-srs-params.schema.ts` — **Create.** `user_srs_params`: `{user (unique), w: number[21], trainedAt, reviewCount, metrics: {default: {logLoss, rmse}, trained: {logLoss, rmse}}, adopted: boolean, libVersion}`.
- `apps/api/src/srs/srs-optimizer.service.ts` — **Create.**
  - `buildItems(userId)`: đọc log **theo luồng (cursor)**, gom theo thẻ, chuyển sang định dạng đầu vào của binding (lịch sử từng thẻ: ngày + điểm, khoảng cách tính theo **ngày cục bộ** của người học). Bỏ thẻ chỉ có 1 lượt; bỏ lượt `clockAdjusted`.
  - Tách 80/20 theo thẻ (seed cố định); tối ưu trên 80%; đánh giá log loss + RMSE (bins) của **bộ mặc định** và **bộ đã tối ưu** trên 20%.
  - `adopted = trained.logLoss < default.logLoss` (và RMSE không tệ hơn quá 5%). Không đạt → lưu kết quả nhưng `adopted: false`.
  - Giới hạn: tối đa 200.000 lượt / người / lần; đo RSS trước/sau, vượt 600 MB thì dừng người đó và log cảnh báo.
- `apps/api/src/srs/srs-optimizer.job.ts` — **Create.** Chạy mỗi ngày 03:00 (theo giờ server; kiểm repo đang lên lịch job thế nào — nếu chưa có cơ chế cron thì dùng `@nestjs/schedule` nếu đã có, nếu không thì `setInterval` kiểm giờ trong process, giống các worker nền hiện có). Mỗi lần: lấy người đủ ngưỡng, có ≥ 500 lượt mới kể từ `trainedAt`, xử lý **tuần tự**. Có cờ env `SRS_OPTIMIZER_ENABLED` (mặc định `false`).
- `apps/api/src/srs/srs.service.ts` — **Modify.** `reviewBatch` và `getQueue` nạp tham số người học (`adopted: true`) → truyền vào `advanceSrs`; log ghi `algorithm: "fsrs-6:user"`. Response hàng đợi trả thêm `srsParams` để UI preview đúng.
- `apps/ui/components/learn/study-session.tsx` — **Modify.** Dùng `srsParams` từ response cho `previewIntervals`.
- Admin (tuỳ chọn, nếu còn thời gian): bảng trong trang admin hệ thống liệt kê người đã tối ưu, số lượt, log loss trước/sau.
- `docs/adr/ADR-srs.md` — **Modify.** Ghi ngưỡng, tiêu chí áp dụng, kết quả đo đầu tiên.

Test:

- `apps/api/src/srs/srs-optimizer.spec.ts`:
  - `buildItems` từ log giả: đúng gom theo thẻ, đúng khoảng cách theo ngày cục bộ (có case qua nửa đêm theo timezone), bỏ lượt `clockAdjusted`;
  - dữ liệu giả sinh từ một bộ tham số biết trước (mô phỏng người học theo FSRS-6 với `w` khác mặc định) → bộ tối ưu cho log loss trên hold-out **tốt hơn** mặc định → `adopted: true`;
  - dữ liệu ngẫu nhiên (không theo mô hình) → không bị áp dụng nếu không tốt hơn;
  - người chưa đủ ngưỡng → không chạy.
- Đo thủ công trên VPS: thời gian + RSS cho 10k và 100k lượt giả, ghi vào ticket.

## 6. Song song hoá

Tuần tự: GĐ1 → GĐ2 → GĐ3 (GĐ1 và GĐ2 cùng sửa `reviewBatch` và `study-session.tsx`). GĐ1 nên lên production càng sớm càng tốt để tích luỹ nhật ký.

## 7. Kiểm tra cuối mỗi giai đoạn

```
pnpm -C apps/api test
pnpm -C apps/api lint
pnpm -C apps/api typecheck
pnpm -C apps/ui lint
pnpm -C apps/ui typecheck
```

Chạy lần lượt (RAM 4 GB). GĐ2 thêm `pnpm -C apps/ui build` một lần để chắc Next biên dịch được gói `@nihongo/shared/srs`.

## 8. Tiêu chí hoàn thành

- [ ] Mỗi lượt ôn có đúng một dòng log; gửi lại batch không áp dụng hai lần.
- [ ] Lượt ôn dùng thời điểm thật của client (trong giới hạn D5).
- [ ] Thẻ mới và thẻ cũ (v1, v2) đều lên lịch bằng FSRS-6; không có migration hàng loạt; lịch đến hạn hiện có không nhảy bất thường (số liệu ±25% ghi trong ticket).
- [ ] API và UI dùng chung một module SRS; không còn bản sao công thức trong UI.
- [ ] Bộ tối ưu chỉ áp dụng tham số khi tốt hơn mặc định trên hold-out; có cờ tắt; chạy tuần tự, RSS đo được.
- [ ] ADR-srs, `database.md`, TICKETS, file ticket cập nhật; đóng issue GitHub #2 hoặc ghi rõ phần còn lại.

## 9. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| `ts-fsrs` không giữ được UX học lại 10 phút | Phương án B ở D1: tự cài theo mã nguồn thư viện, dùng test vector của thư viện |
| Gói `@nihongo/shared` chưa từng chứa TS — API/UI không biên dịch được | Thêm bước build hoặc `transpilePackages`; kiểm ở GĐ2 bằng `build` thật |
| Lịch ôn thay đổi đột ngột với người đang học | D3 + test ±25%; triển khai GĐ2 khi đã có log để so trước/sau |
| Binding native không cài được trên VPS | Dừng GĐ3, giữ mặc định; không tự viết bộ tối ưu |
| Tối ưu làm hết RAM | Tuần tự, giới hạn lượt, ngưỡng RSS, chạy 03:00, cờ tắt mặc định |
| Ít người đủ 1.000 lượt | Bình thường — mặc định FSRS-6 đã tốt hơn FSRS-4.5; tối ưu chỉ là phần thêm |
