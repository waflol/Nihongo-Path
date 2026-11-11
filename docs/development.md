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
- **Google AI Pro (Antigravity CLI):** thay cho Gemini CLI — Google đã ngừng phục vụ gói cá nhân / AI Pro qua Gemini CLI từ 18/06/2026 (lỗi `IneligibleTierError`). Thêm dịch vụ "Google AI Pro (Antigravity CLI)" (không cần khoá API), bấm **Ủy quyền tài khoản Google**: server chạy phần đăng nhập của chính `agy` trong một pty (chọn "Google OAuth"), trang admin đưa liên kết Google; bạn đăng nhập bằng tài khoản có gói AI Pro, cho phép, rồi dán mã uỷ quyền vào ô. "Đã ủy quyền" chỉ được ghi sau khi `agy models` chạy được (ứng dụng không đọc token); sau đó chọn model từ danh sách `agy models` (mặc định `default` = để agy tự chọn). "Đăng xuất" xoá trạng thái của dịch vụ, xoá dịch vụ xoá cả thư mục. Mỗi dịch vụ có `HOME` riêng ở `ANTIGRAVITY_CLI_DATA_DIR/<id>/` (0700, trạng thái của agy nằm ở `.gemini/antigravity-cli`). Mỗi lần gọi là một tiến trình `agy --output-format json --mode plan --disable-slash-commands --print-timeout … -p=<prompt>`: prompt gắn liền với `-p=` (vì `-p` nuốt token kế tiếp), stdin là pipe đóng ngay (**không** dùng `/dev/null`: agy tưởng là terminal và chờ đăng nhập bằng trình duyệt), thư mục làm việc rỗng, môi trường tối giản (không truyền bí mật của app), dấu `@` trong nội dung người dùng đổi thành `＠`, hết giờ thì kill cả nhóm tiến trình. Cài bằng `apps/api/scripts/setup-antigravity-cli.sh` (cần thêm lệnh `script` của util-linux). Biến môi trường: `ANTIGRAVITY_CLI_BIN`, `ANTIGRAVITY_CLI_DATA_DIR`, `ANTIGRAVITY_CLI_CONCURRENCY` (mặc định 1), `ANTIGRAVITY_CLI_TIMEOUT_MS`. **Tách user cho agy (`ANTIGRAVITY_CLI_USER`, khuyên dùng):** `agy` là agent đọc văn bản không tin cậy nên không nên cùng user với API. Đặt `ANTIGRAVITY_CLI_USER=<user>` thì API (phải chạy bằng root) chạy mọi tiến trình `agy` (gọi AI, đăng nhập, đăng xuất) qua `setpriv --reuid --regid --clear-groups` (không dùng tuỳ chọn `uid` của Node vì nó giữ nhóm phụ của root), và **mọi thao tác file bên trong thư mục dữ liệu (tạo thư mục, ghi hook/guard/dấu "đã ủy quyền"/ảnh tạm, xoá) cũng do chính user đó làm** qua `setpriv … sh -c` — API (root) không bao giờ ghi, chmod, chown hay xoá trong cây thư mục do user kia kiểm soát, vì nó có thể đặt symlink trỏ tới `/etc/...` để lợi dụng quyền root (leo thang đặc quyền); trước mỗi lần dùng, thư mục dữ liệu và `HOME` của dịch vụ phải là thư mục thật thuộc đúng user đó (không thì từ chối). `setpriv` dùng thêm `--no-new-privs`. Một `HOME` tạo từ trước khi bật tách user (thuộc root) sẽ bị từ chối: xoá nó hoặc `chown -R <user>` rồi thử lại. Khi đó `agy` không đọc được `.env`, thông tin database hay file của user khác, kể cả khi hook chặn công cụ không có tác dụng. Điều kiện: `agy` ở nơi user đó chạy được (vd `/usr/local/bin`), thư mục dữ liệu nằm ngoài `/root`, `node` chạy được bởi user đó (hook), và `.env` của API không đọc được bởi user đó. Tạo và kiểm tra tất cả bằng `sudo ANTIGRAVITY_CLI_USER=agy-runner apps/api/scripts/setup-antigravity-cli.sh --create-user` (script in sẵn các dòng cần đặt trong `.env` và cảnh báo nếu user đó đọc được `.env`). Sai cấu hình (tên không hợp lệ, user không tồn tại, là root, API không phải root) làm dịch vụ báo lỗi thay vì chạy nhầm bằng user của API. Không dùng tuỳ chọn chạy qua `sudo` khi API không phải root: các file `agy` tạo ra không xoá được nếu không có quyền root. **Rủi ro chưa kiểm chứng với tài khoản thật:** (1) agy lưu token trong keyring của hệ điều hành — máy chủ không giao diện có thể thiếu Secret Service/D-Bus, khi đó đăng nhập xong vẫn bị đòi đăng nhập lại (trang admin sẽ hiện đoạn cuối màn hình của agy để chẩn đoán); keyring dùng chung giữa các `HOME` nên chỉ nên có **một** dịch vụ Antigravity; (2) chế độ `-p` từng bị treo khi không có TTY ở một số bản; (3) Google có thể không cho phép bọc `agy` trong ứng dụng khác với gói consumer (chưa có xác nhận chính thức) — chỉ dùng cá nhân. **Bảo mật:** `agy` là một agent nên có hook `PreToolUse` (`guard.mjs` + `hooks.json` trong mỗi `HOME`, ghi ở `.gemini/config/` và `work/.agents/`) từ chối mọi tool trừ xem file trong thư mục làm việc rỗng của dịch vụ (để một đoạn chữ lấy từ file import không thể bảo agent đọc `.env`, tải URL hay chạy lệnh) — *chưa kiểm chứng với agy đã đăng nhập*; chắc chắn hơn: chạy API và `agy` bằng user hệ điều hành khác nhau để `agy` không đọc được `.env`. Prompt đi qua argv nên người dùng khác trên cùng máy thấy được trong `ps`. Mỗi lần gọi để lại cuộc hội thoại (prompt + câu trả lời) trong `.gemini/antigravity-cli`; app xoá mục cũ hơn 24 giờ mỗi giờ một lần. "Đăng xuất" cho `agy` chạy `/logout` (xoá token, kể cả trong keyring, nếu lệnh này hoạt động — chưa kiểm chứng) rồi xoá trạng thái trên máy chủ; thu hồi hẳn quyền ở https://myaccount.google.com/permissions. **Xoá dịch vụ** xoá toàn bộ dữ liệu của nó trên máy chủ theo thứ tự: chặn việc mới cho dịch vụ → dừng phiên đăng nhập và mọi tiến trình `agy` đang chạy của nó → `/logout` (cả khi chưa được đánh dấu "đã ủy quyền" nhưng agy từng chạy ở đó, vì token có thể đã lưu) → xoá cả thư mục `ANTIGRAVITY_CLI_DATA_DIR/<id>/` (trạng thái agy, hội thoại, thư mục làm việc, guard) và thư mục `gemini-cli/<id>` cũ nếu có → xoá cache danh sách model → xoá nhật ký các lần gọi của dịch vụ đó. Nếu không xoá hết được thì **giữ lại dịch vụ** và báo lỗi để thử lại (không để lại token mồ côi không còn nút xoá). Giữ nguyên: cache kết quả AI chung (câu đã sinh, không gắn với tài khoản) và token trong keyring nếu `/logout` không xoá được.  Script cài tải bản nhị phân từ máy chủ của Google (kiểm sha512 lấy từ cùng nguồn) và chạy bằng user thường, chỉ dùng sudo để chép file. Dịch vụ "Gemini CLI" tạo trước đây không còn preset: xoá nó trên trang admin (và `rm -r apps/api/data/gemini-cli`). Mã nguồn: `apps/api/src/ai/ai-antigravity-cli.ts`; kế hoạch: `docs/plans/plan-antigravity-cli.md`.
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
