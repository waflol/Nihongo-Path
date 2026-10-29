# Kiến trúc — Nihongo Path

> Tài liệu kỹ thuật nội bộ. Phản ánh trạng thái đã quyết định đến Sprint 0/1. Mọi mục "chưa chốt"
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
├── pnpm-workspace.yaml     # packages: apps/*
├── pnpm-lock.yaml          # lockfile duy nhất (root)
├── .nvmrc                  # Node v22.23.3 (khớp engines)
├── apps/
│   ├── ui/                 # Frontend — Next.js 16 (App Router, TS, Turbopack)
│   │   ├── app/            # routes: /, /login, /learn, /admin + metadata
│   │   ├── components/     # components Preline, chỉ "use client" khi cần
│   │   ├── public/         # favicon, logo, og-image (placeholder, thay được)
│   │   └── ...
│   └── api/                # Backend — NestJS 12 (REST + Swagger)
│       ├── src/            # modules: config, health, (mongosh)
│       └── test/           # jest unit + e2e
├── packages/               # shared code (types/utils) — thêm khi thực sự cần
├── docs/                   # spec, architecture, database, checklists, development
└── .claude/                # config công cụ (settings.local.json bị gitignore)
```

Quyết định: dùng pnpm workspace (không turborepo) — đủ cho 2 app, giảm phụ thuộc; cân nhắc
chuyển sang turbo/nx khi có ≥3 package + build pipeline phức tạp.

## 3. Frontend — `apps/ui`

### 3.1 Stack

| Hạng mục | Chọn | Ghi chú |
|---|---|---|
| Framework | Next.js **16.4.3** | App Router, Turbopack là mặc định (stable trong v16) |
| Ngôn ngữ | TypeScript ~5.9 | strict |
| UI | **Preline 5.0.0** + **Tailwind 4.3.3** | Preline bắt buộc theo spec §18; dùng component/pattern Preline |
| React | 19.3.0 | do scaffold Next 16 gắn |

### 3.2 Server vs Client Component

- Mặc định **Server Component**. Chỉ thêm `"use client"` khi cần: state, event handler,
  hook, hoặc component Preline JS (dropdown, offcanvas, modal, tabs…).
- Preline v5 khởi tạo JS qua entry bundle; để tránh **double-init khi chuyển route App Router**
  (rủi ro spec §18.2), initializer phải run guarded trong `useEffect` của client component,
  không import module có side-effect auto-init ở scope module.
- Không để script Preline ảnh hưởng render phía server.

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
| Test | Jest (unit) + e2e (Supertest) | |

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
| Redis / queue-worker | Chưa bật | Bổ sung khi tác vụ dài thực sự cần (import/STT/video) |
| Object storage | Trừu tượng, chưa chọn | Không lưu binary lớn trong Mongo |
| Thanh toán provider + tiền tệ + gói | **Chưa quyết định** | spec §6; không bật giao dịch thật |
| Google AdSense | Cờ tắt theo env (mặc định) | spec §7; chỉ bật sau khi Tôi có tài khoản/domain/chính sách |
| Thuật toán spaced repetition | **Chưa quyết định** | So sánh trước khi chốt (spec §4.4) |
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
