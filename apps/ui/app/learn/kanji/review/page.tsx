import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { StudySession } from "@/components/learn/study-session";
import { PillarNav } from "@/components/learn/pillar-nav";

export const metadata: Metadata = {
  title: "Ôn tập Kanji",
  description: "Ôn tập các chữ Kanji đến hạn theo FSRS.",
  robots: { index: false, follow: true },
};

async function AsyncKanjiReview() {
  const session = await getSession();
  if (!session.authenticated) redirect("/login?from=/learn/kanji/review");
  return <StudySession mode="review" kind="KANJI" />;
}

export default function KanjiReviewPage() {
  return (
    <>
      <PillarNav pillar="kanji" />
      <Suspense fallback={<p className="mx-auto max-w-6xl px-4 py-16 text-center text-sm text-[var(--muted-foreground)]">Đang tải…</p>}>
        <AsyncKanjiReview />
      </Suspense>
    </>
  );
}
