import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { StudySession } from "@/components/learn/study-session";
import { PillarNav } from "@/components/learn/pillar-nav";

export const metadata: Metadata = {
  title: "Ôn tập ngữ pháp",
  description: "Ôn tập các mẫu ngữ pháp đến hạn theo FSRS.",
  robots: { index: false, follow: true },
};

async function AsyncGrammarReview() {
  const session = await getSession();
  if (!session.authenticated) redirect("/login?from=/learn/grammar/review");
  return <StudySession mode="review" kind="GRAMMAR" />;
}

export default function GrammarReviewPage() {
  return (
    <>
      <PillarNav pillar="grammar" />
      <Suspense
        fallback={
          <p className="mx-auto max-w-6xl px-4 py-16 text-center text-sm text-[var(--muted-foreground)] sm:px-6">
            Đang tải…
          </p>
        }
      >
        <AsyncGrammarReview />
      </Suspense>
    </>
  );
}
