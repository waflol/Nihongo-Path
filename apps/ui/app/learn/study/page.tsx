import type { Metadata } from "next";
import { Suspense } from "react";
import { LearnStudyGate } from "./gate";

export const metadata: Metadata = {
  title: "Ôn tập flashcard",
  description: "Phiên ôn tập với lặp lại ngắt quãng (SRS).",
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
        <p className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-[var(--muted-foreground)] sm:px-6">
          Đang tải…
        </p>
      }
    >
      <LearnStudyGate />
    </Suspense>
  );
}
