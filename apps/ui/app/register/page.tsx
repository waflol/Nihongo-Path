import type { Metadata } from "next";
import Link from "next/link";
import { redirectIfAuthenticated } from "@/lib/auth-redirect";
import { AuthForm } from "@/components/auth/auth-form";
import { GoogleSignIn } from "@/components/auth/google-sign-in";

export const metadata: Metadata = {
  title: "Tạo tài khoản",
  description: "Tạo tài khoản Nihongo Path bằng email để bắt đầu lộ trình học.",
  robots: { index: false, follow: true },
};

/** Register page (P2-UI-02) — email/password self-service signup. */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  await redirectIfAuthenticated(searchParams);
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
        Tạo tài khoản
      </h1>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        Tạo tài khoản bằng email để lưu tiến độ và truy cập khu học tập.
      </p>

      <AuthForm mode="register" />

      <div className="mt-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-[var(--border)]" />
        <span className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
          hoặc
        </span>
        <span className="h-px flex-1 bg-[var(--border)]" />
      </div>

      <GoogleSignIn />

      <p className="mt-6 text-center text-sm text-[var(--muted-foreground)]">
        Đã có tài khoản?{" "}
        <Link
          href="/login"
          className="font-medium text-[var(--primary)] hover:text-[var(--primary-hover)]"
        >
          Đăng nhập
        </Link>
      </p>
    </div>
  );
}
