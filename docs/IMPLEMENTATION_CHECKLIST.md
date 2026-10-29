# Implementation Checklist — Nihongo Path

> Chi tiết hoá [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md). Mỗi task có ID
> duy nhất, phụ thuộc, file/module dự kiến, tiêu chí hoàn thành kiểm chứng được
> và cách kiểm thử.
>
> **Ngày lập:** 30/10/2026. Cập nhật lần cuối: 30/10/2026.

---

## 0. Quy ước

### 0.1. Trạng thái

| Ký hiệu | Nghĩa |
|---|---|
| `[ ]` | Chưa làm |
| `[x]` | **Xong và đã kiểm chứng bằng lệnh** — bắt buộc có bằng chứng |
| `[~]` | Làm dở / có khuyết điểm đã biết |
| `[—]` | Không áp dụng / hoãn có chủ đích (ghi rõ lý do) |
| `⏸` | Chờ **Tôi** quyết định — không được tự làm tiếp |

**Quy tắc vàng:** không tick `[x]` nếu chưa chạy lệnh/thao tác kiểm chứng và ghi
kết quả thật vào cột *Kiểm thử* hoặc mục *Bằng chứng*.

### 0.2. Mã domain trong ID

| Mã | Domain | Mã | Domain |
|---|---|---|---|
| `ENV` | môi trường, build, script | `ADMIN` | quản trị |
| `API` | backend nền tảng | `QUOTA` | hạn mức, entitlement |
| `AUTH` | xác thực | `FEEDBACK` | phản hồi người dùng |
| `USER` | người dùng, hồ sơ | `MEDIA` | upload, lưu trữ media |
| `CONTENT` | giáo trình, từ vựng, ngữ pháp | `STT` | chép lời |
| `CARD` | bộ thẻ, thẻ | `ANALYZE` | phân tích câu |
| `SRS` | lặp lại ngắt quãng | `SHADOW` | shadowing |
| `IMPORT` | nhập hàng loạt | `KAIWA` | hội thoại AI |
| `EXAM` | bài tập, đề thi | `BILL` | thanh toán, thuê bao |
| `SEO` | metadata, sitemap, thẻ xã hội | `ADS` | AdSense |
| `UI` | giao diện | `SEC` | bảo mật |
| `A11Y` | khả năng tiếp cận | `OPS` | vận hành, giám sát |
| `DOC` | tài liệu | `TEST` | kiểm thử |

ID dạng `P<phase>-<DOMAIN>-<nn>`. Test case dùng `T-P<phase>-<nn>`.

### 0.3. Đánh số phase

`P0`–`P11` map 1:1 với **Sprint 0–11** của spec §14. Phần bootstrap cũ
(A/B1–B4) nằm trọn trong **P0** (Sprint 0, đã xong) và **P1** (Sprint 1 —
Foundation, còn việc).

---

## P0 — Sprint 0: Discovery

> Hoàn tất 29/10/2026. Toàn bộ mục dưới đây đã chạy và có bằng chứng.

| ID | Task | Phụ thuộc | File/module | Hoàn thành khi | Kiểm thử | TT |
|---|---|---|---|---|---|---|
| P0-DOC-01 | Khảo sát repo: git status, cấu trúc, `.env` tồn tại | — | — | Biết rõ trạng thái ban đầu | `git status`, `ls` | `[x]` |
| P0-ENV-01 | Xác minh Node `v22.23.3`, pnpm 12.11.2; kiểm tra MongoDB local & Docker | — | `.nvmrc` | Ghi nhận: **không có** mongod → chọn graceful-degrade | `node -v`, `pnpm -v` | `[x]` |
| P0-DOC-02 | Xác minh phiên bản từ npm registry (không dựa trí nhớ) | P0-ENV-01 | — | next 16.4.3, @nestjs/core 12.x, mongoose 8.24.7, preline 5.0.0, tailwind 4.x | `npm view <pkg> version engines` | `[x]` |
| P0-DOC-03 | Chốt 4 quyết định nền: monorepo `apps/ui`+`apps/api`; MongoDB graceful-degrade; quyền chạy lệnh cài đặt; hoãn Vitest UI | P0-DOC-02 | `.claude/settings.json` | 4 quyết định được ghi lại | đối chiếu phiếu trả lời | `[x]` |
| P0-DOC-04 | Lập kế hoạch bootstrap B1–B4 và được duyệt | P0-DOC-03 | `docs/IMPLEMENTATION_PLAN.md` (đã thay thế `phase-plan.md` cũ) | Kế hoạch được duyệt | người dùng xác nhận | `[x]` |
| P0-DOC-05 | Lập bộ tài liệu triển khai đầy đủ P0–P11 (thay tài liệu cũ) | P0-DOC-04 | `docs/IMPLEMENTATION_PLAN.md`, `docs/IMPLEMENTATION_CHECKLIST.md`, `docs/OPEN_QUESTIONS.md` | 3 file tồn tại; spec §1–§19 phủ đủ; ID task/test duy nhất; phụ thuộc hợp lệ | xem §"Kiểm chứng cuối" (V1–V7) | `[x]` |

---

## P1 — Sprint 1: Foundation

> Gồm toàn bộ bootstrap A/B1–B4 và các lỗi phát hiện khi rà soát (L1–L8 ở
> `IMPLEMENTATION_PLAN.md` §3.3). **Đây là phase duy nhất có thể làm ngay.**

### 1.1. Frontend nền (đã xong)

| ID | Task | Phụ thuộc | File/module | Hoàn thành khi | Kiểm thử | TT |
|---|---|---|---|---|---|---|
| P1-ENV-01 | Scaffold Next.js 16.4.3 (TS, App Router, Turbopack, ESLint 9) + Preline 5 | P0-DOC-03 | `apps/ui/package.json` | Cài đặt thành công | `pnpm install` | `[x]` |
| P1-ENV-02 | Tailwind 4 CSS-first + Preline (`@source`, `variants.css`, `theme.css`) + theme token | P1-ENV-01 | `apps/ui/app/globals.css`, `app/themes/theme.css` | Trang render có style Preline | `next build` + xem HTML | `[x]` |
| P1-ENV-03 | Layout chung + metadata mặc định (title template, OG, locale `vi_VN`) | P1-ENV-01 | `app/layout.tsx`, `app/site.ts` | `<title>`/`<meta>` đúng | xem HTML | `[x]` |
| P1-ENV-04 | Khởi tạo Preline an toàn App Router (dynamic import trong `useEffect`, re-init theo pathname) | P1-ENV-02 | `components/preline.tsx` | Không lỗi SSR, không double-init | `next build`, kiểm tra console | `[x]` |
| P1-ENV-05 | Routes nền: `/`, `/login`, `/learn` (noindex), `/admin` (noindex) | P1-ENV-03 | `app/*/page.tsx` | 4 route trả 200 | `curl` từng route | `[x]` |
| P1-ENV-06 | SEO: `robots.ts`, `sitemap.ts`, `opengraph-image.tsx`, `icon.svg` | P1-ENV-03 | `app/robots.ts`, `app/sitemap.ts`, `app/opengraph-image.tsx`, `app/icon.svg` | File hợp lệ, không lộ route riêng tư | `curl /robots.txt`, `/sitemap.xml` | `[x]` |
| P1-ENV-07 | Gom chuỗi thương hiệu vào một chỗ (`TODO(rebrand)`) | P1-ENV-03 | `app/site.ts` | Không còn chuỗi brand rải rác | `grep -rn "Nihongo Path" app components` | `[x]` |

### 1.2. Backend nền (đã xong)

| ID | Task | Phụ thuộc | File/module | Hoàn thành khi | Kiểm thử | TT |
|---|---|---|---|---|---|---|
| P1-API-01 | Validate env (`NODE_ENV`, `PORT`, `WEB_ORIGIN`, `MONGODB_URL`, `MONGODB_URL_REQUIRED`) | P0-DOC-03 | `src/config/env.types.ts`, `src/config/env.validation.ts` | Sai giá trị → throw với thông điệp rõ | `tsc --noEmit` | `[x]` |
| P1-API-02 | Nạp `.env`/`.env.local` trước khi module evaluate | P1-API-01 | `src/bootstrap/env.ts` | `MONGODB_URL` có sẵn lúc `buildDatabaseModule()` chạy | kiểm tra thứ tự import | `[x]` |
| P1-API-03 | `buildDatabaseModule()`: có URL → Mongoose fail-fast; thiếu → không đăng ký | P1-API-02 | `src/database/database.module.ts` | Hai nhánh chạy đúng | chạy với/không có URL | `[x]` |
| P1-API-04 | `HealthService`: `health()` + `ready()` (ping, không throw) | P1-API-03 | `src/health/health.service.ts` | Trả `connected`/`unreachable`/`not-configured` | gọi trực tiếp | `[x]` |
| P1-API-05 | `HealthController`: `GET /health`, `GET /health/ready` | P1-API-04 | `src/health/health.controller.ts` | **Hiện SAI**: `/health` gọi `ready()`; `/health/ready` bị comment; `@ApiOperation` trùng → xem P1-API-09 | đọc code | `[~]` |
| P1-API-06 | `HealthModule` import `buildDatabaseModule()` | P1-API-04 | `src/health/health.module.ts` | Injector có token connection | app khởi động | `[x]` |
| P1-API-07 | `AppModule` wiring: ConfigModule global + DB + Health | P1-API-01, P1-API-06 | `src/app.module.ts` | App khởi động không lỗi DI | `node dist/main.js` | `[x]` |
| P1-API-08 | `main.ts`: ValidationPipe global, Swagger dev/test, CORS theo `WEB_ORIGIN`, port qua ConfigService | P1-API-07 | `src/main.ts` | Swagger có ở dev, không có ở production | `NODE_ENV=production` so sánh | `[x]` |
| P1-API-09 | **Sửa** `HealthController`: `GET /health` = liveness, `GET /health/ready` = readiness, bỏ `@ApiOperation` trùng | P1-API-05 | `src/health/health.controller.ts` | 2 endpoint trả đúng shape và status | `curl :3000/health`, `/health/ready` | `[ ]` |
| P1-API-10 | Bỏ `AppController`/`AppService` "Hello World!" ở `/` (hoặc chuyển thành `/` trả metadata API) | P1-API-07 | `src/app.controller.ts`, `src/app.service.ts`, `src/app.module.ts` | `/` không còn trả chuỗi scaffold | `curl :3000/` | `[ ]` |

### 1.3. Scripts & env mẫu

| ID | Task | Phụ thuộc | File/module | Hoàn thành khi | Kiểm thử | TT |
|---|---|---|---|---|---|---|
| P1-ENV-08 | `apps/api/package.json`: `dev`, `typecheck`, `start:prod` (ESM) | P1-API-08 | `apps/api/package.json` | Script chạy được | `pnpm --filter @nihongo/api run typecheck` | `[x]` |
| P1-ENV-09 | `apps/api/.env.example`: `PORT`, `WEB_ORIGIN`, `MONGODB_URL`, `MONGODB_URL_REQUIRED` + placeholder Redis/Auth/Google | P1-API-01 | `apps/api/.env.example` | Chỉ tên biến + giá trị minh họa, không secret thật | `git check-ignore` | `[x]` |
| P1-ENV-10 | `apps/ui/.env.example`: `PORT`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL` | P1-ENV-01 | `apps/ui/.env.example` | Có đủ 3 biến | `cat` | `[x]` |
| P1-ENV-11 | `apps/ui/.gitignore`: `!.env.example` | P1-ENV-10 | `apps/ui/.gitignore` | `.env.example` không bị ignore | `git check-ignore apps/ui/.env.example` → exit 1 | `[x]` |
| P1-ENV-12 | Fix UI chạy đúng `PORT` trong `.env` | P1-ENV-10 | `apps/ui/package.json` | **Đã sửa** (commit `6a2692c`): script `dotenv run -f .env -- next <cmd>` + dep `dotenv-cli@11`; boot đúng `:3001` (đã kiểm chứng 30/10) — còn hậu quả strict khi thiếu `.env`: xem P1-ENV-14 | `pnpm --filter @nihongo/ui run dev` → log `Local: http://localhost:3001` | `[x]` |
| P1-ENV-13 | Bật CORS theo `WEB_ORIGIN` | P1-API-08 | `src/main.ts` | UI khác origin gọi được API | `curl -H "Origin: ..."` | `[x]` |
| P1-ENV-14 | Script env UI chạy được + tôn trọng `PORT` trong `.env` — **đã làm bởi user** (commit `6a2692c`: `dotenv run -f .env -- next <cmd>` + dep `dotenv-cli@11`); [CC] kiểm chứng lại: `env -u PORT dotenv run -f .env -- next dev` → `Local: http://localhost:3001` (30/10) | P1-ENV-12 | `apps/ui/package.json` | `dev`/`build`/`start` chạy; `PORT` trong `.env` được tôn trọng (bằng chứng: boot `:3001` mà không có biến shell) | log `Local: http://localhost:3001` | `[x]` |
| P1-ENV-15 | Xử lý `apps/ui/envConfig.ts` (không được import ở đâu): hoặc xoá, hoặc import trong `next.config.ts` cho biến không phải `PORT` | P1-ENV-14 | `apps/ui/envConfig.ts`, `apps/ui/next.config.ts` | Không còn file chết; quyết định được ghi chú | `grep -rn envConfig apps/ui --exclude-dir=node_modules` | `[ ]` |
| P1-ENV-16 | Sửa chú thích sai trong `apps/ui/.env.example` (cách `node --env-file-if-exists` không dùng được với Next) | P1-ENV-14 | `apps/ui/.env.example` | Chú thích khớp script thật | đọc file | `[ ]` |

### 1.4. Kiểm chứng runtime & tài liệu

| ID | Task | Phụ thuộc | File/module | Hoàn thành khi | Kiểm thử | TT |
|---|---|---|---|---|---|---|
| P1-ENV-17 | Checkpoint build toàn monorepo | P1-ENV-14, P1-API-09, P1-API-10 | root `package.json` | Cả 3 lệnh exit 0 | `pnpm -r run typecheck`; `pnpm -r run lint`; `pnpm -r run build` | `[ ]` |
| P1-ENV-18 | Kiểm chứng runtime backend | P1-API-09 | `apps/api/dist/main.js` | `/health` 200 `{status:"ok"}`; `/health/ready` 200 `database:"not-configured"`; `/api/docs` 200 | `node dist/main.js` + `curl` | `[ ]` |
| P1-ENV-19 | Chứng minh fail-fast có chủ đích | P1-ENV-18 | — | Khởi động **thất bại** với lỗi rõ khi DB không tới được | `MONGODB_URL=mongodb://127.0.0.1:59999/x node dist/main.js` | `[ ]` |
| P1-ENV-20 | Kiểm chứng UI: port, SEO, Preline | P1-ENV-14 | `apps/ui` | Log đúng `:3001`; `/robots.txt`, `/sitemap.xml` trả 200; dropdown + off-canvas hoạt động sau chuyển route (kiểm bằng browser) | `curl` + thao tác trình duyệt | `[ ]` |
| P1-DOC-01 | Viết `docs/development.md` (chạy local, bảng env, MongoDB thật, lưu ý ESM/Preline/port) | P1-ENV-17 | `docs/development.md` | Người mới làm theo chạy được cả 2 app | làm theo tài liệu từ clone sạch | `[ ]` |
| P1-DOC-02 | Cập nhật `architecture.md`: "Jest" → **Vitest 4** (L5 `MONGODB_URI`→`MONGODB_URL` đã sửa trong working tree, chỉ còn phần Jest ở dòng 30, 93) | P1-DOC-01 | `docs/architecture.md` | Không còn mô tả sai so với code | `grep -n "Jest\|MONGODB_URI" docs/architecture.md` | `[ ]` |
| P1-SEC-01 | Kiểm tra secrets: `.env` bị ignore, `.env.example` không có giá trị thật | P1-ENV-11 | `.gitignore`, `apps/*/.gitignore` | Không có `.env` nào trong git | `git status --porcelain --ignored` | `[ ]` |
| P1-OPS-01 | Root scripts điều phối đúng (`dev`, `build`, `lint`, `typecheck`) | P1-ENV-17 | root `package.json` | `pnpm dev` chạy song song 2 app | `pnpm dev` (Ctrl+C sau khi thấy log) | `[ ]` |

**Checkpoint P1:** P1-ENV-17 + P1-ENV-18 + P1-ENV-20 pass → báo cáo → **DỪNG**.
Test case sinh ra: `T-P1-01` … `T-P1-06` (xem backlog).

**Ghi chú kỹ thuật khi đọc kết quả P1-ENV-18/19:**
- Máy dev có `.env` chứa `MONGODB_URL` thì `/health/ready` sẽ báo
  `connected`/`unreachable` **thay vì** `not-configured` — đối chiếu đúng nhánh
  trước khi kết luận sai.
- Hiện không có mongod (local & Docker), nên chỉ kiểm chứng được nhánh
  `not-configured` + fail-fast; nhánh `connected` chờ MongoDB thật (Q-02).
- "Bằng chứng" chỉ được ghi khi lệnh **đã chạy thật** và pass; tick `[x]` mà
  không có output là vi phạm quy ước.

---

## P2 — Sprint 2: Identity & Content

> **Gate ⏸:** provider auth (Google/GitHub/email) và MongoDB thật phải được Tôi
> chốt trước khi bắt đầu (Q-01, Q-02).

### 2.1. Xác thực

| ID | Task | Phụ thuộc | File/module | Hoàn thành khi | Kiểm thử | TT |
|---|---|---|---|---|---|---|
| P2-AUTH-01 | Chốt provider auth + viết ADR | P1-ENV-17 | `docs/adr/ADR-auth-provider.md` | Tôi duyệt; ADR `Accepted` | người dùng xác nhận | `⏸` |
| P2-AUTH-02 | Schema `users` (role, lang, trạng thái, index) | P2-AUTH-01 | `src/users/schemas/user.schema.ts` | Index theo truy vấn thực; role tách khỏi plan | xem `database.md` §3 | `[ ]` |
| P2-AUTH-03 | Schema `auth_accounts` + session/refresh token | P2-AUTH-02 | `src/auth/schemas/*` | Unique `(provider, providerAccountId)` | kiểm tra index | `[ ]` |
| P2-AUTH-04 | Endpoint đăng ký/đăng nhập theo provider đã chốt | P2-AUTH-03 | `src/auth/auth.controller.ts`, `auth.service.ts` | Trả access + refresh token; lỗi sai mật khẩu là 401 chung chung | gọi API bằng `curl` | `[ ]` |
| P2-AUTH-05 | JWT access/refresh (TTL theo `.env.example`) | P2-AUTH-04 | `src/auth/token.service.ts` | Token hết hạn bị từ chối | gọi API với token hết hạn | `[ ]` |
| P2-AUTH-06 | `AuthGuard` + `RolesGuard` | P2-AUTH-05 | `src/auth/guards/*` | Thiếu token → 401; sai role → 403 | `curl` không/không đủ quyền | `[ ]` |
| P2-AUTH-07 | Decorator `@CurrentUser()`, `@Roles()` | P2-AUTH-06 | `src/auth/decorators/*` | Dùng được trong controller | `tsc --noEmit` | `[ ]` |
| P2-AUTH-08 | Rate limit cho endpoint đăng nhập | P2-AUTH-04 | `src/auth/*` | Vượt ngưỡng → 429 | gọi lặp nhanh | `[ ]` |
| P2-USER-01 | Hồ sơ: xem/sửa thông tin của chính mình | P2-AUTH-06 | `src/users/users.controller.ts` | Không sửa được user khác | gọi API với id khác | `[ ]` |
| P2-USER-02 | Cơ chế tạo admin đầu tiên (thủ công, không auto-seed) | P2-AUTH-02 | `scripts/` hoặc tài liệu | Có quy trình rõ, không tự tạo tài khoản | làm theo tài liệu | `[ ]` |

### 2.2. Nội dung học

| ID | Task | Phụ thuộc | File/module | Hoàn thành khi | Kiểm thử | TT |
|---|---|---|---|---|---|---|
| P2-CONTENT-01 | Schema + CRUD `textbooks`, `units` (admin only) | P2-AUTH-06 | `src/content/schemas/*`, `content.controller.ts` | Chỉ admin ghi; public đọc được | `curl` với/không token | `[ ]` |
| P2-CONTENT-02 | Schema + CRUD `vocabulary` (furigana, POS, nghĩa VN, ví dụ, nguồn, tags) | P2-CONTENT-01 | `src/content/schemas/vocabulary.schema.ts` | Đủ trường theo spec §4.2 | xem schema | `[ ]` |
| P2-CONTENT-03 | Schema + CRUD `grammar_points` (1 điểm ↔ N ví dụ/bài tập) | P2-CONTENT-01 | `src/content/schemas/grammar-point.schema.ts` | Quan hệ nhiều-ví-dụ đúng | xem schema | `[ ]` |
| P2-CONTENT-04 | API đọc công khai có phân trang + filter theo giáo trình/cấp độ | P2-CONTENT-02, P2-CONTENT-03 | `content.controller.ts` | Phân trang ổn định, không lộ dữ liệu riêng tư | `curl` với `page`/`limit` | `[ ]` |
| P2-CONTENT-05 | Trường `lang` trên nội dung (không hard-code tiếng Việt) | P2-CONTENT-02 | schema nội dung | Có `lang`, mặc định `vi` | xem schema | `[ ]` |

### 2.3. Giao diện

| ID | Task | Phụ thuộc | File/module | Hoàn thành khi | Kiểm thử | TT |
|---|---|---|---|---|---|---|
| P2-UI-01 | Trang `/login` nối API thật (Preline form, trạng thái loading/error) | P2-AUTH-04 | `app/login/page.tsx`, `components/auth/*` | Đăng nhập thành công → chuyển trang; lỗi hiển thị rõ | thao tác trình duyệt | `[ ]` |
| P2-UI-02 | Trang đăng ký (nếu provider hỗ trợ) | P2-UI-01 | `app/register/page.tsx` | Tạo được tài khoản | thao tác trình duyệt | `[ ]` |
| P2-UI-03 | Bảo vệ route riêng tư (`/learn`, `/admin`) ở tầng server | P2-AUTH-05 | `middleware.ts`, layout | Chưa đăng nhập → redirect `/login` | mở URL khi chưa auth | `[ ]` |
| P2-UI-04 | Màn hình admin CRUD nội dung (Preline table + form + confirm xoá) | P2-CONTENT-04 | `app/admin/content/*` | Tạo/sửa/xoá hoạt động; có empty/error state | thao tác trình duyệt | `[ ]` |
| P2-UI-05 | Chiến lược lưu token (httpOnly cookie vs memory) + refresh | P2-AUTH-05 | `lib/api-client.ts` | Không lưu refresh token ở nơi script đọc được | review code | `[ ]` |
| P2-UI-06 | Header hiển thị trạng thái đăng nhập + menu tài khoản | P2-UI-01 | `components/site-header.tsx` | Đổi trạng thái đúng sau login/logout | thao tác trình duyệt | `[ ]` |

### 2.4. Tài liệu

| ID | Task | Phụ thuộc | File/module | Hoàn thành khi | Kiểm thử | TT |
|---|---|---|---|---|---|---|
| P2-DOC-01 | Cập nhật `database.md` với schema/index thực tế của P2 | P2-CONTENT-03 | `docs/database.md` | Khớp code | đối chiếu | `[ ]` |

**Checkpoint P2:** `typecheck` + `lint` + `build` exit 0; kiểm thử tay: đăng nhập,
chặn route, CRUD nội dung. Test case: `T-P2-01` … `T-P2-10`.

---

## P3 — Sprint 3: Flashcards & SRS

> **Gate ⏸:** thuật toán SRS (Q-03) và quyền nội dung nhập vào (Q-12).

| ID | Task | Phụ thuộc | File/module | Hoàn thành khi | Kiểm thử | TT |
|---|---|---|---|---|---|---|
| P3-CARD-01 | Schema `flashcard_decks` (chia sẻ + cá nhân) | P2-CONTENT-02 | `src/flashcards/schemas/deck.schema.ts` | Deck cá nhân gắn `userId`; deck chia sẻ không | xem schema | `[ ]` |
| P3-CARD-02 | Schema `flashcards` (tham chiếu deck, vocabulary/grammar) | P3-CARD-01 | `src/flashcards/schemas/card.schema.ts` | Index theo `deckId` | xem schema | `[ ]` |
| P3-CARD-03 | CRUD bộ thẻ cá nhân (chỉ chủ sở hữu) | P3-CARD-02, P2-AUTH-06 | `flashcards.controller.ts` | Không sửa được deck người khác | gọi API với id khác | `[ ]` |
| P3-CARD-04 | Đọc bộ thẻ chia sẻ + lưu từ trong lúc học | P3-CARD-03 | `flashcards.service.ts` | Lưu từ tạo card trong deck cá nhân | thao tác UI | `[ ]` |
| P3-IMPORT-01 | Parser CSV/XLSX | P3-CARD-02 | `src/import/parsers/*` | Đọc được file mẫu; báo lỗi rõ khi sai định dạng | upload file mẫu | `[ ]` |
| P3-IMPORT-02 | Ánh xạ cột + preview (không ghi DB) | P3-IMPORT-01 | `src/import/import.service.ts` | Trả về bản xem trước + danh sách lỗi từng dòng | gọi API preview | `[ ]` |
| P3-IMPORT-03 | Phát hiện trùng lặp trước khi nhập | P3-IMPORT-02 | `import.service.ts` | Đánh dấu dòng trùng, cho phép bỏ qua/ghi đè | gọi API với file có trùng | `[ ]` |
| P3-IMPORT-04 | Xác nhận và ghi hàng loạt (idempotent) | P3-IMPORT-03 | `import.service.ts` | Gửi lại cùng request không tạo bản ghi đôi | gọi 2 lần | `[ ]` |
| P3-IMPORT-05 | Hỗ trợ PDF (nếu được duyệt — Q-12) | P3-IMPORT-01 | `src/import/parsers/pdf.ts` | Chỉ làm khi Tôi duyệt; nếu không → `[—]` | — | `⏸` |
| P3-SRS-01 | ADR thuật toán SRS (so sánh, chọn, mô tả dữ liệu cần lưu) | P3-CARD-02 | `docs/adr/ADR-srs.md` | Tôi duyệt; ADR `Accepted` | người dùng xác nhận | `⏸` |
| P3-SRS-02 | Schema `user_card_progress` + index `(userId, dueDate)` | P3-SRS-01 | `src/srs/schemas/progress.schema.ts` | Index tồn tại | xem index | `[ ]` |
| P3-SRS-03 | Tính lịch ôn từ phản hồi người học | P3-SRS-02 | `src/srs/srs.service.ts` | Cùng chuỗi phản hồi → cùng `dueDate` | gọi hàm thuần | `[ ]` |
| P3-SRS-04 | API phiên ôn: thẻ mới / đến hạn / khó nhớ / đã thuộc | P3-SRS-03 | `src/srs/srs.controller.ts` | Trả đúng nhóm, không lẫn user khác | gọi API 2 user | `[ ]` |
| P3-SRS-05 | Xử lý timezone và ngày reset | P3-SRS-03 | `srs.service.ts` | Cùng thời điểm, 2 timezone → kết quả đúng theo tz người dùng | đổi tz hồ sơ | `[ ]` |
| P3-SRS-06 | Học trên nhiều thiết bị (ghi đồng thời) | P3-SRS-04 | `srs.service.ts` | Không mất tiến độ; ghi sau thắng theo quy tắc rõ | gửi 2 request song song | `[ ]` |
| P3-UI-01 | Màn hình học flashcard (Preline card, phím tắt, a11y) | P3-SRS-04 | `app/learn/flashcards/*` | Lật thẻ, đánh giá, chuyển thẻ mượt | thao tác trình duyệt | `[ ]` |
| P3-UI-02 | Wizard nhập hàng loạt (upload → map cột → preview → xác nhận) | P3-IMPORT-04 | `app/admin/import/*` | 4 bước rõ ràng, có huỷ giữa chừng | thao tác trình duyệt | `[ ]` |
| P3-UI-03 | Danh sách bộ thẻ + tiến độ | P3-CARD-03 | `app/learn/decks/*` | Hiển thị số thẻ mới/đến hạn | thao tác trình duyệt | `[ ]` |
| P3-DOC-01 | Cập nhật `database.md` cho deck/card/progress + SRS state | P3-SRS-02 | `docs/database.md` | Khớp code | đối chiếu | `[ ]` |

**Checkpoint P3:** build/lint/typecheck; import mẫu chạy end-to-end; thẻ đến hạn
đúng. Test case: `T-P3-01` … `T-P3-12`.

---

## P4 — Sprint 4: Exercises & Exams

> **Gate ⏸:** loại kỳ thi (JLPT/JFT/NAT) và quyền sử dụng đề (Q-12).

| ID | Task | Phụ thuộc | File/module | Hoàn thành khi | Kiểm thử | TT |
|---|---|---|---|---|---|---|
| P4-EXAM-01 | Schema câu hỏi (loại, đáp án đúng, giải thích) | P2-CONTENT-04 | `src/exams/schemas/question.schema.ts` | Đáp án đúng luôn tách khỏi dữ liệu gửi client | xem DTO trả về | `[ ]` |
| P4-EXAM-02 | Schema đề thi (cấp độ, loại kỳ thi, năm, bộ câu hỏi) | P4-EXAM-01 | `src/exams/schemas/exam.schema.ts` | Cấu hình được thời gian, thang điểm | xem schema | `[ ]` |
| P4-EXAM-03 | Schema `exercise_attempts`, `exam_attempts` | P4-EXAM-02, P2-AUTH-06 | `src/exams/schemas/attempt.schema.ts` | Lưu câu trả lời, điểm, thời gian, giải thích | xem schema | `[ ]` |
| P4-EXAM-04 | API bắt đầu/nộp bài; chặn hết giờ phía server | P4-EXAM-03 | `src/exams/exams.controller.ts` | Nộp sau hạn → bị từ chối/đánh dấu hết giờ | gọi API với thời gian giả lập | `[ ]` |
| P4-EXAM-05 | Xáo câu hỏi/thứ tự lựa chọn, giữ nguyên đáp án đúng | P4-EXAM-04 | `src/exams/shuffle.service.ts` | Đáp án đúng luôn khớp sau khi xáo | chạy 100 lần với seed | `[ ]` |
| P4-EXAM-06 | Chấm điểm + trả giải thích | P4-EXAM-05 | `exams.service.ts` | Điểm khớp đáp án; giải thích chỉ hiện sau khi nộp | gọi API | `[ ]` |
| P4-EXAM-07 | Xem lại lỗi sau khi làm | P4-EXAM-06 | `exams.controller.ts` | Liệt kê câu sai + đáp án đúng + giải thích | thao tác UI | `[ ]` |
| P4-EXAM-08 | Thống kê tiến độ làm bài | P4-EXAM-07 | `src/exams/stats.service.ts` | Theo thời gian, theo cấp độ, theo loại đề | gọi API | `[ ]` |
| P4-EXAM-09 | Admin soạn đề (câu hỏi, đáp án, giải thích, năm, cấp) | P4-EXAM-02, P2-UI-04 | `app/admin/exams/*` | Tạo đề hoàn chỉnh qua UI | thao tác trình duyệt | `[ ]` |
| P4-UI-01 | Màn hình làm bài (timer, điều hướng câu, cờ đánh dấu) | P4-EXAM-04 | `app/learn/exams/*` | Không mất câu trả lời khi refresh (lưu nháp) | thao tác trình duyệt | `[ ]` |
| P4-UI-02 | Màn hình kết quả + xem lại lỗi | P4-EXAM-07 | `app/learn/exams/[id]/result/*` | Hiển thị điểm, thời gian, từng câu | thao tác trình duyệt | `[ ]` |
| P4-SEC-01 | Không lộ đáp án đúng qua API trước khi nộp | P4-EXAM-01 | DTO/response | Response làm bài không chứa `isCorrect` | `curl` và kiểm JSON | `[ ]` |
| P4-DOC-01 | Cập nhật `database.md` cho nhóm exam | P4-EXAM-03 | `docs/database.md` | Khớp code | đối chiếu | `[ ]` |

**Checkpoint P4:** build/lint/typecheck; làm thử 1 đề end-to-end. Test case:
`T-P4-01` … `T-P4-10`.

---

## P5 — Sprint 5: Admin, Feedback & Entitlements

> **Gate ⏸:** định nghĩa Free/Pro/VIP + con số hạn mức (Q-07).

| ID | Task | Phụ thuộc | File/module | Hoàn thành khi | Kiểm thử | TT |
|---|---|---|---|---|---|---|
| P5-QUOTA-01 | Schema cấu hình tính năng (`featureKey`, bật/tắt, limit, chu kỳ, tz reset) | P4-EXAM-03 | `src/entitlements/schemas/feature-config.schema.ts` | Cấu hình được không cần deploy | xem schema | `[ ]` |
| P5-QUOTA-02 | Schema `quota_reservations` + `usage_records` | P5-QUOTA-01 | `src/entitlements/schemas/*` | Có index theo `(userId, featureKey, period)` | xem index | `[ ]` |
| P5-QUOTA-03 | Service reserve → settle → release | P5-QUOTA-02 | `src/entitlements/quota.service.ts` | Reserve trừ hạn mức; settle chốt; release hoàn lại | gọi service | `[ ]` |
| P5-QUOTA-04 | `EntitlementGuard` + `QuotaGuard` | P5-QUOTA-03, P2-AUTH-06 | `src/entitlements/guards/*` | Plan không có quyền → 403; hết hạn mức → 429/403 theo quy ước | gọi API | `[ ]` |
| P5-QUOTA-05 | Reset theo chu kỳ + timezone | P5-QUOTA-03 | `quota.service.ts` | Sang kỳ mới hạn mức về mặc định đúng tz | giả lập thời gian | `[ ]` |
| P5-QUOTA-06 | Chính sách vượt hạn mức (chặn / cho vượt có ghi nhận) | P5-QUOTA-04 | `quota.service.ts` | Hành vi khớp quyết định của Tôi | gọi API vượt | `⏸` |
| P5-ADMIN-01 | Khung admin + RBAC (`USER`/`ADMIN`/`SUPER_ADMIN`) | P2-UI-04 | `app/admin/layout.tsx`, `src/admin/*` | Vào `/admin` khi không đủ quyền → 403 | thao tác trình duyệt | `[ ]` |
| P5-ADMIN-02 | Quản lý người dùng (trạng thái tài khoản, đổi role — least privilege) | P5-ADMIN-01 | `app/admin/users/*`, `src/users/*` | Không tự nâng quyền; thao tác có audit | thao tác trình duyệt | `[ ]` |
| P5-ADMIN-03 | Audit log cho thao tác quản trị (ai, khi nào, giá trị trước/sau) | P5-ADMIN-02 | `src/admin/audit.interceptor.ts`, `audit_logs` | Mọi thao tác ghi trong P5 đều có bản ghi | thao tác rồi kiểm DB | `[ ]` |
| P5-FEEDBACK-01 | Schema + API gửi phản hồi (từ vựng/transcript/bản dịch) | P2-AUTH-06 | `src/feedback/*` | Người dùng gửi được; có trạng thái | gọi API | `[ ]` |
| P5-FEEDBACK-02 | Hộp thư phản hồi cho admin (lọc theo trạng thái, lịch sử xử lý) | P5-FEEDBACK-01, P5-ADMIN-01 | `app/admin/feedback/*` | Đổi trạng thái + ghi lịch sử | thao tác trình duyệt | `[ ]` |
| P5-ADMIN-04 | Màn hình cấu hình tính năng/hạn mức theo gói | P5-QUOTA-01, P5-ADMIN-01 | `app/admin/entitlements/*` | Sửa limit → có hiệu lực ngay | thao tác rồi gọi API | `[ ]` |
| P5-SEC-01 | Rà soát least privilege toàn bộ endpoint admin | P5-ADMIN-03 | `src/**/*.controller.ts` | Mọi endpoint admin có `@Roles` | `grep -L "@Roles" src/**/*.controller.ts` | `[ ]` |
| P5-DOC-01 | Cập nhật `database.md` + ADR entitlement | P5-QUOTA-05 | `docs/database.md`, `docs/adr/ADR-entitlements.md` | ADR `Proposed`/`Accepted` rõ | đối chiếu | `[ ]` |

**Checkpoint P5:** build/lint/typecheck; thử reserve→settle→release bằng tay.
Test case: `T-P5-01` … `T-P5-12`.

---

## P6 — Sprint 6: Media & Transcription

> **Gate ⏸:** object storage (Q-05), STT provider (Q-04), giới hạn media (Q-11).

| ID | Task | Phụ thuộc | File/module | Hoàn thành khi | Kiểm thử | TT |
|---|---|---|---|---|---|---|
| P6-MEDIA-01 | ADR: upload, giới hạn, queue, storage, retention | P5-QUOTA-04 | `docs/adr/ADR-media.md` | Tôi duyệt | người dùng xác nhận | `⏸` |
| P6-MEDIA-02 | Schema `media_assets` + state machine (`UPLOADING`→`EXPIRED`) | P6-MEDIA-01 | `src/media/schemas/media-asset.schema.ts` | Chỉ chuyển trạng thái hợp lệ | thử chuyển sai | `[ ]` |
| P6-MEDIA-03 | Endpoint upload: giới hạn dung lượng/thời lượng, kiểm MIME | P6-MEDIA-02 | `src/media/media.controller.ts` | Vượt giới hạn → 413/422 với thông điệp rõ | upload file lớn | `[ ]` |
| P6-MEDIA-04 | Trừu tượng storage (local dev + adapter cloud) | P6-MEDIA-02 | `src/media/storage/*` | Đổi provider không sửa service | cấu hình 2 adapter | `[ ]` |
| P6-MEDIA-05 | Chống SSRF cho URL ngoài (chặn IP nội bộ/private, redirect nguy hiểm) | P6-MEDIA-03 | `src/media/url-guard.ts` | `http://127.0.0.1`, `10.x`, `169.254.x` bị chặn | gọi API với các URL đó | `[ ]` |
| P6-MEDIA-06 | Retention: job xoá file hết hạn | P6-MEDIA-02 | `src/media/retention.service.ts` | File quá hạn bị xoá và asset → `EXPIRED` | giả lập thời gian | `[ ]` |
| P6-STT-01 | Interface STT provider-independent | P6-MEDIA-01 | `src/transcription/stt.provider.ts` | Có interface + 1 adapter giả lập cho dev | unit thủ công | `[ ]` |
| P6-STT-02 | Queue/worker cho tác vụ dài | P6-STT-01 | `src/queue/*` | Job chạy ngoài request; API không block | gửi job, đo thời gian phản hồi | `[ ]` |
| P6-STT-03 | Trạng thái job + retry + huỷ | P6-STT-02 | `src/transcription/job.service.ts` | `QUEUED`→`PROCESSING`→`COMPLETED`/`FAILED`/`CANCELLED` | thử từng nhánh | `[ ]` |
| P6-STT-04 | Schema `transcripts`, `transcript_segments` (timestamp) | P6-STT-03 | `src/transcription/schemas/*` | Segment sắp theo thời gian | xem schema | `[ ]` |
| P6-STT-05 | Quota: reserve khi tạo job, settle khi xong, release khi fail | P6-STT-03, P5-QUOTA-03 | `src/transcription/*` | Không rò rỉ hạn mức khi job fail | chạy job fail | `[ ]` |
| P6-UI-01 | Upload UI + tiến trình + trạng thái lỗi | P6-MEDIA-03 | `app/learn/media/*` | Thấy tiến trình và lỗi rõ | thao tác trình duyệt | `[ ]` |
| P6-UI-02 | Trình xem transcript theo timestamp, bật/tắt | P6-STT-04 | `app/learn/media/[id]/*` | Nhảy đúng đoạn khi click | thao tác trình duyệt | `[ ]` |
| P6-UI-03 | Chế độ chính tả (dictation) + chỉnh font/cỡ chữ/màu | P6-UI-02 | `app/learn/media/[id]/dictation/*` | Gõ được, so khớp, đổi font | thao tác trình duyệt | `[ ]` |
| P6-DOC-01 | Cập nhật `database.md` cho media/transcript | P6-STT-04 | `docs/database.md` | Khớp code | đối chiếu | `[ ]` |

**Checkpoint P6:** build/lint/typecheck; upload → transcript chạy hết state machine.
Test case: `T-P6-01` … `T-P6-12`.

---

## P7 — Sprint 7: Sentence Analysis & Shadowing

> **Gate ⏸:** analyzer + giấy phép từ điển (Q-06), speech-eval provider (Q-04),
> consent/retention audio (Q-16).

| ID | Task | Phụ thuộc | File/module | Hoàn thành khi | Kiểm thử | TT |
|---|---|---|---|---|---|---|
| P7-ANALYZE-01 | ADR: Kuromoji.js vs Sudachi (độ chính xác, hiệu năng, giấy phép) | P6-STT-04 | `docs/adr/ADR-analyzer.md` | Tôi duyệt | người dùng xác nhận | `⏸` |
| P7-ANALYZE-02 | Adapter tokenizer (phân đoạn từ, reading, POS) | P7-ANALYZE-01 | `src/analysis/tokenizer/*` | Trả token có reading + POS | chạy với câu mẫu N5–N1 | `[ ]` |
| P7-ANALYZE-03 | Adapter AI ngữ nghĩa (nghĩa, cấu trúc ngữ pháp, bản dịch) | P7-ANALYZE-02 | `src/analysis/semantic/*` | Không phụ thuộc LLM để xác định ranh giới từ | kiểm code path | `[ ]` |
| P7-ANALYZE-04 | Schema `sentence_analyses` có `schemaVersion` + `analyzer/model` | P7-ANALYZE-02 | `src/analysis/schemas/*` | Kết quả sai schema bị từ chối, không ghi DB | bơm output sai | `[ ]` |
| P7-ANALYZE-05 | Lưu từ/ngữ pháp từ kết quả phân tích vào flashcard cá nhân | P7-ANALYZE-04, P3-CARD-03 | `src/analysis/*` | Tạo được card từ token | thao tác UI | `[ ]` |
| P7-ANALYZE-06 | Timeout/retry/cancellation + usage/cost tracking | P7-ANALYZE-03, P5-QUOTA-03 | `src/analysis/*` | Provider chậm → timeout sạch, quota hoàn lại | giả lập provider chậm | `[ ]` |
| P7-SHADOW-01 | Phát audio/video theo câu/đoạn, lặp đoạn | P6-UI-02 | `app/learn/shadowing/*` | Lặp đúng đoạn, không lệch timestamp | thao tác trình duyệt | `[ ]` |
| P7-SHADOW-02 | Ghi âm người học (chỉ khi có đồng ý) | P7-SHADOW-01 | `components/shadowing/recorder.tsx` | Không ghi khi chưa consent | thử từ chối consent | `[ ]` |
| P7-SHADOW-03 | Adapter đánh giá phát âm/độ tương đồng | P7-SHADOW-02 | `src/shadowing/scoring/*` | Phản hồi dễ hiểu, kèm ghi chú "không phải đánh giá tuyệt đối" | gọi adapter | `[ ]` |
| P7-SHADOW-04 | Retention + xoá audio bản ghi | P7-SHADOW-02 | `src/shadowing/retention.ts` | Hết hạn → file bị xoá | giả lập thời gian | `[ ]` |
| P7-SEC-01 | Quyền truy cập bản ghi âm (chỉ chủ sở hữu + admin được duyệt) | P7-SHADOW-04 | `src/shadowing/*` | User khác nhận 403 | gọi API với user khác | `[ ]` |
| P7-DOC-01 | Cập nhật `database.md` cho analysis/shadowing | P7-ANALYZE-04 | `docs/database.md` | Khớp code | đối chiếu | `[ ]` |

**Checkpoint P7:** build/lint/typecheck; phân tích 1 câu từ transcript → lưu card.
Test case: `T-P7-01` … `T-P7-10`.

---

## P8 — Sprint 8: AI Kaiwa

> **Gate ⏸:** AI provider + benchmark chi phí (Q-04).

| ID | Task | Phụ thuộc | File/module | Hoàn thành khi | Kiểm thử | TT |
|---|---|---|---|---|---|---|
| P8-KAIWA-01 | ADR provider + benchmark (chất lượng, độ trễ, chi phí/phiên) | P7-ANALYZE-06 | `docs/adr/ADR-kaiwa.md` | Tôi duyệt | người dùng xác nhận | `⏸` |
| P8-KAIWA-02 | Phiên hội thoại: tạo, gửi lượt, lịch sử | P8-KAIWA-01, P2-AUTH-06 | `src/kaiwa/*` | Lưu phiên + lượt theo user | gọi API | `[ ]` |
| P8-KAIWA-03 | Chọn chủ đề/cấp độ | P8-KAIWA-02 | `src/kaiwa/*` | Danh mục cấu hình được, không hard-code | xem config | `[ ]` |
| P8-KAIWA-04 | Entitlement + quota (phút/tháng) | P8-KAIWA-02, P5-QUOTA-04 | `src/kaiwa/*` | Plan không có quyền → 403; hết phút → chặn | gọi API | `[ ]` |
| P8-KAIWA-05 | Timeout, xử lý lỗi provider, đo chi phí mỗi phiên | P8-KAIWA-04 | `src/kaiwa/*` | Provider lỗi không làm hỏng phiên; chi phí ghi nhận | giả lập lỗi | `[ ]` |
| P8-KAIWA-06 | Phản hồi sau lượt nói (sửa lỗi, gợi ý) | P8-KAIWA-02 | `src/kaiwa/*` | Có phản hồi dễ hiểu, không khẳng định tuyệt đối | thao tác UI | `[ ]` |
| P8-UI-01 | Màn hình Kaiwa (chọn chủ đề, chat, trạng thái chờ/lỗi) | P8-KAIWA-04 | `app/learn/kaiwa/*` | Có loading/empty/error; không treo khi mất mạng | thao tác trình duyệt | `[ ]` |
| P8-DOC-01 | Cập nhật `database.md` cho phiên/lượt Kaiwa | P8-KAIWA-02 | `docs/database.md` | Khớp code | đối chiếu | `[ ]` |

**Checkpoint P8:** build/lint/typecheck; hội thoại 3 lượt + vượt quota bị chặn.
Test case: `T-P8-01` … `T-P8-08`.

---

## P9 — Sprint 9: Monetization

> **Gate ⏸:** payment provider, tiền tệ, refund, mua một lần (Q-08). **Không
> bật giao dịch thật** trong phase này — chỉ sandbox.

| ID | Task | Phụ thuộc | File/module | Hoàn thành khi | Kiểm thử | TT |
|---|---|---|---|---|---|---|
| P9-BILL-01 | ADR payment provider + chính sách | P5-QUOTA-04 | `docs/adr/ADR-payment.md` | Tôi duyệt | người dùng xác nhận | `⏸` |
| P9-BILL-02 | Schema `subscription_plans` (featureKey, limit, chu kỳ, tz) | P9-BILL-01 | `src/billing/schemas/plan.schema.ts` | Cấu hình gói không cần deploy | xem schema | `[ ]` |
| P9-BILL-03 | Schema `user_subscriptions` + unique một gói hiệu lực | P9-BILL-02 | `src/billing/schemas/subscription.schema.ts` | Unique index `(userId, status)` | thử tạo 2 gói active | `[ ]` |
| P9-BILL-04 | Schema `payments` | P9-BILL-03 | `src/billing/schemas/payment.schema.ts` | Lưu provider ref, số tiền, tiền tệ, trạng thái | xem schema | `[ ]` |
| P9-BILL-05 | Checkout sandbox (tháng/năm/mua một lần) | P9-BILL-04 | `src/billing/checkout.controller.ts` | Chạy ở sandbox; không gọi production | chạy sandbox | `[ ]` |
| P9-BILL-06 | Webhook: xác thực chữ ký + idempotency + retry | P9-BILL-05 | `src/billing/webhook.controller.ts` | Sai chữ ký → 400; gửi trùng → không tạo bản ghi đôi | gửi webhook giả | `[ ]` |
| P9-BILL-07 | Đồng bộ entitlement khi subscription đổi | P9-BILL-06, P5-QUOTA-01 | `src/billing/*` | Nâng gói → quyền mới có hiệu lực ngay | gọi API | `[ ]` |
| P9-BILL-08 | Vòng đời: gia hạn, huỷ, hết hạn, refund, mua một lần | P9-BILL-07 | `src/billing/lifecycle.service.ts` | Mỗi nhánh có hành vi xác định | thử từng nhánh | `[ ]` |
| P9-BILL-09 | Chặn khởi động production khi chưa được duyệt bật thanh toán | P9-BILL-05 | `src/billing/*` | Cờ môi trường chặn giao dịch thật | chạy với `NODE_ENV=production` | `[ ]` |
| P9-UI-01 | Trang giá + so sánh gói (Preline) | P9-BILL-02 | `app/pricing/page.tsx` | Hiển thị đúng cấu hình gói | thao tác trình duyệt | `[ ]` |
| P9-UI-02 | Trang quản lý gói của tôi (trạng thái, huỷ, hoá đơn) | P9-BILL-07 | `app/account/billing/*` | Hiển thị trạng thái thật | thao tác trình duyệt | `[ ]` |
| P9-DOC-01 | Cập nhật `database.md` + ADR billing | P9-BILL-08 | `docs/database.md` | Khớp code | đối chiếu | `[ ]` |

**Checkpoint P9:** build/lint/typecheck; webhook sandbox chạy đúng 3 nhánh
(hợp lệ / sai chữ ký / trùng). Test case: `T-P9-01` … `T-P9-12`.

---

## P10 — Sprint 10: AdSense

> **Gate ⏸:** Publisher ID, domain, consent/privacy, chính sách Pro/VIP ẩn quảng
> cáo (Q-09). **Mặc định tắt** (`NEXT_PUBLIC_ADS_ENABLED=false`).

| ID | Task | Phụ thuộc | File/module | Hoàn thành khi | Kiểm thử | TT |
|---|---|---|---|---|---|---|
| P10-ADS-01 | ADR AdSense: placement, consent, Free vs Pro/VIP | P9-BILL-07 | `docs/adr/ADR-adsense.md` | Tôi duyệt | người dùng xác nhận | `⏸` |
| P10-ADS-02 | Cấu hình placement/feature flag trong DB (mặc định tắt) | P10-ADS-01 | `src/ads/*` | Đổi cấu hình không cần deploy | thao tác admin | `[ ]` |
| P10-ADS-03 | Component `AdSlot` (client island, fallback khi không có quảng cáo) | P10-ADS-02 | `components/ads/ad-slot.tsx` | Slot trống không làm layout nhảy | thao tác trình duyệt | `[ ]` |
| P10-ADS-04 | Nạp script một lần, không nạp trùng khi chuyển route | P10-ADS-03 | `components/ads/adsense-script.tsx` | Chuyển route 5 lần → 1 thẻ script | đếm `<script>` trong DOM | `[ ]` |
| P10-ADS-05 | Gate theo route/gói (không hiện ở admin, login, checkout, khu học tập) | P10-ADS-03, P5-QUOTA-04 | `components/ads/*` | Route bị cấm không render slot | mở từng route | `[ ]` |
| P10-ADS-06 | Tắt toàn bộ quảng cáo bằng một cờ | P10-ADS-02 | `.env.example`, `components/ads/*` | `NEXT_PUBLIC_ADS_ENABLED=false` → không có script nào | đổi cờ, kiểm DOM | `[ ]` |
| P10-ADS-07 | Admin toggle + audit log khi đổi cấu hình | P10-ADS-02, P5-ADMIN-03 | `app/admin/ads/*` | Mọi thay đổi có bản ghi audit | thao tác rồi kiểm DB | `[ ]` |
| P10-ADS-08 | `ads.txt` (khi có Publisher ID) | P10-ADS-01 | `public/ads.txt` | Chỉ tạo khi Tôi cung cấp ID | kiểm file | `⏸` |
| P10-SEC-01 | Không gửi dữ liệu cá nhân/học tập vào tham số quảng cáo | P10-ADS-03 | `components/ads/*` | Không có `userId`/email trong URL quảng cáo | review code | `[ ]` |
| P10-A11Y-01 | Không che nội dung/nút, có nhãn cho vùng quảng cáo | P10-ADS-03 | `components/ads/*` | Không đè nút "Tiếp theo"/"Nộp bài" | thao tác trình duyệt | `[ ]` |

**Checkpoint P10:** build/lint/typecheck; cờ tắt → 0 script; cờ bật + slot trống
→ layout ổn định. Test case: `T-P10-01` … `T-P10-09`.

---

## P11 — Sprint 11: Production Readiness

> **Gate ⏸:** RPO/RTO, hosting, monitoring (Q-10).

| ID | Task | Phụ thuộc | File/module | Hoàn thành khi | Kiểm thử | TT |
|---|---|---|---|---|---|---|
| P11-TEST-01 | Chạy toàn bộ test backlog `T-*` | P1–P10 | `apps/api/test`, `apps/ui` | 100% test case pass hoặc có lý do chấp nhận | `pnpm -r run test` | `[ ]` |
| P11-TEST-02 | E2E luồng chính (đăng ký → học → thi → nâng gói) | P11-TEST-01 | `test/e2e/*` | Luồng chạy trên môi trường test | `pnpm --filter @nihongo/api run test:e2e` | `[ ]` |
| P11-SEC-01 | Security review: OWASP top 10, IDOR, injection, SSRF, upload | P11-TEST-01 | toàn repo | Không còn lỗ hổng mức cao chưa xử lý | checklist review | `[ ]` |
| P11-SEC-02 | Rate limit toàn bộ endpoint công khai | P11-SEC-01 | `src/**` | Có giới hạn, trả 429 | gọi lặp | `[ ]` |
| P11-SEC-03 | Rà soát secrets/log: không log token, không log PII | P11-SEC-01 | toàn repo | Không có secret trong log/repo | `grep` + review | `[ ]` |
| P11-OPS-01 | Monitoring/logging/alert (API, worker, queue, STT/AI, storage, webhook) | P11-TEST-01 | `src/**`, hạ tầng | Có cảnh báo khi lỗi/latency vượt ngưỡng | mô phỏng lỗi | `⏸` |
| P11-OPS-02 | Backup + kiểm thử restore (đạt RPO/RTO đã chốt) | P11-OPS-01 | hạ tầng | Restore thành công trong RTO | chạy restore thật | `[ ]` |
| P11-OPS-03 | Cấu hình production: env, secret manager, tắt Swagger | P11-SEC-03 | `main.ts`, hạ tầng | `NODE_ENV=production` không có `/api/docs` | `curl /api/docs` | `[ ]` |
| P11-OPS-04 | Hiệu năng & Core Web Vitals | P11-TEST-02 | `apps/ui` | LCP/CLS/INP trong ngưỡng đã chốt | Lighthouse | `[ ]` |
| P11-A11Y-01 | Kiểm tra accessibility (bàn phím, focus, contrast, label) | P11-TEST-02 | `apps/ui` | Không lỗi mức chặn; mục tiêu WCAG do Tôi chốt (Q-19) | axe/Lighthouse | `[ ]` |
| P11-SEO-01 | Kiểm chứng SEO: title/description riêng, canonical, sitemap, OG | P11-OPS-03 | `apps/ui` | Không trùng mô tả hàng loạt; OG hiển thị đúng | công cụ validator | `[ ]` |
| P11-DOC-01 | Release checklist + rollback plan | P11-OPS-02 | `docs/release.md` | Có quy trình phát hành và quay lui | review | `[ ]` |
| P11-DOC-02 | Báo cáo bàn giao cuối | P11-DOC-01 | `docs/` | Liệt kê file, dependency, lệnh, kết quả thật, phần chưa làm | review | `[ ]` |

**Checkpoint P11:** toàn bộ `T-*` pass; release checklist ký → **DỪNG**, chờ
quyết định phát hành.

---

## Test backlog (chạy ở P11)

> Theo quyết định 29/10/2026, **không viết test trong P1–P10**. Mỗi phase ghi
> test case ở đây; P11 thực thi toàn bộ.

| ID | Mô tả | Phase nguồn |
|---|---|---|
| T-P1-01 | `typecheck` + `lint` + `build` cả 2 app exit 0 | P1 |
| T-P1-02 | `/health` 200 `{status:"ok"}`; `/health/ready` 200 `not-configured` | P1 |
| T-P1-03 | `MONGODB_URL` không tới được → khởi động thất bại, lỗi rõ | P1 |
| T-P1-04 | `NODE_ENV=production` → `/api/docs` trả 404 | P1 |
| T-P1-05 | `PORT` trong `.env` được tôn trọng khi `next dev` | P1 |
| T-P1-06 | `/robots.txt` không chứa `/admin`, `/learn` trong `allow` | P1 |
| T-P2-01 | Đăng nhập đúng → 200 + token | P2 |
| T-P2-02 | Sai mật khẩu → 401, không lộ user tồn tại hay không | P2 |
| T-P2-03 | Không token → 401 ở route riêng tư | P2 |
| T-P2-04 | User thường gọi API admin → 403 | P2 |
| T-P2-05 | Role `ADMIN` không tự động cấp quyền lợi Pro | P2 |
| T-P2-06 | User A không sửa được hồ sơ user B (IDOR) | P2 |
| T-P2-07 | Vượt ngưỡng đăng nhập → 429 | P2 |
| T-P2-08 | Refresh token hết hạn bị từ chối | P2 |
| T-P2-09 | Phân trang nội dung ổn định, không lộ bản nháp | P2 |
| T-P2-10 | Đăng xuất → token cũ không dùng lại được | P2 |
| T-P3-01 | Import file có dòng trùng → đánh dấu đúng | P3 |
| T-P3-02 | Import sai cột → báo lỗi từng dòng, không ghi DB | P3 |
| T-P3-03 | Gửi lại cùng request import → không tạo bản ghi đôi | P3 |
| T-P3-04 | SRS: cùng chuỗi phản hồi → cùng `dueDate` | P3 |
| T-P3-05 | Thẻ đến hạn đúng theo timezone người dùng | P3 |
| T-P3-06 | Hai thiết bị ôn cùng lúc → không mất tiến độ | P3 |
| T-P3-07 | User A không đọc được deck cá nhân của B | P3 |
| T-P3-08 | Deck chia sẻ đọc được bởi mọi user đã đăng nhập | P3 |
| T-P3-09 | Lưu từ trong lúc học → tạo card trong deck cá nhân | P3 |
| T-P3-10 | Xoá deck → card/progress liên quan xử lý theo quy tắc | P3 |
| T-P3-11 | Import file quá lớn → 413, không treo server | P3 |
| T-P3-12 | `dueDate` tính lại đúng khi người dùng đổi timezone | P3 |
| T-P4-01 | Xáo 1000 lần → đáp án đúng luôn khớp | P4 |
| T-P4-02 | Nộp sau hạn → bị đánh dấu hết giờ, điểm theo quy tắc | P4 |
| T-P4-03 | Response làm bài không chứa `isCorrect` | P4 |
| T-P4-04 | Chấm điểm khớp đáp án ở mọi loại câu | P4 |
| T-P4-05 | Giải thích chỉ hiện sau khi nộp | P4 |
| T-P4-06 | Làm lại đề → attempt mới, không ghi đè attempt cũ | P4 |
| T-P4-07 | User A không xem attempt của B | P4 |
| T-P4-08 | Thống kê khớp dữ liệu attempt | P4 |
| T-P4-09 | Đề không có câu hỏi → API báo lỗi rõ | P4 |
| T-P4-10 | Refresh giữa bài → không mất câu trả lời nháp | P4 |
| T-P5-01 | Reserve trừ đúng hạn mức | P5 |
| T-P5-02 | Settle chốt usage đúng | P5 |
| T-P5-03 | Job fail → release hoàn lại hạn mức | P5 |
| T-P5-04 | Hai request song song → không vượt hạn mức (race) | P5 |
| T-P5-05 | Sang kỳ mới → hạn mức reset đúng tz | P5 |
| T-P5-06 | Plan không có quyền → 403 | P5 |
| T-P5-07 | Hết hạn mức → chặn theo chính sách đã chốt | P5 |
| T-P5-08 | Mọi thao tác admin có bản ghi audit | P5 |
| T-P5-09 | Admin không nâng quyền cho chính mình ngoài phạm vi | P5 |
| T-P5-10 | Feedback: đổi trạng thái có lịch sử | P5 |
| T-P5-11 | Sửa limit có hiệu lực ngay, không cần restart | P5 |
| T-P5-12 | User thường không truy cập endpoint admin | P5 |
| T-P6-01 | Upload vượt dung lượng → 413 | P6 |
| T-P6-02 | Upload sai MIME → 422 | P6 |
| T-P6-03 | State machine từ chối chuyển trạng thái sai | P6 |
| T-P6-04 | Job chạy hết `QUEUED`→`COMPLETED` | P6 |
| T-P6-05 | Job `FAILED` → quota hoàn lại | P6 |
| T-P6-06 | Job `CANCELLED` → quota hoàn lại | P6 |
| T-P6-07 | SSRF: `127.0.0.1`, `10.x`, `169.254.x` bị chặn | P6 |
| T-P6-08 | Redirect sang IP nội bộ bị chặn | P6 |
| T-P6-09 | File hết retention bị xoá, asset → `EXPIRED` | P6 |
| T-P6-10 | Transcript segment sắp đúng theo timestamp | P6 |
| T-P6-11 | User A không đọc media của B | P6 |
| T-P6-12 | Worker chết giữa job → job được retry hoặc đánh dấu fail | P6 |
| T-P7-01 | Kết quả analyzer sai schema bị từ chối | P7 |
| T-P7-02 | Analyzer lỗi → fallback/ báo lỗi rõ, không crash | P7 |
| T-P7-03 | Lưu từ từ kết quả phân tích → card đúng nội dung | P7 |
| T-P7-04 | Provider chậm → timeout, quota hoàn lại | P7 |
| T-P7-05 | Không ghi âm khi chưa consent | P7 |
| T-P7-06 | Audio hết retention bị xoá | P7 |
| T-P7-07 | User A không nghe bản ghi của B | P7 |
| T-P7-08 | Phản hồi chấm phát âm có ghi chú không tuyệt đối | P7 |
| T-P7-09 | `sentence_analyses` lưu đúng `schemaVersion` | P7 |
| T-P7-10 | Phân tích lại cùng câu → dùng cache/không ghi trùng | P7 |
| T-P8-01 | Vượt quota phút/tháng → chặn | P8 |
| T-P8-02 | Provider timeout → phiên không hỏng | P8 |
| T-P8-03 | Provider lỗi → thông báo thân thiện, không lộ chi tiết nội bộ | P8 |
| T-P8-04 | Chi phí ghi nhận theo phiên | P8 |
| T-P8-05 | Plan Free không vào được Kaiwa | P8 |
| T-P8-06 | Lịch sử phiên chỉ chủ sở hữu xem được | P8 |
| T-P8-07 | Gửi lượt rỗng/quá dài → validation chặn | P8 |
| T-P8-08 | Huỷ giữa phiên → quota xử lý theo quy tắc | P8 |
| T-P9-01 | Webhook sai chữ ký → 400, không đổi trạng thái | P9 |
| T-P9-02 | Webhook gửi trùng → idempotent | P9 |
| T-P9-03 | Nâng gói → entitlement mới có hiệu lực | P9 |
| T-P9-04 | Hạ gói → quyền cũ bị thu hồi đúng thời điểm | P9 |
| T-P9-05 | Hết hạn → về Free | P9 |
| T-P9-06 | Gia hạn thất bại → trạng thái rõ, không mất quyền đột ngột | P9 |
| T-P9-07 | Refund → quyền lợi xử lý theo chính sách | P9 |
| T-P9-08 | Mua một lần → không hết hạn sai | P9 |
| T-P9-09 | Không thể có 2 gói active cùng lúc | P9 |
| T-P9-10 | Production chưa duyệt → không gọi cổng thanh toán thật | P9 |
| T-P9-11 | Webhook retry không tạo payment đôi | P9 |
| T-P9-12 | Số tiền/tiền tệ lưu khớp provider | P9 |
| T-P10-01 | Không Publisher ID → app chạy bình thường, không lỗi | P10 |
| T-P10-02 | Cờ tắt → không nạp script quảng cáo | P10 |
| T-P10-03 | Cờ bật, slot trống → layout ổn định, không CLS | P10 |
| T-P10-04 | Chuyển route 5 lần → chỉ 1 script | P10 |
| T-P10-05 | Ad blocker bật → chức năng học không hỏng | P10 |
| T-P10-06 | Không có quảng cáo ở `/admin`, `/login`, checkout, khu học tập | P10 |
| T-P10-07 | Pro/VIP không thấy quảng cáo (nếu chính sách đã chốt) | P10 |
| T-P10-08 | Không có PII trong tham số quảng cáo | P10 |
| T-P10-09 | Quảng cáo không đè nút điều hướng/đáp án | P10 |

---

## Checklist AdSense theo môi trường (P10)

**Local/dev:**
- [ ] `NEXT_PUBLIC_ADS_ENABLED=false` (mặc định) → không nạp script; layout ổn định.
- [ ] Component placeholder có fallback khi script bị chặn; không che nội dung, không gần nút điều hướng (spec §7.3).
- [ ] Publisher ID giả hợp lệ → render đúng cấu hình; sai ID → không crash.

**Staging:**
- [ ] Bật cờ, dùng slot test; responsive mobile/tablet/desktop; không CLS bất thường.
- [ ] Chuyển route Next không nạp trùng script.

**Production (chỉ sau khi Tôi xác nhận tài khoản/domain/chính sách):**
- [ ] Tôi: tài khoản AdSense, xác minh domain, `ads.txt`, consent/cookie, điều khoản Google.
- [ ] Policy review (spec §7.5): không nội dung mỏng trên trang có quảng cáo.
- [ ] Pro/VIP ẩn quảng cáo chỉ khi chính sách đã chốt (spec §11).
- [ ] Không có test nào nhấp quảng cáo thật hoặc tạo traffic giả.

---

## Checklist SEO & thương hiệu (P1 + P10 + P11)

- [ ] Tên thương hiệu + domain production được duyệt (Q-09).
- [ ] `metadataBase`/canonical chỉ cấu hình sau khi có domain.
- [ ] Mỗi trang công khai có title/description riêng, không lặp hàng loạt.
- [ ] Sitemap/robots khớp route thực tế; không lộ trang riêng tư.
- [ ] OG hiển thị đúng khi chia sẻ (kiểm bằng validator).
- [ ] Không có structured data bịa; chỉ thêm schema.org khi có nội dung thật.
- [ ] Logo/favicon thay placeholder theo bộ nhận diện được duyệt.

---

## Template kiểm tra sau mỗi phase (spec §18.7)

- [ ] Phạm vi triển khai khớp kế hoạch đã duyệt.
- [ ] Diff đã review; không có secrets hoặc file ngoài ý muốn.
- [ ] `typecheck`, `lint`, `build` đã chạy; kết quả ghi rõ.
- [ ] Test case của phase đã ghi vào backlog (không bỏ trống nhóm quota/quyền/trùng lặp).
- [ ] Tài liệu cấu hình/migration/rollback cập nhật nếu cần.
- [ ] Không bật dịch vụ trả phí, thanh toán thật hoặc quảng cáo production.
- [ ] Có xác nhận của Tôi trước khi chuyển phase.

---

## Bằng chứng đã ghi nhận (chuyển từ tài liệu bootstrap cũ)

> Các mục `[x]` ở P0/P1 ở trên dựa trên những lần chạy sau (ngày 29/10/2026).
> Đây là **bằng chứng gốc**; nếu nghi ngờ, chạy lại lệnh tương ứng trước khi tin.

| Lệnh / thao tác | Kết quả ghi nhận | Dùng cho |
|---|---|---|
| `node -v`, `pnpm -v` | `v22.23.3`, `12.11.2` | P0-ENV-01 |
| `npm view next version engines` | `16.4.3`, node `>=20.9` | P0-DOC-02 |
| `npm view @nestjs/core version` | `12.x` (nhánh 12) | P0-DOC-02 |
| `npm view mongoose version` | `8.24.7` | P0-DOC-02 |
| `npm view preline version` | `5.0.0` | P0-DOC-02 |
| `tsc -p tsconfig.json --noEmit` | exit 0 | P1-API-01 |
| `oxlint --type-aware src/ test/` | exit 0, 0 warning | P1-API-01 |
| `pnpm install` | "Already up to date" | P1-ENV-08 |
| `git check-ignore apps/api/.env.example apps/ui/.env.example` | exit 1 (không bị ignore) | P1-ENV-09, P1-ENV-11 |
| `next dev` với `PORT=4567` trong `.env` | log `Local: http://localhost:4567` | P1-ENV-12 (sau đó phát hiện hỏng — xem Q-15) |
| `dotenv -e .env -- node -e …` | in usage, **exit 1** → xác nhận Q-15 | P1-ENV-14 |
| `node --env-file-if-exists=.env … next dev` | `--env-file-if-exists= is not allowed in NODE_OPTIONS` | P1-ENV-16 |
| `dotenv run -q -- node -e …` | chạy được; thiếu `.env` vẫn exit 0 | P1-ENV-14 |

---

## Kiểm chứng cuối (trước khi báo "đã xác minh")

| # | Kiểm tra | Cách chạy | Kết quả |
|---|---|---|---|
| V1 | ID task duy nhất | `grep -oE '^\| P[0-9]+-[A-Z0-9]+-[0-9]{2} \|' … \| sort \| uniq -d` | ✅ rỗng — 178 ID định nghĩa đúng 1 lần |
| V2 | Phụ thuộc hợp lệ | script đối chiếu cột *Phụ thuộc* với bảng ID | ✅ 0 tham chiếu treo, 0 phụ thuộc ngược phase |
| V3 | Phủ spec §1–§19 | đối chiếu từng heading của spec với `IMPLEMENTATION_PLAN.md` §11 | ✅ 0 mục bị bỏ sót |
| V4 | Phủ collection `database.md` | `grep` từng tên collection trong plan §12 | ✅ 21/21 collection có phase |
| V5 | Quyết định mở có owner | `architecture.md` §5 (8 dòng) + `database.md` §4 (4 dòng) ↔ `OPEN_QUESTIONS.md` | ✅ 12/12 map tới Q-03…Q-11 |
| V6 | Không có `[x]` thiếu bằng chứng | đọc 27 mục `[x]` ở P0/P1 (6 P0 + 21 P1) | ✅ có lệnh/bằng chứng; P1-ENV-12/14 boot `:3001` (30/10), P1-API-05 là `[~]` duy nhất |
| V7 | Test ID duy nhất | `grep -oE '^\| T-P[0-9]+-[0-9]{2} \|' … \| sort \| uniq -d` | ✅ rỗng — 101 test case |

**Phần chưa đối chiếu được:** không có. Mọi mục V1–V7 đã chạy trên bản tài liệu
này (30/10/2026). Lưu ý: V3 đối chiếu ở mức **heading cấp 2/3** của spec; nội
dung chi tiết trong từng đoạn văn được map qua phase tương ứng chứ không đối
chiếu từng câu.
