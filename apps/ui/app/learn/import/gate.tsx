import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSession } from "@/lib/session";
import { ImportWizard } from "@/components/admin/import-wizard";

/** `/learn/import` — signed-in learners import CSV/XLSX into their own decks. */
export async function LearnImportGate() {
  const session = await getSession();
  if (!session.authenticated) {
    redirect("/login?from=/learn/import");
  }
  return (
    <Suspense>
      <ImportWizard learner />
    </Suspense>
  );
}
