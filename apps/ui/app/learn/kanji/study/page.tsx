import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { StudySession } from "@/components/learn/study-session";
import { PillarNav } from "@/components/learn/pillar-nav";

export const metadata: Metadata = {
  title: "Học Kanji mới",
  description: "Học chữ Kanji mới với nét viết KanjiVG, Hán Việt và on/kun.",
  robots: { index: false, follow: true },
};

async function AsyncKanjiStudy() {
  const session = await getSession();
  if (!session.authenticated) redirect("/login?from=/learn/kanji/study");
  return <StudySession mode="learn" kind="KANJI" />;
}

export default function KanjiStudyPage() {
  return (
    <>
      <PillarNav pillar="kanji" />
      <Suspense fallback={<p className="mx-auto max-w-6xl px-4 py-16 text-center text-sm text-[var(--muted-foreground)]">Đang tải…</p>}>
        <AsyncKanjiStudy />
      </Suspense>
    </>
  );
}
