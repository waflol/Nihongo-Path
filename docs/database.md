# Database — Nihongo Path

> Nhóm collection theo đặc tả §9.2. **Chỉ tạo collection khi sprint nào thực sự cần** —
> không dựng sẵn toàn bộ (spec §9.2, yêu cầu bootstrap). Mỗi collection khi triển khai phải
> kèm: owner, index, retention, quan hệ.

## 1. Nguyên tắc

- MongoDB; media binary **không** lưu trong Mongo (object storage — abstraction, chưa chọn).
- Dữ liệu có khả năng đa ngôn ngữ: nội dung học tách theo `lang` khi cần, không hard-code tiếng Việt.
- `Role` ≠ `Plan`: quyền quản trị tách khỏi quyền lợi thuê bao (spec §4.1, §6.2).
- Không lưu secret/credential trong DB.

## 2. Nhóm collection (tên là gợi ý logic)

### Identity
| Collection | Trạng thái | Ghi chú |
|---|---|---|
| `users` | **Tạo Sprint 2 ✅** | `role` (USER/ADMIN/SUPER_ADMIN), `lang`, `status` (ACTIVE/SUSPENDED), `passwordHash` (scrypt `salt$hash`), `authAccounts[]`. Owner: admin. Index: `{email: 1}` sparse. |
| `auth_accounts` | **Tạo Sprint 2 ✅** | Liện kết 1:1 giữa user và provider (google/email; `provider: "github"` đã có trong enum nhưng chưa bật). `providerAccountId` = Google `sub` / email. Index: `{provider: 1, providerAccountId: 1}` **unique**. |
| `auth_sessions` | **Tạo Sprint 2 ✅** | Refresh token opaque (128-bit, unique) + `expiresAt` (TTL theo `JWT_REFRESH_EXPIRES_IN`), `revokedAt` khi rotation/logout. Index: `{token: 1}` unique, `{user: 1, expiresAt: 1}`, `{expiresAt: 1}` TTL (xoá session hết hạn). |

### Learning content
| Collection | Trạng thái | Ghi chú |
|---|---|---|
| `textbooks` | **Tạo Sprint 2 ✅** | `title`, `level`, `status` (DRAFT/PUBLISHED), `lang`. Owner: admin (viết), công khai (đọc PUBLISHED). Index: `{status: 1, level: 1}`. |
| `units` | **Tạo Sprint 2 ✅** | Tham chiếu `textbook`, `sortOrder` là thứ tự canon. Index: `{textbook: 1, sortOrder: 1}`. |
| `vocabulary` | **Tạo Sprint 2 ✅** | `term`, `reading`, `meaning`, `pos`, `example`/`exampleTranslation`, `source`, `tags[]`, `textbooks[]`/`units[]` (liên kết N:1 denormalized), `status`, `lang`. Index: `{status: 1, term: 1}`, `{status: 1, textbooks: 1}`. |
| `grammar_points` | **Tạo Sprint 2 ✅** | `label`, `meaning`, `structure`, `usage`, `examples[]` (sub-document `{sentence, translation, note}` — quan hệ 1 điểm ↔ N ví dụ, **không** collection riêng), `level`, `tags[]`, `sortOrder`, `status`, `lang`. Index: `{status: 1, label: 1}`. |
| `flashcard_decks` | **Tạo Sprint 3 ✅** | `title`, `summary`, `user` (ObjectId, **null cho deck chia sẻ**), `shared` (bool — admin viết, mọi user đã auth đọc), `level`, `lang`, `status` (DRAFT/PUBLISHED), `exampleTotal`/`exampleDone` (tiến độ tạo câu ví dụ nền sau khi nhập; 0 = không xử lý), `publishWhenReady` (deck mới tạo từ wizard nhập: giữ DRAFT đến khi tạo xong ví dụ rồi tự PUBLISHED). Index: `{user: 1, shared: 1, status: 1}`. |
| `flashcards` | **Tạo Sprint 3 ✅** | `deck` (ref), `kind` (VOCABULARY/GRAMMAR/CUSTOM), `vocabulary`/`grammar` (ref, provenance khi wrap content — front/back được snapshot lên card để engine học tự chứa), `front`, `back`, `reading` (hiragana), `image`, `imageCredit`, `partOfSpeech`, `hanViet` (âm Hán Việt từ nguồn), `order` (STT trong file nhập, dùng để sắp xếp), `examples[]`, `tags[]`, `origin` (manual/import/saved), `dedupeKey` (sha256 của (front, back, reading) chuẩn hoá — reading rỗng thì trùng khoá cũ (front, back) — **máy tính server-side**; trùng = giống cả kanji, hiragana và nghĩa; lúc API khởi động các thẻ có reading được tính lại khoá một lần). Index: `{deck: 1}`, `{deck: 1, dedupeKey: 1}` **unique** (idempotent save/import, trùng lặp preview). |

### Progress
| Collection | Ghi chú |
|---|---|
| `user_card_progress` | **Tạo Sprint 3 ✅** — 1 doc duy nhất mỗi `(user, card)` (unique). `state` embed SRS payload **versioned** (`schemaVersion: 1, algorithm: "sm2"`, `ease`, `repetitions`, `intervalDays`, `lapses` — ADR-srs, Q-03 chốt SM-2 + dự phòng FSRS), `dueAt` (instant UTC), `dueDay` (`YYYY-MM-DD` theo tz user — P3-SRS-05), `seenCount`, `lastReviewedAtMs` (thứ tự ghi đa thiết bị: last-write-wins, T-P3-06). Index: `{user: 1, card: 1}` **unique**, `{user: 1, dueDay: 1}` (hàng đợi ôn). |
| `study_sessions` | **Tạo Sprint 3 ✅** — phiên học append-only: `user`, `deck` (null = cross-deck), `day` (local tz), `timezone` (ghi nhận, không giả định), `device` (web/mobile/unknown), `cardsReviewed`, `grades` (histogram theo AGAIN/HARD/GOOD/EASY), `startedAtMs`/`endedAtMs`. Index: `{user: 1, day: -1}`. |
| `exercise_attempts`, `exam_attempts` | Câu trả lời, điểm, thời gian, giải thích (Sprint 4) |

### Media
| Collection | Ghi chú |
|---|---|
| `media_assets` | Chỉ metadata; file ở object storage; trạng thái UPLOADING→EXPIRED |
| `transcripts`, `transcript_segments` | STT sau benchmark provider; timestamp |
| `sentence_analyses` | Schema versioned, lưu tên analyzer/model |
| `ai_jobs` | Quota đặt trước → quyết toán khi thành công, giải phóng khi fail/hủy |

### Billing & entitlements
| Collection | Ghi chú |
|---|---|
| `subscription_plans` | Free/Pro/VIP cấu hình được (featureKey, limit, chu kỳ, tz reset) |
| `user_subscriptions`, `payments` | Provider chưa chọn; không bật giao dịch thật |
| webhook events | Chữ ký + idempotency |
| feature config, quota reservations, usage records | Entitlements tách khỏi role |

### Admin / quality
| Collection | Ghi chú |
|---|---|
| `feedback` | Trạng thái xử lý + lịch sử |
| `audit_logs` | AI thay đổi, thời điểm, giá trị — đã triển khai một phần: xem `auditlogs` ở §3.3 (thao tác của admin) |

### Ads
| Ghi chú |
|---|
| Cấu hình placement/feature flag (cờ bật/tắt, vị trí, theo gói) — **chỉ lưu cấu hình, không dữ liệu nhạy cảm**. Mặc định tắt. |

## 3. Indexes (chỉ tạo khi có collection)

Nguyên tắc: index theo truy vấn thực (userId, deckId, dueDate, status). Ghi rõ index
bắt buộc + unique (vd `user_subscriptions(userId, status)` unique một gói đang hiệu lực).

### 3.1. Đã tạo (Sprint 2 / P2)

| Collection | Index | Loại | Mục đích |
|---|---|---|---|
| `users` | `{ email: 1 }` | sparse | Tra cứu tài khoản email (OAuth-only có email null) |
| `auth_accounts` | `{ provider: 1, providerAccountId: 1 }` | **unique** | Một external identity không link 2 lần |
| `auth_sessions` | `{ token: 1 }` | **unique** | Tra cứu + revocation theo token |
| `auth_sessions` | `{ user: 1, expiresAt: 1 }` | — | Liệt kê session theo user (debug/audit) |
| `auth_sessions` | `{ expiresAt: 1 }` | TTL (`expireAfterSeconds: 0`) | MongoDB tự xoá session hết hạn |
| `textbooks` | `{ status: 1, level: 1 }` | — | Lọc công khai + theo cấp độ |
| `units` | `{ textbook: 1, sortOrder: 1 }` | — | TOC của giáo trình theo thứ tự |
| `vocabulary` | `{ status: 1, term: 1 }` | — | Lọc công khai + hiển thị theo từ |
| `vocabulary` | `{ status: 1, textbooks: 1 }` | — | Lọc theo giáo trình |
| `grammar_points` | `{ status: 1, label: 1 }` | — | Lọc công khai + hiển thị theo nhãn |

> Ghi chú: tên collection thực là do mongoose **tự pluralise** model name
> (ví dụ model `FlashcardDeck` → collection `flashcarddecks`). Tên ở §2 là
> "gợi ý logic" theo quy ước; khi viết query/đọc code, dùng tên pluralised.

### 3.2. Đã tạo (Sprint 3 / P3)

| Collection (actual) | Model | Index | Loại | Mục đích |
|---|---|---|---|---|
| `flashcarddecks` | `FlashcardDeck` | `{ user: 1, shared: 1, status: 1 }` | — | Liệt kê deck cá nhân (user) + deck chung (shared, PUBLISHED) |
| `flashcards` | `Flashcard` | `{ deck: 1 }` | — | Liệt kê card trong 1 deck (P3-CARD-02) |
| `flashcards` | `Flashcard` | `{ deck: 1, dedupeKey: 1 }` | **unique** | Idempotent save/import + phát hiện trùng (T-P3-01/03) |
| `usercardprogresses` | `UserCardProgress` | `{ user: 1, card: 1 }` | **unique** | 1 progress record mỗi (user, card) — last-write-wins đa thiết bị (T-P3-06) |
| `usercardprogresses` | `UserCardProgress` | `{ user: 1, dueDay: 1 }` | — | Hàng đợi ôn theo ngày (P3-SRS-02 / T-P3-05) |
| `studysessions` | `StudySession` | `{ user: 1, day: -1 }` | — | Thống kê phiên học theo ngày (P3-UI-03) |

### 3.3. Đã tạo (nhật ký & chặn IP — `apps/api/src/logs/`)

| Collection (actual) | Model | Index | Loại | Mục đích |
|---|---|---|---|---|
| `requestlogs` | `RequestLog` | `{ createdAt: -1 }`, `{ status: 1, createdAt: -1 }`, `{ ip: 1, createdAt: -1 }` | — | Mỗi request HTTP đã kết thúc (method, path **không query/body**, status, ms, user, IP, `error`) |
| `requestlogs` | `RequestLog` | `{ createdAt: 1 }` | **TTL 30 ngày** | Tự xoá log cũ |
| `applogs` | `AppLog` | `{ createdAt: -1 }`, `{ level: 1, createdAt: -1 }` | TTL 30 ngày | Dòng log Nest (`log`/`warn`/`error`) + exception: stack, request, user, IP, `details` (đã `[redacted]` khoá nhạy cảm). 5xx = `error`; 4xx = `warn` (trừ 401/403/404/429, bật hết bằng `LOG_4XX_ALL=true`) |
| `auditlogs` | `AuditLog` | `{ createdAt: -1 }`, `{ actor: 1 }` | TTL 365 ngày | Thao tác ghi (non-GET) trên route có `@Roles`: ai, khi nào, path, body đã lọc, thành công/thất bại |
| `blockedips` | `BlockedIp` | `{ ip: 1 }` | **unique** | IP bị chặn (thủ công hoặc tự động) |
| `blockedips` | `BlockedIp` | `{ expiresAt: 1 }` | TTL theo `expiresAt` | Hết hạn chặn → tự gỡ (không có `expiresAt` = vĩnh viễn) |
| `allowedips` | `AllowedIp` | `{ ip: 1 }` | **unique** | IP không bao giờ bị chặn (allowlist) |

Các module log chỉ có khi có `MONGODB_URL`. Truy vấn qua `GET /admin/logs*`
(ADMIN / SUPER_ADMIN), UI ở `/admin/logs`.

Tài khoản admin đầu tiên: **không auto-seed** (spec §4.1) — chạy
`node apps/api/scripts/bootstrap-admin.mjs <email> [password]` (P2-USER-02).

## 4. Điều chưa quyết định (owner: Tôi/Cả hai)

- Provider thanh toán, tiền tệ, chính sách refund (spec §6.1).
- Giới hạn media (500MB/60min/1080p/30 ngày là **giá trị thử nghiệm**, chưa chốt).
- RPO/RTO (gợi ý 24h/8h, chưa cam kết).
- ~~Thuật toán SRS~~ → **Đã chốt SM-2 + state versioned (03/11/2026, ADR-srs, Q-03).**
