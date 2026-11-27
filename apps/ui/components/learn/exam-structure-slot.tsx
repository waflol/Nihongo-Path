import { ExamStructureCard } from "@/components/learn/exam-structure-card";
import type { LevelStructure } from "@/components/learn/exam-structure";
import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/session";

/**
 * Reads the exam structure server-side for the /learn card. The card is an extra: signed out
 * or API down, the hub shows without it.
 */
export async function ExamStructureSlot() {
  // `getSession` throws when the API is unreachable.
  const session = await getSession().catch(() => null);
  if (!session?.authenticated || !session.accessToken) return null;
  const levels = await apiFetch<LevelStructure[]>("/exams/structure", { token: session.accessToken }).catch(() => null);
  return levels ? <ExamStructureCard levels={levels} /> : null;
}
