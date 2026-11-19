import type { Metadata } from "next";
import { Suspense } from "react";
import { LearnExamsGate } from "./gate";

export const metadata: Metadata = {
  title: "Đề thi",
  description: "Làm đề thi có thời gian, chấm điểm trên máy chủ và xem lại lỗi.",
  // Private learning area — never indexed (spec §17.3).
  robots: { index: false, follow: true },
};

/**
 * Exams (P4-UI-02): published exams to take, my sittings, and my progress.
 */
export default function LearnExamsPage() {
  return (
    <Suspense
      fallback={
        <p className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-[var(--muted-foreground)]">
          Đang tải…
        </p>
      }
    >
      <LearnExamsGate />
    </Suspense>
  );
}
