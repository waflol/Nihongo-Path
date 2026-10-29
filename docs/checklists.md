# Checklists theo phase — Nihongo Path

> Quy ước trạng thái (đúng spec §2: "không đánh dấu hoàn thành nếu chưa
> chạy kiểm thử phù hợp"):
>
> - `[x]` Xong & **đã kiểm chứng bằng lệnh** (ghi lệnh đã chạy ở mục
>   "Bằng chứng" hoặc kết quả bên cạnh).
> - `[ ]` Chưa làm / chưa kiểm chứng.
> - `[~]` Làm dở.
> - Trạng thái "chờ Tôi/Cả hai" (ràng buộc spec §1, §16).
>
> Ngày cập nhật: 29/10/2026. Mỗi lần kết thúc phase, cập nhật lại file này.

---

## Phase A — Discovery (xong 29/10/2026)

- [x] Kiểm tra thư mục, git status, cấu trúc (repo mới, 1 commit, `api/`
      `ui/` trống, `.env` tồn tại nhưng không được đọc).
- [x] Xác minh Node `v22.23.3` (khớp `.nvmrc`), pnpm 12.11.2; MongoDB
      local & Docker: **không có** → chốt chiến lược graceful-degrade.
- [x] Xác minh phiên bản từ npm registry (không dựa nhớ):
  - `next@16.4.3` (engines node >=20.9) — [Bằng chứng: `npm view next version/engines`]
  - `@nestjs/core@12.3.2` (node >=20), `@nestjs/mongoose@12`,
    `@nestjs/swagger@12.0.5`, `@nestjs/config@12.0.1`, `mongoose@8.24.7`
  - `preline@5.0.0` (hỗ trợ Tailwind v4: import `preline/variants.css` +
    `theme.css`, entry non-auto không auto-init), `tailwindcss@4.3.3`
- [x] Người dùng chốt 4 quyết định (questionnaire):
  - Layout monorepo: `apps/ui` + `apps/api` (khớp permission
    `.claude/settings.json`).
  - MongoDB: graceful-degrade.
  - Lệnh cài đặt: cập nhật `.claude/settings.json` (allow
    `pnpm install/add`, `npx create-*`, `npx @nestjs/cli*`).
  - Test frontend: hoãn Vitest UI ở bootstrap.
- [x] Kế hoạch bootstrap được duyệt (Phase B1–B4) — file
  [phase-plan.md](./phase-plan.md).

## Phase B1 — Core backend (apps/api)

**Frontend (apps/ui)** — hoàn thành trước khi re-scaffold backend:

- [x] Scaffold Next.js 16.4.3 (TS, App Router, Turbopack, ESLint 9)
      + cài `preline@5.0.0`.
- [x] `globals.css`: Tailwind 4 CSS-first + Preline
      (`@source` dist/index.js, import `preline/variants.css` +
      `preline/theme.css`) + file design token `app/themes/theme.css`
      (palette placeholder, ghi rõ chưa duyệt — spec §17.2).
- [x] Layout chung: `layout.tsx` (metadata theo spec §17.3: title template
      `%s | Nihongo Path`, Open Graph, locale `vi_VN`; canonical/metadataBase
      chờ domain), `components/site-header.tsx` (nav responsive: desktop
      dropdown + mobile off-canvas — API Preline v5 đã xác minh từ
      `node_modules/preline`), `components/site-footer.tsx`.
- [x] Preline init an toàn App Router: `components/preline.tsx` — dynamic
      import trong `useEffect` + re-init theo `usePathname` (tránh
      double-init, đúng rủi ro spec §18.2).
- [x] Routes nền tảng: `/` (public + OG metadata), `/login`, `/learn`
      (placeholder, `noindex`), `/admin` (placeholder, `noindex`).
- [x] SEO: `robots.ts`, `sitemap.ts` (chỉ route công khai),
      `opengraph-image.tsx` (next/og), `icon.svg` + `public/logo.svg`
      (placeholder, thay được).
- [x] `app/site.ts`: tên/mô tả tập trung 1 chỗ (`TODO(rebrand)`).
- [ ] **Chờ xác minh visual bằng browser** (dropdown/off-canvas hoạt động
      sau chuyển route) → gộp vào Phase B4 (item UI verify).

**Backend (apps/api)**:

- [x] `src/config/env.types.ts` + `env.validation.ts` (validate
      NODE_ENV/PORT/MONGODB_URI/MONGODB_URI_REQUIRED; URI phải
      `mongodb://`/`mongodb+srv://`) — [Bằng chứng: `tsc --noEmit` exit 0, `oxlint --type-aware` exit 0].
- [x] `src/bootstrap/env.ts` — nạp `.env`/`.env.local` bằng side-effect module
      (import đầu tiên của `app.module.ts`) để `MONGODB_URI` có sẵn **trước khi**
      `buildDatabaseModule()` được evaluate (giới hạn evaluation order của ESM).
- [x] `src/database/database.module.ts` — `buildDatabaseModule()`: có URI →
      `MongooseModule.forRootAsync` fail-fast (`serverSelectionTimeoutMS: 5000`,
      `retryAttempts: 0`); thiếu URI → không đăng ký Mongoose, token connection
      resolve `undefined` (service dùng `@Optional()`).
- [x] `src/health/health.service.ts` — `health()` (liveness) + `ready()`
      (ping `db.admin().ping()`, guard `Connection.db` undefined, không throw).
- [x] `src/health/health.controller.ts` — `GET /health`, `GET /health/ready`
      (503 qua `ServiceUnavailableException` khi DB không tới được).
- [x] `src/health/health.module.ts` — import `buildDatabaseModule()`.
- [x] `src/app.module.ts` — `ConfigModule.forRoot({ isGlobal: true,
      ignoreEnvFile: true, validate: validateEnv })` + `buildDatabaseModule()`
      + `HealthModule`; giữ nguyên `AppController`/`AppService`.
- [x] `src/main.ts` — `ValidationPipe` global; Swagger v12
      (`SwaggerModule.createDocument` + `setup("api/docs")`) chỉ khi
      `NODE_ENV !== "production"`; port qua `ConfigService`; không log secret.
- [—] **Test: bỏ qua theo yêu cầu người dùng** (29/10/2026): "các phase chưa cần
      viết test" → không tạo `env.validation.spec.ts`, `health.service.spec.ts`,
      `test/health.e2e-spec.ts`. Test để lại cho sprint có nghiệp vụ thật.

**Checkpoint B1:** `tsc --noEmit` + `oxlint --type-aware src/ test/` đều exit 0
→ ✅ **Đạt**, báo cáo và dừng.

## Phase B2 — Scripts & env mẫu

- [x] `apps/api/package.json`: thêm `dev` (`nest start --watch`), `typecheck`;
      sửa `start:prod` → `node dist/main.js` (ESM).
- [x] `apps/api/.env.example`: `PORT=3000`, `WEB_ORIGIN`, `MONGODB_URL`,
      `MONGODB_URL_REQUIRED`, Redis/Auth/Google placeholders.
      (`.gitignore` api liệt kê từng file `.env` cụ thể nên `.env.example`
      **không** bị ignore — không cần thêm rule.)
- [x] `apps/ui/.env.example`: `PORT=3001`, `NEXT_PUBLIC_API_URL`,
      `NEXT_PUBLIC_SITE_URL`.
- [x] `apps/ui/.gitignore`: thêm `!.env.example` (rule `.env*` trước đó chặn
      file example).
- [x] **Sửa lỗi UI không chạy đúng port trong `.env`** — nguyên nhân xác minh
      từ docs Next 16 bundled (`next.md:355`): *"`PORT` cannot be set in `.env`
      as booting up the HTTP server happens before any other code is
      initialized"*. Thử `node --env-file-if-exists=...` **thất bại** vì flag
      bị từ chối trong `NODE_OPTIONS` (`--env-file-if-exists= is not allowed in
      NODE_OPTIONS`). Giải pháp cuối: `apps/ui/scripts/with-env.mjs` — parse
      `.env`/`.env.local` bằng `node:util` `parseEnv` (không cần thêm
      dependency), rồi `spawn` Next CLI; scripts `dev`/`build`/`start` gọi
      loader này.
      [Bằng chứng: `.env` có `PORT=4567` → Next log `Local: http://localhost:4567`].
- [x] Đổi tên biến backend theo `.env.example` của bạn: `MONGODB_URI` →
      **`MONGODB_URL`** (kèm `MONGODB_URL_REQUIRED`), thêm `WEB_ORIGIN` và
      bật CORS trong `main.ts`; port mặc định API = 3000 (khớp file env).

**Checkpoint B2:** ✅ Đạt
- `pnpm install` → "Already up to date" (lockfile đồng bộ).
- `tsc -p tsconfig.json --noEmit` → exit 0.
- `oxlint --type-aware src/ test/` → exit 0.
- `git check-ignore apps/api/.env.example apps/ui/.env.example` → exit 1 cho
  cả hai (không bị ignore).
- `next dev` với `PORT=4567` trong `.env` → lắng nghe `:4567` (fix port OK).

## Phase B3 — Kiểm tra runtime

- [ ] `pnpm --filter @nihongo/api run build`.
- [ ] `node dist/main.js` + `curl :3000/health` → mong 200
      `{status:"ok"}`; `curl :3000/health/ready` → mong 200
      `database:"not-configured"`.
- [ ] Fail-fast: `MONGODB_URL=mongodb://127.0.0.1:59999/x node dist/main.js`
      → mong khởi động **thất bại, lỗi rõ** (bằng chứng đúng thiết kế).
- [ ] `curl :3000/api/docs` (NODE_ENV=development) → mong 200.
- [ ] UI: `pnpm --filter @nihongo/ui run dev` → phải lắng nghe **:3001**
      (bằng chứng cho fix port).
- [—] Test unit/e2e: **dời sang phase cuối** (sau khi hoàn thành tính năng,
      theo yêu cầu 29/10/2026).

## Phase B4 — Docs & bàn giao

- [ ] `docs/development.md` (chạy local, bảng env, bật MongoDB thật,
      Swagger, lưu ý ESM + Preline).
- [ ] Cập nhật trạng thái file này + [phase-plan.md](./phase-plan.md).
- [ ] UI verify: `next dev` → `curl /robots.txt`, `/sitemap.xml`, `/`
      (thực `<meta>` trong HTML), bundle Preline có trong trang;
      kiểm tương tác (dropdown/off-canvas) bằng browser.
- [ ] `pnpm -r run build` (root).
- [ ] Báo cáo bàn giao: file tạo/sửa, dependency, lệnh, biến env, kết quả
      từng lệnh, phần chưa triển khai, đề xuất sprint tiếp theo.

**Checkpoint B4:** báo cáo bàn giao → dừng (chưa mở Phase C+).

---

## Checklist AdSense (sprint riêng theo spec §7, §15.11 — KHÔNG làm trong bootstrap)

**Môi trường local/dev:**
- [ ] Cờ `NEXT_PUBLIC_ADS_ENABLED=false` (mặc định) → không nạp script
      quảng cáo; layout ổn định khi slot trống.
- [ ] Component ad placeholder (client/island), có fallback khi script
      bị chặn; không che nội dung, không gần nút điều hướng (spec §7.3).
- [ ] Test: có Publisher ID hợp lệ giả → render đúng cấu hình; sai ID →
      không crash.

**Staging:**
- [ ] Cờ bật, slot test; responsive mobile/tablet/desktop; không CLS bất
      thường; chuyển route Next không nạp trùng script.

**Production (chỉ sau khi Tôi xác nhận tài khoản/domain/chính sách):**
- [ ] Tôi: tài khoản AdSense, xác minh domain, `ads.txt` (nếu áp dụng),
      consent/cookie theo quy định hiện hành, điều khoản Google.
- [ ] Policy review (spec §7.5): không nội dung mỏng trên trang có ad;
      Pro/VIP ẩn ad chỉ khi chính sách đã chốt (chưa được tự mặc định —
      spec §11).

## Checklist SEO & thương hiệu (spec §17.5)

- [ ] Tên thương hiệu + domain production được duyệt (chờ Tôi/Cả hai).
- [ ] `metadataBase`/canonical: chỉ cấu hình sau khi có domain.
- [ ] Mỗi trang công khai: title/description riêng, không lặp hàng loạt.
- [ ] Sitemap/robots khớp route thực tế; không lộ trang riêng tư.
- [ ] OG hiển thị đúng khi chia sẻ (test bằng công cụ validator).
- [ ] Không có structured data bịa; chỉ thêm schema.org khi nội dung thật.
- [ ] Logo/favicon: đổi placeholder theo bộ nhận diện được duyệt.

## Template checklist sprint (dùng cho Sprint 1+, theo spec §18.7)

- [ ] Phạm vi khớp kế hoạch đã duyệt.
- [ ] Diff đã review; không có secrets/file ngoài ý muốn.
- [ ] Lint, typecheck, test, build đã chạy + kết quả ghi rõ.
- [ ] Có test cho thành công / lỗi / quyền truy cập liên quan.
- [ ] Tài liệu cấu hình/migration/rollback cập nhật nếu cần.
- [ ] Không bật dịch vụ trả phí/thanh toán thật/quảng cáo production khi
      chưa được phê duyệt.
- [ ] Có xác nhận của người dùng trước khi chuyển sprint hoặc phát hành.

---

### Ghi chú kỹ thuật (phục vụ đánh dấu check chính xác)

- "Bằng chứng" ở Phase A = lệnh đã chạy + output (ghi trong phase-plan).
  Chỉ được tick khi lệnh đã thực sự chạy và pass.
- E2E `not-configured`: máy dev có `.env` chứa `MONGODB_URI` thì
  `ready` sẽ báo `connected`/`unreachable` thay vì `not-configured` —
  khi đọc kết quả Phase B3, đối chiếu nhánh này.
- Mongod local & Docker không có → B3 chỉ kiểm chứng được nhánh
  `not-configured` + fail-fast; nhánh `connected` đợi có MongoDB thật
  (Community local hoặc Atlas free — do Tôi quyết định).
