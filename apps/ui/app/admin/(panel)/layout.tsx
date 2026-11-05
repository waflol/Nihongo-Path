import { Suspense } from "react";
import type { ReactNode } from "react";
import { AdminGate } from "@/components/admin/admin-gate";
import { AdminShell } from "@/components/admin/admin-shell";
import { getSession } from "@/lib/session";

/**
 * Chrome for every admin page except `/admin/login`: the role gate (signed
 * out → `/admin/login`, non-admin → "không đủ quyền") and the sidebar shell.
 * The session read sits behind `<Suspense>` (Next 16 PPR).
 */
async function Panel({ children }: { children: ReactNode }) {
  const session = await getSession();
  return (
    <AdminGate from="/admin">
      <AdminShell
        userLabel={session.user?.displayName || session.user?.email || "Quản trị viên"}
        role={session.user?.role ?? "ADMIN"}
      >
        {children}
      </AdminShell>
    </AdminGate>
  );
}

export default function AdminPanelLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <p className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-[var(--muted-foreground)] sm:px-6">
          Đang tải…
        </p>
      }
    >
      <Panel>{children}</Panel>
    </Suspense>
  );
}
