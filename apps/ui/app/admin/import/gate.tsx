import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ImportWizard } from "@/components/admin/import-wizard";

/**
 * Server gate for `/admin/import` (P3-UI-02). Admin-only, mirroring the P2
 * content gate: signed out → `/login?from=…`; signed-in non-admin → the
 * "không đủ quyền" state (T-P2-04).
 */
export async function AdminImportGate() {
  const session = await getSession();

  if (!session.authenticated) {
    redirect("/login?from=/admin/import");
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
          ({session.user?.role}).
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

  return <ImportWizard />;
}
