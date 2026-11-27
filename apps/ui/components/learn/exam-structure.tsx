"use client";

import { useState } from "react";
import Link from "next/link";
import { useExamLevel } from "@/components/learn/use-exam-level";
import { LevelBadge } from "@/components/learn/level-select";
import { MONDAI_LABELS, SECTION_TITLES } from "@/components/learn/exam-sectioned";

export interface StructureMondai {
  no: number;
  mondai: string;
  section: string;
  nameJa: string;
  count: number;
  options: number;
}
export interface StructurePart {
  key: string;
  titleJa: string;
  titleVi: string;
  timeMin: number;
  mondai: StructureMondai[];
  questions: number;
}
export interface LevelStructure {
  level: string;
  parts: StructurePart[];
  totalMin: number;
  totalQuestions: number;
}

/** The Vietnamese name of a 大問, without the Japanese the table already shows. */
const labelVi = (m: string) => (MONDAI_LABELS[m] ?? m).replace(/\s*\([^)]*[぀-ヿ一-鿿][^)]*\)$/, "");

function minutes(n: number): string {
  const h = Math.floor(n / 60);
  return h > 0 ? `${h} giờ${n % 60 ? ` ${n % 60} phút` : ""}` : `${n} phút`;
}

/** One timed part: its 大問 in printed order, grouped under 文字・語彙 / 文法 / 読解 when the part holds several. */
function PartTable({ part }: { part: StructurePart }) {
  const sections = [...new Set(part.mondai.map((m) => m.section))];
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background-1)]">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[var(--border)] px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-[var(--foreground)]" lang="ja">
            {part.titleJa}
          </h3>
          <p className="text-xs text-[var(--muted-foreground)]">{part.titleVi}</p>
        </div>
        <p className="text-sm tabular-nums text-[var(--muted-foreground)]">
          <span className="font-semibold text-[var(--foreground)]">{minutes(part.timeMin)}</span> · khoảng {part.questions} câu
        </p>
      </header>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-[var(--muted-foreground)]">
            <th scope="col" className="w-16 px-4 py-2 font-medium sm:px-5">
              問題
            </th>
            <th scope="col" className="px-2 py-2 font-medium">
              Dạng câu hỏi
            </th>
            <th scope="col" className="w-20 px-2 py-2 text-right font-medium">
              Số câu
            </th>
            <th scope="col" className="hidden w-28 px-4 py-2 text-right font-medium sm:table-cell sm:px-5">
              Phương án
            </th>
          </tr>
        </thead>
        {sections.map((sec) => (
          <tbody key={sec} className="border-t border-[var(--border)]">
            {sections.length > 1 && (
              <tr>
                <th colSpan={4} scope="rowgroup" className="bg-[var(--layer)] px-4 py-1.5 text-left text-xs font-semibold text-[var(--muted-foreground)] sm:px-5" lang="ja">
                  {SECTION_TITLES[sec] ?? sec}
                </th>
              </tr>
            )}
            {part.mondai
              .filter((m) => m.section === sec)
              .map((m) => (
                <tr key={m.no} className="border-t border-[var(--border)] first:border-t-0">
                  <td className="px-4 py-2.5 tabular-nums text-[var(--muted-foreground)] sm:px-5">{m.no}</td>
                  <td className="px-2 py-2.5">
                    <span className="font-medium text-[var(--foreground)]" lang="ja">
                      {m.nameJa}
                    </span>
                    <span className="block text-xs text-[var(--muted-foreground)]">{labelVi(m.mondai)}</span>
                  </td>
                  <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-[var(--foreground)]">{m.count}</td>
                  <td className="hidden px-4 py-2.5 text-right tabular-nums text-[var(--muted-foreground)] sm:table-cell sm:px-5">{m.options}</td>
                </tr>
              ))}
          </tbody>
        ))}
      </table>
    </section>
  );
}

/**
 * The JLPT paper of each level (N5 … N1): its timed parts, the 大問 of each in printed order
 * and the usual number of questions (`GET /exams/structure`). Opens on `initialLevel`, else on
 * the level picked last.
 */
export function ExamStructure({ levels, initialLevel }: { levels: LevelStructure[]; initialLevel?: string }) {
  const [picked, remember] = useExamLevel();
  const [chosen, setChosen] = useState(initialLevel);
  const current = levels.find((l) => l.level === chosen) ?? levels.find((l) => l.level === picked) ?? levels[0];
  const level = current?.level;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">Cấu trúc đề thi JLPT</h1>
        <Link
          href="/learn"
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
        >
          ← Khu học tập
        </Link>
      </div>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Mỗi cấp gồm các phần thi có giờ riêng; mỗi phần là các 問題 (大問) theo đúng thứ tự in trên đề.
      </p>

      <div role="tablist" aria-label="Cấp độ" className="mt-5 inline-flex flex-wrap gap-1 rounded-xl border border-[var(--border)] bg-[var(--background-1)] p-1">
        {levels.map((l) => (
          <button
            key={l.level}
            type="button"
            role="tab"
            aria-selected={l.level === level}
            onClick={() => {
              setChosen(l.level);
              remember(l.level);
            }}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
              l.level === level ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "text-[var(--muted-foreground)] hover:bg-[var(--layer-hover)] hover:text-[var(--foreground)]"
            }`}
          >
            {l.level}
          </button>
        ))}
      </div>

      {current ? (
        <div role="tabpanel" aria-label={current.level} className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] px-4 py-3 sm:px-5">
            <LevelBadge level={current.level} />
            <p className="text-sm text-[var(--muted-foreground)]">
              Tổng thời gian <span className="font-semibold text-[var(--foreground)]">{minutes(current.totalMin)}</span>
            </p>
            <p className="text-sm text-[var(--muted-foreground)]">
              Khoảng <span className="font-semibold text-[var(--foreground)]">{current.totalQuestions}</span> câu
            </p>
            <p className="text-sm text-[var(--muted-foreground)]">
              {current.parts.length} phần: {current.parts.map((p) => `${p.timeMin} phút`).join(" + ")}
            </p>
          </div>
          {current.parts.map((p) => (
            <PartTable key={p.key} part={p} />
          ))}
        </div>
      ) : (
        <p className="mt-6 text-sm text-[var(--muted-foreground)]">Chưa có dữ liệu cấu trúc đề.</p>
      )}

      <p className="mt-6 text-xs leading-5 text-[var(--muted-foreground)]">
        Số câu là con số tham khảo (目安) — đề thật có thể chênh một vài câu.
      </p>
    </div>
  );
}
