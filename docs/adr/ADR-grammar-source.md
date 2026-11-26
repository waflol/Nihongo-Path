# ADR-grammar-source — Nguồn dữ liệu ngữ pháp

> **Trạng thái:** Accepted — người dùng cho phép lấy dữ liệu và lưu vào database (27/11/2026).
> **Phạm vi:** NP-1004–NP-1012.

## Quyết định

Nihongo-Path tách dữ liệu ngữ pháp thành nội dung có provenance. Dữ liệu tham chiếu từ Super Honki được phép tải về và lưu vào MongoDB theo pipeline importer. Bản ghi được nhập ở trạng thái `DRAFT` mặc định; admin có thể preview, chỉnh sửa và publish sau khi kiểm tra chất lượng.

Mỗi bản ghi nhập phải có `sourceProvider`, `sourceKey`, `sourceHash`, `sourceVersion` và `sourceUrl`. Import lại phải idempotent theo `(sourceProvider, sourceKey)` và không được ghi đè các trường admin đã chỉnh sửa nếu chưa có thao tác xác nhận.

## Phạm vi dữ liệu

Nguồn hiện được khảo sát có 630 mẫu N5–N1, kèm cấu trúc, nghĩa, giải thích, nhiều nghĩa, ví dụ, chủ đề, bối cảnh và tham chiếu giáo trình. Parser phải đọc dữ liệu dạng object tĩnh, không thực thi JavaScript tải từ mạng.

## An toàn importer

- giới hạn kích thước, thời gian và số bản ghi;
- tải vào thư mục tạm riêng;
- chỉ chấp nhận wrapper đã biết (`SB.register({...})` hoặc catalog object);
- parse và validate schema trước khi ghi MongoDB;
- reject function, import, require và biểu thức ngoài object literal;
- ghi checksum/version để phát hiện source thay đổi.

## Hậu quả

- Có thể đổi nhà cung cấp dữ liệu mà không đổi flashcard/API.
- Cần màn preview diff trước khi publish.
- Không được tự động coi nội dung website là public domain.
- Các flashcard grammar dùng lại `GrammarPoint` và SRS hiện tại, không tạo hệ thống tiến độ thứ hai.
