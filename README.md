# Nihongo Path

Nền tảng học tiếng Nhật (giao diện tiếng Việt): flashcard + lặp lại ngắt quãng (SM-2),
nhập từ vựng từ CSV/XLSX/PDF, tự tạo câu ví dụ (Tatoeba + AI), khu quản trị.

Monorepo pnpm:

| Thư mục | Nội dung |
|---|---|
| `apps/ui` | Frontend — Next.js 16 (App Router), Tailwind 4 |
| `apps/api` | Backend — NestJS 12, MongoDB (Mongoose), Redis tuỳ chọn |
| `docs/` | Đặc tả, kiến trúc, database, hướng dẫn dev, checklist |

## Chạy nhanh

```bash
nvm use          # Node 22 (.nvmrc)
pnpm install
pnpm dev         # UI :3001, API :3000
```

Cấu hình env, MongoDB, tài khoản admin, AI/Redis: xem [docs/development.md](docs/development.md).

## Tài liệu

- [Kiến trúc](docs/architecture.md) · [Database](docs/database.md) · [Hướng dẫn dev](docs/development.md)
- [ADR SRS](docs/adr/ADR-srs.md) · [ADR Auth](docs/adr/ADR-auth-provider.md)
- [Kế hoạch](docs/IMPLEMENTATION_PLAN.md) · [Checklist](docs/IMPLEMENTATION_CHECKLIST.md) · [Câu hỏi mở](docs/OPEN_QUESTIONS.md)
