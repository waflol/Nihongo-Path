import type { Metadata } from "next";
import { Suspense } from "react";
import { DeckCardsManager } from "@/components/learn/deck-cards-manager";
import { DeckPageReview } from "@/components/learn/deck-page-review";

export const metadata: Metadata = {
  title: "Quản lý thẻ",
  robots: { index: false, follow: false },
};

async function Manager({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <DeckCardsManager mode="admin" deckId={id} />
      <DeckPageReview deckId={id} />
    </>
  );
}

/** Admin card manager for one shared deck. The role gate lives in the panel layout. */
export default function AdminDeckCardsPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <Manager params={params} />
    </Suspense>
  );
}
