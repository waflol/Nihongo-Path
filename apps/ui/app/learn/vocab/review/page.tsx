import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { StudySession } from "@/components/learn/study-session";
import { PillarNav } from "@/components/learn/pillar-nav";

export const metadata: Metadata = {
  title: "Ôn tập từ vựng",
  description: "Ôn tập các thẻ từ vựng đến hạn theo FSRS.",
  robots: { index: false, follow: true },
};

async function AsyncVocabReview() {
  const session = await getSession();
  if (!session.authenticated) redirect("/login?from=/learn/vocab/review");
  return <StudySession mode="review" />;
}

export default function VocabReviewPage() {
  return (
    <>
      <PillarNav pillar="vocab" />
      <Suspense fallback={<p className="mx-auto max-w-6xl px-4 py-16 text-center text-sm text-[var(--muted-foreground)]">Đang tải…</p>}>
        <AsyncVocabReview />
      </Suspense>
    </>
  );
}
