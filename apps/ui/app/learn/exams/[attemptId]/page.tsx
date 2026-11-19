import type { Metadata } from "next";
import { Suspense } from "react";
import { LearnExamSittingGate } from "./gate";

export const metadata: Metadata = {
  title: "Làm đề thi",
  description: "Làm bài thi có thời gian, chấm điểm và xem lại lỗi.",
  // Private learning area — never indexed (spec §17.3).
  robots: { index: false, follow: true },
};

/**
 * One exam sitting (P4-UI-01): timer, question navigation, flags, draft
 * autosave, and the result / "xem lại lỗi" screen after submit or time-out.
 */
export default function LearnExamSittingPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  return (
    <Suspense
      fallback={
        <p className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-[var(--muted-foreground)]">
          Đang tải…
        </p>
      }
    >
      <AsyncGate params={params} />
    </Suspense>
  );
}

// The gate reads the session cookie, so it must resolve `params` (a Promise)
// itself — kept out of `metadata` and the sync component above.
async function AsyncGate({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  return <LearnExamSittingGate attemptId={attemptId} />;
}
