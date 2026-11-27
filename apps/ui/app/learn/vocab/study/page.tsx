import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { StudySession } from "@/components/learn/study-session";
import { PillarNav } from "@/components/learn/pillar-nav";

export const metadata: Metadata = {
  title: "Học từ vựng mới",
  description: "Học thẻ từ vựng mới theo lịch lặp lại ngắt quãng.",
  robots: { index: false, follow: true },
};

async function AsyncVocabStudy() {
  const session = await getSession();
  if (!session.authenticated) redirect("/login?from=/learn/vocab/study");
  return <StudySession mode="learn" />;
}

export default function VocabStudyPage() {
  return (
    <>
      <PillarNav pillar="vocab" />
      <Suspense fallback={<p className="mx-auto max-w-6xl px-4 py-16 text-center text-sm text-[var(--muted-foreground)]">Đang tải…</p>}>
        <AsyncVocabStudy />
      </Suspense>
    </>
  );
}
