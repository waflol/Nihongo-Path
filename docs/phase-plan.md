# Phase Plan — Nihongo Path (Bootstrap)

> Kế hoạch triển khai theo phase, mỗi phase có checklist riêng (xem
> [checklists.md](./checklists.md)). **Quy tắc: làm xong 1 phase → dừng,
> báo cáo kết thật, chờ xác nhận mới sang phase kế tiếp** (không tự động
> chạy hết roadmap).

Liên quan: [architecture.md](./architecture.md), [database.md](./database.md),
spec gốc: [claude_japanese_learning_platform_spec_preline.md](./claude_japanese_learning_platform_spec_preline.md).

## Quyết định đã chốt (từ Phase A)

| Quyết định | Trạng thái |
|---|---|
| Monorepo pnpm, layout `apps/ui` + `apps/api` | Chốt |
| Node v22.23.3 (`.nvmrc`), pnpm 12 | Chốt |
| Frontend: Next.js 16.4.3 + Tailwind 4.3.3 + Preline 5.0.0 | Chốt (đã verify từ npm registry) |
| Backend: NestJS 12 (scaffold ESM `nodenext`, Vitest, oxlint, TypeScript 6) | Chốt theo scaffold hiện có |
| MongoDB: graceful-degrade (thiếu `MONGODB_URI` → API vẫn chạy, readiness báo `not-configured`; có URI mà DB không tới được → fail-fast có chủ đích) | Chốt |
| Swagger chỉ dev/test, tắt ở production | Chốt |
| Secrets: chỉ qua env, `.env.example` giá trị minh họa | Chốt |
| Framework test frontend (Vitest) | Hoãn — thêm khi có component tương tác thật |

## Trạng thái tổng quan

| Phase | Mô tả | Trạng thái |
|---|---|---|
| A — Discovery | Khảo sát repo, env, xác minh phiên bản, chốt kiến trúc | ✅ Xong (29/10) |
| B1 — Core backend | `src/config`, `src/database`, `src/health` + wiring module + main.ts | ✅ Xong (29/10) |
| B2 — Scripts & env mẫu | Scripts api, `.env.example` (api + ui), `.gitignore`, fix port UI | ✅ Xong (29/10) |
| B3 — Kiểm tra runtime | build + chạy thật health, fail-fast, Swagger | ⏳ Tiếp theo |
| B4 — Docs & bàn giao | `docs/development.md`, checklist, verify UI, tổng kết | ⬜ |
| C+ | Các sprint sau (Identity, Flashcard, …) theo spec §14 | Chưa bắt đầu |

> **Quy ước test:** theo yêu cầu người dùng (29/10/2026), **toàn bộ test tự động
> được dời sang phase cuối cùng**, sau khi hoàn thành các tính năng. Checkpoint
> các phase hiện tại dùng typecheck + lint (B1), build + chạy thật (B3).

## Chi tiết từng phase

### Phase B1 — Core backend (apps/api) ✅ Xong

Đã làm (không sửa scaffold của user, bám convention ESM — import nội bộ có
suffix `.js`):

- `src/config/` — `env.types.ts`, `env.validation.ts` (validate
  NODE_ENV/PORT/MONGODB_URI/MONGODB_URI_REQUIRED; helper narrow kiểu để không
  stringify object).
- `src/bootstrap/env.ts` — nạp `.env`/`.env.local` bằng side-effect module,
  import **đầu tiên** trong `app.module.ts` (ESM evaluate import trước body).
- `src/database/database.module.ts` — `buildDatabaseModule()`: có URI →
  `MongooseModule.forRootAsync` fail-fast; thiếu URI → không đăng ký Mongoose
  (HealthService dùng `@Optional()` → `undefined`).
- `src/health/` — `health.service.ts` (`health()`, `ready()` ping
  `db.admin().ping()`, không throw), `health.controller.ts`
  (`GET /health`, `GET /health/ready` → 503 qua `ServiceUnavailableException`),
  `health.module.ts`.
- `src/app.module.ts` — `ConfigModule.forRoot({ isGlobal: true,
  ignoreEnvFile: true, validate: validateEnv })` + `buildDatabaseModule()` +
  `HealthModule`; giữ `AppController`/`AppService`.
- `src/main.ts` — `ValidationPipe` global, Swagger v12
  (`createDocument` + `setup("api/docs")`) chỉ ngoài production, port qua
  `ConfigService`, không log secret.

**Kết quả checkpoint:** `tsc -p tsconfig.json --noEmit` → exit 0;
`oxlint --type-aware src/ test/` → exit 0 (0 warning sau khi sửa).

### Phase B2 — Scripts & env mẫu ✅ Xong

- `apps/api/package.json`: thêm `dev` (`nest start --watch`) + `typecheck`;
  `start:prod` → `node dist/main.js` (ESM).
- `apps/api/.env.example` — đã có sẵn (người dùng tạo), bổ sung
  `MONGODB_URL_REQUIRED`; backend đổi sang đọc **`MONGODB_URL`** cho khớp.
- `apps/ui/.env.example` — `PORT=3001`, `NEXT_PUBLIC_API_URL`,
  `NEXT_PUBLIC_SITE_URL`.
- `apps/ui/.gitignore` — thêm `!.env.example`.
- **Fix: UI không chạy đúng port trong `.env`.** Nguyên nhân (docs Next 16
  bundled, `next.md:355`): `PORT` trong `.env` bị bỏ qua vì HTTP server khởi
  động trước khi code người dùng nạp env. Giải pháp: scripts ui chạy
  `node --env-file-if-exists=.env --env-file-if-exists=.env.local
  node_modules/next/dist/bin/next <cmd>`.
- Bật CORS trong `main.ts` theo `WEB_ORIGIN` (UI ở origin khác khi dev).

**Checkpoint:** `pnpm install` + `git check-ignore` → ⏳ chưa chạy được cuối
phase (Bash tạm bị chặn) — sẽ chạy ở đầu B3.

### Phase B3 — Kiểm tra runtime backend

- `pnpm --filter @nihongo/api run build`.
- Chạy thật: `node dist/main.js` → `curl /health`, `/health/ready`
  (mong đợi 200 + `database:"not-configured"`).
- Chứng minh fail-fast: `MONGODB_URL=mongodb://127.0.0.1:59999/x` → khởi
  động **thất bại với lỗi rõ** (đúng thiết kế).
- Swagger: `curl /api/docs` (dev) → 200.
- UI: `pnpm --filter @nihongo/ui run dev` → lắng nghe **:3001** (bằng chứng
  fix port).
- (Không chạy unit/e2e — test dời sang phase cuối.)

**Checkpoint:** liệt kê kết quả thật từng lệnh → báo cáo → **DỪNG**.

### Phase B4 — Docs & bàn giao

- `docs/development.md` (chạy local, env, MongoDB thật, lưu ý ESM/Preline).
- Cập nhật `docs/checklists.md` (trạng thái từng mục + kết quả kiểm tra).
- Verify UI: `next dev` + kiểm metadata/robots/sitemap/OG, bundle Preline.
- `pnpm -r run build`.
- Tổng kết bàn giao: file tạo/sửa, dependency, lệnh, biến env, kết quả
  từng lệnh, phần chưa triển khai, đề xuất sprint tiếp theo.

**Checkpoint:** báo cáo bàn giao → **DỪNG** (không tự mở sprint C+).

## Rủi ro / giới hạn của kế hoạch

- `mongoose` + URI sai → fail-fast tại startup là **hành vi có chủ đích**
  (không phải bug) — ghi rõ trong docs.
- E2E phụ thuộc `MONGODB_URI` không có trong môi trường test; nếu máy dev
  có `.env` đặt URI thật thì e2e phải dùng dynamic import + stub env
  (đã thiết kế sẵn trong B1).
- TypeScript 6 + Nest 12 (scaffold user) chưa từng build: nếu lỗi build do
  TS6 → báo cáo, hỏi lại, không tự hạ/đổi phiên bản.
- Không commit/push trong các phase trên (trừ khi được yêu cầu).
