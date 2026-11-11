# Hướng dẫn phát triển — Nihongo Path

> Tài liệu cho dev local. Chạy 2 app trong monorepo pnpm, cấu hình env, bật
> MongoDB thật, và các lưu ý kỹ thuật (ESM, Preline, port, Swagger).
>
> **Ngày cập nhật:** 08/11/2026 (thêm env AI/Redis, nhập PDF/OCR, Tatoeba, Kanji Jōyō,
> benchmark & sân thử phát âm AI, cảnh báo xem xét thẻ nhập `reviewIssues`, lưu nháp wizard, admin AI/Redis/reports).

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
> của UI vì vậy chạy `dotenv run -q -- next <cmd>` để nạp `.env` vào process trước
> (đã kiểm chứng: `.env` có `PORT=3001` → `next dev` log `Local: http://localhost:3001`).
> Nếu không có `.env`, `dotenv` bỏ qua êm (`-q`) và Next dùng port mặc định 3000.

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

# Redis (tuỳ chọn): cache kết quả AI dùng chung + xem task ở /admin/redis
REDIS_URL=

# AI tạo câu ví dụ (tuỳ chọn) — xem §4.1.2
AI_KEY_SECRET=
GEMINI_API_KEY=
GEMINI_MODEL=
GEMINI_RPM=10

# Auth (dùng từ Phase P2)
JWT_ACCESS_SECRET=
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=
JWT_REFRESH_EXPIRES_IN=7d

# Nhật ký & chống flood (tuỳ chọn) — xem §4.1.1
TRUST_PROXY=
IP_ALLOWLIST=
RATE_BLOCK_MAX=300
RATE_BLOCK_WINDOW_SEC=10
RATE_BLOCK_MINUTES=15
LOG_4XX_ALL=false
```

#### 4.1.1. Nhật ký, thống kê truy cập & chặn IP

Cần `MONGODB_URL`. Admin xem ở `/admin/logs` (tab Request, Log ứng dụng & lỗi,
Thao tác admin, Truy cập & chặn IP; lọc theo Ngày/Tuần/Tháng hoặc ngày cụ thể;
nút **Xuất CSV** theo bộ lọc hiện tại, tối đa 10.000 dòng).

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `TRUST_PROXY` | tắt | Lấy IP thật từ `X-Forwarded-For`: `true`, số hop (`1`) hoặc tên subnet (`loopback`). **Chỉ bật khi người ngoài không gọi thẳng được vào API** (header có thể giả mạo). Không bật → mọi request cùng IP của server UI, thống kê/chặn theo IP vô nghĩa. Kiểm tra bằng khối "API nhìn thấy IP của bạn". |
| `IP_ALLOWLIST` | rỗng | IP cách nhau bằng dấu phẩy, không bao giờ bị chặn. Thêm/gỡ thêm được ngay trên UI (mục nhập từ env chỉ sửa được ở đây). |
| `RATE_BLOCK_MAX` | `300` | Quá số request này trong cửa sổ → tự chặn IP |
| `RATE_BLOCK_WINDOW_SEC` | `10` | Độ dài cửa sổ đếm (giây) |
| `RATE_BLOCK_MINUTES` | `15` | Thời gian khoá khi tự chặn |
| `LOG_4XX_ALL` | `false` | `true` = lưu cả 401/403/404/429 vào log ứng dụng (mặc định bỏ qua vì nhiễu khi bị quét) |

Lưu ý: IP nội bộ (127.x, 10.x, 192.168.x, 172.16–31.x…) không bao giờ bị tự
chặn; IP trong allowlist cũng vậy. Chặn ở tầng ứng dụng chỉ chống flood nhỏ —
DDoS thật cần chặn ở hạ tầng (Cloudflare / nginx / firewall).

#### 4.1.2. AI, Tatoeba, Redis & nhập file

- **Dịch vụ AI** (Gemini/Groq/OpenRouter/NVIDIA hoặc endpoint custom) được admin thêm ở `/admin/ai`:
  khoá API được mã hoá AES-256-GCM bằng `AI_KEY_SECRET` (mặc định dùng
  `JWT_ACCESS_SECRET` — **đổi secret này sẽ làm các khoá đã lưu không giải mã được**).
  Benchmark, xếp hạng và thứ tự ưu tiên chạy **riêng cho 4 tác vụ** (`translate` dịch / `write` viết ví dụ / `grammar` ngữ pháp / `pronounce` phát âm; tab theo tác vụ ở `/admin/ai`, lịch sử 30 lần chạy mỗi tác vụ); thử theo thứ tự của tác vụ đó (thiếu thì dùng `priority` chung), tự nghỉ khi 429; các
  request chạy song song giữa các dịch vụ. Sân thử ở `/admin/ai-playground` hỗ trợ thử dịch, phân tích ngữ pháp và gợi ý phát âm (hiragana, romaji, phiên âm kiểu Việt, tách từ kèm trọng âm, mẹo phát âm). Nhật ký gọi AI xem ở `/admin/ai`
  (lưu 30 ngày). `GEMINI_*` chỉ là dịch vụ dự phòng qua env.
- **Chỉ mục Tatoeba cục bộ** (ví dụ nhanh, không gọi API ngoài):
  ```bash
  pnpm --filter @nihongo/api tatoeba:import -- --write
  ```
  Cần `MONGODB_URL`; ~35 MB dữ liệu / ~80 MB cả chỉ mục. Chưa nạp → fallback gọi API Tatoeba.
- **Kanji Jōyō** (2136 chữ, kèm thứ tự nét): `pnpm --filter @nihongo/api kanji:import -- --write` (cần `MONGODB_URL`; xem `docs/plans/plan-kanji.md`). Sau đó admin quản lý ở `/admin/kanji`: xuất/nhập Excel (body tối đa 40 MB), cập nhật Hán Việt/on/kun từ mazii.net (chậm có chủ đích, ~0,4 s/chữ, chạy nền).
- **Ollama / LM Studio:** thêm dịch vụ loại `custom` với base URL trần (vd `http://192.168.1.220:11434`) → tự dùng `/v1`; danh sách model lấy từ `/api/tags`.
- **`NODE_OPTIONS`:** script `dev`/`start` của API đọc từ env (mẫu `--max-old-space-size=700` trong `apps/api/.env.example`).
- **Redis** (`REDIS_URL`, tuỳ chọn): không bắt buộc; thiếu thì bỏ qua. Console ở `/admin/redis`.
- **Giới hạn file nhập:** CSV/XLSX ≤ **10 MB**, PDF ≤ **50 MB** (vượt → 413). PDF có text
  cần bảng có cột STT; text hỏng (OCR rác) bị phát hiện và bỏ, báo lỗi rõ.
  - Cho phép nhập dòng **để trống nghĩa** (`back` rỗng): AI tự gợi ý nghĩa tiếng Việt khi preview/confirm (nếu có dịch vụ AI), hoặc để trống cho người học điền sau.
  - Âm Hán Việt trống hoặc bị lệch được tự điền/sửa từ bảng chuẩn `packages/shared/han-viet.json`.
  - Thẻ nhập có nghi vấn (nghĩa trống/do AI gợi ý/nghi sai chính tả, cách đọc khác kuromoji, âm Hán Việt lệch) được gắn `reviewIssues` và lọc riêng bằng nút **“⚠ Cần xem xét”** (`?review=1`) trong trang quản lý thẻ (`/admin/decks/[id]`, `/learn/decks/[id]`), bấm sửa nhanh từng trường (`resolve`) hoặc **“Đã xem xét”** (`reviewed: true`) để xoá cảnh báo.
  - Các bước AI của import (gợi ý nghĩa/Hán Việt/cách đọc, kiểm tra lại thẻ) chỉ chạy ở bước xem trước sau ánh xạ cột; bước xác nhận không gọi AI lại. Từ loại nhận thêm `phrase` (cụm từ/thành ngữ). Chi tiết: `docs/import-flow.md`.
  - Wizard nhập lưu bản nháp vào IndexedDB (`nihongo-import-draft`) khi tải lại trang (F5) và tự xoá khi huỷ hoặc xác nhận xong.
- **PDF scan (ảnh):** đọc bằng OCR qua dịch vụ AI có hỗ trợ ảnh (Gemini / Claude /
  GPT-4o). Chạy nền như **tác vụ** (job) nên có thể để trang rồi quay lại:
  - Trang render PNG (scale 2 ≈ 150 dpi) → gửi cho model đọc → JSON `{rows:[…]}`.
  - Tối đa **300 trang**, 3 trang đọc song song, thử lại tối đa 4 lần/trang.
  - Kết quả nhập được cache theo hash nội dung file (không OCR lại lần hai).
  - Admin xem từng trang (ảnh gốc bên trái, dữ liệu đọc được bên phải), đọc lại
    trang lỗi, hoặc huỷ/xoá job (`DELETE /flashcards/import/jobs/:id`).
  - Cần có ít nhất một dịch vụ AI hỗ trợ ảnh; không có → báo lỗi rõ.
- **Tạo ví dụ:** import **không** tự sinh ví dụ nữa. Admin bấm **“✨ Tạo ví dụ”**
  (trang quản lý thẻ hoặc sau khi import) → chạy nền trên server (có thể tạm dừng/tiếp tục/huỷ ở góc phải dưới), Tatoeba trước,
  không có thì nhờ AI. Thẻ tự sinh từ "Tạo ví dụ bằng AI" cũng có ví dụ nếu
  Tatoeba không có.
- **Ví dụ AI không dùng:** thẻ còn trống nhưng AI **đã** trả lời cho từ đó (bị bộ
  kiểm tra "câu có thật dùng từ này" chặn, kèm lý giải) → admin xem và thêm tay ở
  `/admin/decks/[id]` (mục “AI chưa dùng”).

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

## 5.1. Tạo tài khoản admin

Quản trị nội dung (`/admin/*`) cần vai trò `ADMIN` / `SUPER_ADMIN`. **Không** có
đường self-service tự nâng quyền — tài khoản đăng ký qua UI luôn về `USER`. Hai cách:

**Cách A — env (khuyến nghị cho dev):** đặt trong `apps/api/.env`

```bash
ADMIN_EMAIL=admin@example.com
ADMIN_PASS=Password123!
```

Khi cả hai có mặt, API tự đảm bảo tài khoản đó tồn tại khi khởi động
(`AdminBootstrapService`): chưa có → tạo mới (`role: ADMIN`, `status: ACTIVE`,
kèm credential email để đăng nhập ngay); đã có → thăng role về `ADMIN`/`ACTIVE`
(idempotent, **không** đổi mật khẩu của tài khoản đang có). Chỉ cả hai biến đều
có mới chạy; một mình là no-op. Lặp lại an toàn.

**Cách B — script one-shot (cần DB thật):**

```bash
cd apps/api
node scripts/bootstrap-admin.mjs admin@example.com "Password123!"
```

Dùng cách B khi muốn thăng cấp một tài khoản bất kỳ (kể cả tài khoản Google-only)
mà không giữ env luôn. Cả hai đều là thao tác thủ công, không auto-seed mặc định
(spec: không tạo tài khoản ngầm).

> **B mật khẩu:** sau khi tạo, đổi mật khẩu trong DB / xoá `ADMIN_PASS` khi không
> còn cần; `ADMIN_PASS` chỉ dùng ở bước tạo mới.

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

### 8.2. UI: Tailwind 4 + ReactBits (Next 16 App Router)

- Đã **bỏ Preline**. Dropdown tài khoản (`components/auth/account-menu.tsx`) và
  menu off-canvas (`components/site-header.tsx`) dùng React state thuần
  (click ngoài / Escape / click link để đóng).
- [ReactBits](https://reactbits.dev) là thư viện copy-paste, không phải npm
  package: file nằm ở `apps/ui/components/reactbits/` (hiện có `BlurText`,
  `SpotlightCard`; cần `motion`). Thêm component mới:
  `curl https://reactbits.dev/r/<Name>-TS-TW.json` rồi lấy `files[].content`
  (hoặc `npx shadcn@latest add https://reactbits.dev/r/<Name>-TS-TW.json`).
  Thư mục này bị ESLint bỏ qua vì là code vendored.
- CSS: Tailwind 4 CSS-first; token màu là biến thô trong `app/themes/theme.css`
  (dùng `var(--...)`). Palette hiện là **placeholder** (`TODO(rebrand)`).

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
