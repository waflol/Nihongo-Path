import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ExamSitting } from "@/components/learn/exam-sitting";

/**
 * Server gate for `/learn/exams/<attemptId>` (P4-UI-01). Signed out →
 * `/login?from=…`. The sitting component fetches its payload from the
 * `/api/exams/attempts/:id` gateway — a refresh restores the server-side
 * draft (T-P4-10); another user's attempt is a 404 (T-P4-07).
 */
export async function LearnExamSittingGate({
  attemptId,
}: {
  attemptId: string;
}) {
  const session = await getSession();

  if (!session.authenticated) {
    redirect(`/login?from=/learn/exams/${attemptId}`);
  }

  return <ExamSitting attemptId={attemptId} />;
}
