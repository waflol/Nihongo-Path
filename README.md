# Nihongo Path

Nền tảng học tiếng Nhật (giao diện tiếng Việt): flashcard + lặp lại ngắt quãng (SM-2),
Kanji Jōyō 2136 (thứ tự nét, tra âm Hán Việt), luyện từ & luyện thi (問題),
nhập từ vựng từ CSV/XLSX/PDF (kèm OCR ảnh cho PDF scan), tự tạo câu ví dụ (Tatoeba + AI), khu quản trị.

Monorepo pnpm:

| Thư mục | Nội dung |
|---|---|
| `apps/ui` | Frontend — Next.js 16 (App Router), Tailwind 4 |
| `apps/api` | Backend — NestJS 12, MongoDB (Mongoose), Redis tuỳ chọn |
| `packages/shared` | Bảng âm Hán Việt dùng chung (`han-viet.json`) |
| `docs/` | Đặc tả, kiến trúc, database, hướng dẫn dev, checklist, kế hoạch |

## Chạy nhanh

Yêu cầu: Node ≥ 22.22 (xem `.nvmrc`) và pnpm 12 (phiên bản khoá ở trường `packageManager`
trong `package.json`). Cài pnpm qua Corepack (đi kèm Node), chỉ cần làm một lần:

```bash
nvm install      # cài Node theo .nvmrc nếu máy chưa có
nvm use
corepack enable
corepack prepare pnpm@12.11.2 --activate
pnpm --version   # 12.11.2
```

Không dùng được Corepack thì cài global: `npm install -g pnpm@12.11.2`.

Sau đó:

```bash
pnpm install
pnpm dev         # UI :3001, API :3000
```

Cấu hình env, MongoDB, tài khoản admin, AI/Redis: xem [docs/development.md](docs/development.md).

## Chạy trên server (pm2 + ngrok)

`pnpm dev` dừng khi đóng terminal. Trên server, dùng pm2 để chạy bản build ở chế độ nền.
Với cách này, app không dừng khi đóng terminal, tự restart khi crash và tự chạy lại sau khi reboot.
Cấu hình nằm ở [`ecosystem.config.cjs`](ecosystem.config.cjs) gồm 3 process:

| Tên | Lệnh | Cổng |
|---|---|---|
| `api` | `pnpm start:prod` trong `apps/api` (chạy `dist/main.js`) | 3000 |
| `ui` | `pnpm start` trong `apps/ui` (`next start`) | 3001 |
| `ngrok` | `ngrok http 3001`: tunnel public tới UI | — |

Mỗi process bị restart nếu dùng quá 800MB RAM (`max_memory_restart`).

### Cài đặt lần đầu

```bash
npm i -g pm2
ngrok config add-authtoken <TOKEN>   # lấy token ở dashboard ngrok, chỉ làm một lần

# Build từng app một (server ít RAM, đừng build song song)
pnpm --filter @nihongo/api run build
pnpm --filter @nihongo/ui run build

pm2 start ecosystem.config.cjs
pm2 startup                          # chạy tiếp câu lệnh mà nó in ra
pm2 save                             # lưu danh sách để tự chạy lại khi reboot
pm2 install pm2-logrotate            # tự xoay vòng log, tránh đầy ổ đĩa
```

### Lệnh thường dùng

| Việc | Lệnh |
|---|---|
| Xem trạng thái | `pm2 ls` |
| Xem log | `pm2 logs api` / `pm2 logs ui` / `pm2 logs ngrok` |
| Lấy link ngrok | `curl -s localhost:4040/api/tunnels \| grep -o 'https://[^"]*'` |
| Restart tất cả | `pm2 restart ecosystem.config.cjs` |
| Dừng (giữ trong danh sách) | `pm2 stop all` |
| Dừng và xoá (giống `docker compose down`) | `pm2 delete ecosystem.config.cjs && pm2 save --force` |

### Cập nhật code

```bash
git pull && pnpm install
pnpm --filter @nihongo/api run build   # build lại app có thay đổi
pnpm --filter @nihongo/ui run build
pm2 restart ecosystem.config.cjs
```

### Lưu ý về ngrok

- **Link đổi mỗi lần ngrok restart.** Tài khoản free có 1 domain tĩnh (xem dashboard ngrok, mục Domains).
  Thêm `--url=<ten>.ngrok-free.app` vào `args` của process `ngrok` để giữ link cố định.
- **Gói free chỉ cho chạy 1 ngrok cùng lúc.** Nếu còn một ngrok mở tay ở terminal khác, process
  trong pm2 sẽ báo lỗi `ERR_NGROK_108` và restart liên tục. Kiểm tra bằng `pgrep -a ngrok`.
- **Gọi API qua link ngrok hiện chưa chạy được.** UI gọi API theo `NEXT_PUBLIC_API_URL=http://localhost:3000`.
  Khi người khác mở link ngrok, trình duyệt của họ sẽ gọi vào `localhost` trên máy của họ, nên UI hiện nhưng
  không có dữ liệu và không đăng nhập được. Muốn dùng được qua ngrok, cần proxy API qua Next.js (rewrites)
  hoặc mở thêm tunnel cho API và đặt lại `NEXT_PUBLIC_API_URL` / `WEB_ORIGIN`.
- Nếu dùng Google Sign-In, thêm link ngrok vào mục Authorized JavaScript origins trong Google Console.

## Tài liệu

- [Kiến trúc](docs/architecture.md) · [Database](docs/database.md) · [Hướng dẫn dev](docs/development.md) · [Luồng nhập thẻ](docs/import-flow.md)
- Quyết định: [ADR SRS](docs/adr/ADR-srs.md) · [ADR Auth](docs/adr/ADR-auth-provider.md)
- Kế hoạch tính năng: [Kanji](docs/plans/plan-kanji.md) · [Mobile iOS/Android](docs/plans/plan-mobile.md) · [Antigravity CLI (Google AI Pro)](docs/plans/plan-antigravity-cli.md) · [Tăng tốc kiểm tra cách đọc](docs/plans/plan-reading-check.md)
- [Pháp lý Việt Nam & Điều khoản Sử dụng](docs/legal-vietnam-and-terms.md)
- Lộ trình tổng: [Kế hoạch](docs/IMPLEMENTATION_PLAN.md) · [Checklist](docs/IMPLEMENTATION_CHECKLIST.md) · [Câu hỏi mở](docs/OPEN_QUESTIONS.md) · [Đặc tả gốc](docs/claude_japanese_learning_platform_spec_preline.md)
