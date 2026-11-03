import type { Metadata } from "next";

import { Suspense } from "react";
import { AdminContentGate } from "./gate";

export const metadata: Metadata = {
  title: "Quản trị nội dung",
  description: "CRUD nội dung học (giáo trình, đơn vị, từ vựng, ngữ pháp).",
  robots: { index: false, follow: false },
};

/**
 * Admin content console (P2-UI-04). The gate (`./gate.tsx`) reads the
 * session (`cookies()`), which under `cacheComponents` (Next 16 PPR) must
 * live behind a `<Suspense>` boundary or the build fails: the static shell
 * prerenders the fallback, and the gate streams at request time (redirects
 * when signed out / non-admin). The console itself is a client component
 * that talks to the `/api/admin/content/...` gateway (P2-UI-05).
 */
export default function AdminContentPage() {
  return (
    <Suspense
      fallback={
        <p className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-[var(--muted-foreground)] sm:px-6">
          Đang tải…
        </p>
      }
    >
      <AdminContentGate />
    </Suspense>
  );
}
