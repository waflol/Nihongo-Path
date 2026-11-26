# Issues — Nihongo Path

Mỗi file là một issue (ID `NP-nnn`); nguồn gốc và tiến độ tổng ở [../TICKETS.md](../TICKETS.md). Khi `gh` sẵn sàng, mỗi file có thể đưa lên GitHub Issues nguyên văn.

| ID | Trạng thái | Phase | Tiêu đề |
|---|---|---|---|
| [NP-001](./NP-001.md) | done | - | Nền monorepo, env, health, Swagger, SEO cơ bản, docs chạy local |
| [NP-002](./NP-002.md) | done | - | Xác thực email + Google, JWT/refresh, guard role, rate limit, hồ sơ |
| [NP-003](./NP-003.md) | done | - | Nội dung học: textbook/unit/vocab/grammar + API công khai có phân trang |
| [NP-004](./NP-004.md) | done | - | Deck/card cá nhân + chia sẻ, lưu từ khi học |
| [NP-005](./NP-005.md) | done | - | Nhập CSV/XLSX: map cột, preview, dedupe, ghi idempotent |
| [NP-006](./NP-006.md) | done | - | SRS: tiến độ, hàng đợi, timezone, ghi đa thiết bị |
| [NP-007](./NP-007.md) | done | - | UI học: flashcard, bài tập, danh sách deck, trang hoàn thành |
| [NP-008](./NP-008.md) | done | - | Route guard server (proxy), lưu token an toàn |
| [NP-020](./NP-020.md) | done | P2 | Bấm thử trình duyệt: trang đăng ký, CRUD nội dung admin, menu tài khoản header (verify 18/11) |
| [NP-021](./NP-021.md) | partial | - | Xác nhận import PDF trên file thật (bấm Xác nhận) và OCR trên PDF scan thật |
| [NP-022](./NP-022.md) | done | - | Verify live API đặt lại tiến độ deck + xuất CSV |
| [NP-023](./NP-023.md) | done | - | Bấm thử wizard nhập, màn admin deck chung, thêm/xoá thẻ + đánh giá batch |
| [NP-024](./NP-024.md) | partial | - | Admin: RBAC kiểm 403, quản lý user không tự nâng quyền, audit có giá trị trước/sau |
| [NP-025](./NP-025.md) | partial | - | Phản hồi người dùng: mở rộng từ "báo lỗi thẻ" sang phản hồi chung, có trạng thái + lịch sử xử lý |
| [NP-026](./NP-026.md) | done | - | Kiểm chứng FSRS-4.5: chạy srs.algorithm.spec.ts, so lịch với SM-2 cũ, thử nâng cấp thẻ SM-2 thật |
| [NP-027](./NP-027.md) | partial | - | Thử Antigravity CLI với tài khoản Google thật |
| [NP-101](./NP-101.md) | off-roadmap | - | FSRS-4.5 thay SM-2 (API + bản sao client), nâng cấp lười thẻ cũ |
| [NP-102](./NP-102.md) | off-roadmap | - | PWA: cài như app, offline page, nhắc ôn hằng ngày (Web Push, VAPID) |
| [NP-103](./NP-103.md) | off-roadmap | - | Benchmark AI tiếng Nhật dataset 1000 case (eval, /admin/ai-eval) |
| [NP-104](./NP-104.md) | off-roadmap | - | Dịch vụ AI do admin quản lý + ưu tiên 4 tác vụ + cache + log + Ollama |
| [NP-105](./NP-105.md) | off-roadmap | - | Kiểm tra cả deck bằng AI: cách đọc nhiều giá trị, Hán Việt, ví dụ, reviewIssues |
| [NP-106](./NP-106.md) | off-roadmap | - | Thẻ nhiều từ loại (partsOfSpeech) + ghi chú từ (note) + nhập từ Mazii |
| [NP-107](./NP-107.md) | off-roadmap | - | Kanji Jōyō 2136: trang học, admin theo thứ tự N5–N1, đồng bộ Mazii + log |
| [NP-108](./NP-108.md) | off-roadmap | - | Luyện thi 問題 (exercise_questions, /learn/exam), bài tập nhiều chế độ |
| [NP-109](./NP-109.md) | off-roadmap | - | Nhật ký request/app/audit, chặn IP, Redis console |
| [NP-110](./NP-110.md) | off-roadmap | - | Quản lý admin: tạo admin, đặt lại mật khẩu, trạng thái |
| [NP-111](./NP-111.md) | off-roadmap | - | Điều khoản & bảo mật, đồng ý khi đăng ký (/terms, /privacy) |
| [NP-112](./NP-112.md) | off-roadmap | - | Triển khai pm2 + ngrok, mem-guard RAM |
| [NP-113](./NP-113.md) | off-roadmap | - | Giám sát máy chủ (RAM, ổ đĩa, CPU) cho admin |
| [NP-114](./NP-114.md) | done-partial | - | SRS: nhật ký từng lượt ôn, thời điểm thật, chống áp dụng trùng |
| [NP-115](./NP-115.md) | done-partial | - | SRS: chuyển sang FSRS-6 (tham số mặc định), một module dùng chung API + UI |
| [NP-116](./NP-116.md) | todo | - | SRS: đánh giá và tối ưu tham số FSRS-6 theo người học |
| [NP-401](./NP-401.md) | partial | P4 | Schema câu hỏi/đề/attempt, tách đáp án khỏi payload (P4-EXAM-01…03, P4-SEC-01) |
| [NP-402](./NP-402.md) | partial | P4 | API làm bài: bắt đầu/nộp, hết giờ phía server, xáo trộn, chấm điểm (P4-EXAM-04…06) |
| [NP-403](./NP-403.md) | partial | P4 | Xem lại lỗi + thống kê (P4-EXAM-07/08, P4-UI-02) |
| [NP-404](./NP-404.md) | partial | P4 | Admin soạn đề + màn làm bài có timer/lưu nháp (P4-EXAM-09, P4-UI-01) |
| [NP-405](./NP-405.md) | done | P4 | Cập nhật database.md nhóm exam (P4-DOC-01) |
| [NP-406](./NP-406.md) | done | P4 | Ngân hàng JLPT: mã dạng mondai, bài đọc dùng chung, chấm theo phần |
| [NP-407](./NP-407.md) | partial | P4 | Nhập PDF đề JLPT thành bản nháp có người duyệt |
| [NP-408](./NP-408.md) | todo | P4 | Sinh đề JLPT ngẫu nhiên theo khung đề (blueprint) từng level |
| [NP-409](./NP-409.md) | partial | P4 | UI làm đề JLPT theo phần: bài đọc, câu ★, điểm từng phần |
| [NP-501](./NP-501.md) | partial | P5 | Schema + service quota reserve→settle→release, reset theo kỳ/tz (P5-QUOTA-01…05) |
| [NP-502](./NP-502.md) | partial | P5 | EntitlementGuard/QuotaGuard + chính sách vượt hạn mức (P5-QUOTA-04/06) |
| [NP-503](./NP-503.md) | partial | P5 | Màn cấu hình hạn mức theo gói (P5-ADMIN-04) |
| [NP-504](./NP-504.md) | done | P5 | Rà least privilege endpoint admin + ADR entitlement (P5-SEC-01, P5-DOC-01) |
| [NP-601](./NP-601.md) | blocked | P6 | ADR media + storage + giới hạn (P6-MEDIA-01, 04) |
| [NP-602](./NP-602.md) | todo | P6 | Upload, state machine, SSRF, retention (P6-MEDIA-02/03/05/06) |
| [NP-603](./NP-603.md) | blocked | P6 | STT provider-independent + queue/worker + job state + quota (P6-STT-01…05) |
| [NP-604](./NP-604.md) | todo | P6 | UI upload, trình xem transcript, chính tả (P6-UI-01…03) |
| [NP-701](./NP-701.md) | blocked | P7 | ADR bộ phân tích (Kuromoji vs Sudachi) + tokenizer adapter (P7-ANALYZE-01/02) |
| [NP-702](./NP-702.md) | todo | P7 | Phân tích ngữ nghĩa AI, schema versioned, lưu từ vào thẻ, timeout/chi phí |
| [NP-703](./NP-703.md) | blocked | P7 | Shadowing: phát lặp đoạn, ghi âm có consent, chấm phát âm, retention, quyền truy cập |
| [NP-801](./NP-801.md) | blocked | P8 | ADR provider + benchmark chi phí (P8-KAIWA-01) |
| [NP-802](./NP-802.md) | todo | P8 | Phiên hội thoại, chủ đề/cấp độ, phản hồi sau lượt (P8-KAIWA-02/03/06) |
| [NP-803](./NP-803.md) | todo | P8 | Quota phút/tháng, timeout, đo chi phí + UI (P8-KAIWA-04/05, P8-UI-01) |
| [NP-901](./NP-901.md) | blocked | P9 | ADR payment + schema plan/subscription/payment (P9-BILL-01…04) |
| [NP-902](./NP-902.md) | todo | P9 | Checkout sandbox + webhook ký/idempotent + đồng bộ entitlement (P9-BILL-05…07) |
| [NP-903](./NP-903.md) | todo | P9 | Vòng đời gói, chặn production khi chưa duyệt, trang giá + trang gói của tôi |
| [NP-1001](./NP-1001.md) | blocked | P10 | ADR AdSense + cấu hình placement trong DB + admin toggle/audit (P10-ADS-01/02/07) |
| [NP-1002](./NP-1002.md) | todo | P10 | AdSlot, nạp script một lần, gate theo route/gói, cờ tắt toàn bộ (P10-ADS-03…06) |
| [NP-1003](./NP-1003.md) | blocked | P10 | ads.txt, an toàn PII, a11y (P10-ADS-08, P10-SEC-01, P10-A11Y-01) |
| [NP-1101](./NP-1101.md) | todo | P11 | Chạy toàn bộ backlog T-* + E2E luồng chính (P11-TEST-01/02) |
| [NP-1102](./NP-1102.md) | todo | P11 | Security review, rate limit toàn endpoint công khai, rà secret/log (P11-SEC-01…03) |
| [NP-1103](./NP-1103.md) | blocked | P11 | Monitoring/alert, backup + restore, cấu hình production (P11-OPS-01…03) |
| [NP-1104](./NP-1104.md) | blocked | P11 | Core Web Vitals, a11y, SEO, release checklist, báo cáo bàn giao |

## GitHub Issues ↔ file chi tiết

Các issue đã đăng lên `waflol/Nihongo-Path` (18/11/2026). Dùng `/ticket-status` để xem trạng thái hiện tại.

| GitHub | Tiêu đề | File chi tiết | Task checklist |
|---|---|---|---|
| #2 | Kiểm chứng FSRS-4.5 end-to-end | [NP-026](./NP-026.md), [NP-101](./NP-101.md) | — (ADR-srs) |
| #3 | Đăng ký tài khoản chạy thật | [NP-020](./NP-020.md) | P2-UI-02 |
| #4 | Admin CRUD nội dung học | [NP-020](./NP-020.md) | P2-UI-04 |
| #5 | Menu tài khoản header | [NP-020](./NP-020.md) | P2-UI-06 |
| #6 | Wizard nhập hàng loạt | [NP-023](./NP-023.md) | P3-UI-02 |
| #7 | Admin quản lý deck chung | [NP-023](./NP-023.md) | P3-UI-04 |
| #8 | Thêm/xoá thẻ, đánh giá batch | [NP-023](./NP-023.md) | P3-UI-05 |
| #9 | Đặt lại tiến độ deck, xuất CSV | [NP-022](./NP-022.md) | P3-SRS-07, P3-UI-09 |
| #10 | Nhập PDF thật + OCR | [NP-021](./NP-021.md) | P3-IMPORT-05, 05b |
| #11 | Bắt đầu và nộp đề tự soạn | [NP-401](./NP-401.md), [NP-402](./NP-402.md) | P4-EXAM-01…04 |
| #12 | Hết giờ do server quyết định | [NP-402](./NP-402.md) | P4-EXAM-04 |
| #13 | Xáo câu và chấm điểm | [NP-402](./NP-402.md) | P4-EXAM-05/06 |
| #14 | Xem lại lỗi và thống kê | [NP-403](./NP-403.md) | P4-EXAM-07/08 |
| #15 | Admin soạn đề, lưu nháp | [NP-404](./NP-404.md) | P4-EXAM-09, P4-UI-01 |
| #16 | Audit admin + kiểm quyền | [NP-024](./NP-024.md), [NP-504](./NP-504.md) | P5-ADMIN-01…03, P5-SEC-01 |
| #17 | Phản hồi có trạng thái | [NP-025](./NP-025.md) | P5-FEEDBACK-01/02 |
| #18 | Hạn mức dùng AI | [NP-501](./NP-501.md), [NP-502](./NP-502.md) | P5-QUOTA-01…06 |
| #19 | Backlog P6–P11 | NP-601…NP-1104 (xem bảng trên) | P6–P11 |
