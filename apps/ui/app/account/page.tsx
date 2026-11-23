import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DeleteAccountPanel } from "@/components/auth/delete-account-panel";
import { FeedbackPanel } from "@/components/account/feedback-panel";
import { getSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Tài khoản",
  robots: { index: false, follow: false },
};

/** Own-account page: identity summary and the delete-account danger zone. */
export default async function AccountPage() {
  const session = await getSession();
  if (!session.authenticated || !session.user) redirect("/login?from=/account");
  const { user } = session;
  // SUPER_ADMIN must never see (or use) the delete control.
  const canDelete = user.role !== "SUPER_ADMIN";

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">Tài khoản</h1>

      <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
        <dl className="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-[var(--muted-foreground)]">Tên hiển thị</dt>
          <dd className="font-medium text-[var(--foreground)]">{user.displayName ?? "—"}</dd>
          <dt className="text-[var(--muted-foreground)]">Email</dt>
          <dd className="font-medium text-[var(--foreground)]">{user.email ?? "—"}</dd>
          <dt className="text-[var(--muted-foreground)]">Múi giờ</dt>
          <dd className="font-medium text-[var(--foreground)]">{user.timezone}</dd>
        </dl>
      </section>

      <FeedbackPanel />

      <div className="mt-6">{canDelete ? <DeleteAccountPanel /> : null}</div>

      <p className="mt-6 text-xs text-[var(--muted-foreground)]">
        Xem <Link href="/terms" className="underline underline-offset-4">Điều khoản sử dụng</Link> và{" "}
        <Link href="/privacy" className="underline underline-offset-4">Chính sách bảo vệ dữ liệu cá nhân</Link>.
      </p>
    </div>
  );
}
