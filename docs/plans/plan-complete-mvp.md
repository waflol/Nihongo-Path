# Plan hoàn thiện MVP — Nihongo Path

> Cập nhật: 27/11/2026. Mục tiêu: rút ngắn đường tới bản MVP có thể cho người học dùng thử, không triển khai các phase bị chặn bởi quyết định sản phẩm.

## 1. Kết luận sau khi đối chiếu docs và code

- Nền tảng P0–P3 cơ bản đã hoàn thành; P3 còn phải xác nhận import PDF thật.
- P4 đã có engine, UI và pipeline import; phần còn thiếu chủ yếu là verify runtime, sinh đề theo blueprint và kiểm tra quyền nội dung.
- P5 quota, entitlement, feedback và least-privilege đã có code và phần lớn đã verify live; còn thiếu một số kiểm tra audit/RBAC trên tài khoản thật.
- Grammar P11 đã có vertical slice: schema, importer, API, catalog/detail UI và lưu thẻ. Còn thiếu flashcard session riêng, bài luyện tập và admin review.
- P6–P10 chưa nên làm ngay: còn phụ thuộc Q-04–Q-12, hoặc chưa cần cho MVP học cốt lõi.
- Working tree hiện có nhiều thay đổi chưa commit. Không chạy lệnh làm sạch/reset; phải kiểm tra và commit theo lát dọc.

## 2. Mục tiêu MVP đề xuất

MVP được coi là sẵn sàng khi người dùng có thể:

1. đăng ký/đăng nhập;
2. học và ôn flashcard từ vựng/ngữ pháp bằng FSRS;
3. duyệt và học danh mục ngữ pháp N5–N1;
4. làm bài luyện tập/ngữ pháp và đề tự soạn có chấm điểm server;
5. gửi phản hồi, admin xử lý và xem audit;
6. admin nhập, duyệt, xuất bản nội dung;
7. hệ thống chạy ổn định trên VPS, có backup/rollback tối thiểu và không lộ đáp án, dữ liệu riêng tư hay nội dung chưa publish.

Thanh toán, quảng cáo, media/STT, shadowing và Kaiwa để sau MVP. Không giả vờ hoàn thành các mục này bằng mock production.

## 3. Thứ tự thực hiện tối ưu

### Slice A — Đóng và bảo vệ working tree

**Mục tiêu:** biến thay đổi hiện tại thành các commit nhỏ có thể rollback.

- Chạy diff review, loại file tạm/cache, kiểm tra không có PDF/nội dung nguồn có bản quyền hoặc secret.
- Commit riêng theo nhóm: grammar backend/import, grammar UI, feedback, quota/admin, tài liệu.
- Cập nhật `docs/HANDOFF.md` ngay trong commit tương ứng.
- Chạy kiểm tra nhẹ trước mỗi commit: test file liên quan + typecheck package.

**Đóng khi:** `git status` chỉ còn thay đổi có chủ đích; mỗi commit có phạm vi rõ và HANDOFF khớp code.

### Slice B — Hoàn tất grammar end-to-end

Phụ thuộc trực tiếp: không còn blocker kỹ thuật; quyền crawl đã được cho phép nhưng provenance/attribution phải giữ trong DB và UI admin.

1. Sửa các lỗi đã ghi trong HANDOFF: `textbookId` string, quota `GRAMMAR`, dedupe card, markup hiển thị, filter label, preview 400 KB, console pagination.
2. Chạy import 630 mẫu với index mới; xác nhận thống kê N5–N1 và idempotency khi chạy lại.
3. Hoàn thiện admin preview → chỉnh sửa → publish, audit và lọc DRAFT/PUBLISHED.
4. Hoàn thiện grammar flashcard session dùng queue FSRS hiện tại: lật thẻ, phím tắt/mobile, đánh giá, resume, progress.
5. Thêm bài luyện tập grammar tối thiểu: multiple choice + điền mẫu; không lộ đáp án trước submit; câu sai có thể lưu vào queue.
6. Verify browser với tài khoản learner/admin thật.

**Đóng khi:** NP-1004–1012 có trạng thái và bằng chứng tương ứng; N5 publish được, N4–N1 chỉ publish sau review; một learner hoàn thành luồng browse → save → study → practice.

### Slice C — Đóng P4 và NP-021

1. Verify API exam thật: start, payload không có đáp án, submit, timeout, result, review, ownership.
2. Verify browser desktop/mobile: làm bài, timer, refresh/draft, nộp, xem kết quả.
3. Verify admin import PDF: upload, log, draft, sửa, publish/discard, idempotent.
4. Chạy một file PDF scan được phép dùng; đo RSS và xác nhận OCR/gạch chân/furigana.
5. Hoàn thiện NP-408 blueprint/generator với quyền `own|licensed`; `reference` chỉ admin/test.
6. Hoàn thiện NP-409 UI đề ngẫu nhiên theo phần sau khi generator pass.

**Đóng khi:** P4-EXAM-01…09, P4-JLPT-05…07 không còn `[~]` do thiếu verify; Q-12 vẫn phải hiển thị rõ nếu chưa được quyết định cho đề chính thức.

### Slice D — Đóng P5 bằng kiểm tra live còn thiếu

- USER mở `/admin` phải bị chặn ở cả UI và API.
- SUPER_ADMIN đổi role user khác; không thể tự hạ/nâng quyền.
- PATCH feedback phải có audit `before/after/summary`.
- Kiểm tra lịch sử feedback/card feedback không lộ thông tin admin ngoài chính sách.
- Chạy race quota trên Mongo thật; nếu chỉ chứng minh được bằng single-node thì ghi giới hạn rõ, không gọi là kiểm chứng đa tiến trình.
- Xác nhận reset kỳ và chính sách `ALLOW` trên live.

**Đóng khi:** NP-024, NP-501, NP-502 có bằng chứng live và checklist không còn mâu thuẫn với TICKETS/HANDOFF.

### Slice E — Production gate tối thiểu

Làm sau A–D, trước khi mở rộng tính năng:

- chạy test backlog hiện có theo nhóm, không chạy full suite song song trên VPS 4 GB;
- typecheck/lint/build API và UI;
- security review focused: auth/IDOR/admin/upload/SSRF/rate-limit/secrets/log;
- build production và kiểm tra pm2 chạy `dist`, không chạy dev/watch;
- backup Mongo + restore thử; xác nhận disk/RAM/log rotation;
- kiểm tra health/readiness, rollback commit, cookie/CORS/Swagger production;
- smoke test các luồng đăng nhập, học, grammar, exam, feedback.

**Đóng khi:** có `docs/release.md`, báo cáo bàn giao, rollback đã thử và người sở hữu sản phẩm xác nhận release gate.

## 4. Những việc chưa làm ngay

| Nhóm | Quyết định |
|---|---|
| P6 Media/STT | Hoãn đến khi chốt Q-04, Q-05, Q-11 |
| P7 Analysis/Shadowing | Hoãn đến khi chốt Q-04, Q-06, Q-24 |
| P8 Kaiwa | Hoãn đến khi có provider, benchmark và quota phút |
| P9 Payment | Chỉ làm sandbox sau khi chốt Q-08; không bật giao dịch thật |
| P10 AdSense | Tắt mặc định đến khi có domain, publisher ID và policy |
| FSRS-6 tuning | Chưa ưu tiên; cần dữ liệu review thật trước |
| Antigravity CLI | Không chặn MVP; xử lý riêng khi có tài khoản/ủy quyền |

## 5. Thứ tự ticket tiếp theo

1. NP-1006 → NP-1012: hoàn tất grammar vertical slice và verify thật.
2. NP-401 → NP-404, NP-021: đóng P4 core và import thật.
3. NP-408 → NP-409: generator + UI đề ngẫu nhiên.
4. NP-024, NP-501, NP-502: đóng các điểm verify P5 còn thiếu.
5. NP-1101 → NP-1104: test, security, vận hành, release.

## 6. Quy tắc cập nhật trạng thái

- Chỉ đổi `todo/partial` thành `done` khi có lệnh hoặc thao tác browser/DB thật được ghi trong ticket.
- Mỗi slice có commit riêng; không gom thay đổi không liên quan.
- Không cập nhật checklist chỉ vì code đã tồn tại.
- Mọi blocker sản phẩm phải ghi lại ở `OPEN_QUESTIONS.md`, không tự quyết thay chủ sản phẩm.
