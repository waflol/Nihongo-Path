import type { Metadata } from "next";
import Link from "next/link";
import { RedirectIfAuthenticated } from "@/components/auth/redirect-if-authenticated";
import { AdminAuthForm } from "@/components/admin/admin-auth-form";
import { GoogleSignIn } from "@/components/auth/google-sign-in";

export const metadata: Metadata = {
  title: "Đăng nhập quản trị",
  description: "Khu đăng nhập + đăng ký dành cho quản trị viên.",
  robots: { index: false, follow: false },
};

/**
 * Dedicated admin authentication (quản trị riêng với user thường).
 *
 * One page, two tabs — **đăng nhập** và **đăng ký** — both flowing through
 * the same credential/Google handlers as the regular area, but landing in
 * the `/admin` dashboard afterwards. The account's `role` field is what
 * gates the admin area (API-side `@ContentAdmin` + the UI gate, T-P2-04);
 * registering here is just a convenience path, not a role grant.
 */
export default function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 sm:px-6">
      <RedirectIfAuthenticated searchParams={searchParams} admin />
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">
        Khu quản trị
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--foreground)]">
        Đăng nhập / đăng ký quản trị
      </h1>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        Dành cho <code>ADMIN</code> / <code>SUPER_ADMIN</code>. Người học vui
        lòng dùng trang{" "}
        <Link
          href="/login"
          className="font-medium text-[var(--primary)] hover:underline"
        >
          đăng nhập thường
        </Link>
        .
      </p>

      <AdminAuthForm />

      <div className="mt-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-[var(--border)]" />
        <span className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
          hoặc
        </span>
        <span className="h-px flex-1 bg-[var(--border)]" />
      </div>

      <GoogleSignIn fromHref="/admin" />

      <p className="mt-6 text-center text-sm text-[var(--muted-foreground)]">
        <Link
          href="/login"
          className="font-medium text-[var(--primary)] hover:underline"
        >
          ← Về trang đăng nhập thường
        </Link>
      </p>
    </div>
  );
}
