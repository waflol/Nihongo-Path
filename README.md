# Nihongo Path

Nền tảng học tiếng Nhật (giao diện tiếng Việt): flashcard + lặp lại ngắt quãng (SM-2),
Kanji Jōyō 2136 (thứ tự nét, tra âm Hán Việt), luyện từ & luyện thi (問題),
nhập từ vựng từ CSV/XLSX/PDF (kèm OCR ảnh cho PDF scan), tự tạo câu ví dụ (Tatoeba + AI), khu quản trị.

Monorepo pnpm:

| Thư mục | Nội dung |
|---|---|
| `apps/ui` | Frontend — Next.js 16 (App Router), Tailwind 4 |
| `apps/api` | Backend — NestJS 12, MongoDB (Mongoose), Redis tuỳ chọn |
| `packages/shared` | Bảng âm Hán Việt dùng chung (`han-viet.json`) |
| `docs/` | Đặc tả, kiến trúc, database, hướng dẫn dev, checklist, kế hoạch |

## Chạy nhanh

```bash
nvm use          # Node 22 (.nvmrc)
pnpm install
pnpm dev         # UI :3001, API :3000
```

Cấu hình env, MongoDB, tài khoản admin, AI/Redis: xem [docs/development.md](docs/development.md).

## Tài liệu

- [Kiến trúc](docs/architecture.md) · [Database](docs/database.md) · [Hướng dẫn dev](docs/development.md) · [Luồng nhập thẻ](docs/import-flow.md)
- Quyết định: [ADR SRS](docs/adr/ADR-srs.md) · [ADR Auth](docs/adr/ADR-auth-provider.md)
- Kế hoạch tính năng: [Kanji](docs/plans/plan-kanji.md) · [Mobile iOS/Android](docs/plans/plan-mobile.md) · [Antigravity CLI (Google AI Pro)](docs/plans/plan-antigravity-cli.md) · [Tăng tốc kiểm tra cách đọc](docs/plans/plan-reading-check.md)
- [Pháp lý Việt Nam & Điều khoản Sử dụng](docs/legal-vietnam-and-terms.md)
- Lộ trình tổng: [Kế hoạch](docs/IMPLEMENTATION_PLAN.md) · [Checklist](docs/IMPLEMENTATION_CHECKLIST.md) · [Câu hỏi mở](docs/OPEN_QUESTIONS.md) · [Đặc tả gốc](docs/claude_japanese_learning_platform_spec_preline.md)
