# @nihongo/ui

Frontend của Nihongo Path — Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS 4.

```bash
pnpm dev          # http://localhost:3001 (nạp PORT từ .env qua dotenv-cli)
pnpm build
pnpm typecheck && pnpm lint
```

- Mọi lời gọi từ trình duyệt đi qua route handler proxy `app/api/*` (token giữ ở httpOnly cookie phía server).
- Env (`PORT`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`): xem [docs/development.md](../../docs/development.md) §4.2.
- Cấu trúc route & luồng giao diện: [docs/architecture.md](../../docs/architecture.md) §8.2.
