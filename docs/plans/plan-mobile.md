# Kế hoạch Phát triển Mobile App (iOS & Android) — Nihongo Path (`apps/mobile`)

> **Trạng thái:** Bản kế hoạch kiến trúc & lộ trình triển khai (`M0`–`M6`) — chờ **Tôi** duyệt trước khi khởi tạo code.
> **Ngày lập:** 07/11/2026. **Phụ thuộc:** Hạ tầng Backend `apps/api` (NestJS 12) + `packages/shared` + tuân thủ pháp lý theo [legal-vietnam-and-terms.md](../legal-vietnam-and-terms.md).

---

## 1. Mục tiêu và Định hướng Kỹ thuật

### 1.1. Tại sao cần App Native/Cross-platform riêng thay vì chỉ bọc WebView?

1. **Chính sách duyệt App của Apple App Store (Guideline 4.2 — Minimum Functionality):** Apple thường xuyên từ chối (reject) các ứng dụng chỉ bọc lại website (`apps/ui`) bằng WebView/Capacitor mà không có trải nghiệm điều hướng, lưu trữ ngoại tuyến (offline) và tương tác phần cứng chuẩn iOS.
2. **Trải nghiệm học tiếng Nhật trên di động:**
   - **Ôn thẻ SRS ngoại tuyến (Offline-first):** Người học ôn Flashcard/Kanji trên xe buýt, tàu điện, máy bay khi mất mạng và tự động đồng bộ (`sync`) khi có mạng trở lại.
   - **Vẽ nét chữ Hán (Kanji Stroke Drawing) & Flip Card 60fps:** Phản hồi xúc giác (`Haptics`), cử chỉ vuốt (`Gesture Handler` + `Reanimated`) mượt mà.
   - **Thu âm độ trễ thấp (Shadowing / AI Kaiwa) & phát âm TTS:** Quản lý phiên âm thanh nền, quyền Microphone chuẩn hệ điều hành.
   - **Nhắc lịch ôn tập hàng ngày (Push Notifications):** Thông báo cục bộ và từ máy chủ khi có thẻ đến hạn (`dueCards`).

### 1.2. So sánh & Đề xuất Công nghệ (`Expo / React Native` vs `Capacitor` vs `Flutter`)

| Tiêu chí | Phương án A: **Expo (React Native) — Đề xuất** | Phương án B: Capacitor (Bọc Next.js) | Phương án C: Flutter |
|---|---|---|---|
| **Tái sử dụng code trong Monorepo** | **Rất cao** (100% TypeScript, dùng chung `packages/shared`, thuật toán SM-2, kiểu DTO, Zod/validation, `han-viet.json`) | Cao (dùng lại UI web nhưng phải đổi sang static export hoặc trỏ remote URL) | Thấp (phải viết lại toàn bộ logic TS sang Dart) |
| **Rủi ro bị Apple Reject (Guideline 4.2)** | **Thấp** (UI gốc UIKit/Android View qua React Native New Architecture) | **Cao** (nếu giống hệt web) | Thấp |
| **Offline SRS & SQLite local** | Xuất sắc (`expo-sqlite` + Drizzle/WatermelonDB) | Hạn chế (IndexedDB dễ bị iOS xoá khi thiếu bộ nhớ) | Tốt (`sqflite`/`drift`) |
| **Audio / Mic / IAP / Push** | Hệ sinh thái chuẩn (`expo-audio`, `react-native-Purchases` / StoreKit 2, `expo-notifications`) | Phụ thuộc plugin cầu nối WebView | Tốt |
| **Build & Phát hành không cần Mac cục bộ** | Có **EAS Build / EAS Submit** (hoặc CI GitHub Actions) | Cần Xcode để ký và đóng gói | Cần Xcode để ký và đóng gói |

👉 **Đề xuất chốt:** Chọn **Phương án A — Expo (React Native New Architecture) + Expo Router + NativeWind v4 (Tailwind CSS)** đặt tại `apps/mobile` trong cùng `pnpm-workspace.yaml`.

---

## 2. Kiến trúc Monorepo mở rộng cho Mobile

```text
nihongo-path/
├── pnpm-workspace.yaml          # packages: ["apps/*", "packages/*"]
├── apps/
│   ├── api/                     # NestJS 12 REST API (dùng chung cho cả Web & Mobile)
│   ├── ui/                      # Next.js 16 Web App
│   └── mobile/                  # [MỚI] Expo (iOS + Android) — @nihongo/mobile
│       ├── app/                 # Expo Router (file-based routing, tương đồng Next App Router)
│       │   ├── (auth)/          # login, register, consent modal
│       │   ├── (tabs)/          # home, decks (SRS), kanji, exams, profile
│       │   ├── study/[deckId].tsx
│       │   ├── kanji/[char].tsx
│       │   └── legal/           # terms.tsx, privacy.tsx
│       ├── src/
│       │   ├── api/             # HTTP client + auto refresh token qua expo-secure-store
│       │   ├── db/              # expo-sqlite local cache (decks, cards, offline review queue)
│       │   ├── components/      # CardFlip, KanjiStrokeCanvas, AudioRecorder
│       │   └── iap/             # StoreKit 2 / Google Play Billing adapter
│       ├── app.json / eas.json
│       └── package.json
└── packages/
    └── shared/                  # @nihongo/shared (dùng chung cho api + ui + mobile)
        ├── han-viet.json        # Đã có
        ├── src/
        │   ├── srs/             # Tách pure algorithm SM-2 + srs.days.ts sang đây để chạy offline trên Mobile
        │   ├── types/           # DTO / Response interfaces (Auth, Deck, Card, Kanji, Exam, AI)
        │   └── constants/       # JLPT levels, feature keys, error codes
        └── package.json
```

---

## 3. Các Yêu cầu Bắt buộc của Apple App Store & Google Play Store (Tránh bị Reject)

Để ứng dụng được duyệt ngay từ lần đầu trên cả **Apple App Store** và **Google Play Store** tại Việt Nam, kiến trúc phải đáp ứng **6 quy tắc bắt buộc** sau:

| # | Quy định của Apple / Google & Pháp luật VN | Cách thiết kế trong `apps/mobile` & `apps/api` |
|---|---|---|
| **R1** | **Sign in with Apple bắt buộc (Apple Guideline 4.8):** Nếu ứng dụng iOS có "Đăng nhập bằng Google", **bắt buộc** phải có nút **"Sign in with Apple"** đặt ngang hàng. | Bổ sung provider `apple` vào `auth_accounts.provider ∈ {google, apple, email}` và endpoint `POST /auth/apple` (xác thực Apple Identity Token) ở `apps/api`. |
| **R2** | **Xoá tài khoản ngay trong App (Apple Guideline 5.1.1(v), Google Play Policy & Luật BVDLCN 91/2025/QH15):** Không được chỉ dẫn người dùng gửi email mới xoá được tài khoản. | Thêm endpoint `DELETE /users/me` (yêu cầu xác nhận lại mật khẩu hoặc OTP/re-auth) và nút **"Xoá tài khoản vĩnh viễn"** trong màn hình `Profile > Cài đặt tài khoản` trên cả Web & Mobile. |
| **R3** | **Thanh toán In-App Purchase (Apple Guideline 3.1.1 & Google Play Billing):** Mọi tính năng số mở khoá trong app (gói Pro/VIP) phải dùng IAP của Apple/Google; không được đặt link dẫn ra cổng thanh toán ngoài trên iOS. | Tích hợp `react-native-iap` hoặc `RevenueCat` trên Mobile, gửi receipt/purchase token về `POST /billing/iap/verify` ở `apps/api` để đồng bộ `user_subscriptions`. |
| **R4** | **Quyền riêng tư & Giải thích quyền phần cứng (`Info.plist` / `AndroidManifest.xml`):** Phải khai báo rõ lý do xin quyền Microphone, Photo Library/Document Picker. | Cấu hình chuỗi tiếng Việt rõ ràng trong `NSMicrophoneUsageDescription`: *"Nihongo Path cần quyền truy cập Microphone để thu âm giọng nói của bạn khi luyện phát âm tiếng Nhật (Shadowing / Kaiwa)."* Không gắn SDK theo dõi quảng cáo xuyên ứng dụng khi chưa xin quyền ATT (`NSUserTrackingUsageDescription`). |
| **R5** | **Kiểm duyệt Nội dung do Người dùng tạo (UGC Policy) & Báo cáo lỗi:** Phải có nút Báo cáo nội dung sai/vi phạm và đồng ý Điều khoản sử dụng. | Tái sử dụng hệ thống `CardReport` (`POST /flashcards/cards/:id/report`) đã có sẵn ở `apps/api` và hiển thị màn hình đồng ý Điều khoản sử dụng trước khi tạo nội dung. |
| **R6** | **Truy cập Chế độ Khách / Xem thử trước khi bắt buộc đăng nhập (Apple Guideline 5.1.1):** Nên cho phép người dùng duyệt danh sách Kanji Jōyō N5–N1, bộ thẻ công khai (`SHARED`) và bài học mẫu trước khi yêu cầu đăng nhập để lưu tiến độ. | Cho phép các màn hình đọc công khai (`GET /kanji`, `GET /content/*`, đề mẫu) hoạt động ở chế độ Guest; chỉ yêu cầu đăng nhập khi lưu tiến độ SRS, tạo bộ thẻ riêng hoặc dùng AI. |

---

## 4. Lộ trình Triển khai Chi tiết (`M0` – `M6`)

### Phase M0 — Chuẩn bị Tài khoản Developer, Pháp lý & Tách `packages/shared` (1 tuần)

| ID | Công việc | Phụ thuộc | Sản phẩm đầu ra | Chủ thể |
|---|---|---|---|---|
| `M0-LEGAL-01` | Hoàn thiện trang `/terms` và `/privacy` trên Web (`apps/ui`) theo nội dung trong `docs/legal-vietnam-and-terms.md` (Apple & Google bắt buộc có URL công khai hoạt động trước khi submit app) | — | Route `/terms`, `/privacy` trả 200 | [CC] + Tôi duyệt |
| `M0-LEGAL-02` | Đăng ký tài khoản **Apple Developer Program** (99 USD/năm) và **Google Play Console** (25 USD một lần); đăng ký giảm phí hoa hồng xuống 15% (Small Business Program) | — | Team ID, Bundle ID `vn.nihongopath.app` | **Tôi** (chủ sản phẩm) |
| `M0-SHARED-01` | Mở rộng `packages/shared` để xuất (export) các kiểu DTO chung và thuật toán thuần `srs.algorithm.ts` + `srs.days.ts` (không phá vỡ import hiện tại của `apps/api`) | — | `@nihongo/shared` build sạch | [CC] |
| `M0-API-01` | Bổ sung 2 API bắt buộc cho Mobile: `POST /auth/apple` (Sign in with Apple) và `DELETE /users/me` (Xoá tài khoản & dữ liệu cá nhân theo Luật 91/2025/QH15 + Apple 5.1.1(v)) | `M0-LEGAL-01` | Unit test + e2e test pass | [CC] |

### Phase M1 — Khởi tạo `apps/mobile` (Expo), Xác thực & Điều hướng nền (1–1.5 tuần)

| ID | Công việc | Phụ thuộc | Sản phẩm đầu ra |
|---|---|---|---|
| `M1-ENV-01` | Khởi tạo `apps/mobile` với Expo SDK mới nhất, TypeScript, Expo Router, NativeWind v4, cấu hình Metro bundler hỗ trợ pnpm monorepo (`packages/shared`) | `M0-SHARED-01` | `pnpm --filter @nihongo/mobile start` chạy trên iOS Simulator & Android Emulator |
| `M1-AUTH-01` | Tích hợp `expo-secure-store` lưu JWT Access/Refresh Token an toàn; viết HTTP client tự động refresh token khi gặp `401` | `M1-ENV-01` | Luồng token tự làm mới, không lưu token vào `AsyncStorage` không mã hoá |
| `M1-AUTH-02` | Màn hình Đăng nhập / Đăng ký (Email + Google + Sign in with Apple trên iOS) kèm **checkbox đồng ý Điều khoản Sử dụng & Chính sách Dữ liệu Cá nhân (không tick sẵn)** | `M0-API-01`, `M1-AUTH-01` | Đăng nhập thành công trên cả iOS & Android |
| `M1-UI-01` | Thiết kế Bottom Tab Bar 5 tab chính: `Trang chủ`, `Từ vựng & SRS`, `Kanji 2136`, `Luyện đề`, `Cá nhân` + chế độ Sáng/Tối (Dark Mode) | `M1-ENV-01` | Điều hướng mượt, hỗ trợ chế độ Guest cho nội dung công khai |

### Phase M2 — Học Từ vựng, Ngữ pháp & Kanji Jōyō 2136 trên Mobile (1.5 tuần)

| ID | Công việc | Phụ thuộc | Sản phẩm đầu ra |
|---|---|---|---|
| `M2-KANJI-01` | Màn hình tra cứu & học Kanji Jōyō (N5–N1): bộ lọc cấp độ, tìm kiếm theo chữ Hán/Hán-Việt/nghĩa, đồng bộ trạng thái đã thuộc | `M1-UI-01` | Tận dụng API `/kanji` và `/kanji/:char` sẵn có |
| `M2-KANJI-02` | Component vẽ và phát hoạt ảnh thứ tự nét viết Kanji (`react-native-svg` + `react-native-reanimated`) từ dữ liệu `strokePaths` của KanjiVG + ghi công giấy phép CC BY-SA 3.0/4.0 | `M2-KANJI-01` | Hoạt ảnh nét viết mượt 60fps |
| `M2-CONTENT-01` | Màn hình danh sách Giáo trình, Bài học (`units`), Từ vựng (có furigana, phát âm TTS qua `expo-speech`) và Ngữ pháp | `M1-UI-01` | Xem bài học mượt, lưu nhanh từ vựng vào bộ thẻ cá nhân |

### Phase M3 — Flashcard & Ôn tập SRS Ngoại tuyến (Offline-first) (2 tuần)

| ID | Công việc | Phụ thuộc | Sản phẩm đầu ra |
|---|---|---|---|
| `M3-SRS-01` | Thiết lập `expo-sqlite` lưu bộ đệm (cache) cho bộ thẻ đang học và hàng đợi kết quả ôn tập (`offline_review_queue`) khi không có mạng | `M0-SHARED-01` | Ôn thẻ được ngay cả khi bật chế độ Máy bay (Airplane Mode) |
| `M3-SRS-02` | Màn hình lật thẻ 3D (`CardFlip` với `Reanimated` + phản hồi rung nhẹ `expo-haptics`), chấm 4 mức `Again / Hard / Good / Easy` tính ngày đến hạn tức thì bằng `@nihongo/shared/srs` | `M3-SRS-01` | Trải nghiệm lật thẻ mượt, đồng bộ ngầm về `POST /srs/review` khi có mạng |
| `M3-CARD-01` | Tạo/sửa bộ thẻ cá nhân (`PRIVATE`), báo cáo thẻ lỗi (`CardReport`), nhập nhanh bộ thẻ từ file CSV/Excel/PDF qua `expo-document-picker` (kèm hộp thoại xác nhận bản quyền tài liệu tải lên) | `M3-SRS-02` | Luồng tạo thẻ và báo lỗi hoạt động đầy đủ |
| `M3-NOTIF-01` | Nhắc nhở ôn tập hàng ngày (`expo-notifications` local reminder theo giờ người học tự chọn, mặc định tắt cho tới khi người học bật) | `M3-SRS-02` | Thông báo nhắc số lượng thẻ đến hạn trong ngày |

### Phase M4 — Bài tập, Đề thi thử JLPT (`問題`) & Công cụ AI (1.5 tuần)

| ID | Công việc | Phụ thuộc | Sản phẩm đầu ra |
|---|---|---|---|
| `M4-EXAM-01` | Màn hình làm bài tập & đề thi thử có đồng hồ đếm ngược, tự động lưu nháp câu trả lời vào `expo-sqlite` phòng trường hợp thoát app giữa chừng | `M1-UI-01` | Nộp bài, chấm điểm và xem giải thích chi tiết sau khi nộp |
| `M4-AI-01` | Tích hợp tính năng AI gợi ý nghĩa/ngữ pháp/cách đọc và màn hình luyện phát âm (thu âm qua `expo-audio` sau khi người dùng bấm đồng ý **Modal Consent Thu âm `Q-24`**) | `M3-CARD-01` | Có nhãn cảnh báo *"Kết quả do AI tạo tự động"* và cơ chế xoá bản ghi âm |

### Phase M5 — In-App Purchase (StoreKit 2 / Google Play Billing) & Quản lý Tài khoản (1.5 tuần)

| ID | Công việc | Phụ thuộc | Sản phẩm đầu ra |
|---|---|---|---|
| `M5-IAP-01` | Tích hợp `RevenueCat` (hoặc `react-native-iap`) cho gói `Pro` / `VIP` trên iOS & Android + nút **"Khôi phục giao dịch đã mua (Restore Purchases)"** (Apple bắt buộc phải có nút này) | `M0-LEGAL-02` | Mua gói trên Sandbox StoreKit / Google Play Test Track thành công |
| `M5-IAP-02` | Backend webhook & endpoint xác thực biên lai Apple/Google (`POST /billing/iap/verify`) đồng bộ vào bảng `user_subscriptions` và `Entitlements` | `M5-IAP-01` | Mua trên App → Web nhận quyền Pro ngay và ngược lại |
| `M5-ACC-01` | Hoàn thiện màn hình `Cài đặt & Pháp lý`: xem Điều khoản sử dụng, Chính sách dữ liệu cá nhân, Ghi công nguồn mở (KANJIDIC2/JMdict/KanjiVG), Quản lý gói thuê bao, và nút **Xoá tài khoản vĩnh viễn** | `M0-API-01` | Đạt 100% checklist pháp lý và chính sách duyệt app |

### Phase M6 — Kiểm thử, Đóng gói EAS Build & Phát hành lên TestFlight / Google Play (1 tuần)

| ID | Công việc | Phụ thuộc | Sản phẩm đầu ra |
|---|---|---|---|
| `M6-QA-01` | Kiểm thử trên thiết bị thật (iPhone, iPad — Apple bắt buộc app phải hiển thị không vỡ giao diện trên iPad kể cả khi chỉ target iPhone, và điện thoại Android nhiều kích cỡ màn hình) | `M5-ACC-01` | Không lỗi layout, không crash, pass E2E |
| `M6-STORE-01` | Chuẩn bị bộ ảnh chụp màn hình (Screenshots), Privacy Nutrition Labels (App Store) & Data Safety Form (Google Play) khớp 100% với Chính sách Bảo vệ Dữ liệu Cá nhân | `M6-QA-01` | Đầy đủ metadata trên App Store Connect & Play Console |
| `M6-RELEASE-01` | Build bản phát hành qua EAS Build / Fastlane, đẩy lên **TestFlight** (iOS) và **Google Play Internal/Closed Testing** (lưu ý: tài khoản Google Play cá nhân mới lập cần 12–20 tester chạy thử 14 ngày liên tục trước khi lên Production; tài khoản Doanh nghiệp có D-U-N-S được miễn bước 14 ngày này) | `M6-STORE-01` | Bản Beta hoạt động ổn định, sẵn sàng bấm Submit Review |

---

## 5. Mẹo Quan trọng khi Đăng ký Tài khoản Developer tại Việt Nam

1. **Nên đăng ký tài khoản Apple Developer & Google Play dưới tên Tổ chức/Doanh nghiệp (Organization) nếu có Công ty:**
   - Tài khoản **Google Play cá nhân** (Individual) đăng ký sau tháng 11/2023 bắt buộc phải qua vòng kiểm thử đóng với **ít nhất 12–20 người dùng thử trong 14 ngày liên tục** mới được quyền nộp đơn xin lên Production. Trong khi đó, tài khoản **Tổ chức (Organization)** có mã số **D-U-N-S** (xin miễn phí cho doanh nghiệp Việt Nam trong khoảng 5–14 ngày làm việc) được đưa thẳng lên Production Review và hiển thị tên pháp nhân uy tín hơn.
2. **Điền biểu mẫu Thuế Mỹ (W-8BEN / W-8BEN-E) trên App Store Connect & Google Play:**
   - Khi mở bán IAP, nhớ hoàn tất biểu mẫu **W-8BEN** (cá nhân) hoặc **W-8BEN-E** (tổ chức) trên App Store Connect để xác nhận không phải đối tượng cư trú thuế tại Hoa Kỳ, tránh bị khấu trừ 30% thuế dự phòng (backup withholding) trên doanh thu toàn cầu.
