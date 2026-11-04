import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { StudySession } from "@/components/learn/study-session";

/**
 * Server gate for `/learn/study` (P3-UI-01). Signed out → `/login?from=…`.
 * The study session itself is a client component (card flip, keyboard
 * shortcuts, grading) that talks to `/api/srs/…` (token stays server-side,
 * P2-UI-05).
 */
export async function LearnStudyGate() {
  const session = await getSession();

  if (!session.authenticated) {
    redirect("/login?from=/learn/study");
  }

  return <StudySession />;
}
