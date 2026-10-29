# Implementation Plan — Nihongo Path

> **Trạng thái:** bản kế hoạch triển khai đầy đủ; đã thay thế và xoá
> `phase-plan.md` + `checklists.md` (nội dung + bằng chứng đã chuyển sang bộ 3 file này).
> **Ngày lập:** 30/10/2026. **Người lập:** [CC]. **Chủ sản phẩm:** Tôi.
>
> Tài liệu này **chỉ là kế hoạch**. Không dòng code nào được viết ở giai đoạn
> lập kế hoạch (spec §2.5). Mọi task có ID và tiêu chí kiểm chứng nằm ở
> [IMPLEMENTATION_CHECKLIST.md](./IMPLEMENTATION_CHECKLIST.md); các điểm chưa
> chốt nằm ở [OPEN_QUESTIONS.md](./OPEN_QUESTIONS.md).

---

## 1. Mục tiêu và phạm vi

### 1.1. Sản phẩm

Nền tảng học tiếng Nhật có nội dung theo giáo trình/JLPT, flashcard + lặp lại
ngắt quãng, bài tập/đề thi, luyện nghe–chính tả, phân tích câu, shadowing, AI
Kaiwa, quản trị nội dung và gói Free/Pro/VIP (spec §3).

### 1.2. Mục tiêu của kế hoạch

1. Chuyển toàn bộ spec §4–§19 thành phase có thứ tự, phụ thuộc và tiêu chí
   nghiệm thu kiểm chứng được.
2. Không bỏ sót chức năng nào trong spec (đối chiếu ở §11).
3. Tách rõ: **đã chốt** / **đề xuất** / **chưa quyết định** — không tự quyết
   thay chủ sản phẩm.

### 1.3. Trong phạm vi

Toàn bộ lộ trình tới bản phát hành production đầu tiên: xác thực, nội dung học,
flashcard/SRS, đề thi, quản trị, media/STT, phân tích câu, shadowing, Kaiwa,
thanh toán, AdSense, và các yêu cầu vận hành.

### 1.4. Ngoài phạm vi (không làm nếu chưa được yêu cầu rõ)

- Microservice, Docker/Kubernetes (spec §9.1: không tự chuyển kiến trúc).
- Thay framework / package manager / database hiện có.
- Chọn provider trả phí, tạo tài khoản, bật giao dịch hoặc quảng cáo thật.
- Đa ngôn ngữ UI đầy đủ (chỉ chuẩn bị cấu trúc dữ liệu — spec §2.7, §17.4).

---

## 2. Nguồn tài liệu và thứ tự ưu tiên

Khi có mâu thuẫn, thứ tự ưu tiên:

1. `docs/claude_japanese_learning_platform_spec_preline.md` — đặc tả gốc.
2. `docs/architecture.md` — kiến trúc đã chốt tới Sprint 0/1.
3. `docs/database.md` — nhóm collection, index, retention.
4. `docs/IMPLEMENTATION_PLAN.md` (tài liệu này) — thứ tự và phạm vi thi hành.
5. `docs/IMPLEMENTATION_CHECKLIST.md` — task chi tiết.

Mâu thuẫn đã phát hiện giữa tài liệu và code thực tế được ghi ở
[OPEN_QUESTIONS.md](./OPEN_QUESTIONS.md) mục "Mâu thuẫn tài liệu", **không tự
sửa** trong bước lập kế hoạch.

### 2.1. Nhãn trạng thái quyết định (spec §2.4)

| Nhãn | Nghĩa | Ai chốt |
|---|---|---|
| **Đã chốt** | Yêu cầu sản phẩm đã nêu rõ trong spec/architecture | Tôi |
| **Đề xuất** | Phương án hợp lý nhưng cần duyệt | Cả hai |
| **Chưa quyết định** | Chặn thiết kế hoặc chặn phát hành | Tôi |

### 2.2. Ký hiệu trách nhiệm (spec §1)

- **Tôi** — quyết định sản phẩm, tài khoản, API key, nội dung, thanh toán.
- **[CC]** — viết code theo pattern hiện có, test, tài liệu kỹ thuật.
- **Cả hai** — cùng phân tích và chốt.

---

## 3. Trạng thái repository hiện tại (30/10/2026)

### 3.1. Nền tảng đã dựng

| Hạng mục | Hiện trạng | Ghi chú |
|---|---|---|
| Monorepo | pnpm workspace, `apps/ui` + `apps/api` | không turborepo |
| Node | v22.23.3 (`.nvmrc`, `engines >=22.22.0`) | đã xác minh 29/10 |
| UI | Next.js 16.4.3, React 19.3, Tailwind 4, Preline 5.0.0 | App Router, Turbopack |
| API | NestJS 12, ESM (`nodenext`), Vitest 4, oxlint, TypeScript 6 | scaffold có sẵn |
| DB | MongoDB qua `@nestjs/mongoose`, **graceful-degrade** | chưa có mongod local |
| Docs API | Swagger ở `/api/docs`, tắt khi `NODE_ENV=production` | |
| Validation | `ValidationPipe` global (whitelist + transform + forbidNonWhitelisted) | |
| CORS | bật theo `WEB_ORIGIN` (danh sách phân tách dấu phẩy) | |

### 3.2. Module / route đã có

**Backend** (`apps/api/src`):
`bootstrap/env.ts` (nạp `.env`), `config/` (validate env), `database/`
(`buildDatabaseModule()`), `health/` (service + controller), `app.module.ts`,
`main.ts`. Chưa có domain module nào.

**Frontend** (`apps/ui/app`):
`/` (trang chủ), `/login`, `/learn`, `/admin` (placeholder), `robots.ts`,
`sitemap.ts`, `opengraph-image.tsx`, `icon.svg`; components:
`site-header.tsx`, `site-footer.tsx`, `preline.tsx` (init idempotent theo
`usePathname`), `themes/theme.css` (palette placeholder).

### 3.3. Điểm lệch đã phát hiện (chi tiết + đề xuất ở OPEN_QUESTIONS)

| # | Lệch | Ảnh hưởng |
|---|---|---|
| L1 | ~~`apps/ui/package.json` dùng `dotenv -e .env -- …` (hỏng)~~ → **đã sửa** (commit `6a2692c`, 30/10): scripts dùng `dotenv run -f .env -- next <cmd>` (thêm dep `dotenv-cli@11`), đã kiểm chứng boot đúng `:3001` | Từng làm `pnpm dev` của UI không chạy; giờ chạy được. Còn dở: chú thích `.env.example` (L6) + hậu quả thiếu `.env` (P1-ENV-14/16) |
| L2 | `apps/ui/envConfig.ts` tồn tại nhưng **không được import** ở đâu | file chết, gây hiểu nhầm |
| L3 | `health.controller.ts`: `/health` lại gọi `ready()`; `/health/ready` bị comment; `@ApiOperation` trùng | sai hợp đồng endpoint so với `architecture.md` §4.2 |
| L4 | `architecture.md` §4.1/§4.2 ghi "Jest (unit) + e2e (Supertest)" nhưng repo dùng **Vitest 4** (`vitest.config.ts`, `@vitest/coverage-v8`) | tài liệu sai — sửa ở P1-DOC-02 |
| L5 | ~~`architecture.md` §4.4 ghi `MONGODB_URI`, code dùng `MONGODB_URL`~~ → **đã sửa trong working tree** (chưa commit): `architecture.md` + 3 file `apps/api/src` đổi sang `MONGODB_URL` | khớp code sau khi commit |
| L6 | `apps/ui/.env.example` mô tả `node --env-file-if-exists` — cách này **thất bại** khi Next spawn lại node (`is not allowed in NODE_OPTIONS`) | chú thích sai |
| L7 | Spec §19 dùng lại số `18.1–18.8` cho tiểu mục của §19 | trùng số mục |
| L8 | `app.controller.ts` (`getHello()`) + `app.service.ts` vẫn trả `"Hello World!"` ở `/` (còn kèm `app.controller.spec.ts`) | rác scaffold |

---

## 4. Kiến trúc đích

### 4.1. Sơ đồ tổng thể

```
Browser (Next.js 16, App Router)
   │  Server Component fetch / client fetch (NEXT_PUBLIC_API_URL)
   ▼
apps/api (NestJS 12, REST + Swagger)
   │
   ├── AuthGuard → RolesGuard → EntitlementGuard   (thứ tự cố định)
   │
   ├── MongoDB (users, content, progress, media-meta, billing, entitlements)
   ├── Object storage  [abstraction — chưa chọn nhà cung cấp]
   ├── Queue/Worker    [Redis-compatible — bật khi có tác vụ dài]
   └── AI/STT providers [interface theo nhiệm vụ — chưa chọn]
```

### 4.2. Ranh giới module backend (đề xuất)

| Module | Trách nhiệm | Phase |
|---|---|---|
| `config` | validate env, fail-fast | P1 ✅ |
| `database` | kết nối Mongo, graceful-degrade | P1 ✅ |
| `health` | liveness + readiness | P1 ✅ |
| `auth` | login, JWT, refresh, session | P2 |
| `users` | hồ sơ, role | P2 |
| `content` | textbooks, units, vocabulary, grammar | P2 |
| `flashcards` | deck, card, import | P3 |
| `srs` | lịch ôn, progress | P3 |
| `exams` | đề, attempt, chấm điểm | P4 |
| `admin` | quản trị, feedback, audit | P5 |
| `entitlements` | feature config, quota | P5 |
| `media` | upload, asset, storage | P6 |
| `transcription` | STT job, transcript | P6 |
| `analysis` | tokenizer + AI ngữ nghĩa | P7 |
| `shadowing` | ghi âm, đánh giá phát âm | P7 |
| `kaiwa` | hội thoại AI | P8 |
| `billing` | plan, subscription, payment, webhook | P9 |
| `ads` | cấu hình placement, feature flag | P10 |

Không tách microservice: 2 app hiện tại đủ cho MVP (architecture §2).

### 4.3. Thứ tự kiểm tra quyền (bắt buộc)

```
Request → AuthGuard (có token hợp lệ?)
        → RolesGuard (role đủ quyền admin?)
        → EntitlementGuard (plan/feature có quyền lợi?)
        → QuotaGuard (còn hạn mức?)
        → Handler
```

`Role` **không** được dùng làm cơ chế entitlement duy nhất (spec §4.1, §6.2).

### 4.4. Luồng dữ liệu tác vụ dài

```
UI upload → API tạo media_assets (UPLOADING) → object storage
          → API enqueue job (ai_jobs) → worker xử lý
          → cập nhật trạng thái: QUEUED → PROCESSING → COMPLETED | FAILED | CANCELLED
          → quota: reserve khi tạo job → settle khi COMPLETED → release khi FAILED/CANCELLED
```

---

## 5. Bảng phase

**Quy ước đánh số:** `P0`–`P11` map **1:1** với Sprint 0–11 của spec §14.
Bootstrap A/B1–B4 đã làm nằm trong **P1** (Sprint 1 — Foundation).

| Phase | Spec §14 | Nội dung | Phụ thuộc | Gate cần Tôi chốt | Tiêu chí nghiệm thu phase |
|---|---|---|---|---|---|
| **P0** | Sprint 0 | Discovery: khảo sát repo, xác minh phiên bản, chốt kiến trúc | — | — | ✅ Xong 29/10 (bằng chứng ở checklist) |
| **P1** | Sprint 1 | Foundation: env, lint/typecheck/build, health, Swagger, nền UI Preline, docs chạy local | P0 | — | `typecheck` + `lint` + `build` exit 0; `/health` và `/health/ready` trả đúng; UI chạy đúng `PORT` trong `.env` |
| **P2** | Sprint 2 | Identity & content: auth, users, role≠plan, textbooks/units/vocabulary/grammar | P1 | Provider auth; MongoDB thật | Đăng nhập được; route riêng tư chặn khi chưa auth; admin CRUD nội dung chạy |
| **P3** | Sprint 3 | Flashcards & SRS: deck, card, import XLSX/CSV/PDF, phiên ôn, lịch ôn | P2 | Thuật toán SRS; quyền nội dung | Import có preview–map–dedupe–confirm; thẻ đến hạn đúng ngày theo timezone |
| **P4** | Sprint 4 | Exercises/exams: bài tập, đề, attempt, chấm điểm, xáo trộn, thống kê | P2, P3 | Loại đề; quyền đề thi | Xáo trộn không làm sai đáp án; hết giờ chặn server-side; xem lại lỗi |
| **P5** | Sprint 5 | Admin/feedback/entitlements: admin console, feedback, audit log, feature config, quota | P2–P4 | Định nghĩa Free/Pro/VIP | Quota reserve→settle→release đúng; mọi thao tác admin có audit |
| **P6** | Sprint 6 | Media/transcription: upload, state machine, queue/worker, STT, transcript, retention, SSRF | P5 | Object storage; STT provider; giới hạn media | Job chạy hết state machine; file hết hạn bị xoá; URL nội bộ bị chặn |
| **P7** | Sprint 7 | Sentence analysis/shadowing: analyzer + AI, schema versioned, ghi âm, chấm phát âm | P6 | Analyzer + giấy phép; speech-eval provider; consent | Phân tích câu trả schema hợp lệ; lưu được từ vào flashcard; audio xoá theo retention |
| **P8** | Sprint 8 | AI Kaiwa: hội thoại, quota/timeout/cost, entitlement gate | P5, P6 | AI provider + benchmark | Vượt quota bị chặn; timeout xử lý sạch; chi phí ghi nhận theo phiên |
| **P9** | Sprint 9 | Monetization: plan, subscription, payment, webhook — **sandbox only** | P5 | Payment provider, tiền tệ, refund | Webhook sai chữ ký bị từ chối; retry trùng không tạo bản ghi đôi; không giao dịch thật |
| **P10** | Sprint 10 | AdSense: slot component, env flag, gate theo route/gói, fallback, admin toggle | P5, P9 | Publisher ID, domain, consent | Cờ tắt → không nạp script; slot trống → layout ổn định; chuyển route không nạp trùng |
| **P11** | Sprint 11 | Production readiness: chạy toàn bộ test backlog, security, CWV, backup/restore, monitoring, a11y, release | P0–P10 | RPO/RTO; hosting | Toàn bộ `T-*` pass; checklist phát hành ký xong |

> **Lưu ý đếm phase:** 12 phase (P0–P11) ứng với 12 sprint của spec §14. Không
> có phase "thừa" và không sprint nào bị bỏ.

---

## 6. Ma trận phụ thuộc

```
P0 ✅
 └─→ P1
      └─→ P2 ─┬─→ P3 ─→ P4 ─┐
               │              ├─→ P5 ─┬─→ P6 ─→ P7
               │              │       └─→ P8
               │              └─→ P9 ─→ P10
               └──────────────────────→ P11  (nhận toàn bộ test backlog)
```

Đọc: P5 cần P2–P4 (admin quản lý nội dung đã có). P6 và P9 độc lập nhau, đều
cần P5. P10 cần P9 (ẩn quảng cáo theo gói cần subscription thật). P11 cần mọi
thứ.

---

## 7. Thứ tự triển khai và lý do

1. **P1 trước mọi thứ** — nếu env/port/build chưa ổn định thì mọi phase sau đều
   gặp lỗi khó tái hiện.
2. **P2 trước P3–P5** — mọi dữ liệu tiến độ đều gắn `userId`; chưa có auth thì
   không thể kiểm chứng phân quyền.
3. **P5 (entitlements) trước P6–P9** — media, AI, Kaiwa đều là tác vụ tốn tiền;
   spec §16 yêu cầu "tính năng dài/đắt được giới hạn bằng quota, timeout, queue".
   Làm quota trước để không phải retrofit.
4. **P6 trước P7, P8** — phân tích câu và Kaiwa đều cần transcript/hạ tầng job.
5. **P9 (payment) trước P10 (AdSense)** — spec §14 cho phép tách, nhưng quyết
   định "Pro/VIP ẩn quảng cáo" cần entitlement của subscription tồn tại trước.
   Nếu chính sách chốt là "không ẩn quảng cáo theo gói" thì P10 có thể chạy song
   song P9.
6. **P11 cuối** — nhận toàn bộ test backlog theo quyết định 29/10.

---

## 8. Chiến lược test

**Quyết định 29/10/2026 (giữ nguyên):** toàn bộ test tự động dồn sang **P11**.
Trong các phase tính năng, checkpoint dùng `typecheck` + `lint` + `build` + kiểm
thử thủ công có ghi bằng chứng.

- Mỗi phase **ghi** test case vào backlog với ID `T-<phase>-<nn>` (ví dụ
  `T-P3-02`), kèm mô tả ngắn.
- Không viết file test trong P1–P10.
- P11 chạy toàn bộ backlog; chỉ khi đó mới tick `[x]` cho các mục test.

**Ngoại lệ bắt buộc:** spec §16 yêu cầu test cho quota, quyền truy cập và dữ
liệu trùng lặp. Các nhóm này **phải** có test case trong backlog ngay từ P5,
không được để trống.

---

## 9. ADR cần tạo (spec §13)

| ADR | Nội dung | Phase | Trạng thái ban đầu | Owner |
|---|---|---|---|---|
| ADR-001 | Phiên bản NestJS/Node + compatibility matrix | P1 | `Accepted` (đã xác minh) | Cả hai |
| ADR-002 | Bộ phân tích hình thái + giấy phép từ điển | P7 | `Proposed` | Cả hai |
| ADR-003 | AI/STT/speech-eval/Kaiwa provider + benchmark | P6–P8 | `Proposed` | Cả hai |
| ADR-004 | Video upload, giới hạn, queue, storage, retention | P6 | `Proposed` | Cả hai |
| ADR-005 | Nguồn video ngoài và quyền sử dụng | P6 | `Proposed` | Tôi |
| ADR-006 | Payment provider, tiền tệ, gia hạn, hủy, refund, mua một lần | P9 | `Proposed` | Tôi |
| ADR-007 | Định nghĩa entitlement/giới hạn Free–Pro–VIP | P5 | `Proposed` | Tôi |
| ADR-008 | Hosting, MongoDB, Redis, object storage, backup, monitoring | P11 | `Proposed` | Cả hai |
| ADR-009 | AdSense: điều kiện phê duyệt, consent, placement, Free vs Pro/VIP | P10 | `Proposed` | Tôi |

Mỗi ADR có: trạng thái, bối cảnh, lựa chọn, ưu/nhược, quyết định, hậu quả,
nguồn cần kiểm tra, người chịu trách nhiệm.

---

## 10. Rủi ro và chi phí cần benchmark

| Rủi ro | Ảnh hưởng | Giảm thiểu | Phase |
|---|---|---|---|
| Không có MongoDB thật khi dev | Không kiểm chứng được nhánh `connected` | Dùng Atlas free hoặc Community local — **Tôi quyết định** | P2 |
| Provider AI/STT chưa chọn | P6–P8 không thể bắt đầu | Trừu tượng hóa interface trước, adapter sau | P6 |
| Chi phí AI/STT vượt dự kiến | Ảnh hưởng ngân sách | Quota + timeout + usage tracking từ P5; benchmark trước khi chốt provider | P5–P8 |
| Nội dung/đề thi có bản quyền | Rủi ro pháp lý, mất tài khoản AdSense | Chỉ dùng nội dung có quyền; ghi nguồn + trạng thái quyền | P2, P4 |
| SRS chọn sai thuật toán | Phải làm lại schema progress | So sánh trước, tách `srs` module để thay thuật toán | P3 |
| AdSense bị từ chối | Không có doanh thu | Không phụ thuộc AdSense vào MVP; cờ tắt mặc định | P10 |
| ESM + Next 16 thay đổi API | Vỡ build | Đọc docs bundled `node_modules/next/dist/docs/` trước khi code (AGENTS.md) | P1+ |
| Test dồn cuối kỳ | Phát hiện lỗi muộn | Ghi test case ngay khi làm task; giữ CI typecheck/lint mỗi phase | Tất cả |

---

## 11. Đối chiếu spec → phase (coverage matrix)

| Mục spec | Nội dung | Phase |
|---|---|---|
| §1 | Quy ước trách nhiệm | Tất cả |
| §2 | Cách làm việc bắt buộc | Tất cả |
| §3 | Mục tiêu sản phẩm | P0 |
| §4 | Chức năng người học (mục cha) | P2–P8 (theo từng mục con) |
| §4.1 | Tài khoản & hồ sơ | P2 |
| §4.2 | Flashcard từ vựng (+ import PDF/Excel/CSV) | P3 |
| §4.3 | Flashcard ngữ pháp | P2 (schema) + P3 (học) |
| §4.4 | Lặp lại ngắt quãng | P3 |
| §4.5 | Bài tập & đề thi | P4 |
| §4.6 | Video, transcript, chính tả | P6 |
| §4.7 | Phân tích câu | P7 |
| §4.8 | Shadowing | P7 |
| §4.9 | AI Kaiwa | P8 |
| §5 | Quản trị viên | P5 |
| §6 | Thuê bao và quyền lợi (mục cha) | P5 + P9 |
| §6.1 | Hình thức bán | P9 |
| §6.2 | Entitlements | P5 (cơ chế) + P9 (gói) |
| §7 | Google AdSense (mục cha) | P10 |
| §7.1 | Mục tiêu quảng cáo | P10 |
| §7.2 | Phân công trách nhiệm | P10 (+ Tôi: tài khoản/Publisher ID) |
| §7.3 | Phạm vi vị trí quảng cáo đề xuất | P10 |
| §7.4 | Yêu cầu kỹ thuật | P10 |
| §7.5 | Quyền riêng tư, consent, chính sách | P10 (+ Tôi duyệt nội dung pháp lý) |
| §7.6 | Admin và cấu hình quảng cáo | P10 |
| §7.7 | Kiểm thử và nghiệm thu AdSense | P10 + P11 |
| §8 | Video và nguồn nội dung bên ngoài | P6 |
| §9 | Kiến trúc và dữ liệu (mục cha) | P1 + P6 + P11 |
| §9.1 | Công nghệ | P1 (nền) + P6/P11 (hạ tầng) |
| §9.2 | Nhóm dữ liệu | P2–P10 (xem §12) |
| §10 | AI và bộ phân tích tiếng Nhật | P6–P8 |
| §11 | AdSense ≠ thuê bao | P5 + P10 |
| §12 | Bảo mật, quyền riêng tư, vận hành | P2 (auth) + P11 |
| §13 | ADR | §9 tài liệu này |
| §14 | Lộ trình sprint | §5 tài liệu này |
| §15 | Yêu cầu đầu ra giai đoạn thiết kế | P0 (tài liệu này) |
| §16 | Điều kiện nghiệm thu tổng thể | P11 |
| §17 | Nhận diện sản phẩm, SEO, icon | P1 (nền) + P11 (kiểm chứng) |
| §17.1 | Tên dự án, tagline, mô tả | P1 (`app/site.ts`) + Tôi duyệt tên |
| §17.2 | Logo, favicon, OG image | P1 (placeholder) + Tôi duyệt bộ nhận diện |
| §17.3 | SEO kỹ thuật & metadata | P1 (metadata/robots/sitemap) + P11 (kiểm chứng) |
| §17.4 | SEO đa ngôn ngữ | P1 (trường `lang`) — mở rộng sau (Q-21) |
| §17.5 | Tiêu chí nghiệm thu SEO & thương hiệu | P11-SEO-01 |
| §18 | Quy chuẩn UI với Preline | P1+ (mọi phase UI) |
| §18.1 | Công nghệ UI bắt buộc | P1 |
| §18.2 | Yêu cầu triển khai UI | P1+ (mọi phase UI) |
| §18.3 | Hướng dẫn [CC] về Preline | P1 |
| §18.4 | Tiêu chí nghiệm thu UI | Mọi checkpoint phase UI + P11-A11Y-01 |
| §18.5, §18.6, §18.7, §18.8 (bản gốc đánh nhầm số, thực chất là §19.1–19.8 — xem Q-17) | Hướng dẫn lượt 2–3, quy tắc làm việc, kiểm tra sau mỗi phase | P0 (đã thực hiện) + mọi phase (checklist cuối phase) |
| §19 | Hướng dẫn khởi tạo dự án | P0 (đã thực hiện) |

---

## 12. Đối chiếu collection → phase

| Collection (`database.md`) | Phase | Ghi chú |
|---|---|---|
| `users` | P2 | role, lang, progress index |
| `auth_accounts`, sessions | P2 | theo provider được duyệt |
| `textbooks`, `units` | P2 | owner: admin |
| `vocabulary` | P2 | furigana, POS, nghĩa, ví dụ, nguồn, tags |
| `grammar_points` | P2 | 1 điểm ↔ N ví dụ/bài tập |
| `flashcard_decks`, `flashcards` | P3 | deck chia sẻ + cá nhân |
| `user_card_progress` | P3 | SRS state |
| `study_sessions` | P3 | timezone, thiết bị |
| `exercise_attempts` | P4 | |
| `exam_attempts` | P4 | |
| `media_assets` | P6 | chỉ metadata; binary ở object storage |
| `transcripts`, `transcript_segments` | P6 | timestamp |
| `sentence_analyses` | P7 | schema versioned + analyzer/model |
| `ai_jobs` | P6 (nền) → P7/P8 | quota reserve/settle/release |
| `subscription_plans` | P9 | |
| `user_subscriptions`, `payments` | P9 | unique một gói đang hiệu lực |
| webhook events | P9 | chữ ký + idempotency |
| `feedback` | P5 | trạng thái xử lý + lịch sử |
| `audit_logs` | P5 | ai đổi, khi nào, giá trị |
| feature config / quota reservations / usage records | P5 | tách khỏi role |
| Ads placement/feature flag | P10 | mặc định tắt, không lưu dữ liệu nhạy cảm |

**Không** tạo collection trước phase tương ứng (spec §9.2, `database.md` §1).

---

## 13. Quy tắc vận hành kế hoạch

- Làm xong **một** phase → dừng, báo cáo kết quả thật, chờ xác nhận.
- Không tự chuyển phase khi gate chưa được chốt.
- Không tick `[x]` nếu chưa chạy lệnh kiểm chứng và ghi bằng chứng.
- Không commit/push khi chưa được yêu cầu.
- Mọi thay đổi kiến trúc lớn phải có ADR và được duyệt trước.
