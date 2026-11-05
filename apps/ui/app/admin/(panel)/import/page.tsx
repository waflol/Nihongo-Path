import type { Metadata } from "next";
import { Suspense } from "react";
import { ImportWizard } from "@/components/admin/import-wizard";

export const metadata: Metadata = {
  title: "Nhập flashcard hàng loạt",
  description: "Nhập thẻ flashcard từ CSV/XLSX: ánh xạ cột, xem trước, xác nhận.",
  robots: { index: false, follow: false },
};

/**
 * Admin import wizard (P3-UI-02): upload → map columns → preview → confirm.
 * `useSearchParams` (the `?deck=` preselect) needs a Suspense boundary.
 */
export default function AdminImportPage() {
  return (
    <Suspense fallback={<p className="px-4 py-16 text-center text-sm text-[var(--muted-foreground)]">Đang tải…</p>}>
      <ImportWizard />
    </Suspense>
  );
}
