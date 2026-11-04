import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { DecksConsole } from "@/components/learn/decks-console";

/**
 * Server gate for `/learn/decks` (P3-UI-03). Any signed-in user gets their
 * deck list (personal + published shared); signed out → `/login?from=…`.
 * Under `cacheComponents` the `cookies()` read inside `getSession()` must
 * sit behind `<Suspense>` (same reason as the P2 admin gate).
 */
export async function LearnDecksGate() {
  const session = await getSession();

  if (!session.authenticated) {
    redirect("/login?from=/learn/decks");
  }

  return <DecksConsole />;
}
