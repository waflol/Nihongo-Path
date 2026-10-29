import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Quản trị",
  description: "Bàn điều khiển quản trị nội dung.",
  // Admin is a private area; never indexed or crawlable (spec §17.3).
  robots: { index: false, follow: false },
};

/**
 * Admin placeholder. No real auth/RBAC yet (spec §4.1, §5). This route is a
 * shell only; access control is wired in Sprint 5.
 */
export default function AdminPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
        Quản trị
      </h1>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        Khu vực quản trị nội dung đang là placeholder. Quyền truy cập,
        dashboard và thao tác quản trị sẽ được triển khai kèm xác thực và RBAC.
      </p>
    </div>
  );
}
