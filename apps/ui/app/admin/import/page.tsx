import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminImportGate } from "./gate";

export const metadata: Metadata = {
  title: "Nhập flashcard hàng loạt",
  description: "Nhập thẻ flashcard từ CSV/XLSX: ánh xạ cột, xem trước, xác nhận.",
  robots: { index: false, follow: false },
};

/**
 * Admin import wizard (P3-UI-02): upload → map columns → preview → confirm.
 * The gate (session read via `cookies()`) must sit behind `<Suspense>`
 * under `cacheComponents` (Next 16 PPR), matching the P2 content gate.
 */
export default function AdminImportPage() {
  return (
    <Suspense
      fallback={
        <p className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-[var(--muted-foreground)] sm:px-6">
          Đang tải…
        </p>
      }
    >
      <AdminImportGate />
    </Suspense>
  );
}
