# @nihongo/api

Backend của Nihongo Path — NestJS 12 (ESM), MongoDB (Mongoose), Redis tuỳ chọn.

```bash
pnpm dev          # watch mode, http://localhost:3000
pnpm test         # vitest
pnpm typecheck && pnpm lint
pnpm tatoeba:import -- --write   # nạp chỉ mục câu ví dụ Tatoeba (cần MONGODB_URL)
pnpm kanji:import -- --write     # nạp 2136 Kanji Jōyō kèm thứ tự nét (cần MONGODB_URL)
```

- Swagger: `/api/docs` (chỉ khi `NODE_ENV !== "production"`).
- Env, MongoDB, tài khoản admin, AI/Redis, giới hạn file nhập: [docs/development.md](../../docs/development.md).
- Module & luồng dữ liệu: [docs/architecture.md](../../docs/architecture.md) §8; schema: [docs/database.md](../../docs/database.md).
- Import nội bộ bắt buộc có đuôi `.js` (ESM `nodenext`).
