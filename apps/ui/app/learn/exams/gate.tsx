import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ExamsConsole } from "@/components/learn/exams-console";

/**
 * Server gate for `/learn/exams` (P4-UI-02). Signed out →
 * `/login?from=…`; the console is a client component that talks to the
 * `/api/exams/…` gateway (the access token stays server-side, P2-UI-05).
 */
export async function LearnExamsGate() {
  const session = await getSession();

  if (!session.authenticated) {
    redirect("/login?from=/learn/exams");
  }

  return <ExamsConsole />;
}
