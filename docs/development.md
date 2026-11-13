# Hướng dẫn phát triển — Nihongo Path

> Cài đặt và chạy local: 2 app trong monorepo pnpm, biến môi trường, MongoDB, tài khoản admin,
> nạp dữ liệu, dịch vụ AI. Đối chiếu với code ngày 11/11/2026.
>
> Tài liệu liên quan: [architecture.md](./architecture.md) · [database.md](./database.md) ·
> [import-flow.md](./import-flow.md) (hành vi nhập file, tạo ví dụ).

## 1. Yêu cầu

| Thành phần | Phiên bản | Ghi chú |
|---|---|---|
| Node.js | `v22.23.3` | theo `.nvmrc` (`engines >=22.22.0`); dùng `nvm use` |
| pnpm | `12.11.2` | theo `packageManager` ở root |
| MongoDB | tuỳ chọn | thiếu thì API vẫn chạy nhưng gần như mọi tính năng cần DB đều tắt |
| Redis | tuỳ chọn | chỉ là lớp cache AI nhanh |

## 2. Cài đặt và chạy

```bash
nvm use
```

```bash
pnpm install
```

```bash
pnpm dev
```

`pnpm dev` chạy cả hai app song song. Chạy riêng: `pnpm dev:ui`, `pnpm dev:api`.

| App | Địa chỉ | Port lấy từ |
|---|---|---|
| UI | http://localhost:3001 | `apps/ui/.env` → `PORT` |
| API | http://localhost:3000 | `apps/api/.env` → `PORT` |

Chép `apps/api/.env.example` → `apps/api/.env` và `apps/ui/.env.example` → `apps/ui/.env` trước khi chạy. Không cần bước migration hay seed; dữ liệu kanji và Tatoeba nạp riêng (§7).

> **Port của UI (Next 16):** Next mở HTTP server *trước* khi đọc file `.env`, nên `PORT` trong `.env` không tự có tác dụng. Script của UI vì vậy chạy `dotenv run -q -- next <lệnh>` để nạp `.env` vào process trước. Không có file `.env` thì Next dùng port mặc định 3000 và **đụng port với API**.

## 3. Biến môi trường

Secret chỉ đặt qua env. File `.env` bị gitignore; chỉ commit `.env.example` với giá trị minh hoạ.

### 3.1. API — `apps/api/.env`

**Cơ bản**

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `NODE_ENV` | `development` | `production` sẽ tắt Swagger |
| `PORT` | `3000` | |
| `NODE_OPTIONS` | — | Script `dev` / `start` đọc từ env; mẫu: `--max-old-space-size=700` |
| `WEB_ORIGIN` | — | Origin được phép gọi (CORS), phân tách bằng dấu phẩy. Dev: `http://localhost:3001`. Request không có header `Origin` (curl, health check) không bị ảnh hưởng |
| `MONGODB_URL` | trống | Xem §5 |
| `MONGODB_URL_REQUIRED` | `false` | `true` = thiếu `MONGODB_URL` thì không khởi động |
| `REDIS_URL` | trống | Tuỳ chọn. Cache AI dùng chung + console ở `/admin/redis` |
| `IMPORT_JOB_DIR` | thư mục tạm hệ thống `/nihongo-import-jobs` | Nơi lưu file PDF của job đọc nền |

**Xác thực**

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `JWT_ACCESS_SECRET` | — | Tạo bằng `openssl rand -base64 64`. Cũng là khoá mã hoá khoá AI nếu không đặt `AI_KEY_SECRET` |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | |
| `JWT_REFRESH_SECRET` | — | Khác với access secret |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | |
| `GOOGLE_CLIENT_ID` | trống | Đăng nhập Google; phải trùng `NEXT_PUBLIC_GOOGLE_CLIENT_ID` của UI |
| `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` | trống | |
| `ADMIN_EMAIL`, `ADMIN_PASS` | trống | Tạo admin khi khởi động — xem §6 |

Thiếu các biến JWT thì API vẫn khởi động, nhưng các endpoint xác thực từ chối chạy.

**AI**

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `AI_KEY_SECRET` | dùng `JWT_ACCESS_SECRET` | Khoá mã hoá các khoá API mà admin lưu. **Đổi giá trị này (hoặc đổi `JWT_ACCESS_SECRET` khi không đặt biến này) làm mọi khoá đã lưu không giải mã được** |
| `GEMINI_API_KEY` | trống | Một dịch vụ Gemini dự phòng, chỉ đọc, thử sau cùng. Cách chính là thêm dịch vụ ở `/admin/ai` (§8) |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Model của dịch vụ dự phòng |
| `GEMINI_RPM` | `10` | Số request / phút của dịch vụ dự phòng |
| `RECHECK_CONCURRENCY` | `2` | Số lô AI chạy song song khi kiểm tra lại cả deck (1–4) |
| `ANTIGRAVITY_CLI_BIN` | `agy` | Lệnh Antigravity CLI; đặt đường dẫn đầy đủ nếu không nằm trong `PATH` của API (§8) |
| `ANTIGRAVITY_CLI_DATA_DIR` | `./data/antigravity-cli` | Mỗi dịch vụ CLI có một thư mục `HOME` riêng ở đây (chứa dữ liệu đăng nhập — đã gitignore, không commit) |
| `ANTIGRAVITY_CLI_CONCURRENCY` | `1` | Số lời gọi CLI chạy cùng lúc (1–4); mỗi lời gọi là một tiến trình con |
| `ANTIGRAVITY_CLI_TIMEOUT_MS` | `120000` | Thời gian chờ tối đa mỗi lời gọi (tối thiểu 15000) |

**Nhật ký và chặn IP** — xem §9.

### 3.2. UI — `apps/ui/.env`

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `3001` | |
| `NODE_OPTIONS` | — | Mẫu: `--max-old-space-size=400` |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3000` | Địa chỉ API |
| `NEXT_PUBLIC_SITE_URL` | trống | Chỉ đặt khi đã có domain production (dùng cho canonical / SEO) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | trống | Trùng `GOOGLE_CLIENT_ID` của API. Trống → không hiện nút Google, đăng nhập email vẫn dùng được |
| `ALLOWED_DEV_ORIGINS` | trống | Host / IP ngoài localhost được tải tài nguyên dev của Next (HMR), phân tách bằng dấu phẩy. `next.config.ts` đọc vào `allowedDevOrigins`; restart `next dev` sau khi đổi |

> Biến `NEXT_PUBLIC_*` nằm trong bundle trình duyệt — không đặt secret vào đây.

## 4. Kiểm tra nhanh

```bash
curl http://localhost:3000/health
```

```bash
curl http://localhost:3000/health/ready
```

| Endpoint | Kết quả |
|---|---|
| `GET /` | Metadata API: `{name, version, docs}` |
| `GET /health` | 200, không ping DB (`database: "not-checked"`) |
| `GET /health/ready` | 200 với `connected` hoặc `not-configured`; **503** khi DB đã cấu hình nhưng không tới được |
| `GET /api/docs` | Swagger UI; `NODE_ENV=production` → 404 |
| UI `/robots.txt`, `/sitemap.xml` | 200 |

## 5. MongoDB

1. Chạy mongod local hoặc dùng Atlas (free tier).
2. Đặt `MONGODB_URL` trong `apps/api/.env`, ví dụ `mongodb://127.0.0.1:27017/nihongo`.
3. Restart API; `/health/ready` báo `database: "connected"`.

| `MONGODB_URL` | Hành vi |
|---|---|
| Trống | API chạy không DB; `/health/ready` báo `not-configured` |
| Có, kết nối được | Bình thường |
| Có, không kết nối được | API **dừng ngay khi khởi động** (cố ý, để lộ lỗi cấu hình) |

Collection được tạo tự động khi tính năng ghi dữ liệu lần đầu. Schema: [database.md](./database.md).

## 6. Tạo tài khoản admin

Khu `/admin/*` cần vai trò `ADMIN` hoặc `SUPER_ADMIN`. Tài khoản đăng ký qua UI luôn là `USER`; không có đường tự nâng quyền. Có hai cách, đều là thao tác chủ động:

**Cách A — env (tiện cho dev).** Đặt trong `apps/api/.env`:

```bash
ADMIN_EMAIL=admin@example.com
ADMIN_PASS=Password123!
```

Khi **cả hai** biến có giá trị, API bảo đảm tài khoản đó tồn tại mỗi lần khởi động (`AdminBootstrapService`):

- Chưa có → tạo mới với `role: ADMIN`, `status: ACTIVE`, đăng nhập được ngay bằng email.
- Đã có → nâng lên `ADMIN` / `ACTIVE`, **không** đổi mật khẩu hiện có.
- Chỉ có một trong hai biến → không làm gì.

`ADMIN_PASS` (tối thiểu 8 ký tự) chỉ dùng lúc tạo mới; xoá khỏi `.env` sau khi tạo xong.

**Cách B — script một lần.** Dùng khi muốn nâng quyền một tài khoản bất kỳ (kể cả tài khoản chỉ đăng nhập Google) mà không giữ env. Cần `MONGODB_URL` tới được:

```bash
cd apps/api && node scripts/bootstrap-admin.mjs admin@example.com "Password123!"
```

Mật khẩu có thể truyền qua env `ADMIN_BOOTSTRAP_PASSWORD` thay cho tham số thứ hai.

Tài khoản `SUPER_ADMIN` tạo được tài khoản ADMIN khác và đặt lại mật khẩu ở `/admin/users`.

## 7. Nạp dữ liệu

Cả hai lệnh cần `MONGODB_URL`. Không có `--write` thì chỉ chạy thử, không ghi.

**Kanji Jōyō** (2136 chữ, kèm thứ tự nét):

```bash
pnpm --filter @nihongo/api kanji:import -- --write
```

Sau đó admin quản lý ở `/admin/kanji`: xuất / nhập Excel (body tối đa 40 MB), đồng bộ Hán Việt / on / kun từ mazii.net (chạy nền, cố ý chậm ~0,4 giây mỗi chữ). Nguồn và giấy phép: [plans/plan-kanji.md](./plans/plan-kanji.md).

**Chỉ mục Tatoeba** (câu ví dụ cục bộ, không phải gọi API ngoài):

```bash
pnpm --filter @nihongo/api tatoeba:import -- --write
```

Khoảng 35 MB dữ liệu, 80 MB kể cả index. Chưa nạp thì hệ thống gọi API tatoeba.org.

## 8. Dịch vụ AI

Không bắt buộc. Thiếu AI thì ví dụ chỉ lấy từ Tatoeba và nhập file bỏ các bước AI.

- **Thêm dịch vụ** ở `/admin/ai`: Gemini, Groq, OpenRouter, NVIDIA hoặc endpoint `custom`. Khoá API được mã hoá bằng `AI_KEY_SECRET` (§3.1).
- **Ollama / LM Studio:** thêm dịch vụ loại `custom` với base URL trần (ví dụ `http://192.168.1.220:11434`); hệ thống tự dùng `/v1` và lấy danh sách model từ `/api/tags`.
- **Google AI Pro (Antigravity CLI):** thay cho Gemini CLI — Google đã ngừng phục vụ gói cá nhân / AI Pro qua Gemini CLI từ 18/06/2026 (lỗi `IneligibleTierError`). Thêm dịch vụ "Google AI Pro (Antigravity CLI)" (không cần khoá API), bấm **Ủy quyền tài khoản Google**: server chạy phần đăng nhập của chính `agy` trong một pty (chọn "Google OAuth"), trang admin đưa liên kết Google; bạn đăng nhập bằng tài khoản có gói AI Pro, cho phép, rồi dán mã uỷ quyền vào ô. "Đã ủy quyền" chỉ được ghi sau khi `agy models` chạy được (ứng dụng không đọc token); sau đó chọn model từ danh sách `agy models` (mặc định `default` = để agy tự chọn). "Đăng xuất" xoá trạng thái của dịch vụ, xoá dịch vụ xoá cả thư mục. Mỗi dịch vụ có `HOME` riêng ở `ANTIGRAVITY_CLI_DATA_DIR/<id>/` (0700, trạng thái của agy nằm ở `.gemini/antigravity-cli`). Mỗi lần gọi là một tiến trình `agy --output-format json --mode plan --disable-slash-commands --print-timeout … -p=<prompt>`: prompt gắn liền với `-p=` (vì `-p` nuốt token kế tiếp), stdin là pipe đóng ngay (**không** dùng `/dev/null`: agy tưởng là terminal và chờ đăng nhập bằng trình duyệt), thư mục làm việc rỗng, môi trường tối giản (không truyền bí mật của app), dấu `@` trong nội dung người dùng đổi thành `＠`, hết giờ thì kill cả nhóm tiến trình. Cài bằng `apps/api/scripts/setup-antigravity-cli.sh` (cần thêm lệnh `script` của util-linux). Biến môi trường: `ANTIGRAVITY_CLI_BIN`, `ANTIGRAVITY_CLI_DATA_DIR`, `ANTIGRAVITY_CLI_CONCURRENCY` (mặc định 1), `ANTIGRAVITY_CLI_TIMEOUT_MS`. **Tách user cho agy (`ANTIGRAVITY_CLI_USER`, khuyên dùng):** `agy` là agent đọc văn bản không tin cậy nên không nên cùng user với API. Đặt `ANTIGRAVITY_CLI_USER=<user>` thì API (phải chạy bằng root) chạy mọi tiến trình `agy` (gọi AI, đăng nhập, đăng xuất) qua `setpriv --reuid --regid --clear-groups` (không dùng tuỳ chọn `uid` của Node vì nó giữ nhóm phụ của root), và **mọi thao tác file bên trong thư mục dữ liệu (tạo thư mục, ghi hook/guard/dấu "đã ủy quyền"/ảnh tạm, xoá) cũng do chính user đó làm** qua `setpriv … sh -c` — API (root) không bao giờ ghi, chmod, chown hay xoá trong cây thư mục do user kia kiểm soát, vì nó có thể đặt symlink trỏ tới `/etc/...` để lợi dụng quyền root (leo thang đặc quyền); trước mỗi lần dùng, thư mục dữ liệu và `HOME` của dịch vụ phải là thư mục thật thuộc đúng user đó (không thì từ chối). `setpriv` dùng thêm `--no-new-privs`. Một `HOME` tạo từ trước khi bật tách user (thuộc root) sẽ bị từ chối: xoá nó hoặc `chown -R <user>` rồi thử lại. Khi đó `agy` không đọc được `.env`, thông tin database hay file của user khác, kể cả khi hook chặn công cụ không có tác dụng. Điều kiện: `agy` ở nơi user đó chạy được (vd `/usr/local/bin`), thư mục dữ liệu nằm ngoài `/root`, `node` chạy được bởi user đó (hook), và `.env` của API không đọc được bởi user đó. Tạo và kiểm tra tất cả bằng `sudo ANTIGRAVITY_CLI_USER=agy-runner apps/api/scripts/setup-antigravity-cli.sh --create-user` (script in sẵn các dòng cần đặt trong `.env` và cảnh báo nếu user đó đọc được `.env`). Sai cấu hình (tên không hợp lệ, user không tồn tại, là root, API không phải root) làm dịch vụ báo lỗi thay vì chạy nhầm bằng user của API. Không dùng tuỳ chọn chạy qua `sudo` khi API không phải root: các file `agy` tạo ra không xoá được nếu không có quyền root. **Rủi ro chưa kiểm chứng với tài khoản thật:** (1) agy lưu token trong keyring của hệ điều hành — máy chủ không giao diện có thể thiếu Secret Service/D-Bus, khi đó đăng nhập xong vẫn bị đòi đăng nhập lại (trang admin sẽ hiện đoạn cuối màn hình của agy để chẩn đoán); keyring dùng chung giữa các `HOME` nên chỉ nên có **một** dịch vụ Antigravity; (2) chế độ `-p` từng bị treo khi không có TTY ở một số bản; (3) Google có thể không cho phép bọc `agy` trong ứng dụng khác với gói consumer (chưa có xác nhận chính thức) — chỉ dùng cá nhân. **Bảo mật:** `agy` là một agent nên có hook `PreToolUse` (`guard.mjs` + `hooks.json` trong mỗi `HOME`, ghi ở `.gemini/config/` và `work/.agents/`) từ chối mọi tool trừ xem file trong thư mục làm việc rỗng của dịch vụ (để một đoạn chữ lấy từ file import không thể bảo agent đọc `.env`, tải URL hay chạy lệnh) — *chưa kiểm chứng với agy đã đăng nhập*; chắc chắn hơn: chạy API và `agy` bằng user hệ điều hành khác nhau để `agy` không đọc được `.env`. Prompt đi qua argv nên người dùng khác trên cùng máy thấy được trong `ps`. Mỗi lần gọi để lại cuộc hội thoại (prompt + câu trả lời) trong `.gemini/antigravity-cli`; app xoá mục cũ hơn 24 giờ mỗi giờ một lần. "Đăng xuất" cho `agy` chạy `/logout` (xoá token, kể cả trong keyring, nếu lệnh này hoạt động — chưa kiểm chứng) rồi xoá trạng thái trên máy chủ; thu hồi hẳn quyền ở https://myaccount.google.com/permissions. **Xoá dịch vụ** xoá toàn bộ dữ liệu của nó trên máy chủ theo thứ tự: chặn việc mới cho dịch vụ → dừng phiên đăng nhập và mọi tiến trình `agy` đang chạy của nó → `/logout` (cả khi chưa được đánh dấu "đã ủy quyền" nhưng agy từng chạy ở đó, vì token có thể đã lưu) → xoá cả thư mục `ANTIGRAVITY_CLI_DATA_DIR/<id>/` (trạng thái agy, hội thoại, thư mục làm việc, guard) và thư mục `gemini-cli/<id>` cũ nếu có → xoá cache danh sách model → xoá nhật ký các lần gọi của dịch vụ đó. Nếu không xoá hết được thì **giữ lại dịch vụ** và báo lỗi để thử lại (không để lại token mồ côi không còn nút xoá). Giữ nguyên: cache kết quả AI chung (câu đã sinh, không gắn với tài khoản) và token trong keyring nếu `/logout` không xoá được.  Script cài tải bản nhị phân từ máy chủ của Google (kiểm sha512 lấy từ cùng nguồn) và chạy bằng user thường, chỉ dùng sudo để chép file. Dịch vụ "Gemini CLI" tạo trước đây không còn preset: xoá nó trên trang admin (và `rm -r apps/api/data/gemini-cli`). **Dùng chung ủy quyền giữa nhiều server (cùng database):** khi máy không có keyring, `agy` lưu token Google ở file `.gemini/antigravity-cli/antigravity-oauth-token` trong `HOME` của dịch vụ. Ủy quyền xong, API mã hoá file này (AES-256-GCM, khoá từ `AI_KEY_SECRET`, không có thì `JWT_ACCESS_SECRET`) và lưu vào trường `cliTokenBox` của dịch vụ trong MongoDB. Mọi server dùng chung database tự chép token về khi khởi động, khi mở danh sách dịch vụ và trước mỗi lần gọi (tối đa 1 lần/phút), nên **chỉ cần ủy quyền một lần**. Token `agy` tự làm mới ở một server được đẩy ngược lên DB; ủy quyền lại ở server nào thì các server khác nhận token mới; **Đăng xuất ở một server sẽ đăng xuất mọi server**. Server đã ủy quyền từ trước khi có tính năng này tự đưa token của nó lên DB ở lần đồng bộ đầu tiên. Token bị Google từ chối thì không được chép lại cho tới khi DB có token khác. Điều kiện: mọi server phải có **cùng** `AI_KEY_SECRET` (hoặc `JWT_ACCESS_SECRET`), sai khoá thì server đó bỏ qua và ghi cảnh báo. Máy có keyring thì không có file token nên không chia sẻ được. Mọi server dùng chung hạn mức của một tài khoản AI Pro. Với `ANTIGRAVITY_CLI_USER`, file token được đọc và ghi bằng chính user đó. Mã nguồn: `syncToken` trong `ai-antigravity-cli.ts`. Mã nguồn: `apps/api/src/ai/ai-antigravity-cli.ts`; kế hoạch: `docs/plans/plan-antigravity-cli.md`.
- **Thứ tự ưu tiên và benchmark** tách riêng cho 4 tác vụ — `translate` (dịch), `write` (viết ví dụ), `grammar` (ngữ pháp), `pronounce` (phát âm) — mỗi tác vụ một tab, giữ lịch sử 30 lần benchmark. Tác vụ chưa đặt thứ tự thì dùng `priority` chung.
- **Khi gọi:** thử lần lượt theo thứ tự của tác vụ; dịch vụ trả 429 hoặc lỗi được cho nghỉ rồi chuyển sang dịch vụ kế. Các request chạy song song giữa các dịch vụ.
- **PDF scan** cần ít nhất một dịch vụ có hỗ trợ ảnh (Gemini, Claude, GPT-4o…).
- **Sân thử** ở `/admin/ai-playground`: dịch, phân tích ngữ pháp, gợi ý phát âm (hiragana, romaji, phiên âm kiểu Việt, tách từ kèm trọng âm, mẹo phát âm).
- **Nhật ký gọi AI** ở `/admin/ai`, giữ 30 ngày.

## 9. Nhật ký, thống kê truy cập, chặn IP

Cần `MONGODB_URL`. Admin xem ở `/admin/logs`: các tab Request, Log ứng dụng & lỗi, Thao tác admin, Truy cập & chặn IP. Lọc theo Ngày / Tuần / Tháng hoặc ngày cụ thể; nút **Xuất CSV** theo bộ lọc hiện tại, tối đa 10.000 dòng.

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `TRUST_PROXY` | tắt | Lấy IP thật từ `X-Forwarded-For`: `true`, số hop (`1`) hoặc tên subnet (`loopback`) |
| `IP_ALLOWLIST` | trống | IP không bao giờ bị chặn, phân tách bằng dấu phẩy. Thêm / gỡ thêm được trên UI; mục nhập từ env chỉ sửa được ở đây |
| `RATE_BLOCK_MAX` | `300` | Quá số request này trong cửa sổ → tự chặn IP |
| `RATE_BLOCK_WINDOW_SEC` | `10` | Độ dài cửa sổ đếm (giây) |
| `RATE_BLOCK_MINUTES` | `15` | Thời gian chặn khi tự chặn |
| `LOG_4XX_ALL` | `false` | `true` = ghi cả 401 / 403 / 404 / 429 vào log ứng dụng (mặc định bỏ vì nhiễu khi bị quét) |

**Về `TRUST_PROXY`:**

- Trình duyệt gọi qua server UI, nên nếu không bật, API thấy mọi request đến từ cùng một IP (của server UI) — thống kê và chặn theo IP vô nghĩa.
- Chỉ bật khi người ngoài **không** gọi thẳng được vào API, vì header `X-Forwarded-For` có thể giả mạo.
- Kiểm tra bằng khối "API nhìn thấy IP của bạn" trên trang log.

IP nội bộ (127.x, 10.x, 192.168.x, 172.16–31.x…) và IP trong allowlist không bao giờ bị tự chặn. Chặn ở tầng ứng dụng chỉ chống flood nhỏ; DDoS thật cần chặn ở hạ tầng (Cloudflare / nginx / firewall).

## 10. Build, lint, test

```bash
pnpm build
```

```bash
pnpm typecheck
```

```bash
pnpm lint
```

```bash
pnpm test
```

- `lint`: eslint (UI) + oxlint `--type-aware` (API).
- `test`: Vitest 4 (không phải Jest). Unit spec nằm cạnh code trong `apps/api/src/**/*.spec.ts`; e2e chạy bằng `pnpm --filter @nihongo/api test:e2e`. UI chưa có test.
- Bộ test đầy đủ theo checklist (các mã `T-P*`) được dồn sang phase P11; checkpoint mỗi phase hiện dùng typecheck + lint + build.

Chạy bản build production của API:

```bash
cd apps/api && pnpm build && node dist/main.js
```

## 11. Lưu ý kỹ thuật

### 11.1. API là ESM (`nodenext`)

- Import nội bộ **bắt buộc** có đuôi `.js` dù file nguồn là `.ts`: `import { HealthService } from "./health.service.js";`
- `apps/api/package.json` có `"type": "module"`; bản build chạy bằng `node dist/main.js`, không dùng `ts-node`.
- `src/bootstrap/env.ts` phải là import **đầu tiên** trong `app.module.ts`: ESM chạy import tĩnh trước thân module, nên `MONGODB_URL` phải có sẵn trước khi `buildDatabaseModule()` được đánh giá.

### 11.2. UI: Tailwind 4 + ReactBits

- Dropdown tài khoản (`components/auth/account-menu.tsx`) và menu off-canvas (`components/site-header.tsx`) dùng React state thuần; đóng bằng click ngoài, `Escape` hoặc bấm link.
- [ReactBits](https://reactbits.dev) là thư viện copy-paste, không phải npm package. File nằm ở `apps/ui/components/reactbits/` (hiện có `BlurText`, `SpotlightCard`; cần `motion`); thư mục này được ESLint bỏ qua vì là code vendored. Thêm component mới:

  ```bash
  npx shadcn@latest add https://reactbits.dev/r/<Name>-TS-TW.json
  ```

- CSS theo kiểu Tailwind 4 CSS-first; token màu là biến thô trong `app/themes/theme.css` (dùng `var(--…)`). Palette hiện là **placeholder** (`TODO(rebrand)`).

### 11.3. Bản nháp wizard nhập

Wizard nhập lưu bản nháp vào IndexedDB (`nihongo-import-draft`, code ở `lib/import-draft.ts`) để F5 không mất; tự xoá khi huỷ hoặc xác nhận xong.
