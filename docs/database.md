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
| `flashcard_decks`, `flashcards` | Tạo Sprint 3 | Deck chia sẻ + cá nhân; cá nhân gắn userId |

### Progress
| Collection | Ghi chú |
|---|---|
| `user_card_progress` | Tiến độ từng người dùng, SRS state (thuật toán chưa chốt) |
| `study_sessions` | Phiên học, timezone, thiết bị |
| `exercise_attempts`, `exam_attempts` | Câu trả lời, điểm, thời gian, giải thích |

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
| `audit_logs` | AI thay đổi, thời điểm, giá trị |

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

Tài khoản admin đầu tiên: **không auto-seed** (spec §4.1) — chạy
`node apps/api/scripts/bootstrap-admin.mjs <email> [password]` (P2-USER-02).

## 4. Điều chưa quyết định (owner: Tôi/Cả hai)

- Provider thanh toán, tiền tệ, chính sách refund (spec §6.1).
- Thuật toán SRS (spec §4.4).
- Giới hạn media (500MB/60min/1080p/30 ngày là **giá trị thử nghiệm**, chưa chốt).
- RPO/RTO (gợi ý 24h/8h, chưa cam kết).
