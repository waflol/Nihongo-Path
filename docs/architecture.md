# Kiến trúc — Nihongo Path

> Tài liệu kỹ thuật nội bộ, mô tả **hệ thống đang chạy** (đối chiếu với code ngày 11/11/2026).
> Phần chưa làm hoặc chưa chốt nằm riêng ở [§7](#7-chưa-làm--chưa-chốt). Không phải cam kết phát hành.
>
> Tài liệu liên quan: [database.md](./database.md) (schema, index) ·
> [development.md](./development.md) (cài đặt, env, lệnh) ·
> [import-flow.md](./import-flow.md) (luồng nhập thẻ).

## 1. Nguyên tắc

- **Tương thích trước:** xác minh phiên bản, Node và peer deps từ nguồn chính thức trước khi khoá.
- **Không phụ thuộc nhà cung cấp:** AI, cache, storage đứng sau lớp trừu tượng; admin đổi dịch vụ AI mà không sửa code.
- **Kiểm soát chi phí:** chỉ bật dịch vụ trả phí (Redis, object storage, AI, thanh toán, AdSense) khi thật sự cần và được duyệt.
- **Chạy được khi thiếu hạ tầng:** thiếu MongoDB, Redis hay dịch vụ AI thì phần phụ thuộc tự tắt, phần còn lại vẫn chạy (xem [§5](#5-hành-vi-khi-thiếu-hạ-tầng)).
- **Secrets chỉ qua env / secret manager;** `.env.example` chỉ chứa tên biến và giá trị minh hoạ.

## 2. Tổng quan

```
Trình duyệt
   │
   ▼
apps/ui (Next.js 16)        Server Component + route handler proxy app/api/*
   │  REST (JWT)            trình duyệt không gọi thẳng API
   ▼
apps/api (NestJS 12)        REST + Swagger (/api/docs, tắt ở production)
   ├── MongoDB              dữ liệu chính, log, cache AI bền
   ├── Redis (tuỳ chọn)     cache AI nhanh, hàng đợi task AI — tiền tố khoá np:
   ├── Dịch vụ AI           Gemini / Groq / OpenRouter / NVIDIA / endpoint custom (Ollama…) / Antigravity CLI
   ├── Tatoeba              chỉ mục cục bộ trong Mongo; chỉ mục rỗng → gọi API tatoeba.org
   └── mazii.net            đối chiếu Hán Việt / on / kun cho bảng kanji (admin kích hoạt)
```

### 2.1. Cấu trúc repository (monorepo pnpm)

```
Nihongo-Path/
├── package.json            # script điều phối: dev / build / lint / typecheck / test
├── pnpm-workspace.yaml     # apps/*, packages/*
├── .nvmrc                  # Node v22.23.3
├── apps/
│   ├── ui/                 # Next.js 16 (App Router, Turbopack)
│   │   ├── app/            # route + route handler proxy app/api/*
│   │   ├── components/     # component React; reactbits/ là code vendored
│   │   └── lib/            # furigana, bản nháp import (IndexedDB)…
│   └── api/                # NestJS 12 (ESM)
│       ├── src/            # module — xem §3.2
│       ├── scripts/        # bootstrap-admin, import-kanji, import-tatoeba
│       └── test/           # e2e (Vitest + Supertest); unit spec nằm cạnh code trong src/
├── packages/shared/        # han-viet.json — bảng âm Hán Việt dùng chung UI & API
└── docs/                   # tài liệu; adr/ (quyết định), plans/ (kế hoạch)
```

Dùng pnpm workspace thuần (không turborepo): đủ cho 2 app + 1 package. Cân nhắc turbo/nx khi pipeline build phức tạp hơn.

## 3. Backend — `apps/api`

### 3.1. Stack

| Hạng mục | Chọn | Ghi chú |
|---|---|---|
| Framework | NestJS 12 (Express) | ESM `nodenext`, TypeScript 6 |
| Database | MongoDB qua `@nestjs/mongoose` (Mongoose 8) | |
| Validation | class-validator + class-transformer | `ValidationPipe` global |
| API docs | Swagger ở `/api/docs` | chỉ khi `NODE_ENV !== "production"` |
| Test | Vitest 4 (+ Supertest cho e2e) | |
| Lint | oxlint `--type-aware` | |

### 3.2. Module (`apps/api/src`)

| Module | Tiền tố route | Vai trò |
|---|---|---|
| `auth` | `/auth` | Đăng nhập email / Google, JWT access + refresh xoay vòng, tạo admin từ env khi khởi động |
| `users` | `/users`, `/admin/users` | Hồ sơ; vai trò USER / ADMIN / SUPER_ADMIN; SUPER_ADMIN tạo tài khoản ADMIN, đặt lại mật khẩu (đăng xuất mọi nơi) |
| `content` | (gốc), `/kanji`, `/admin/kanji` | Giáo trình, bài, từ vựng, ngữ pháp, kanji Jōyō — chi tiết §3.3 |
| `flashcards` | `/flashcards` | Deck, thẻ, cảnh báo xem xét, ví dụ, câu luyện thi — chi tiết §3.4 |
| `import` | `/flashcards/import` | Nhập CSV / XLSX / PDF — xem [import-flow.md](./import-flow.md) |
| `srs` | `/srs` | SM-2, hàng đợi học / ôn, thống kê — chi tiết §3.5 |
| `ai` | `/flashcards/admin/ai` | Dịch vụ AI do admin quản lý — chi tiết §3.6 |
| `redis` | `/admin/redis` | Kết nối tuỳ chọn + console quản trị |
| `logs` | `/admin/logs` | Log request / ứng dụng / audit, thống kê truy cập, chặn IP |
| `health` | `/health` | Liveness (`/health`), readiness (`/health/ready`, ping Mongo) |
| `config`, `database`, `bootstrap`, `common` | — | Validate env, kết nối Mongo, nạp `.env`, tiện ích dùng chung (roles, mã hoá khoá, rate limit) |

### 3.3. `content` — nội dung học và kanji

- Giáo trình (`textbooks`), bài (`units`), từ vựng, ngữ pháp: admin viết, người dùng đọc bản `PUBLISHED`.
- **Kanji Jōyō 2136 chữ**, xếp cấp N5–N1 theo thứ tự học:
  - Đọc công khai: `GET /kanji`, `/kanji/levels`, `/kanji/readings`, `/kanji/:char`. Nghĩa tiếng Việt của từ liên quan lấy từ dữ liệu có sẵn, phần thiếu được AI dịch khi mở trang chi tiết.
  - Admin (`/admin/kanji*`): CRUD, sửa hàng loạt (`bulk`), AI sinh nội dung (`:char/generate`), sao lưu / khôi phục Excel (`export`, `import`).
  - **Đồng bộ mazii.net** (`MaziiSyncService`): đối chiếu và cập nhật Hán Việt / on / kun, từng chữ hoặc job nền (tạm dừng / tiếp tục / huỷ, tối đa 1 job cùng lúc). Nhật ký ở `/admin/kanji/mazii-log`.
- **Bảng kanji là nguồn chuẩn** để đánh giá Hán Việt và cách đọc của thẻ — xem §4.2.

### 3.4. `flashcards` — deck và thẻ

- **Deck:** cá nhân (của một user) hoặc chia sẻ (admin viết, mọi user đã đăng nhập đọc bản `PUBLISHED`).
- **Thẻ:** chống trùng bằng `dedupeKey`; tự sinh cách đọc hiragana (kuromoji); tự điền / sửa âm Hán Việt.
- **Cảnh báo xem xét** (`reviewIssues`): lọc, sửa nhanh từng trường, xử lý hàng loạt (`decks/:id/cards/review/resolve`).
- **Kiểm tra lại cả deck** chạy nền: `decks/:id/recheck`, `recheck-jobs` (tạm dừng / tiếp tục / huỷ); các âm Hán Việt đã đổi ghi vào log (`decks/:id/han-viet-log`).
  - Cả server chỉ chạy **một** lần kiểm tra cùng lúc; deck khác gọi trong lúc đó nhận 409.
  - Thẻ có từ, cách đọc, nghĩa không đổi so với lần kiểm tra trước được bỏ qua; `?force=1` kiểm tra lại tất cả.
  - Từng cách đọc trên thẻ được xét riêng (một cách đúng không bảo lãnh cho các cách còn lại). Từ có mỗi cách đọc một nghĩa (人気: にんき / ひとけ) còn được so với nghĩa của thẻ.
- **Ví dụ và ảnh:** gợi ý ví dụ (Tatoeba → AI, xem §4.3), gợi ý ảnh, xem câu AI đã sinh nhưng chưa dùng (`decks/:id/ai-unused`).
- **Luyện tập:** câu luyện thi 問題 (`exercise-questions`), quiz đồng nghĩa, kanji dễ nhầm, trắc nghiệm hiragana → kanji (`kanji-distractors`, chỉ dùng kanji có trong N5–N1), chấm câu người học viết (`grade-sentence`).
- **Báo lỗi thẻ:** học viên gửi (`cards/:id/report`), admin duyệt (`admin/card-reports`).
- **Từ điển cách đọc đã học** (`admin/reading-overrides`): xem [import-flow.md §5](./import-flow.md#5-cảnh-báo-cần-xem-xét).

### 3.5. `srs` — lặp lại ngắt quãng

- Thuật toán **SM-2**, state có phiên bản để đổi sang FSRS sau này ([ADR-srs](./adr/ADR-srs.md)).
- Hàng đợi `GET /srs/queue/:deckId` tách hai chế độ: `mode=learn` (từ mới theo thứ tự deck, giới hạn `newCardsPerDay` mỗi deck mỗi ngày) và `mode=review` (chỉ từ đến hạn). "Ngày" tính theo múi giờ của user.
- `GET /srs/exercise-priority`: thứ tự từ cho phần luyện tập — từ học hôm nay trước, rồi từ đến hạn.
- Thống kê tiến độ bằng Mongo aggregation; ôn chéo deck; đặt lại tiến độ một deck.

### 3.6. `ai` — dịch vụ AI

- Admin thêm dịch vụ ở `/admin/ai`; khoá API mã hoá AES-256-GCM trong DB, không bao giờ trả về client.
- Dịch vụ "Google AI Pro (Antigravity CLI)" không dùng khoá API: server chạy lệnh `agy` như tiến trình con, đăng nhập bằng tài khoản Google do admin uỷ quyền. Chậm hơn API, chỉ hợp dùng cá nhân — xem [plans/plan-antigravity-cli.md](./plans/plan-antigravity-cli.md).
- Bốn tác vụ có **benchmark và thứ tự ưu tiên riêng**: `translate` (dịch), `write` (viết ví dụ), `grammar` (ngữ pháp), `pronounce` (phát âm).
- Gọi lần lượt theo thứ tự ưu tiên của tác vụ; dịch vụ lỗi hoặc hết hạn mức được cho nghỉ (cooldown) rồi chuyển sang dịch vụ kế. Các request chạy song song giữa các dịch vụ.
- Kết quả cache hai lớp: Redis (nhanh, tuỳ chọn) phía trước, collection `airesultcache` (bền) phía sau.
- Mọi lần gọi ghi vào `aicalllogs` (giữ 30 ngày). Sân thử ở `/admin/ai-playground`.

### 3.7. Lỗi, log, bảo vệ

- Exception filter global, dạng lỗi thống nhất (`message`, `status`, `code`). 5xx ghi log mức `error`, 4xx mức `warn`.
- Log request, log ứng dụng, audit log (mọi thao tác ghi trên route có `@Roles`) lưu MongoDB, tự xoá theo TTL.
- Chặn IP thủ công hoặc tự động khi vượt ngưỡng request. Chỉ chống flood nhỏ; DDoS thật phải chặn ở hạ tầng.
- Secret trong header / body được lọc trước khi ghi log.

## 4. Luồng nghiệp vụ chính

### 4.1. Nhập thẻ từ file

```
File (CSV / XLSX / PDF) → preview (không ghi DB; AI gợi ý & kiểm tra) → confirm (idempotent)
   → thẻ trong deck, kèm reviewIssues nếu có nghi vấn
```

PDF scan đọc bằng OCR qua dịch vụ AI hỗ trợ ảnh, chạy nền như một job. Chi tiết: [import-flow.md](./import-flow.md).

### 4.2. Nguồn Hán Việt và cách đọc

Mọi luồng đánh giá thẻ (nhập file, kiểm tra lại deck, gợi ý sửa) dùng chung thứ tự:

1. **Bảng kanji của admin** (collection `kanjis`): `hanViet` cho âm Hán Việt, `onyomi` / `kunyomi` cho cách đọc. Nạp lại tối đa mỗi phút một lần.
2. **`packages/shared/han-viet.json`**: chỉ bù những chữ bảng kanji chưa có âm Hán Việt.
3. **Từ điển cách đọc đã học** (`reading_overrides`) được ưu tiên hơn kuromoji khi phân tích cách đọc.

### 4.3. Tạo câu ví dụ

Nhập file **không** tự sinh ví dụ. Admin bấm "✨ Tạo ví dụ" → job nền trên server (tạm dừng / tiếp tục / dừng), mỗi thẻ thử lần lượt:

1. Cặp câu Nhật–Việt thật từ chỉ mục Tatoeba cục bộ.
2. Câu Nhật Tatoeba + AI dịch.
3. AI viết câu, kuromoji kiểm tra câu có thật sự dùng từ đó.

Job đang chạy dở được tiếp tục sau khi API khởi động lại.

### 4.4. Furigana theo từng kanji (UI)

`lib/furigana.ts` khớp phần kana của từ với cách đọc, rồi tách cách đọc cho từng cụm kanji bằng on / kun từ `GET /kanji/readings` (xử lý rendaku, âm ngắt っ, 々). Không tách được thì đặt một ruby cho cả từ.

## 5. Hành vi khi thiếu hạ tầng

| Thiếu | Hành vi |
|---|---|
| `MONGODB_URL` trống | API vẫn chạy, `/health/ready` báo `not-configured`; module cần DB (kể cả log) không hoạt động. Đặt `MONGODB_URL_REQUIRED=true` để bắt buộc |
| `MONGODB_URL` có nhưng không kết nối được | API **dừng ngay khi khởi động** (cố ý, để lộ lỗi cấu hình) |
| `REDIS_URL` trống | Bỏ qua Redis, cache AI chỉ dùng Mongo |
| Không có dịch vụ AI | Ví dụ chỉ lấy từ Tatoeba; nhập file bỏ các bước AI (xem [import-flow.md §8](./import-flow.md#8-hạn-chế-đã-biết)); PDF scan báo lỗi rõ |
| Chỉ mục Tatoeba rỗng | Gọi API tatoeba.org |

API không tự tạo database trên cloud và không chạy migration phá huỷ dữ liệu.

## 6. Frontend — `apps/ui`

### 6.1. Stack

| Hạng mục | Chọn | Ghi chú |
|---|---|---|
| Framework | Next.js 16.4.3 | App Router, Turbopack |
| React | 19.3.0 | |
| CSS | Tailwind 4 (CSS-first) | token màu là biến thô trong `app/themes/theme.css`; palette còn là placeholder (`TODO(rebrand)`) |
| Component | React state thuần + [ReactBits](https://reactbits.dev) + `motion` | ReactBits là code copy-paste trong `components/reactbits/` |

Thiết kế ban đầu dùng Preline 5; đã gỡ hẳn (dropdown, modal, off-canvas đều là React state).

### 6.2. Quy ước

- Mặc định **Server Component**; chỉ thêm `"use client"` khi cần state, event handler, hook hoặc API trình duyệt.
- Menu / hộp thoại đóng bằng click ngoài, phím `Escape` hoặc chuyển route.
- Trình duyệt gọi API qua route handler proxy `app/api/*`, không gọi thẳng `apps/api`.
- SEO dùng Next Metadata API: title template `%s | Nihongo Path`, locale `vi_VN`, Open Graph. `metadataBase` / canonical chỉ đặt khi có domain production (`NEXT_PUBLIC_SITE_URL`). `robots.ts`, `sitemap.ts` không liệt kê trang riêng tư.

### 6.3. Route

| Nhóm | Route |
|---|---|
| Công khai | `/`, `/login`, `/register`, `/terms`, `/privacy` |
| Học viên | `/learn` (tiến độ), `/learn/decks`, `/learn/decks/[id]` (quản lý thẻ), `/learn/decks/[id]/log` (log Hán Việt), `/learn/study` (học từ mới), `/learn/review` (ôn từ đến hạn), `/learn/import`, `/learn/exercises` (luyện từ), `/learn/exam` (luyện thi), `/learn/kanji`, `/learn/kanji/[char]` |
| Admin | `/admin/login`; trong `/admin/(panel)`: tổng quan, `content`, `decks`, `decks/[id]`, `decks/[id]/log`, `import`, `reading-overrides`, `users`, `kanji`, `kanji/mazii-log`, `ai`, `ai-activity`, `ai-playground`, `reports`, `redis`, `logs` |

Học viên nhập file vào deck cá nhân của mình; chỉ ADMIN / SUPER_ADMIN nhập được vào deck chia sẻ.

## 7. Chưa làm / chưa chốt

Quyết định thuộc chủ sản phẩm; chi tiết ở [OPEN_QUESTIONS.md](./OPEN_QUESTIONS.md).

| Lớp | Trạng thái |
|---|---|
| STT, AI Kaiwa, đánh giá phát âm | Chưa chọn nhà cung cấp; benchmark trước khi chọn |
| Queue / worker riêng | Chưa có. Job nền hiện chạy trong tiến trình API; tách worker khi có tác vụ dài (STT, video) |
| Object storage | Chưa chọn. Không lưu file lớn trong Mongo |
| Thanh toán, gói Free / Pro / VIP | Chưa quyết định; không bật giao dịch thật |
| Google AdSense | Chưa làm; sẽ là cờ tắt mặc định theo env |
| Bộ phân tích hình thái cho tính năng phân tích câu | Chưa quyết định (hiện dùng kuromoji cho cách đọc và kiểm tra ví dụ) |
| Domain production, tên thương hiệu, palette | Chưa chốt — ảnh hưởng canonical / SEO |
| Thuật toán SRS | **Đã chốt SM-2** ([ADR-srs](./adr/ADR-srs.md)) |
| Nhà cung cấp xác thực | **Đã chốt** email + Google ([ADR-auth-provider](./adr/ADR-auth-provider.md)) |

Khi làm các lớp trên: RBAC và quyền lợi gói (entitlements) tách riêng; webhook thanh toán phải có chữ ký, idempotency, retry; cần monitoring / alert cho API, worker, AI, storage trước khi lên production.
