# Open Questions — Nihongo Path

> Các điểm **mơ hồ, mâu thuẫn hoặc còn thiếu** phát hiện khi đối chiếu spec,
> `architecture.md`, `database.md` với code thực tế.
>
> **Ngày lập:** 30/10/2026. **Cập nhật lần cuối:** 07/11/2026. **Người lập:** [CC].
>
> Quy ước: **Chặn thiết kế** = không thể bắt đầu phase liên quan.
> **Chặn phát hành** = có thể code nhưng không được lên production.
> **Mâu thuẫn tài liệu** = tài liệu và code nói khác nhau.
> **Mơ hồ** = spec không nói rõ, cần chốt để tránh tự giả định.

## Tổng quan

| Nhóm | Tổng số | Đang mở (`⏸`) | Đã chốt / giải quyết (`✅`) | Chặn gì |
|---|---:|---:|---:|---|
| A. Chặn thiết kế (`Q-01`–`Q-08`) | 8 | 5 (`Q-04`–`Q-08`) | 3 (`Q-01`–`Q-03`) | P5, P6, P7, P8, P9 |
| B. Chặn phát hành (`Q-09`–`Q-12`) | 4 | 3 (`Q-09`–`Q-11`) + 1 phần P4 (`Q-12`) | 1 phần P3 (`Q-12`) | P4, P6, P10, P11 |
| C. Mâu thuẫn tài liệu (`Q-13`–`Q-18`) | 6 | **0** | **6 (`Q-13`–`Q-18`)** | Không còn chặn (đã đồng bộ docs & code) |
| D. Mơ hồ (`Q-19`–`Q-24`) | 6 | 6 (`Q-19`–`Q-24`) | 0 | Nhiều phase (P5, P6, P7, P8, P11) |

**Trạng thái:**
- `Q-01`, `Q-02` đã `✅ Chốt` (30/10/2026) — mở khoá P2.
- `Q-03` (SRS) đã `✅ Chốt` (03/11/2026) — SM-2 + state versioned, mở khoá P3-SRS.
- `Q-12` đã `✅ Duyệt phần P3` (05/11/2026) cho PDF tự soạn/có quyền và Kanji Jōyō nguồn mở; phần đề thi chính thức ở P4 vẫn `⏸ Chờ Tôi`.
- **Toàn bộ nhóm C (`Q-13`–`Q-18`) đã `✅ Giải quyết dứt điểm` (07/11/2026)** — toàn bộ tài liệu trong `docs/`, `README.md`, `apps/*/README.md` đã khớp với trạng thái codebase hiện tại.
- Các câu còn lại (`Q-04`–`Q-11`, phần P4 của `Q-12`, `Q-19`–`Q-24`) đang `⏸ Chờ Tôi`. Không câu nào thuộc thẩm quyền chủ sản phẩm bị tự trả lời.

---

## A. Câu hỏi chặn thiết kế

### Q-01 — Provider xác thực

- **Câu hỏi:** Dùng phương án xác thực nào: Google OAuth, GitHub OAuth, hay
  email/mật khẩu? Có cần nhiều phương án cùng lúc không?
- **Vì sao chặn:** Quyết định schema `auth_accounts`, luồng UI `/login`,
  biến môi trường (`GOOGLE_CLIENT_ID`, `JWT_*`), và chính sách bảo mật.
- **Phương án:** (a) Google OAuth; (b) GitHub OAuth; (c) email + mật khẩu;
  (d) kết hợp (a)+(c).
- **Đề xuất:** (a)+(c) — Google phổ biến với người học Việt Nam, email làm
  phương án dự phòng.
- **Owner:** Tôi. **Phase:** P2.
- **Trạng thái:** `✅ Đã chốt` (30/10/2026): **(a)+(c) — Google OAuth +
  email/password.** Impl: `auth_accounts.provider ∈ {google, email}`;
  endpoint `/auth/google` (verify ID-token) + `/auth/email` (scrypt); JWT
  access/refresh theo `.env.example`. Schema `auth-account` đã provider-agnostic.

### Q-02 — MongoDB thật cho môi trường dev

- **Câu hỏi:** Dùng MongoDB Community cài local, MongoDB Atlas free tier, hay
  tiếp tục graceful-degrade (không DB) cho tới khi cần?
- **Vì sao chặn:** P2 trở đi đều cần DB thật để kiểm chứng. Hiện máy dev
  **không có** mongod (xác minh 29/10).
- **Phương án:** (a) Community local; (b) Atlas free; (c) graceful-degrade tiếp.
- **Đề xuất:** (b) — không cần cài đặt, có backup, miễn phí ở mức MVP.
- **Lưu ý:** Tạo tài khoản Atlas là việc của **Tôi**, [CC] không tự đăng ký.
- **Owner:** Tôi. **Phase:** P2.
- **Trạng thái:** `✅ Đã chốt` (30/10/2026): **(b) MongoDB Atlas free tier.**
  Tôi tạo tài khoản Atlas + DB, điền `MONGODB_URL` vào `apps/api/.env`, bật
  `MONGODB_URL_REQUIRED=true` ở dev. [CC] không đăng ký.

### Q-03 — Thuật toán lặp lại ngắt quãng

- **Câu hỏi:** Chọn thuật toán SRS nào: SM-2, FSRS, hay biến thể riêng?
- **Vì sao chặn:** Quyết định schema `user_card_progress` và toàn bộ logic
  `srs.service.ts`. Đổi thuật toán sau khi có dữ liệu người dùng thật rất tốn kém.
- **Phương án:** (a) SM-2 (đơn giản, phổ biến, tài liệu nhiều); (b) FSRS
  (chính xác hơn, cần tham số, phức tạp hơn); (c) tự thiết kế.
- **Đề xuất:** (a) SM-2 cho MVP — dễ kiểm chứng, dễ thay thế nhờ tách module
  `srs`. So sánh chi tiết trước khi chốt (ADR-002 ở plan §9).
- **Owner:** Cả hai. **Phase:** P3.
- **Trạng thái:** `✅ Đã chốt` (03/11/2026): **(a) SM-2 cho MVP, state
  versioned để dự phòng FSRS.** Impl: `srs.algorithm.ts` (pure,
  deterministic) + `srs.days.ts` (timezone-aware day boundaries);
  `user_card_progress.state` embed `{ schemaVersion: 1, algorithm: "sm2",
  ease, repetitions, intervalDays, lapses }` — FSRS sau này thêm
  `schemaVersion: 2` mà không phá state cũ. ADR-002 đã `Accepted`.

### Q-04 — Provider AI / STT / đánh giá phát âm

- **Câu hỏi:** Chọn nhà cung cấp nào cho: chép lời (STT), phân tích ngữ nghĩa
  câu, đánh giá phát âm (shadowing), và hội thoại (Kaiwa)?
- **Vì sao chặn:** P6, P7, P8 không thể bắt đầu nếu chưa có provider; cũng
  không thể ước tính chi phí.
- **Phương án:** Nhiều provider cho từng nhiệm vụ; cần benchmark bằng dữ liệu
  tiếng Nhật N5–N1 (spec §10).
- **Đề xuất:** Trừu tượng hóa interface trước (P6), dùng adapter giả lập cho dev,
  benchmark rồi chốt. Không chốt provider chỉ dựa trên vài ví dụ (spec §10).
- **Lưu ý:** Tạo tài khoản, nhập API key, thanh toán là việc của **Tôi**.
- **Owner:** Cả hai (benchmark) → Tôi (chốt). **Phase:** P6–P8. **Trạng thái:** `⏸`

### Q-05 — Object storage và queue/Redis

- **Câu hỏi:** Dùng dịch vụ lưu trữ file nào (S3-compatible, Cloudflare R2, …)
  và có bật Redis-compatible queue ngay từ P6 không?
- **Vì sao chặn:** Quyết định adapter storage, cấu hình worker, chi phí.
- **Phương án:** (a) local filesystem cho dev + cloud khi production;
  (b) cloud ngay từ đầu; (c) chưa bật queue, xử lý đồng bộ (không khuyến nghị
  cho video).
- **Đề xuất:** (a) — adapter trừu tượng, dev dùng local, production chọn sau.
- **Owner:** Cả hai. **Phase:** P6. **Trạng thái:** `⏸`

### Q-06 — Bộ phân tích hình thái tiếng Nhật

- **Câu hỏi:** Kuromoji.js hay Sudachi? Giấy phép từ điển có cho phép dùng
  thương mại không?
- **Vì sao chặn:** Ảnh hưởng chất lượng phân tích câu, hiệu năng, và **pháp lý**
  (giấy phép từ điển khác nhau).
- **Phương án:** (a) Kuromoji.js; (b) Sudachi; (c) kết hợp.
- **Đề xuất:** So sánh trên cùng tập câu N5–N1 (độ chính xác, độ trễ, giấy
  phép) rồi chốt; ghi vào ADR-002.
- **Lưu ý:** Không kết luận pháp lý thay Tôi (spec §2.8).
- **Owner:** Cả hai. **Phase:** P7. **Trạng thái:** `⏸`

### Q-07 — Định nghĩa gói Free / Pro / VIP

- **Câu hỏi:** Mỗi gói có những `featureKey` nào, giới hạn bao nhiêu, chu kỳ
  reset ra sao?
- **Vì sao chặn:** P5 (entitlements) cần cấu hình cụ thể; P8, P9, P10 đều phụ
  thuộc. Spec §6.2 nói rõ các con số trong spec **chỉ là minh họa**.
- **Phương án:** Cần Tôi định nghĩa bảng feature × plan.
- **Đề xuất:** Bắt đầu với cấu hình tối thiểu (số bộ thẻ, lượt phân tích/ngày,
  phút Kaiwa/tháng) và điều chỉnh sau khi có dữ liệu sử dụng thật.
- **Owner:** Tôi. **Phase:** P5. **Trạng thái:** `⏸`

### Q-08 — Thanh toán

- **Câu hỏi:** Nhà cung cấp thanh toán nào? Tiền tệ nào (VND/USD)? Chính sách
  gia hạn/hủy/hoàn tiền? Mua một lần có thời hạn bao lâu?
- **Vì sao chặn:** P9 không thể thiết kế webhook, schema `payments`, hay luồng
  checkout nếu chưa chốt.
- **Phương án:** Cần kiểm tra khả năng hỗ trợ quốc gia của pháp nhân, phương
  thức thanh toán địa phương, thuế, yêu cầu tuân thủ (spec §6.1).
- **Đề xuất:** Chỉ làm sandbox ở P9; chốt provider thật sau khi Tôi xác minh
  pháp lý/thuế.
- **Owner:** Tôi. **Phase:** P9. **Trạng thái:** `⏸`

---

## B. Câu hỏi chặn phát hành

### Q-09 — AdSense, domain và thương hiệu

- **Câu hỏi:** Publisher ID? Domain production? Chính sách consent/cookie?
  Pro/VIP có ẩn quảng cáo không?
- **Vì sao chặn phát hành:** Không thể bật quảng cáo thật hoặc cấu hình
  canonical/`metadataBase` nếu chưa có domain.
- **Phương án:** Cần Tôi tạo tài khoản AdSense, xác minh domain, duyệt chính sách.
- **Đề xuất:** Code sẵn với cờ **tắt mặc định**; bật sau khi Tôi xác nhận.
- **Lưu ý:** [CC] không tạo tài khoản, không tự chọn Publisher ID, không tuyên bố
  đã được phê duyệt (spec §7.2).
- **Owner:** Tôi. **Phase:** P10. **Trạng thái:** `⏸`

### Q-10 — RPO/RTO, hosting, monitoring

- **Câu hỏi:** Mục tiêu RPO/RTO là bao nhiêu? Hosting ở đâu? Dùng công cụ
  monitoring nào?
- **Vì sao chặn phát hành:** P11 cần con số cụ thể để kiểm thử backup/restore
  và cấu hình cảnh báo.
- **Phương án:** Spec §12 gợi ý RPO 24h / RTO 8h nhưng **chưa phải cam kết**.
- **Đề xuất:** Chốt con số trước khi làm P11-OPS-02.
- **Owner:** Cả hai. **Phase:** P11. **Trạng thái:** `⏸`

### Q-11 — Giới hạn media

- **Câu hỏi:** Dung lượng tối đa mỗi file, thời lượng video tối đa, độ phân giải,
  thời gian lưu file gốc?
- **Vì sao chặn phát hành:** Spec §4.6 nêu 500 MB / 60 phút / 1080p / 30 ngày
  nhưng ghi rõ là **giá trị đề xuất để thử nghiệm**.
- **Phương án:** Chốt sau khi ước tính chi phí storage và băng thông.
- **Đề xuất:** Bắt đầu thấp hơn đề xuất (ví dụ 200 MB / 30 phút) để kiểm soát
  chi phí, nâng sau khi có dữ liệu thật.
- **Owner:** Tôi. **Phase:** P6. **Trạng thái:** `⏸`

### Q-12 — Quyền sử dụng nội dung và đề thi

- **Câu hỏi:** Nguồn nội dung từ vựng/ngữ pháp/đề thi lấy từ đâu? Có quyền phân
  phối không? Có dùng PDF của giáo trình có bản quyền để import không?
- **Vì sao chặn phát hành:** Rủi ro pháp lý và có thể mất tài khoản AdSense
  (spec §4.5, §7.5, §8).
- **Phương án:** Chỉ dùng nội dung Tôi có quyền; ghi nguồn + trạng thái quyền
  cho từng mục.
- **Đề xuất:** Không import PDF có bản quyền; ưu tiên nội dung tự soạn hoặc có
  giấy phép mở.
- **Owner:** Tôi. **Phase:** P3, P4.
- **Trạng thái:** `✅ Đã duyệt phần P3 (05/11/2026)` — chỉ import PDF tự soạn/có quyền (đã triển khai P3-IMPORT-05 cho PDF bảng text và P3-IMPORT-05b cho PDF scan qua OCR AI; Kanji Jōyō dùng nguồn mở KANJIDIC/JMdict/KanjiVG theo `docs/plans/plan-kanji.md`). Phần đề thi chính thức ở P4 vẫn `⏸ Chờ Tôi`.

---

## C. Mâu thuẫn tài liệu (cần sửa docs, không sửa code) — Đã giải quyết

> Toàn bộ 6 mục mâu thuẫn tài liệu (`Q-13`–`Q-18`, tương ứng `L1`–`L8` ở
> `IMPLEMENTATION_PLAN.md` §3.3) và điểm lệch tiến hoá UI (Preline → React state
> + ReactBits) đã được phân tích đối chiếu với codebase và đồng bộ hoá trên toàn
> bộ tài liệu (`docs/*.md`, `README.md`, `apps/*/README.md`).

### Q-13 — `architecture.md` ghi "Jest" nhưng repo dùng Vitest (L4)

- **Phân tích nguyên nhân:** Bản kiến trúc đầu tiên (`docs/architecture.md` §2 dòng 30 và §4.1 dòng 92) ghi theo mặc định của NestJS CLI (`Jest (unit) + e2e (Supertest)`), trong khi thực tế `apps/api` đã cấu hình và sử dụng **Vitest 4** (`apps/api/vitest.config.ts`, `apps/api/vitest.config.e2e.ts`, `@vitest/coverage-v8`, `tsconfig.json` khai báo `"types": ["vitest/globals"]`).
- **Cách giải quyết (chỉ sửa docs):**
  - Cập nhật `docs/architecture.md` §2 (`test/ # Vitest 4 (unit + e2e, Supertest)`) và §4.1 (`Test | Vitest 4 (unit + e2e, Supertest)`).
  - Đồng bộ trạng thái tại `docs/IMPLEMENTATION_PLAN.md` §3.3 (`L4`) và `docs/IMPLEMENTATION_CHECKLIST.md` (`P1-DOC-02` → `[x]`).
- **Owner:** [CC]. **Phase:** P1 (task `P1-DOC-02`). **Trạng thái:** `✅ Đã giải quyết (07/11/2026)`.

### Q-14 — `MONGODB_URI` vs `MONGODB_URL` (L5)

- **Phân tích nguyên nhân:** Tài liệu ban đầu dùng tên biến `MONGODB_URI`, nhưng từ Phase B2 code (`apps/api/src/config/env.validation.ts`, `apps/api/src/database/database.module.ts`, `apps/api/.env.example`) đã thống nhất dùng **`MONGODB_URL`** (kèm `MONGODB_URL_REQUIRED`).
- **Cách giải quyết (chỉ sửa docs):**
  - Xác minh `docs/architecture.md` §4.4, `docs/database.md` §1 và `docs/development.md` §3.1 đều đã dùng `MONGODB_URL` nhất quán (0 kết quả `MONGODB_URI` trong tài liệu chính).
  - Cập nhật bảng `L5` trong `docs/IMPLEMENTATION_PLAN.md` §3.3 và `P1-DOC-02` trong `docs/IMPLEMENTATION_CHECKLIST.md` từ ghi chú "đã sửa trong working tree (chưa commit)" sang trạng thái đã hoàn tất chính thức.
- **Owner:** [CC]. **Phase:** P1 (task `P1-DOC-02`). **Trạng thái:** `✅ Đã giải quyết (07/11/2026)`.

### Q-15 — Script nạp `.env` của UI và chú thích `apps/ui/.env.example` (L1, L6)

- **Phân tích nguyên nhân:**
  1. Ban đầu `apps/ui/package.json` dùng cú pháp lỗi `dotenv -e .env --`, sau đó chuyển qua `dotenv run -f .env -- next <cmd>` (commit `6a2692c`, bị lỗi nếu máy clone mới chưa tạo `.env`), và cuối cùng code đã chốt `dotenv run -q -- next <cmd>` (lenient khi thiếu `.env`, vẫn nạp đúng `PORT=3001` khi có `.env`).
  2. Chú thích trong `apps/ui/.env.example` từng gợi ý `node --env-file-if-exists` (gây lỗi `is not allowed in NODE_OPTIONS` khi Next spawn tiến trình con), nhưng đã được sửa khớp với `dotenv-cli`.
  3. Tuy nhiên, `docs/development.md` §3.1 vẫn còn ghi câu lệnh cũ `dotenv run -f .env -- next <cmd>`, và `apps/ui/README.md` vẫn là boilerplate mặc định của `create-next-app` ghi sai cổng `http://localhost:3000`.
- **Cách giải quyết (chỉ sửa docs):**
  - Cập nhật `docs/development.md` §3.1 sang `dotenv run -q -- next <cmd>`.
  - Viết lại `apps/ui/README.md` phản ánh đúng cổng `:3001`, biến môi trường và cấu trúc `@nihongo/ui`.
  - Đồng bộ `L1`, `L6` trong `docs/IMPLEMENTATION_PLAN.md` §3.3 và `P1-ENV-16` trong `docs/IMPLEMENTATION_CHECKLIST.md`.
- **Owner:** [CC]. **Phase:** P1 (task `P1-ENV-14`, `P1-ENV-16`). **Trạng thái:** `✅ Đã giải quyết (07/11/2026)`.

### Q-16 — `apps/ui/envConfig.ts` là file chết & trùng mã `Q-16` ở Gate P7 (L2)

- **Phân tích nguyên nhân:**
  1. File `apps/ui/envConfig.ts` (dùng `@next/env`) từng tồn tại mà không được import ở đâu và không tác động được tới `PORT` của Next CLI. File này đã được xoá khỏi repo, nhưng `IMPLEMENTATION_PLAN.md` (`L2`) và `IMPLEMENTATION_CHECKLIST.md` (`P1-ENV-15`) vẫn ghi là chưa xử lý.
  2. Ngoài ra, phát hiện **xung đột mã câu hỏi**: tại `docs/IMPLEMENTATION_CHECKLIST.md` dòng 407 (Gate P7), tài liệu tham chiếu nhầm `consent/retention audio (Q-16)`, trùng ID với `Q-16` (`envConfig.ts`) ở đây.
- **Cách giải quyết (chỉ sửa docs):**
  - Đánh dấu hoàn tất `L2` trong `docs/IMPLEMENTATION_PLAN.md` §3.3 và `P1-ENV-15` trong `docs/IMPLEMENTATION_CHECKLIST.md`.
  - Tách câu hỏi về consent/retention bản ghi âm người học (Shadowing P7) thành mục riêng **`Q-24`** ở Nhóm D bên dưới và cập nhật tham chiếu tại Gate P7 của `docs/IMPLEMENTATION_CHECKLIST.md`.
- **Owner:** [CC]. **Phase:** P1 (task `P1-ENV-15`). **Trạng thái:** `✅ Đã giải quyết (07/11/2026)`.

### Q-17 — Spec §19 đánh nhầm số tiểu mục thành `18.1–18.8` (L7)

- **Phân tích nguyên nhân:** Trong `docs/claude_japanese_learning_platform_spec_preline.md`, mục `## 18. Quy chuẩn UI với Preline` đã có các tiểu mục `### 18.1.` đến `### 18.4.`, nhưng mục kế tiếp `## 19. Hướng dẫn khởi tạo dự án bằng Claude Code` lại đánh số các tiểu mục con là `### 18.1.` đến `### 18.8.`, gây trùng số mục với §18 và làm các tài liệu khác phải ghi chú giải thích mỗi khi trích dẫn.
- **Cách giải quyết (chỉ sửa docs):**
  - Đánh số lại toàn bộ 8 tiểu mục dưới `## 19.` trong `docs/claude_japanese_learning_platform_spec_preline.md` (dòng 679–791) từ `### 18.1.`–`### 18.8.` thành `### 19.1.`–`### 19.8.`.
  - Cập nhật tất cả nơi tham chiếu trong `docs/IMPLEMENTATION_PLAN.md` (`L7` §3.3 và bảng đối chiếu §11 dòng 355) và `docs/IMPLEMENTATION_CHECKLIST.md` (tiêu đề template cuối phase dòng 664: `spec §19.7`).
- **Owner:** Tôi / [CC] (được yêu cầu giải quyết phần Mâu thuẫn tài liệu). **Phase:** P0/P1. **Trạng thái:** `✅ Đã giải quyết (07/11/2026)`.

### Q-18 — `HealthController` và `AppController` lệch với `architecture.md` (L3, L8)

- **Phân tích nguyên nhân:** Ở bản scaffold ban đầu, `HealthController` gọi nhầm `ready()` ở `/health`, comment `/health/ready` và lặp `@ApiOperation`, còn `AppController` trả chuỗi `"Hello World!"`. Trong codebase hiện tại, `apps/api/src/health/health.controller.ts` đã tách đúng `GET /health` (liveness) và `GET /health/ready` (readiness, trả 200 hoặc 503 `ServiceUnavailableException`), đồng thời `apps/api/src/app.controller.ts` đã trả metadata `{ name, version, docs }` ở `GET /`. Tuy nhiên `IMPLEMENTATION_PLAN.md` (`L3`, `L8`) và `IMPLEMENTATION_CHECKLIST.md` (`P1-API-05`, `P1-API-09`, `P1-API-10`) chưa được cập nhật theo code.
- **Cách giải quyết (chỉ sửa docs):**
  - Cập nhật `L3`, `L8` trong `docs/IMPLEMENTATION_PLAN.md` §3.3 và đánh dấu `[x]` cho `P1-API-05`, `P1-API-09`, `P1-API-10` trong `docs/IMPLEMENTATION_CHECKLIST.md`.
- **Owner:** [CC]. **Phase:** P1 (task `P1-API-09`, `P1-API-10`). **Trạng thái:** `✅ Đã giải quyết (07/11/2026)`.

### Đồng bộ bổ sung — Tiến hoá UI từ Preline JS sang React state + ReactBits

- **Phân tích nguyên nhân:** `docs/development.md` §8.2 ghi rõ UI đã bỏ phụ thuộc runtime `preline` (`data-hs-*`) để dùng React state thuần + Tailwind 4 + `components/reactbits/`, trong khi `docs/architecture.md` §3.1–3.2 vẫn chỉ mô tả Preline 5.0.0 như lúc bootstrap P1.
- **Cách giải quyết (chỉ sửa docs):** Cập nhật `docs/architecture.md` §3.1–3.2 và §8.1 để ghi nhận rõ quá trình chuyển dịch từ Preline 5 (bootstrap P1) sang React state thuần + Tailwind CSS 4 + ReactBits ở các màn hình sản phẩm từ P2/P3 trở đi.
- **Trạng thái:** `✅ Đã giải quyết (07/11/2026)`.

---

## D. Điểm mơ hồ cần làm rõ

### Q-19 — Chuẩn accessibility

- **Câu hỏi:** Mục tiêu WCAG nào: A, AA, hay AAA?
- **Vì sao cần:** P11-A11Y-01 cần tiêu chí đo được; các phase UI cần biết mức
  tối thiểu (contrast, focus, label).
- **Đề xuất:** WCAG 2.2 AA — mức phổ biến và khả thi cho MVP.
- **Owner:** Cả hai. **Trạng thái:** `⏸`

### Q-20 — Phạm vi "MVP"

- **Câu hỏi:** Những tính năng nào **bắt buộc** có trước lần phát hành đầu tiên?
  Spec liệt kê rất nhiều nhưng không nói cái nào thuộc MVP.
- **Vì sao cần:** Ảnh hưởng trực tiếp tới việc phase nào phải xong trước khi
  phát hành, và phase nào có thể hoãn.
- **Đề xuất:** MVP = P1–P5 (auth, nội dung, flashcard/SRS, đề thi, admin/quota).
  Media, phân tích câu, Kaiwa, thanh toán, AdSense là bản mở rộng.
- **Owner:** Tôi. **Trạng thái:** `⏸`

### Q-21 — Mức độ đa ngôn ngữ ở MVP

- **Câu hỏi:** Ngoài UI tiếng Việt, có cần nội dung song ngữ (Việt–Nhật) ngay
  không? Có cần URL theo locale (`/vi`, `/ja`) không?
- **Vì sao cần:** Ảnh hưởng schema nội dung (`lang`), metadata, `hreflang`,
  và cấu trúc route.
- **Đề xuất:** MVP chỉ tiếng Việt nhưng **có trường `lang`** trong schema để
  mở rộng sau (đúng spec §2.7, §17.4).
- **Owner:** Tôi. **Trạng thái:** `⏸`

### Q-22 — Nguồn video bên ngoài

- **Câu hỏi:** Nền tảng video ngoài nào được duyệt (nếu có) — YouTube embed,
  hay chỉ video do người dùng tải lên?
- **Vì sao cần:** Quyết định phạm vi P6 và yêu cầu ghi nguồn/quyền (spec §8).
- **Đề xuất:** MVP chỉ hỗ trợ video người dùng tải lên; embed ngoài làm sau khi
  Tôi duyệt nguồn cụ thể.
- **Owner:** Tôi. **Trạng thái:** `⏸`

### Q-23 — Chính sách vượt hạn mức

- **Câu hỏi:** Khi người dùng hết quota, hệ thống chặn hẳn hay cho vượt và tính
  phí/ghi nhận sau?
- **Vì sao cần:** P5-QUOTA-06 và P8-KAIWA-04 phụ thuộc trực tiếp.
- **Đề xuất:** Chặn hẳn (hard limit) cho mọi tính năng tốn tiền ở MVP.
- **Owner:** Tôi. **Trạng thái:** `⏸`

### Q-24 — Consent và thời hạn lưu bản ghi âm người học (Shadowing)

- **Câu hỏi:** Khi người học thu âm giọng nói ở tính năng Shadowing (P7), nội dung thông báo xin đồng ý (consent) cần nêu những gì, có cho phép chấm phát âm mà không lưu file audio lên server không, và nếu lưu thì thời hạn tự động xoá (retention) là bao nhiêu ngày?
- **Vì sao cần:** Gate của P7 (`P7-SHADOW-02`, `P7-SHADOW-04`, `P7-SEC-01`) yêu cầu chính sách consent và retention rõ ràng trước khi lưu audio giọng nói cá nhân (trước đây ở `IMPLEMENTATION_CHECKLIST.md` dòng 407 bị ghi nhầm mã thành `Q-16`).
- **Đề xuất:** Mặc định xử lý/chấm điểm xong chỉ lưu kết quả điểm số + phản hồi văn bản; nếu người học bật tuỳ chọn lưu lại bản ghi âm để nghe lại thì yêu cầu opt-in consent tường minh và tự động xoá sau 7–30 ngày (hoặc cho phép xoá tức thì).
- **Owner:** Tôi. **Phase:** P7. **Trạng thái:** `⏸`

---

## E. Việc [CC] **không** được tự làm (nhắc lại để tránh hiểu nhầm)

- Tạo tài khoản AdSense, Google Cloud, Atlas, hay bất kỳ dịch vụ trả phí nào.
- Nhập thông tin thanh toán, thuế, ngân hàng.
- Bật giao dịch thật hoặc quảng cáo production.
- Chọn provider trả phí thay Tôi.
- Tuyên bố website đã được AdSense/Google phê duyệt.
- Tự đăng ký domain hoặc nhãn hiệu.
- Sửa spec hoặc `architecture.md` khi chưa được duyệt.

---

## Cách cập nhật tài liệu này

1. Khi Tôi trả lời một câu, đổi `⏸` → `✅ Đã chốt` và ghi câu trả lời + ngày.
2. Nếu câu trả lời làm thay đổi phạm vi, cập nhật đồng thời
   `IMPLEMENTATION_PLAN.md` và `IMPLEMENTATION_CHECKLIST.md`.
3. Câu mới phát sinh khi triển khai: thêm với ID tiếp theo, không tái sử dụng ID.
