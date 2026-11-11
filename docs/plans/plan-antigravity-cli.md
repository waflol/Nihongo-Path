# Plan: dùng tài khoản Google AI Pro qua Antigravity CLI (`agy`)

Trạng thái: **đã triển khai, chưa thử với tài khoản thật** (module `ai-antigravity-cli.ts`, trang admin, test với `agy` giả + thử trực tiếp với `agy` thật đến bước nhập mã, script cài đặt). Bước 6 (bạn thử đăng nhập thật) còn lại.

## 1. Vì sao đổi

Từ **18/06/2026** Google ngừng phục vụ gói cá nhân / Google AI Pro / Ultra qua Gemini CLI (lỗi `IneligibleTierError: … migrate to the Antigravity …`); chỉ Gemini Code Assist Standard/Enterprise còn dùng được. Nơi thay thế do Google chỉ định là **Antigravity CLI (`agy`)**. Phần đăng nhập / pty / quản lý dịch vụ làm cho Gemini CLI được giữ lại về ý tưởng, nhưng runner và đăng nhập viết lại cho `agy`.

## 2. Đã kiểm chứng trên máy này (agy 1.5.5, cài thử vào thư mục tạm)

| Điều | Kết quả |
|------|---------|
| Cài đặt | `curl -fsSL https://antigravity.google/cli/install.sh \| bash` (script tải từ Google, kiểm sha512, đặt `agy` vào `~/.local/bin` hoặc `--dir`). Binary Go ~250 MB, tự cập nhật nền |
| Cô lập theo dịch vụ | Đổi `HOME` là đủ: trạng thái nằm ở `$HOME/.gemini/antigravity-cli/` và `$HOME/.gemini/config/` |
| Headless | `agy -p "<prompt>" --output-format json` → một envelope `{conversation_id,status,response,error,usage,finished_reason}`; chưa đăng nhập: exit 1, stderr `authentication required`, envelope `status:"ERROR"` |
| Đăng nhập | Chạy `agy` trong pty: menu "Select login method" → Enter chọn **Google OAuth** → in link (`accounts.google.com/o/oauth2/auth…`, redirect `antigravity.google/oauth-callback`, có OSC-8 hyperlink) → ô "paste the authorization code". Cùng kiểu "mở link, dán mã" như Gemini CLI |
| Danh sách model | `agy models` (cần đăng nhập); `--model` phải đúng id trong danh sách |
| Cờ hữu ích | `--mode plan`, `--print-timeout`, `--disable-slash-commands`, `--settings <json>` |

## 3. Chưa kiểm chứng được (cần tài khoản thật) — rủi ro chính

1. **Nơi lưu token.** Tài liệu nói *system keyring*; binary có chuỗi `keyringAuth` và "Android (no OS keyring)". Máy chủ Linux không giao diện thường **không có Secret Service/D-Bus**; chưa biết agy có phương án dự phòng. Nếu không lưu được token thì đăng nhập thành công mà gọi headless vẫn đòi đăng nhập. Keyring (nếu có) dùng chung giữa mọi `HOME`, nên nhiều dịch vụ có thể ghi đè nhau → chỉ nên dùng **một** dịch vụ Antigravity.
2. **Print mode treo/im lặng khi không có TTY** (issue #76, #318; đã sửa từ 1.1.1 nhưng vẫn có báo cáo ở 1.2–1.4). Giảm thiểu: đóng stdin, `--print-timeout`, timeout ngoài + kill cả nhóm tiến trình.
3. **Onboarding lần đầu** (điều khoản…) có thể cần hoàn tất trước khi `-p` chạy.
4. **Đọc ảnh PDF** qua `-p` (cách đưa ảnh vào prompt) chưa rõ; để sau khi test thật.
5. **Điều khoản.** Một người trên diễn đàn Google nói FAQ ghi việc bọc `agy` trong ứng dụng khác là *không được hỗ trợ với gói consumer*; người khác nói được. Chưa có câu trả lời chính thức → chỉ dùng cá nhân, tự chịu rủi ro tài khoản.

Vì không đăng nhập được ở đây, **"đã ủy quyền" được xác định bằng cách chạy thật `agy models`** (không đọc file token) và khi thất bại trang admin hiển thị đoạn cuối màn hình của CLI để chẩn đoán.

## 4. Thiết kế

Module `apps/api/src/ai/ai-antigravity-cli.ts` (thay `ai-gemini-cli.ts`), preset `antigravity` ("Google AI Pro (Antigravity CLI)", `kind: "antigravity-cli"`, không khoá, không URL).

- **Thư mục riêng mỗi dịch vụ:** `ANTIGRAVITY_CLI_DATA_DIR/<id>/` (0700) là `HOME` của tiến trình con; thư mục làm việc `…/work` rỗng.
- **Đăng nhập từ trang admin** (giữ UX cũ): server chạy `agy` trong pty (`script`, terminal rộng), gửi Enter để chọn Google OAuth, lấy link (ưu tiên OSC-8), admin mở link, dán mã, server gõ mã vào pty rồi kiểm tra bằng `agy models`. Mã phải là chuỗi an toàn (không phím điều khiển).
- **Gọi AI:** `agy -p <prompt> --output-format json --mode plan --disable-slash-commands --print-timeout …`, stdin đóng, cwd rỗng, môi trường tối giản (không truyền bí mật của app), `@` trong nội dung người dùng đổi thành `＠`, kill cả nhóm tiến trình khi hết giờ, semaphore `ANTIGRAVITY_CLI_CONCURRENCY` (mặc định 1). Prompt đi qua argv (hiện trong `ps` cho người dùng cùng máy — chấp nhận được trên máy cá nhân).
- **Phân loại lỗi:** `authentication required` / chưa đăng nhập → `auth` (kèm xoá dấu "đã ủy quyền"); quota/429 → `rate`; model không hợp lệ → `auth` (đổi model); còn lại → `transient`.
- **Chọn model sau khi ủy quyền:** danh sách lấy động từ `agy models` (parse id dạng `a-b-c`), không được thì dùng danh sách gợi ý. Mặc định `default` = để `agy` tự chọn (không truyền `--model`).
- **Ngoài phạm vi Gemini CLI cũ:** dịch vụ `gemini-cli` đã tạo trước đó không còn preset → xoá thủ công trên trang admin (thư mục của nó được dọn khi xoá).

## 5. Các bước

| # | Việc | Kiểm chứng |
|---|------|-----------|
| 1 | Module `ai-antigravity-cli.ts` + test với `agy` giả (pty, mã đúng/sai, kill cả nhóm, `@`, lỗi) | vitest |
| 2 | Preset, service, controller, `callRaw` | tsc + test AI |
| 3 | UI: tên mới, chọn model động, hiển thị chẩn đoán | tsc |
| 4 | `apps/api/scripts/setup-antigravity-cli.sh` (cài `agy`, kiểm `script`, tạo thư mục dữ liệu) | `--check` |
| 5 | Docs (`development.md`), `.env.example`, `.gitignore` | |
| 6 | **Bạn thử với tài khoản thật**: ủy quyền → `agy models` → Kiểm tra; báo lại lỗi nếu có (đặc biệt keyring / onboarding) | |

## 6. Việc để sau khi thử thật
- Nếu keyring không hoạt động trên máy chủ: thử cài `gnome-keyring` + `dbus` (phiên D-Bus cho tiến trình API) hoặc chạy `agy` bằng user có keyring.
- Đọc PDF scan: chọn cách đưa ảnh vào `-p` (mention `@file` hay mô tả file), gộp nhiều trang mỗi lời gọi nếu quá chậm.
- Nếu Google xác nhận không cho bọc `agy` ở gói consumer: chuyển sang Gemini API key (AI Studio).
