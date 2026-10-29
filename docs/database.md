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
| `users` | Tạo khi Sprint 2 (Identity) | `role`, `lang`, progress index |
| `auth_accounts`, sessions | Khi chọn phương án auth (Google/GitHub/email) | Cần Tôi duyệt provider |

### Learning content
| Collection | Ghi chú |
|---|---|
| `textbooks`, `units` | Giáo trình/unit; owner admin |
| `vocabulary` (flashcard từ vựng) | Từ/cụm từ, furigana, nghĩa VN, POS, ví dụ, nguồn, tags |
| `grammar_points` | Ý nghĩa VN, cấu trúc, cách dùng, ví dụ (1 điểm ↔ N ví dụ/bài tập) |
| `flashcard_decks`, `flashcards` | Bộ thẻ (chia sẻ + cá nhân); cá nhân gắn userId |

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

## 4. Điều chưa quyết định (owner: Tôi/Cả hai)

- Provider thanh toán, tiền tệ, chính sách refund (spec §6.1).
- Thuật toán SRS (spec §4.4).
- Giới hạn media (500MB/60min/1080p/30 ngày là **giá trị thử nghiệm**, chưa chốt).
- RPO/RTO (gợi ý 24h/8h, chưa cam kết).
