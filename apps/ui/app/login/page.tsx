import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Đăng nhập",
  description: "Đăng nhập hoặc đăng ký tài khoản để tiếp tục lộ trình học tiếng Nhật.",
  // Login page is not crawlable content (spec §17.3 — keep private pages out of SEO).
  robots: { index: false, follow: true },
};

/**
 * Login placeholder — no real auth yet (auth provider is not approved,
 * spec §4.1). Keep the layout/UX shell; wire the real flow in Sprint 2.
 */
export default function LoginPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
        Đăng nhập
      </h1>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        Tính năng xác thực đang được triển khai theo kế hoạch. Trang này là
        placeholder và chưa kết nối hệ thống đăng nhập.
      </p>

      {/*
        Placeholder form: static inputs, no handler. This is a Server
        Component. The real auth flow (Sprint 2) will use a client form or a
        Server Action.
      */}
      <form className="mt-8 space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-[var(--foreground)]"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="ban@email.com"
            className="mt-1.5 block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-focus)]"
          />
        </div>
        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-[var(--foreground)]"
          >
            Mật khẩu
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            className="mt-1.5 block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-focus)]"
          />
        </div>
        <button
          type="submit"
          disabled
          title="Chưa có xác thực"
          className="w-full rounded-lg bg-[var(--secondary)] px-4 py-2.5 text-sm font-semibold text-[var(--secondary-foreground)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Đăng nhập (chưa khả dụng)
        </button>
      </form>
    </div>
  );
}
