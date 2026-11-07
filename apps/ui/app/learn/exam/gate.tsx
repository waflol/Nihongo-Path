import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ExercisesConsole } from "@/components/learn/exercises-console";

/**
 * Server gate for `/learn/exam` (P3-UI-07). Signed out →
 * `/login?from=…`; the console itself is a client component that talks to
 * the `/api/flashcards/…` gateway (the access token stays server-side,
 * P2-UI-05).
 */
export async function LearnExamGate() {
  const session = await getSession();

  if (!session.authenticated) {
    redirect("/login?from=/learn/exam");
  }

  return <ExercisesConsole variant="exam" />;
}
