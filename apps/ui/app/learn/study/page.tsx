import type { Metadata } from "next";
import { Suspense } from "react";
import { LearnStudyGate } from "./gate";

export const metadata: Metadata = {
  title: "Học từ mới",
  description: "Học từ mới theo thứ tự bộ thẻ, theo số từ mỗi ngày.",
  robots: { index: false, follow: true },
};

/**
 * Flashcard study screen (P3-UI-01): flip + grade + keyboard shortcuts,
 * fed by the SRS queue for a chosen deck.
 */
export default function LearnStudyPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
            Học từ mới
          </h1>
          <p className="mt-8 text-center text-sm text-[var(--muted-foreground)]">
            Đang tải…
          </p>
        </div>
      }
    >
      <LearnStudyGate />
    </Suspense>
  );
}
