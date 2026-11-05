import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSession } from "@/lib/session";

/**
 * Shared admin-area gate (server component). Reads the session, then:
 * - signed out → redirect to the dedicated `/admin/login` (remembering the
 *   destination via `from`), and
 * - signed-in but not ADMIN / SUPER_ADMIN → an "insufficient permissions"
 *   state (T-P2-04) instead of the child.
 *
 * The role check is mirrored API-side (`@ContentAdmin`); this is the friendly
 * redirect, not the security boundary. Wrapped in `<Suspense>` by the calling
 * page because it reads cookies at request time (Next 16 PPR).
 */
export async function AdminGate({
  from,
  children,
}: {
  /** This admin section's path, remembered on the login redirect. */
  from: string;
  children: ReactNode;
}) {
  const session = await getSession();

  if (!session.authenticated) {
    redirect(`/admin/login?from=${encodeURIComponent(from)}`);
  }

  const isAdmin =
    session.user?.role === "ADMIN" || session.user?.role === "SUPER_ADMIN";

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">
          Không đủ quyền
        </h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Bạn đã đăng nhập ({session.user?.email ?? session.user?.id}) nhưng
          vai trò <code>{session.user?.role}</code> không được phép vào khu
          quản trị. Chỉ <code>ADMIN</code> / <code>SUPER_ADMIN</code> truy cập
          được.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/learn"
            className="inline-block rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]"
          >
            Về khu học
          </Link>
          <Link
            href="/admin/login"
            className="inline-block rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
          >
            Đăng nhập quản trị
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
