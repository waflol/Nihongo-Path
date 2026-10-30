# Hướng dẫn phát triển — Nihongo Path

> Tài liệu cho dev local. Chạy 2 app trong monorepo pnpm, cấu hình env, bật
> MongoDB thật, và các lưu ý kỹ thuật (ESM, Preline, port, Swagger).
>
> **Ngày cập nhật:** 30/10/2026 (kèm hoàn thành Phase P1).

## 1. Yêu cầu tối thiểu

| Thành phần | Phiên bản | Ghi chú |
|---|---|---|
| Node.js | `v22.23.3` | theo `.nvmrc` + `engines >=22.22.0`. Dùng `nvm use` |
| pnpm | `12.11.2` | theo `packageManager` ở root |
| MongoDB | tuỳ chọn | Dev chạy **graceful-degrade**: thiếu `MONGODB_URL` → API vẫn chạy, `/health/ready` báo `not-configured` |

Kiểm tra nhanh:

```bash
node -v   # → v22.23.3
pnpm -v   # → 12.11.2
```

## 2. Cài đặt

```bash
pnpm install          # ở thư mục gốc repo
```

Không có bước migration/seed ở bootstrap. MongoDB tạo collection **theo từng
sprint** (xem `database.md`), không cần chuẩn bị sẵn.

## 3. Chạy local (dev)

Chạy cả hai app song song (root orchestrator):

```bash
pnpm dev              # pnpm -r --parallel run dev
```

Hoặc chạy riêng từng app:

```bash
pnpm dev:ui           # UI → http://localhost:3001
pnpm dev:api          # API → http://localhost:3000
```

### 3.1. Cổng (port)

| App | Port | Nguồn |
|---|---|---|
| API | `3000` | `apps/api/.env` → `PORT` |
| UI  | `3001` | `apps/ui/.env` → `PORT` |

> **Lưu ý quan trọng (Next 16):** `PORT` **không thể** đặt trong `.env` để
> Next đọc trực tiếp — Next khởi động HTTP server *trước* khi nạp env. Script
> của UI vì vậy chạy `dotenv run -- next <cmd>` để nạp `.env` vào process trước
> (đã kiểm chứng: `.env` có `PORT=3001` → `next dev` log `Local: http://localhost:3001`).
> Nếu không có `.env`, `dotenv` bỏ qua và Next dùng port mặc định 3000.

### 3.2. CORS

API bật CORS theo biến `WEB_ORIGIN` (danh sách phân tách dấu phẩy). Ở dev,
đặt trong `apps/api/.env`:

```
WEB_ORIGIN=http://localhost:3001
```

Request không có header `Origin` (curl, health check) không bị ảnh hưởng.

## 4. Cấu hình môi trường (env)

Mọi secret **chỉ** qua env; file `.env` đã bị `.gitignore`, chỉ commit
`.env.example` (giá trị minh hoạ).

### 4.1. API — `apps/api/.env`

```bash
NODE_ENV=development
PORT=3000
WEB_ORIGIN=http://localhost:3001

# MongoDB — để trống để chạy không DB (graceful-degrade).
# Có URI mà DB không tới được → app THẲNG khi khởi động (fail-fast, có chủ đích).
MONGODB_URL=
MONGODB_URL_REQUIRED=false

# Redis (dùng ở các sprint sau: queue/worker)
REDIS_URL=

# Auth (dùng từ Phase P2)
JWT_ACCESS_SECRET=
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=
JWT_REFRESH_EXPIRES_IN=7d
```

### 4.2. UI — `apps/ui/.env`

```bash
PORT=3001
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=      # chỉ đặt khi đã có domain production
```

> `NEXT_PUBLIC_*` xuất hiện trong bundle trình duyệt — không đặt secret vào đây.

## 5. Bật MongoDB thật

1. Chạy mongod local, hoặc dùng Atlas (free tier).
2. Điền `MONGODB_URL` trong `apps/api/.env` (vd `mongodb://127.0.0.1:27017/nihongo`).
3. Restart API. `curl :3000/health/ready` sẽ báo `database:"connected"`.

> **Không** tạo cloud DB hay collection khi chưa có sprint cần. Nếu `MONGODB_URL`
> chỉ trỏ tới DB không tới được, app cố tình không chạy (để lộ lỗi cấu hình) —
> xem §7.

## 6. Build & verify

```bash
pnpm build              # build cả 2 app (root: pnpm -r run build)
pnpm typecheck          # tsc --noEmit cả 2 app
pnpm lint               # eslint (ui) + oxlint --type-aware (api)
```

Chạy API production build:

```bash
cd apps/api && pnpm build && node dist/main.js
```

## 7. Endpoint bootstrap

| Endpoint | Mô tả | Hành vi |
|---|---|---|
| `GET /` | Metadata API | `{name, version, docs}` |
| `GET /health` | Liveness | 200, `database:"not-checked"` (không ping DB) |
| `GET /health/ready` | Readiness | 200 (`connected` / `not-configured`) hoặc **503** khi DB cấu hình nhưng không tới được |
| `GET /api/docs` | Swagger UI | **Chỉ dev/test**; `NODE_ENV=production` → 404 |

Swagger chỉ bật khi `NODE_ENV !== "production"` (chốt ở bootstrap).

## 8. Lưu ý kỹ thuật

### 8.1. ESM (NestJS `nodenext`)

- Import nội bộ **bắt buộc** có suffix `.js` (dù file nguồn là `.ts`):
  `import { HealthService } from "./health.service.js";`
- `apps/api/package.json` có `"type": "module"`; build ra ESM (`dist/main.js`
  chạy bằng `node`, không phải `ts-node`).
- Thứ tự nạp `.env`: `src/bootstrap/env.ts` là import **đầu tiên** trong
  `app.module.ts` để `MONGODB_URL` có sẵn khi `buildDatabaseModule()` được
  evaluate (ESM chạy import tĩnh trước thân module).

### 8.2. Preline UI (Next 16 App Router)

- Preline v5 bundle full tham chiếu `window` ở module scope → **không được**
  import top-level (phá prerender).
- Khởi tạo qua `components/preline.tsx`: `useEffect` + dynamic
  `import("preline")` + `HSStaticMethods.autoInit("all")`, re-run theo
  `usePathname`. `autoInit` idempotent → không double-init khi chuyển route.
- CSS: Tailwind 4 CSS-first, `globals.css` khai báo `@source` trỏ tới
  `preline/dist/index.js` + import `preline/variants.css`, `preline/theme.css`.
- Palette hiện là **placeholder** (`app/themes/theme.css`, ghi `TODO(rebrand)`).

### 8.3. Framework test

Repo dùng **Vitest 4** (không phải Jest) — `vitest.config.ts`,
`vitest.config.e2e.ts`, `@vitest/coverage-v8`. Theo quyết định 29/10, test
tự động dồn sang Phase P11; checkpoint hiện tại dùng typecheck + lint + build.

## 9. Kiểm tra nhanh smoke

```bash
# API (chạy ở :3000)
curl http://localhost:3000/health          # → {"status":"ok",...}
curl http://localhost:3000/health/ready   # → database: connected|not-configured
curl -I  http://localhost:3000/api/docs   # → 200 (dev)

# UI (chạy ở :3001)
curl http://localhost:3001/robots.txt     # → 200
curl http://localhost:3001/sitemap.xml    # → 200
```
