import type { Metadata } from "next";
import Link from "next/link";
import { redirectIfAuthenticated } from "@/lib/auth-redirect";
import { AuthForm } from "@/components/auth/auth-form";
import { GoogleSignIn } from "@/components/auth/google-sign-in";

export const metadata: Metadata = {
  title: "Đăng nhập",
  description: "Đăng nhập hoặc tạo tài khoản để tiếp tục lộ trình học tiếng Nhật.",
  // Login page is not crawlable content (spec §17.3 — keep private pages out of SEO).
  robots: { index: false, follow: true },
};

/**
 * Login page — wires to the real email/password + Google flow (P2-AUTH-04).
 * The form is a client component that POSTs to the `/api/auth/*` route
 * handlers, which own the httpOnly session cookie (P2-UI-05).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  await redirectIfAuthenticated(searchParams);
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
        Đăng nhập
      </h1>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        Chào mừng trở lại. Tạo tài khoản bằng email để bắt đầu.
      </p>

      <AuthForm mode="login" />

      <div className="mt-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-[var(--border)]" />
        <span className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
          hoặc
        </span>
        <span className="h-px flex-1 bg-[var(--border)]" />
      </div>

      <GoogleSignIn />

      <p className="mt-6 text-center text-sm text-[var(--muted-foreground)]">
        Chưa có tài khoản?{" "}
        <Link
          href="/register"
          className="font-medium text-[var(--primary)] hover:text-[var(--primary-hover)]"
        >
          Tạo tài khoản
        </Link>
      </p>

      <p className="mt-4 text-center text-xs text-[var(--muted-foreground)]">
        Quản trị viên?{" "}
        <Link
          href="/admin/login"
          className="font-medium text-[var(--muted-foreground)] underline hover:text-[var(--foreground)]"
        >
          Đăng nhập khu quản trị
        </Link>
      </p>

      <p className="mt-4 text-center text-xs text-[var(--muted-foreground)]">
        <Link href="/terms" className="underline hover:text-[var(--foreground)]">
          Điều khoản sử dụng
        </Link>
        {" · "}
        <Link href="/privacy" className="underline hover:text-[var(--foreground)]">
          Chính sách bảo vệ dữ liệu cá nhân
        </Link>
      </p>
    </div>
  );
}
