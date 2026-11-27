import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/session";
import { ExamStructure, type LevelStructure } from "@/components/learn/exam-structure";

/**
 * Server gate for `/learn/exams/structure`. Signed out → `/login?from=…`; the structure is
 * read server-side (`GET /exams/structure`) so the access token never reaches the browser.
 */
export async function ExamStructureGate({ level }: { level?: string }) {
  const session = await getSession();
  if (!session.authenticated || !session.accessToken) {
    redirect("/login?from=/learn/exams/structure");
  }

  const levels = await apiFetch<LevelStructure[]>("/exams/structure", { token: session.accessToken }).catch(() => null);
  if (!levels) {
    return (
      <p role="alert" className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-[var(--muted-foreground)]">
        Không tải được cấu trúc đề thi — thử tải lại trang.
      </p>
    );
  }
  return <ExamStructure levels={levels} initialLevel={level} />;
}
