import type { Metadata } from "next";
import { Suspense } from "react";
import { ExamStructureGate } from "./gate";

export const metadata: Metadata = {
  title: "Cấu trúc đề thi JLPT",
  description: "Các phần thi, dạng câu hỏi (問題), số câu và thời gian của đề JLPT N5–N1.",
  // Private learning area — never indexed (spec §17.3).
  robots: { index: false, follow: true },
};

/** The JLPT paper of each level: parts, 大問, question counts and time. */
export default async function ExamStructurePage({ searchParams }: { searchParams: Promise<{ level?: string }> }) {
  const { level } = await searchParams;
  return (
    <Suspense
      fallback={
        <p className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-[var(--muted-foreground)]">
          Đang tải…
        </p>
      }
    >
      <ExamStructureGate level={level?.toUpperCase()} />
    </Suspense>
  );
}
