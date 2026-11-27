# ADR-exam-by-source — Đề thi theo nguồn, bỏ ngân hàng câu hỏi

> **Trạng thái:** Accepted — chủ dự án duyệt 27/11/2026.
> **Phạm vi:** NP-407, NP-409; thay NP-408. Chi tiết: [plan-exam-by-source.md](../plans/plan-exam-by-source.md).

## Quyết định

Mỗi file PDF tải lên cho ra **đề thi** (`full` / `section`) hoặc **bài luyện** (`practice`) giữ đúng thứ tự bản in. Mỗi câu hỏi thuộc về nguồn của nó. Bỏ ngân hàng câu hỏi để admin nhặt câu và bỏ sinh đề ngẫu nhiên (NP-408 không làm).

Xuất bản bản nháp ghi câu hỏi rồi dựng lại đề từ mọi bản nháp đã xuất bản cùng khoá `level | setName | sitting` (hàm thuần `assembleExam`, chạy lại cho cùng kết quả). Đề mang `rights` yếu nhất của các câu; đề `reference` chỉ admin thấy cho tới khi chốt Q-12.

## Lý do

- Câu trộn từ nhiều nguồn làm mất thứ tự bản in, mất bài đọc và khó kiểm quyền sử dụng.
- Dedupe toàn cục theo `contentHash` làm đề sau thiếu câu khi nội dung trùng giữa các đề.
- Sinh đề ngẫu nhiên cần ngân hàng đủ lớn và đã rõ quyền; chưa có.

## Hậu quả

- Collection `exercise_questions` giữ nguyên (không đổi tên, không chuyển dữ liệu); không còn endpoint/UI ngân hàng.
- Đề soạn tay cũ (không `kind`) chạy như trước; soạn câu tay nằm trong một đề.
- Sách luyện tập tái dùng `Exam` + `ExamAttempt` (giai đoạn 2).
