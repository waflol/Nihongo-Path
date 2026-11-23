# Danh sách ticket & tiến độ — Nihongo Path

> **Cập nhật:** 18/11/2026. Nguồn: [IMPLEMENTATION_CHECKLIST.md](./IMPLEMENTATION_CHECKLIST.md) (trạng thái từng task),
> [OPEN_QUESTIONS.md](./OPEN_QUESTIONS.md) (quyết định đang chờ), `git log` đến `51049d6`.
>
> **Cách đọc trạng thái:** theo quy ước checklist §0.1. `✅` = checklist đã `[x]` có bằng chứng; `🟡` = `[~]` làm dở / chưa kiểm
> chứng đủ; `⬜` = chưa làm; `⏸` = chờ chủ sản phẩm quyết định; `➕` = đã làm **ngoài** checklist gốc (có commit, chưa có tiêu chí nghiệm thu).
>
> **Giới hạn của bản này:** tiến độ lấy từ tài liệu + `git log`, **chưa chạy lại** `typecheck/lint/build/test` (máy chỉ còn ~100 MB RAM trống).
> Không tick thêm `[x]` nào so với checklist.
>
> **Tracker:** mỗi ticket `NP-nnn` có file riêng trong [issues/](./issues/README.md). Đã đưa lên GitHub Issues (`waflol/Nihongo-Path`, #2–#19, 18/11); bảng ghép issue ↔ file ở [issues/README.md](./issues/README.md). Dùng `/ticket-status` để xem trạng thái hiện tại.

## 1. Tổng quan theo phase

Đếm theo hàng task trong checklist (đã cập nhật 18/11).

| Phase | Nội dung | ✅ | 🟡 | ⬜ | ⏸ | Tiến độ* |
|---|---|---:|---:|---:|---:|---|
| P0 | Discovery | 6 | 0 | 0 | 0 | 100% |
| P1 | Foundation | 34 | 0 | 0 | 0 | 100% |
| P2 | Identity & Content | 22 | 0 | 0 | 0 | 100% |
| P3 | Flashcards & SRS | 22 | 5 | 0 | 0 | 81% (+5 dở) |
| P4 | Exercises & Exams | 1 | 12 | 0 | 0 | 8% (code + vitest xong, chờ verify trình duyệt) |
| P5 | Admin, Feedback, Entitlements | 0 | 5 | 8 | 1 | 0% (+5 dở) |
| P6 | Media & STT | 0 | 0 | 14 | 1 | 0% |
| P7 | Phân tích câu & Shadowing | 0 | 0 | 11 | 1 | 0% |
| P8 | AI Kaiwa | 0 | 0 | 7 | 1 | 0% |
| P9 | Thanh toán | 0 | 0 | 11 | 1 | 0% |
| P10 | AdSense | 0 | 0 | 8 | 2 | 0% |
| P11 | Production readiness | 0 | 0 | 12 | 1 | 0% |
| **Tổng** | | **85** | **22** | **71** | **8** | **~45% xong** (85/186) |

\* % = ✅ / tổng task của phase. P5 đã chuyển 5 hàng từ ⬜ sang 🟡 ngày 18/11 vì code nền đã có.

## 2. Đã xong (✅) — đóng lại, chỉ để tra cứu

| Ticket | Phạm vi | Checklist | Ghi chú |
|---|---|---|---|
| NP-001 | Nền monorepo, env, health, Swagger, SEO cơ bản, docs chạy local | P0, P1 (40 task) | Kiểm chứng 29–30/10 |
| NP-002 | Xác thực email + Google, JWT/refresh, guard role, rate limit, hồ sơ | P2-AUTH-01…08, P2-USER-01/02 | ADR-auth-provider; bằng chứng live 03/11 |
| NP-003 | Nội dung học: textbook/unit/vocab/grammar + API công khai có phân trang | P2-CONTENT-01…05, P2-DOC-01 | |
| NP-004 | Deck/card cá nhân + chia sẻ, lưu từ khi học | P3-CARD-01…04, P3-CARD-08 | |
| NP-005 | Nhập CSV/XLSX: map cột, preview, dedupe, ghi idempotent | P3-IMPORT-01…04 | |
| NP-006 | SRS: tiến độ, hàng đợi, timezone, ghi đa thiết bị | P3-SRS-01…06 | **Thuật toán nay là FSRS-4.5** (NP-101) |
| NP-007 | UI học: flashcard, bài tập, danh sách deck, trang hoàn thành | P3-UI-01/03/07/08 | Bấm thử trình duyệt 05/11 |
| NP-008 | Route guard server (proxy), lưu token an toàn | P2-UI-01/03/05 | |
| NP-020 | Bấm thử trình duyệt: trang đăng ký, CRUD nội dung admin, menu tài khoản header | P2-UI-02, P2-UI-04, P2-UI-06 | Verify Chromium headless 18/11, screenshot `.p2-evidence/` |
| NP-026 | Kiểm chứng FSRS-4.5 | NP-101 | Spec 6/6, so lịch với SM-2, nâng cấp thẻ SM-2 thật lên `schemaVersion: 2` (commit `51049d6`) |
| NP-405 | Cập nhật `database.md` nhóm exam | P4-DOC-01 | `exams`, `exam_attempts` khớp code (18/11) |
| NP-406 | Ngân hàng JLPT GĐ1: mã dạng mondai, `exam_stimuli`, xáo theo nhóm, chấm theo điểm/phần | P4-JLPT-01…04 | vitest 424 xanh (19/11); đề phẳng không đổi hành vi |

## 3. Đang dở (🟡) — việc còn lại để đóng

| Ticket | Việc còn lại | Checklist | Tiêu chí đóng |
|---|---|---|---|
| NP-021 | Xác nhận import PDF trên file thật (bấm **Xác nhận**) và OCR trên PDF scan thật | P3-IMPORT-05, 05b | Import xong, số thẻ khớp, không trùng khi chạy lại |
| NP-022 | Verify live API đặt lại tiến độ deck + xuất CSV | P3-SRS-07, P3-UI-09 | Gọi API/tải file thật |
| NP-023 | Bấm thử wizard nhập, màn admin deck chung, thêm/xoá thẻ + đánh giá batch | P3-UI-02, 04, 05 | Thao tác trình duyệt, ghi bằng chứng |
| NP-024 | Admin: RBAC kiểm 403, quản lý user không tự nâng quyền, audit có giá trị trước/sau | P5-ADMIN-01/02/03 | Test thật + bản ghi audit trong DB |
| NP-025 | Phản hồi người dùng: mở rộng từ "báo lỗi thẻ" sang phản hồi chung, có trạng thái + lịch sử xử lý | P5-FEEDBACK-01/02 | Đổi trạng thái có lịch sử |
| NP-401 | Schema đề/attempt, tách đáp án khỏi payload | P4-EXAM-01…03, P4-SEC-01 | Verify `curl` response làm bài không có `isCorrect`; Q-12 ⏸ (quyền dùng đề chính thức) |
| NP-402 | API làm bài: bắt đầu/nộp, hết giờ server, xáo, chấm | P4-EXAM-04…06 | Verify API với thời gian giả lập (code + vitest xong 18/11) |
| NP-403 | Xem lại lỗi + thống kê + màn kết quả | P4-EXAM-07/08, P4-UI-02 | Verify API + trình duyệt |
| NP-404 | Màn làm bài có timer/lưu nháp + admin soạn đề (`app/admin/exams`) | P4-EXAM-09, P4-UI-01 | Code xong (commit 39c481b); còn verify trình duyệt |
| NP-027 | Thử Antigravity CLI với tài khoản Google thật | `plans/plan-antigravity-cli.md` §3 | Gọi `agy` thật qua đăng nhập dùng chung |

## 4. Đã làm ngoài checklist (➕)

Có commit, chưa nằm trong checklist; cần bổ sung tiêu chí nghiệm thu nếu muốn tính vào tiến độ.

| Ticket | Tính năng | Bằng chứng | Còn thiếu |
|---|---|---|---|
| NP-101 | FSRS-4.5 thay SM-2 (API + bản sao client), nâng cấp lười thẻ cũ | `3b7141c`, `srs.algorithm.spec.ts` | NP-026; tối ưu tham số theo dữ liệu thật |
| NP-102 | PWA: cài như app, offline page, nhắc ôn hằng ngày (Web Push, VAPID) | `1b51a02`, `plans/plan-pwa.md` | Cache tĩnh chỉ bật ở build production (pm2 đang chạy dev); phase 4 cần domain riêng |
| NP-103 | Benchmark AI tiếng Nhật dataset 1000 case (`eval`, `/admin/ai-eval`) | `fcfb416`, `plans/plan-eval-benchmark.md` | — |
| NP-104 | Dịch vụ AI do admin quản lý + ưu tiên 4 tác vụ + cache + log + Ollama | `docs/architecture.md` §3.6 | — |
| NP-105 | Kiểm tra cả deck bằng AI: cách đọc nhiều giá trị, Hán Việt, ví dụ, `reviewIssues` | `plans/plan-reading-check.md`, `6ec7f58`, `e7c2758` | Đo độ chính xác |
| NP-106 | Thẻ nhiều từ loại (`partsOfSpeech`) + ghi chú từ (`note`) + nhập từ Mazii | `09f7f95` | — |
| NP-107 | Kanji Jōyō 2136: trang học, admin theo thứ tự N5–N1, đồng bộ Mazii + log | `plans/plan-kanji.md`, `263fcf3` | — |
| NP-108 | Luyện thi 問題 (`exercise_questions`, `/learn/exam`), bài tập nhiều chế độ | `exercise-questions.service.ts` | Chưa có attempt/timer/chấm điểm server (xem P4) |
| NP-109 | Nhật ký request/app/audit, chặn IP, Redis console | `docs/database.md` §6–7 | — |
| NP-110 | Quản lý admin: tạo admin, đặt lại mật khẩu, trạng thái | `admin-users.service.ts` | Xem NP-024 |
| NP-111 | Điều khoản & bảo mật, đồng ý khi đăng ký (`/terms`, `/privacy`) | `docs/legal-vietnam-and-terms.md`, `apps/ui/app/legal.ts` | Điền thông tin đơn vị vận hành; DPIA/TIA gửi A05; luật sư rà soát (xem NP-111) |
| NP-112 | Triển khai pm2 + ngrok, `mem-guard` RAM | `b96aafb`, `ecosystem.config.cjs` | Chạy bản build production thay vì dev |
| NP-113 | Giám sát máy chủ: RAM, ổ đĩa, CPU + biểu đồ + bộ lọc 1 giờ/6 giờ/ngày/tuần/tháng/năm, lưu mẫu 5 phút (`/admin/system`) | `52da2e6`, `apps/api/src/system/`, `system-monitor.tsx` | Chưa chạy với Mongo thật / bấm thử trình duyệt, chưa test; RAM chưa trừ cache Linux |

## 5. Backlog theo phase (⬜ / ⏸)

Mỗi phase giữ nguyên ID trong checklist; ticket gom theo cụm.

### SRS — Nâng lên FSRS-6 + tối ưu tham số (ngoài checklist, lập 19/11)
Plan chi tiết: [plans/plan-fsrs-6.md](./plans/plan-fsrs-6.md). Làm tuần tự; NP-114 nên lên production sớm để tích luỹ nhật ký ôn.

| Ticket | Cụm task | Chặn bởi |
|---|---|---|
| NP-114 | `srs_review_logs` + `reviewId`/`reviewedAt` từng lượt, gửi lại batch không áp dụng hai lần | — |
| NP-115 | FSRS-6 qua `ts-fsrs` trong `@nihongo/shared/srs`, nâng lười thẻ v1/v2, bỏ bản sao trong UI | NP-114 |
| NP-116 | Tối ưu tham số theo người học (`@open-spaced-repetition/binding`), chỉ áp dụng khi tốt hơn mặc định | NP-115; người dùng đủ ~1.000 lượt ôn |

### P4+ — Ngân hàng đề JLPT & sinh đề ngẫu nhiên (ngoài checklist, lập 19/11)
Plan chi tiết: [plans/plan-jlpt-question-bank.md](./plans/plan-jlpt-question-bank.md). Chưa có hàng trong checklist nên không tính vào % ở §1.

| Ticket | Cụm task | Chặn bởi |
|---|---|---|
| NP-407 | Nhập PDF đề → bản nháp `exam_import_drafts` → admin duyệt/xuất bản, chống trùng chéo nguồn | NP-406 ✅ |
| NP-408 | Khung đề theo level + `generateExam` có seed; người học chỉ bốc câu `own/licensed` | NP-406 ✅; Q-12 ⏸ (phần người học) |
| NP-409 | UI làm đề theo phần (bài đọc, câu ★, điểm từng phần) + admin phủ ngân hàng/sinh đề thử | NP-407, NP-408 |

> NP-406 (GĐ1) xong 19/11 — xem §2.

### P5 — Hạn mức & quản trị
| Ticket | Cụm task | Chặn bởi |
|---|---|---|
| NP-501 | Schema + service quota reserve→settle→release, reset theo kỳ/tz (P5-QUOTA-01…05) | ✅ |
| NP-502 | `EntitlementGuard`/`QuotaGuard` + chính sách vượt hạn mức (P5-QUOTA-04/06) | ✅ |
| NP-503 | Màn cấu hình hạn mức theo gói (P5-ADMIN-04) | NP-501 ✅ |
| NP-504 | Rà least privilege endpoint admin + ADR entitlement (P5-SEC-01, P5-DOC-01) | NP-024 |

### P6 — Media & STT
| Ticket | Cụm task | Chặn bởi |
|---|---|---|
| NP-601 | ADR media + storage + giới hạn (P6-MEDIA-01, 04) | Q-05, Q-11 ⏸ |
| NP-602 | Upload, state machine, SSRF, retention (P6-MEDIA-02/03/05/06) | NP-601 |
| NP-603 | STT provider-independent + queue/worker + job state + quota (P6-STT-01…05) | Q-04 ⏸; cần worker (hiện job nền chạy trong tiến trình API) |
| NP-604 | UI upload, trình xem transcript, chính tả (P6-UI-01…03) | NP-602, NP-603 |

### P7 — Phân tích câu & Shadowing
| Ticket | Cụm task | Chặn bởi |
|---|---|---|
| NP-701 | ADR bộ phân tích (Kuromoji vs Sudachi) + tokenizer adapter (P7-ANALYZE-01/02) | Q-06 ⏸. Đã dùng kuromoji cho cách đọc |
| NP-702 | Phân tích ngữ nghĩa AI, schema versioned, lưu từ vào thẻ, timeout/chi phí (P7-ANALYZE-03…06) | NP-701, NP-501, NP-104 |
| NP-703 | Shadowing: phát lặp đoạn, ghi âm có consent, chấm phát âm, retention, quyền truy cập (P7-SHADOW-01…04, P7-SEC-01) | Q-24, Q-04 ⏸ |

### P8 — AI Kaiwa
| Ticket | Cụm task | Chặn bởi |
|---|---|---|
| NP-801 | ADR provider + benchmark chi phí (P8-KAIWA-01) | Q-04 ⏸. NP-103 đã có hạ tầng benchmark |
| NP-802 | Phiên hội thoại, chủ đề/cấp độ, phản hồi sau lượt (P8-KAIWA-02/03/06) | NP-801 |
| NP-803 | Quota phút/tháng, timeout, đo chi phí + UI (P8-KAIWA-04/05, P8-UI-01) | NP-501, NP-802 |

### P9 — Thanh toán (chỉ sandbox)
| Ticket | Cụm task | Chặn bởi |
|---|---|---|
| NP-901 | ADR payment + schema plan/subscription/payment (P9-BILL-01…04) | Q-08 ⏸ |
| NP-902 | Checkout sandbox + webhook ký/idempotent + đồng bộ entitlement (P9-BILL-05…07) | NP-901, NP-501 |
| NP-903 | Vòng đời gói, chặn production khi chưa duyệt, trang giá + trang gói của tôi (P9-BILL-08/09, P9-UI-01/02) | NP-902 |

### P10 — AdSense
| Ticket | Cụm task | Chặn bởi |
|---|---|---|
| NP-1001 | ADR AdSense + cấu hình placement trong DB + admin toggle/audit (P10-ADS-01/02/07) | Q-09 ⏸ |
| NP-1002 | `AdSlot`, nạp script một lần, gate theo route/gói, cờ tắt toàn bộ (P10-ADS-03…06) | NP-1001, NP-502 |
| NP-1003 | `ads.txt`, an toàn PII, a11y (P10-ADS-08, P10-SEC-01, P10-A11Y-01) | Publisher ID ⏸ |

### P11 — Sẵn sàng production
| Ticket | Cụm task | Chặn bởi |
|---|---|---|
| NP-1101 | Chạy toàn bộ backlog `T-*` + E2E luồng chính (P11-TEST-01/02) | P1–P10. Đã có 47 file spec — đối chiếu với `T-*` trước |
| NP-1102 | Security review, rate limit toàn endpoint công khai, rà secret/log (P11-SEC-01…03) | NP-1101 |
| NP-1103 | Monitoring/alert, backup + restore, cấu hình production (P11-OPS-01…03) | Q-10 ⏸ |
| NP-1104 | Core Web Vitals, a11y, SEO, release checklist, báo cáo bàn giao (P11-OPS-04, A11Y-01, SEO-01, DOC-01/02) | NP-1103; Q-19 ⏸, Q-09 ⏸ |

## 6. Quyết định đang chờ chủ sản phẩm

| Câu hỏi | Chặn ticket | Trạng thái |
|---|---|---|
| Q-04 Provider AI/STT/chấm phát âm | NP-603, 703, 801 | ⏸ |
| Q-05 Object storage + queue | NP-601 | ⏸ |
| Q-06 Bộ phân tích hình thái | NP-701 | ⏸ |
| Q-07 Định nghĩa Free/Pro/VIP + hạn mức | NP-501 | ⏸ |
| Q-08 Thanh toán | NP-901 | ⏸ |
| Q-09 AdSense, domain, thương hiệu | NP-1001, NP-1104 | ⏸ |
| Q-10 RPO/RTO, hosting, monitoring | NP-1103 | ⏸ |
| Q-11 Giới hạn media | NP-601 | ⏸ |
| Q-12 Quyền dùng đề thi chính thức | NP-401, NP-407, NP-408 | ⏸ (phần P3 đã duyệt 05/11) |
| Q-19…Q-24 Mơ hồ (a11y, MVP, đa ngôn ngữ, video ngoài, vượt hạn mức, consent audio) | nhiều ticket | ⏸ |

## 7. Việc nên làm kế tiếp (đề xuất)

1. **Đóng P3 trước:** NP-021…NP-023 chỉ cần thao tác trình duyệt, không cần quyết định mới (NP-020 đã xong 18/11).
2. **P4** (NP-401…404): code + vitest + màn admin soạn đề đã có, cần verify API/trình duyệt thật.
3. **Hỏi chủ sản phẩm Q-07 và Q-12** — Q-07 mở khoá P5; Q-12 quyết định được dùng đề thi chính thức hay chỉ đề tự soạn.

## 8. Nhãn gợi ý khi tạo GitHub Issues

`phase:P2` … `phase:P11` · `status:partial` · `status:off-roadmap` · `blocked:decision` · cùng 5 nhãn triage mặc định
(`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). Tiêu đề: `NP-xxx — <tên>`; thân: bảng dòng tương ứng + liên kết checklist.
