# Open Questions — Nihongo Path

> Các điểm **mơ hồ, mâu thuẫn hoặc còn thiếu** phát hiện khi đối chiếu spec,
> `architecture.md`, `database.md` với code thực tế.
>
> **Ngày lập:** 30/10/2026. **Người lập:** [CC].
>
> Quy ước: **Chặn thiết kế** = không thể bắt đầu phase liên quan.
> **Chặn phát hành** = có thể code nhưng không được lên production.
> **Mâu thuẫn tài liệu** = tài liệu và code nói khác nhau.
> **Mơ hồ** = spec không nói rõ, cần chốt để tránh tự giả định.

## Tổng quan

| Nhóm | Số câu | Chặn gì |
|---|---|---|
| Chặn thiết kế | 8 | P2, P3, P6, P7, P8, P9, P10 |
| Chặn phát hành | 4 | P10, P11 |
| Mâu thuẫn tài liệu | 5 | P1 |
| Mơ hồ | 5 | Nhiều phase |

**Trạng thái:** mọi câu dưới đây đang `⏸ Chờ Tôi`. Không câu nào được tự trả lời.

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
  phương án dự phòng. Nhưng đây chỉ là đề xuất.
- **Owner:** Tôi. **Phase:** P2. **Trạng thái:** `⏸`

### Q-02 — MongoDB thật cho môi trường dev

- **Câu hỏi:** Dùng MongoDB Community cài local, MongoDB Atlas free tier, hay
  tiếp tục graceful-degrade (không DB) cho tới khi cần?
- **Vì sao chặn:** P2 trở đi đều cần DB thật để kiểm chứng. Hiện máy dev
  **không có** mongod (xác minh 29/10).
- **Phương án:** (a) Community local; (b) Atlas free; (c) graceful-degrade tiếp.
- **Đề xuất:** (b) — không cần cài đặt, có backup, miễn phí ở mức MVP.
- **Lưu ý:** Tạo tài khoản Atlas là việc của **Tôi**, [CC] không tự đăng ký.
- **Owner:** Tôi. **Phase:** P2. **Trạng thái:** `⏸`

### Q-03 — Thuật toán lặp lại ngắt quãng

- **Câu hỏi:** Chọn thuật toán SRS nào: SM-2, FSRS, hay biến thể riêng?
- **Vì sao chặn:** Quyết định schema `user_card_progress` và toàn bộ logic
  `srs.service.ts`. Đổi thuật toán sau khi có dữ liệu người dùng thật rất tốn kém.
- **Phương án:** (a) SM-2 (đơn giản, phổ biến, tài liệu nhiều); (b) FSRS
  (chính xác hơn, cần tham số, phức tạp hơn); (c) tự thiết kế.
- **Đề xuất:** (a) SM-2 cho MVP — dễ kiểm chứng, dễ thay thế nhờ tách module
  `srs`. So sánh chi tiết trước khi chốt (ADR-002 ở plan §9).
- **Owner:** Cả hai. **Phase:** P3. **Trạng thái:** `⏸`

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
- **Owner:** Tôi. **Phase:** P3, P4. **Trạng thái:** `⏸`

---

## C. Mâu thuẫn tài liệu (cần sửa docs, không sửa code)

### Q-13 — `architecture.md` ghi "Jest" nhưng repo dùng Vitest

- **Hiện trạng:** `architecture.md` §2 (`test/ # jest unit + e2e`) và §4.1
  (`Test | Jest (unit) + e2e (Supertest)`). Nhưng `apps/api` dùng **Vitest 4**
  (`vitest.config.ts`, `vitest.config.e2e.ts`, `@vitest/coverage-v8`), và
  `tsconfig.json` khai báo `"types": ["vitest/globals"]`.
- **Đề xuất:** Sửa `architecture.md` thành "Vitest 4 (unit + e2e, Supertest)".
- **Owner:** [CC] sau khi Tôi duyệt. **Phase:** P1 (task P1-DOC-02).

### Q-14 — `MONGODB_URI` vs `MONGODB_URL`

- **Hiện trạng:** `architecture.md` §4.4 nói "Có `MONGODB_URI`"; code
  (`env.validation.ts`, `database.module.ts`, `.env.example`) dùng
  **`MONGODB_URL`** (đã đổi ở Phase B2 để khớp file env của Tôi).
- **Đề xuất:** Sửa `architecture.md` và `database.md` (nếu có) sang
  `MONGODB_URL`.
- **Owner:** [CC] sau khi Tôi duyệt. **Phase:** P1 (task P1-DOC-02).

### Q-15 — Script env của UI (đã sửa, còn đúng 1 điểm phụ)

- **Hiện trạng:** Script UI **đã được sửa** (commit `6a2692c`):
  `apps/ui/package.json` giờ dùng `dotenv run -f .env -- next <cmd>` (thêm dep
  `dotenv-cli@11`), [CC] đã kiểm chứng boot đúng `:3001` (30/10). Vết `dotenv -e`
  lỗi và note `node --env-file-if-exists` **không còn đúng nữa**.
- **Còn lại (phụ thuộc P1-ENV-16):** (1) `dotenv run -f .env` là **strict** —
  thiếu `.env` thì `ENOENT, exit 1` (đã kiểm chứng trong thư mục trống); nếu
  muốn dev chạy không cần `.env` thì bỏ `-f` (dùng `.env` mặc định, lenient).
  (2) Chú thích trong `apps/ui/.env.example` (dòng 3) vẫn ghi
  `node --env-file-if-exists` — **lạc hậu** so với script `dotenv run -f .env`
  hiện tại, cần sửa.
- **Đề xuất:** Quyết định strict-vs-lenient (P1-ENV-14), sửa chú thích
  `.env.example` (P1-ENV-16).
- **Owner:** [CC]. **Phase:** P1 (task P1-ENV-14, P1-ENV-16). Trạng thái: `✅ Đã
  sửa phần script; còn 2 điểm phụ chờ P1`.

### Q-16 — `apps/ui/envConfig.ts` là file chết

- **Hiện trạng:** File `apps/ui/envConfig.ts` import `loadEnvConfig` từ
  `@next/env` nhưng **không được import ở bất kỳ đâu** (đã grep toàn repo).
  Hơn nữa nó **không thể** giúp `PORT`, vì Next đọc `PORT` từ process env
  trước khi nạp bất kỳ code người dùng nào (docs Next 16 bundled, `next.md:355`).
- **Đề xuất:** Hoặc xoá file, hoặc import trong `next.config.ts` cho các biến
  **không phải** `PORT` (ví dụ `NEXT_PUBLIC_API_URL` khi build). Chốt khi làm
  P1-ENV-15.
- **Owner:** [CC]. **Phase:** P1.

### Q-17 — Spec §19 dùng lại số tiểu mục `18.x`

- **Hiện trạng:** §18 là "Quy chuẩn UI với Preline" với `18.1–18.4`; §19 là
  "Hướng dẫn khởi tạo dự án" nhưng tiểu mục lại đánh `18.1–18.8` (trùng số).
- **Đề xuất:** Sửa thành `19.1–19.8` để tham chiếu không nhầm.
- **Owner:** Tôi (spec là tài liệu của Tôi). **Phase:** P0.

### Q-18 — `HealthController` trái với `architecture.md`

- **Hiện trạng:** `architecture.md` §4.2 mô tả `GET /health` = liveness,
  `GET /health/ready` = readiness (ping Mongo). Code hiện tại: `/health` gọi
  `ready()`; `/health/ready` bị **comment out**; có hai `@ApiOperation` trùng
  nhau trên cùng một method.
- **Đề xuất:** Sửa code theo `architecture.md` (task P1-API-09) — đây là lỗi
  code, không phải lỗi tài liệu.
- **Owner:** [CC]. **Phase:** P1.

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
