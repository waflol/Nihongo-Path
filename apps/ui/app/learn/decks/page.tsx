import type { Metadata } from "next";
import { Suspense } from "react";
import { LearnDecksGate } from "./gate";

export const metadata: Metadata = {
  title: "Bộ flashcard",
  description: "Danh sách bộ thẻ và tiến độ ôn tập cá nhân.",
  // Private learning area — never indexed (spec §17.3).
  robots: { index: false, follow: true },
};

/**
 * Deck list + progress (P3-UI-03). The gate streams the session at request
 * time; the console is a client component that talks to the
 * `/api/flashcards/…` + `/api/srs/…` gateways (token stays server-side).
 */
export default function LearnDecksPage() {
  return (
    <Suspense
      fallback={
        <p className="mx-auto max-w-6xl px-4 py-16 text-center text-sm text-[var(--muted-foreground)] sm:px-6">
          Đang tải…
        </p>
      }
    >
      <LearnDecksGate />
    </Suspense>
  );
}
