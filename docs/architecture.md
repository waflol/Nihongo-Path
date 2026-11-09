# Kiến trúc — Nihongo Path

> Tài liệu kỹ thuật nội bộ. Phản ánh trạng thái đến Sprint 3+ (flashcard/SRS/nhập file/AI/Kanji/luyện thi, 08/11/2026);
> §3–§4 là thiết kế bootstrap gốc, phần hiện trạng thực tế nằm ở **§8**. Mọi mục "chưa chốt"
> đều gắn nhãn rõ. Không coi đây là cam kết phát hành.

## 1. Nguyên tắc tổng thể

- **Tương thích trước:** luôn xác minh phiên bản + Node + peer deps từ nguồn chính thức trước khi khóa.
- **Provider-independent:** AI/STT/queue/storage đều được trừu tượng hóa, chưa chọn nhà cung cấp.
- **Kiểm soát chi phí:** chỉ bật dịch vụ trả phí (Redis, object storage, AI, payment, AdSense) khi quy mô thực tế yêu cầu và được phê duyệt.
- **MVP theo sprint:** không dựng cả hệ thống một lần; mỗi sprint có tiêu chí nghiệm thu.
- **An toàn secrets:** chỉ qua environment / secret manager; `.env.example` chỉ chứa tên biến + giá trị minh họa.

## 2. Cấu trúc repository (monorepo pnpm)

```
Nihongo-Path/
├── package.json            # root: scripts điều phối (dev/build/lint/typecheck/test)
├── pnpm-workspace.yaml     # packages: apps/*, packages/*
├── pnpm-lock.yaml          # lockfile duy nhất (root)
├── .nvmrc                  # Node v22.23.3 (khớp engines)
├── apps/
│   ├── ui/                 # Frontend — Next.js 16 (App Router, TS, Turbopack)
│   │   ├── app/            # routes: /, /login, /register, /learn/*, /admin/* + metadata
│   │   ├── components/     # components React/Tailwind/ReactBits, chỉ "use client" khi cần
│   │   ├── public/         # favicon, logo, og-image (placeholder, thay được)
│   │   └── ...
│   └── api/                # Backend — NestJS 12 (REST + Swagger)
│       ├── src/            # modules: config, database, health, auth, users, content, flashcards, import, srs, ai, redis, logs
│       └── test/           # Vitest 4 (unit + e2e, Supertest)
├── packages/
│   └── shared/             # han-viet.json (bảng 897 chữ Hán Việt dùng chung UI & API)
├── docs/                   # spec, architecture, database, checklists, development, adr, plans
└── .claude/                # config công cụ (settings.local.json bị gitignore)
```

Quyết định: dùng pnpm workspace (không turborepo) — đủ cho 2 app + `packages/shared`, giảm phụ thuộc; cân nhắc
chuyển sang turbo/nx khi có build pipeline phức tạp.

## 3. Frontend — `apps/ui`

### 3.1 Stack

| Hạng mục | Chọn | Ghi chú |
|---|---|---|
| Framework | Next.js **16.4.3** | App Router, Turbopack là mặc định (stable trong v16) |
| Ngôn ngữ | TypeScript ~5.9 | strict |
| UI | **Tailwind 4.3.3** + **React state thuần** + **ReactBits** | Thiết kế bootstrap ban đầu dùng Preline 5.0.0; từ P2/P3 đã bỏ Preline JS, dùng React state thuần cho dropdown/modal/off-canvas và component copy-paste từ ReactBits (`components/reactbits/`, xem `development.md` §8.2) |
| React | 19.3.0 | do scaffold Next 16 gắn |

### 3.2 Server vs Client Component

- Mặc định **Server Component**. Chỉ thêm `"use client"` khi cần: state, event handler,
  hook, hoặc tương tác phía trình duyệt (dropdown, off-canvas, modal, tabs…).
- Tương tác đóng/mở menu, hộp thoại dùng React state thuần (click ngoài / phím `Escape` / chuyển route để đóng), tránh phụ thuộc DOM imperative của thư viện ngoài.
- Không để script client ảnh hưởng render phía server.

### 3.3 Cấu trúc routes bootstrap

- `/` — trang chủ (public, metadata riêng, Open Graph).
- `/login` — trang đăng nhập (placeholder, chưa auth thật).
- `/learn` — khu học tập (placeholder, chưa nghiệp vụ).
- `/admin` — admin placeholder (không hiển thị trong nav công khai).
- `robots.ts`, `sitemap.ts` — theo route thực tế; không đưa trang riêng tư vào sitemap.

### 3.4 SEO (Next Metadata API)

- `layout.tsx`: `metadata` mặc định (title template `%s | Nihongo Path`, description,
  applicationName, locale `vi_VN`, Open Graph).
- `metadataBase` / canonical: cấu hình khi **domain production đã chốt** (spec §17.3).
- Không tạo structured data/không promise thứ hạng; chỉ khi có nội dung thật.
- Icon/logo/OG image: placeholder trong `public/` + `app/icon.*`, thay thế được khi duyệt.

### 3.5 Thiết kế nền (design token)

- Preline v5 chạy trên **Tailwind 4 CSS-first** (`@import "tailwindcss"` + `@theme`).
- Preline ship `theme.css` (định nghĩa token `--color-*`, font) + `variants.css`.
- Theme riêng của dự án (màu thương hiệu) tạo trong file theme CSS theo pattern Preline,
  kích hoạt bằng `data-theme`; **màu cụ thể là đề xuất, cần duyệt** (spec §17.2).

## 4. Backend — `apps/api`

### 4.1 Stack

| Hạng mục | Chọn | Ghi chú |
|---|---|---|
| Framework | NestJS **12.3.2** | khác số với Next 16 (chúng độc lập) |
| Runtime | Express (default NestJS) | |
| DB | MongoDB via `@nestjs/mongoose` | config theo môi trường |
| Docs | Swagger/OpenAPI | ở `/api/docs`, dev/test |
| Validation | class-validator + class-transformer | global ValidationPipe |
| Test | Vitest 4 (unit + e2e, Supertest) | |

### 4.2 Cấu trúc module

```
src/
├── main.ts
├── app.module.ts
├── config/          # env validation (thiếu biến → báo lỗi rõ, không crash im)
├── health/         # GET /health (liveness), GET /health/ready (ping Mongo)
└── (mongosh)       # module DB: connect, graceful-degrade khi thiếu MONGODB_URL
```

### 4.3 Error handling & logging

- Global exception filter + consistent error shape (`message`, `status`, `code`).
- Không log secrets; log có context, mức severity.
- Rate limit (thêm khi có endpoint công khai cần bảo vệ).

### 4.4 MongoDB — chiến lược graceful-degrade

- Có `MONGODB_URL` → connect; thiếu → log WARNING + `/health/ready` trả degraded
  (API vẫn chạy được ở bootstrap, đúng local không có mongod).
- **Không** tự tạo DB/cloud; không migration phá hủy dữ liệu.

## 5. Các lớp chưa chốt (owner: Tôi / Cả hai)

| Lớp | Trạng thái | Ghi chú |
|---|---|---|
| Provider AI/STT (transcript, Kaiwa, speech eval) | **Chưa quyết định** | Trừu tượng hóa theo nhiệm vụ; benchmark trước khi chọn (spec §10) |
| Redis / queue-worker | **Redis tuỳ chọn đã có** (cache kết quả AI, `/admin/redis`); queue-worker thật chưa | Worker riêng khi tác vụ dài thực sự cần (STT/video) |
| Object storage | Trừu tượng, chưa chọn | Không lưu binary lớn trong Mongo |
| Thanh toán provider + tiền tệ + gói | **Chưa quyết định** | spec §6; không bật giao dịch thật |
| Google AdSense | Cờ tắt theo env (mặc định) | spec §7; chỉ bật sau khi Tôi có tài khoản/domain/chính sách |
| Thuật toán spaced repetition | **Đã chốt SM-2** (ADR-srs, Q-03) | State versioned, dự phòng FSRS |
| Bộ phân tích hình thái (Kuromoji/Sudachi…) | **Chưa quyết định** | spec §4.7 |
| Domain production + tên thương hiệu | **Chưa chốt** | Ảnh hưởng canonical/SEO (spec §17) |

## 6. Data flow (định hướng)

```
Browser (apps/ui, Next 16)
   │  fetch / Server Component
   ▼
apps/api (NestJS) ── REST + Swagger
   │
   ├── MongoDB (users, content, progress, media-meta, billing, entitlements)
   ├── Object storage (file media)  [abstraction]
   ├── Queue/Worker (STT, import, AI jobs)  [Redis, khi cần]
   └── AI/STT providers (behind interface)  [benchmarked]
```

## 7. Bảo mật & vận hành

- Secrets qua env/secret manager; `.gitignore` bọc `.env*` (trừ `.env.example`).
- RBAC + least privilege; audit log cho thao tác quản trị (khi có admin thật).
- Webhook: chữ ký, idempotency, retry, quota (khi bật payment).
- Monitoring/logging/alert cho API + worker + STT/AI + storage (khi có hạ tầng thật).

## 8. Hiện trạng triển khai (08/11/2026)

### 8.1. Backend — module `apps/api/src`

| Module | Vai trò |
|---|---|
| `auth`, `users` | Đăng nhập email/Google, JWT access + refresh xoay vòng, vai trò USER/ADMIN/SUPER_ADMIN, quản trị tài khoản (`/admin/users`) |
| `content` | Giáo trình, bài, từ vựng, ngữ pháp, **kanji Jōyō 2136** (CRUD admin, đọc công khai `/kanji*`, dịch lười từ vựng liên quan) |
| `flashcards` | Deck (cá nhân/chia sẻ), card, trùng lặp (`dedupeKey`), đọc hiragana, tự điền/sửa âm Hán Việt từ `packages/shared`, cảnh báo xem xét (`reviewIssues`, lọc/sửa nhanh theo từng trường), gợi ý ví dụ/ảnh, báo lỗi thẻ (`card-reports`), câu luyện thi 問題 (`exercise-questions`), quiz đồng nghĩa/kanji dễ nhầm, chấm câu |
| `import` | Nhập CSV/XLSX (≤ 10 MB) và PDF bảng STT (≤ 50 MB): preview → confirm idempotent (cho phép nghĩa trống + AI gợi ý nghĩa, tự điền & kiểm tra Hán Việt, gắn `reviewIssues`); PDF scan đọc bằng OCR (AI có hỗ trợ ảnh) chạy nền như job, cache theo hash file, hỗ trợ huỷ job (`DELETE /import/jobs/:id`) |
| `srs` | SM-2, hàng đợi ôn theo ngày tz user, giới hạn thẻ mới/ngày (`newCardsPerDay`), thống kê tiến độ (Mongo aggregation), ôn chéo deck |
| `ai` | Dịch vụ AI do admin quản lý (key mã hoá), benchmark & thứ tự ưu tiên riêng theo 4 tác vụ (`translate`/`write`/`grammar`/`pronounce`), sân thử dịch/ngữ pháp/phát âm (`/admin/ai-playground`), gọi song song, cache kết quả, nhật ký gọi |
| `redis` | Kết nối tuỳ chọn + console quản trị; khoá tiền tố `np:` |
| `logs` | Log request/ứng dụng/audit, thống kê truy cập, chặn IP & rate-block |
| `health`, `config`, `database` | Liveness/readiness, validate env, Mongo graceful-degrade |

### 8.2. Frontend — route `apps/ui/app`

- Công khai: `/`, `/login`, `/register`, `/terms` (điều khoản), `/privacy` (bảo mật).
- Học viên: `/learn` (tiến độ), `/learn/decks`, `/learn/decks/[id]` (quản lý thẻ, lọc thẻ thiếu ví dụ / cần xem xét), `/learn/study`, `/learn/import` (wizard giữ bản nháp qua IndexedDB `lib/import-draft.ts`), `/learn/exercises` (luyện từ), `/learn/exam` (luyện thi), `/learn/kanji`, `/learn/kanji/[char]`.
- Admin (`/admin/login`, `/admin/(panel)`): tổng quan, `content`, `decks`, `decks/[id]`, `import`, `reading-overrides` (từ điển cách đọc đã học), `users`, `ai`, `ai-activity`, `ai-playground` (dịch / ngữ pháp / phát âm), `reports` (báo lỗi thẻ), `redis`, `logs`.
- Furigana hiển thị theo từng kanji (`lib/furigana.ts`, `components/learn/furigana.tsx`): khớp phần kana của từ với cách đọc, rồi tách cách đọc của mỗi cụm kanji bằng on/kun từ `GET /kanji/readings` (xử lý rendaku, âm ngắt っ, 々); không tách được thì để một ruby cho cả từ.
- UI gọi API qua route handler proxy `app/api/*` (trình duyệt không gọi thẳng API).

### 8.3. Luồng nhập & tạo ví dụ

> Chi tiết đầy đủ: [import-flow.md](./import-flow.md).

```
File (CSV/XLSX/PDF) → preview (không ghi DB, AI gợi ý nghĩa nếu trống) → confirm (idempotent)
   → deck + card (gắn reviewIssues nếu có nghi vấn; KHÔNG tự sinh ví dụ)
        → admin bấm "✨ Tạo ví dụ" → nền (server):
             1) Tatoeba cục bộ (cặp Nhật–Việt thật)
             2) câu Nhật Tatoeba + AI dịch
             3) AI viết, kuromoji kiểm tra
   → cache (Mongo `airesultcache` + Redis); deck mới luôn ở DRAFT, admin tự công khai
```

PDF scan (không có text layer): render từng trang PNG → dịch vụ AI có hỗ trợ ảnh
đọc ra JSON dòng từ vựng → job nền (tiến trình, xem trang, đọc lại trang lỗi, huỷ job) →
bảng preview. Có text layer nhưng rác (OCR hỏng) → bỏ trang đó, báo lỗi rõ.

Chi tiết schema: `database.md`; env & lệnh: `development.md`.
