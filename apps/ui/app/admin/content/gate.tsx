import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AdminContentConsole } from "@/components/admin/content-console";

/**
 * Server gate for `/admin/content` (P2-UI-04). Reads the session — a
 * request-time read that must sit behind `<Suspense>` under
 * `cacheComponents` (Next 16 PPR). Signed-out → redirect to `/login`
 * (remembering the destination); signed-in non-admin → "không đủ quyền"
 * state (T-P2-04).
 */
export async function AdminContentGate() {
  const session = await getSession();

  if (!session.authenticated) {
    redirect("/login?from=/admin/content");
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
          Bạn đã đăng nhập nhưng không có vai trò quản trị nội dung
          ({session.user?.role}). Chỉ{" "}
          <code>ADMIN</code> / <code>SUPER_ADMIN</code> được truy cập màn
          hình này.
        </p>
        <Link
          href="/learn"
          className="mt-6 inline-block rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]"
        >
          Về khu học
        </Link>
      </div>
    );
  }

  return <AdminContentConsole />;
}
