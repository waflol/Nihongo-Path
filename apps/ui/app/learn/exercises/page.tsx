import type { Metadata } from "next";
import { Suspense } from "react";
import { LearnExercisesGate } from "./gate";

export const metadata: Metadata = {
  title: "Bài tập",
  description: "Trắc nghiệm và gõ đáp án theo bộ flashcard.",
  // Private learning area — never indexed (spec §17.3).
  robots: { index: false, follow: true },
};

/**
 * Exercises (P3-UI-07): the drill modes that sit beside the flashcard review
 * — multiple choice and type-in-the-answer.
 */
export default function LearnExercisesPage() {
  return (
    <Suspense
      fallback={
        <p className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-[var(--muted-foreground)] sm:px-6">
          Đang tải…
        </p>
      }
    >
      <LearnExercisesGate />
    </Suspense>
  );
}
