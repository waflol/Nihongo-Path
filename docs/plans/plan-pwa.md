# Kế hoạch PWA (cài web như app trên Android/iOS) — Nihongo Path

> **Trạng thái:** P0–P3 đã có code (chạy thử qua domain ngrok): thẻ "Cài ứng dụng" và "Nhắc ôn tập mỗi ngày" ở `/learn`, module `apps/api/src/notifications`. P4 cần domain thật nên chưa làm.
> P3 (cache file tĩnh) chỉ bật ở bản build production; pm2 hiện chạy `pnpm dev` nên khi test chưa có tác dụng.
> P2 cần `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` trong `apps/api/.env` (thiếu thì tắt). Giờ nhắc mặc định 20:00 theo múi giờ của máy; bộ đếm chạy 5 phút một lần.
> **Ngày lập:** 15/11/2026. **Liên quan:** [plan-mobile.md](plan-mobile.md) (app native Expo, cần phí developer). PWA là bước **miễn phí** đi trước, không thay thế kế hoạch đó.

## 1. Mục tiêu

- Người học **cài Nihongo Path lên màn hình chính** (Android/Chrome và iOS/Safari), mở toàn màn hình, có icon riêng.
- **Không tốn phí** (không cần Google Play / App Store), không viết lại giao diện: dùng nguyên `apps/ui`.
- Về sau: nhắc ôn thẻ bằng push notification, đóng gói APK Android qua PWABuilder.

## 2. Vì sao chạy được qua ngrok

- PWA bắt buộc **HTTPS**. Link ngrok luôn là `https://…`, nên test cài app trên điện thoại thật được ngay, chưa cần domain riêng.
- Trình duyệt **không gọi API trực tiếp**: mọi request đi qua Route Handler `apps/ui/app/api/*` rồi Next server gọi `NEXT_PUBLIC_API_URL` (localhost:3000) ở phía server (`lib/api.ts`). Vì vậy chỉ cần tunnel cổng UI 3001.
- `next.config.ts` đã cho phép `*.ngrok-free.app` / `*.ngrok-free.dev` load tài nguyên dev (HMR).

## 3. Các phase

### P0 — Nền tảng PWA, test qua ngrok (đã làm)

| ID | Việc | File |
|---|---|---|
| `PWA-01` | Web App Manifest (tên, icon, `display: standalone`, `start_url: /learn`, màu chủ đề). Dùng Route Handler và link `crossorigin="use-credentials"` thay vì `app/manifest.ts`; icon nhúng dạng data URL. Lý do: trình duyệt tải manifest không kèm cookie, nên ngrok free trả về trang cảnh báo và Chrome báo "Không thể cài đặt" | `apps/ui/app/app.webmanifest/route.ts` → `/app.webmanifest`, link trong `app/layout.tsx` |
| `PWA-02` | Icon PNG 192/512, icon maskable 512 (Android bo tròn/cắt), `apple-icon.png` 180 (iOS) sinh từ `app/icon.svg` | `apps/ui/scripts/generate-pwa-icons.mjs` → `public/icons/*`, `app/apple-icon.png` |
| `PWA-03` | Service worker tối thiểu: **không cache dữ liệu học/API** (nhiều người dùng chung máy, dữ liệu theo tài khoản); chỉ hiện trang "Mất kết nối" khi mở trang lúc offline | `apps/ui/public/sw.js`, `public/offline.html` |
| `PWA-04` | Đăng ký service worker phía client, có công tắc tắt `NEXT_PUBLIC_PWA=off` (gỡ SW đã cài) | `components/pwa/service-worker-register.tsx`, `app/layout.tsx` |
| `PWA-05` | Header `Cache-Control: no-cache` cho `/sw.js` để bản SW mới luôn được tải | `next.config.ts` |
| `PWA-06` | Domain ngrok cố định: ngrok tự dùng domain dev của tài khoản theo authtoken, không cần cấu hình thêm (link không đổi → app đã cài không bị "mồ côi") | `~/.config/ngrok/ngrok.yml` (authtoken) |

### P1 — Trải nghiệm cài đặt

- Nút **"Cài ứng dụng"** trong header/trang `/learn`: bắt sự kiện `beforeinstallprompt` (Android/Chrome/Edge).
- Trên iOS (không có sự kiện trên): hiện hướng dẫn *Chia sẻ → Thêm vào MH chính* khi mở bằng Safari và chưa ở chế độ standalone.
- Thêm `screenshots` + `description` vào manifest để Chrome hiện hộp thoại cài đặt dạng "rich install".

### P2 — Nhắc ôn tập bằng Web Push

- API: tạo cặp khoá VAPID, bảng/collection `push_subscriptions` (userId, endpoint, keys, createdAt), endpoint `POST/DELETE /notifications/subscriptions`, job hằng ngày gửi "Hôm nay còn N thẻ cần ôn" (dùng thư viện `web-push`).
- UI: nút bật/tắt nhắc ôn trong trang cá nhân. **Mặc định tắt**, chỉ xin quyền khi người dùng bấm (Luật 91/2025/QH15, như `M3-NOTIF-01`).
- SW: xử lý `push` và `notificationclick` (mở `/learn/review`).
- iOS: Web Push chỉ chạy khi app **đã được thêm vào MH chính** (iOS 16.4+).

### P3 — Offline có chọn lọc

- Cache-first cho `/_next/static/*` (file có hash, an toàn), font và icon. **Chỉ bật ở bản build production**, vì ở `next dev` file chunk không có hash và cache sẽ phá HMR.
- Cân nhắc cho ôn thẻ offline (IndexedDB + hàng đợi kết quả). Việc này lớn, nên quyết định sau khi có số liệu dùng thật.

### P4 — Domain thật & APK Android miễn phí

- Có domain riêng thì đặt `NEXT_PUBLIC_SITE_URL`, đổi ngrok sang domain đó (hoặc reverse proxy + HTTPS).
- Dùng **PWABuilder** (pwabuilder.com) tạo APK/AAB dạng TWA: build trên cloud, không cần build trên VPS 4GB. Cần file `/.well-known/assetlinks.json` (Digital Asset Links) để APK mở toàn màn hình, không hiện thanh URL.
- Phát hành APK trên web của mình. Lên Google Play ($25) thì làm sau.

## 4. Chạy thử P0 qua ngrok

1. **Domain ngrok:** authtoken trong `~/.config/ngrok/ngrok.yml` đã gắn với domain dev của tài khoản, nên `pm2 restart ngrok` vẫn giữ nguyên link. Chỉ khi đổi authtoken sang tài khoản khác thì link mới đổi, và khi đó phải cài lại app.
2. **Lấy link hiện tại:** `curl -s localhost:4040/api/tunnels | grep -o 'https://[^"]*'`
3. **Kiểm tra trên máy tính:** mở link bằng Chrome → DevTools → *Application* → *Manifest* (không báo lỗi, thấy icon) và *Service workers* (`sw.js` ở trạng thái *activated*).
4. **Android (Chrome):** mở link → bấm *Visit Site* ở trang cảnh báo của ngrok (chỉ lần đầu) → menu ⋮ → **Cài đặt ứng dụng / Thêm vào MH chính** → mở từ icon: toàn màn hình, vào `/learn` (chưa đăng nhập thì chuyển `/login`).
5. **iPhone (Safari):** mở link → nút Chia sẻ → **Thêm vào MH chính** → mở từ icon.
6. **Offline:** bật chế độ máy bay → mở app → thấy trang "Mất kết nối" thay vì lỗi trình duyệt.
7. **Google Sign-In:** thêm link ngrok vào *Authorized JavaScript origins* của OAuth client trong Google Cloud Console. Không thì nút Google không đăng nhập được (email/mật khẩu vẫn chạy).

### Lưu ý

- **Trang cảnh báo của ngrok free** chỉ hiện khi mở trang lần đầu trong trình duyệt. Sau khi bấm *Visit Site*, cookie của ngrok cho các request sau (manifest, `sw.js`) đi qua bình thường. Nếu DevTools báo `sw.js` sai MIME type (`text/html`), tải lại trang sau khi đã qua trang cảnh báo.
- **Cài từ một domain thì app gắn với domain đó.** Đổi domain (ngrok → domain thật) thì người dùng phải cài lại.
- **Tắt PWA khi gặp sự cố:** đặt `NEXT_PUBLIC_PWA=off` trong `apps/ui/.env` rồi restart `ui`. Lần mở trang tiếp theo sẽ gỡ service worker đã cài.
- **Đổi icon:** sửa `app/icon.svg` rồi chạy `node scripts/generate-pwa-icons.mjs` trong `apps/ui`.
