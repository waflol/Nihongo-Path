import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { StudySession } from "@/components/learn/study-session";

export const metadata: Metadata = {
  title: "Học thẻ ngữ pháp",
  description: "Ôn các mẫu ngữ pháp đã lưu theo cấp độ, chủ đề, bối cảnh và giáo trình.",
  robots: { index: false, follow: true },
};

type Search = { level?: string; themeId?: string; contextId?: string; textbookId?: string; unitId?: string };

/**
 * Grammar study session: the shared flashcard engine restricted to
 * `kind: "GRAMMAR"` cards (NP-1010). `?level=&themeId=&contextId=&textbookId=`
 * narrow the queue to the matching grammar points (server-side). Scheduling,
 * batching and multi-device sync stay on the existing FSRS surface.
 */
function GrammarStudyInner({ level, themeId, contextId, textbookId, unitId }: Search) {
  const grammarFilter: Search = {};
  if (level) grammarFilter.level = level;
  if (themeId) grammarFilter.themeId = themeId;
  if (contextId) grammarFilter.contextId = contextId;
  if (textbookId) grammarFilter.textbookId = textbookId;
  if (unitId) grammarFilter.unitId = unitId;
  return <StudySession mode="learn" kind="GRAMMAR" grammarFilter={grammarFilter} />;
}

// Session and URL data are awaited inside Suspense so the route can prerender.
async function AsyncGrammarStudy({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await getSession();
  if (!session.authenticated) redirect("/login?from=/learn/grammar/study");
  return <GrammarStudyInner {...await searchParams} />;
}

export default function GrammarStudyPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <Suspense
      fallback={
        <p className="mx-auto max-w-6xl px-4 py-16 text-center text-sm text-[var(--muted-foreground)] sm:px-6">
          Đang tải…
        </p>
      }
    >
      <AsyncGrammarStudy searchParams={searchParams} />
    </Suspense>
  );
}
