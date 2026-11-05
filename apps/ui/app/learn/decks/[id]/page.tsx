import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { DeckCardsManager } from "@/components/learn/deck-cards-manager";

export const metadata: Metadata = {
  title: "Quản lý thẻ",
  robots: { index: false, follow: true },
};

async function Gate({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session.authenticated) redirect("/login?from=/learn/decks");
  return <DeckCardsManager mode="learn" deckId={id} />;
}

/** Card manager for one deck (own deck: editable; shared deck: read-only). */
export default function LearnDeckCardsPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense
      fallback={
        <p className="mx-auto max-w-5xl px-4 py-16 text-center text-sm text-[var(--muted-foreground)] sm:px-6">
          Đang tải…
        </p>
      }
    >
      <Gate params={params} />
    </Suspense>
  );
}
