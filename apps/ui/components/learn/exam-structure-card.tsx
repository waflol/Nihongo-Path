"use client";

import Link from "next/link";
import { LevelSelect } from "@/components/learn/level-select";
import { SECTION_TITLES } from "@/components/learn/exam-sectioned";
import type { LevelStructure, StructurePart } from "@/components/learn/exam-structure";
import { useExamLevel } from "@/components/learn/use-exam-level";

/** `文字・語彙`, or `文法・読解` for a part that holds several paper sections. */
const partName = (p: StructurePart) => [...new Set(p.mondai.map((m) => SECTION_TITLES[m.section]?.replace(/\s*\(.*$/, "") ?? m.section))].join("・");

/** /learn: the exam structure of the level the learner picked (remembered), with a link to the full tables. */
export function ExamStructureCard({ levels }: { levels: LevelStructure[] }) {
  const [picked, pick] = useExamLevel();
  const current = levels.find((l) => l.level === picked) ?? levels[0];
  if (!current) return null;

  return (
    <section
      aria-label="Cấu trúc đề thi JLPT"
      className="flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-3.5"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">Cấp muốn thi</h2>
        <div className="[&>div]:mt-0 [&>div]:gap-1.5 [&_button]:px-2.5">
          <LevelSelect value={current.level} onChange={pick} />
        </div>
      </div>
      <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--muted-foreground)]">
        {current.parts.map((p) => (
          <li key={p.key} className="whitespace-nowrap">
            <span className="font-semibold text-[var(--foreground)]" lang="ja">
              {partName(p)}
            </span>{" "}
            <span className="tabular-nums">
              {p.timeMin} phút · {p.questions} câu
            </span>
          </li>
        ))}
      </ul>
      <Link href={`/learn/exams/structure?level=${current.level}`} className="text-xs font-medium text-[var(--primary)] hover:underline">
        Cấu trúc đề {current.level} →
      </Link>
    </section>
  );
}
