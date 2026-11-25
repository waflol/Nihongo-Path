"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { FormattedText } from "../rich-text";
import { audioSrc, type ExamResult, type ExamSit, type SitQuestion, type Stimulus } from "./exam-types";

/**
 * JLPT sectional sitting (NP-409): tabs per part (文字・語彙 / 文法 / 読解 / 聴解),
 * every question of the active part on one page grouped by 問題 type, shared
 * passages beside their questions (collapsible on mobile), and a side panel
 * with the clock, submit and a number grid grouped by type. Layout only — the
 * server owns deadlines and grading.
 */

export const SECTION_TITLES: Record<string, string> = {
  vocab: "文字・語彙",
  grammar: "文法",
  reading: "読解",
  listening: "聴解",
};

export const MONDAI_LABELS: Record<string, string> = {
  "kanji-reading": "Cách đọc kanji",
  orthography: "Cách viết kanji",
  "word-formation": "Cấu tạo từ",
  context: "Biểu hiện từ",
  paraphrase: "Đồng nghĩa",
  usage: "Cách dùng từ",
  "grammar-form": "Dạng ngữ pháp",
  "star-order": "Sắp xếp câu ★",
  "text-grammar": "Ngữ pháp theo đoạn văn",
  "reading-short": "Đoạn văn ngắn",
  "reading-mid": "Đoạn văn trung bình",
  "reading-long": "Đoạn văn dài",
  "reading-integrated": "Đọc hiểu tổng hợp",
  "reading-thematic": "Đọc hiểu chủ đề",
  "info-retrieval": "Tìm thông tin",
  listening: "Nghe hiểu",
};

const sectionTitle = (key: string, title?: string) => title ?? SECTION_TITLES[key] ?? key;
const mondaiLabel = (m?: string) => (m ? (MONDAI_LABELS[m] ?? m) : "Câu hỏi");
const sectionOf = (q: SitQuestion) => q.sectionKey ?? q.section ?? "vocab";

function fmtClock(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = String(Math.floor((t % 3600) / 60)).padStart(2, "0");
  const s = String(t % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/** Consecutive questions of one 問題 type (and one passage) form a group. */
interface Group {
  key: string;
  mondai?: string;
  stimulusId?: string;
  items: { q: SitQuestion; no: number }[];
}

function groupQuestions(questions: SitQuestion[], numberOf: Map<string, number>): Group[] {
  const groups: Group[] = [];
  for (const q of questions) {
    const last = groups[groups.length - 1];
    if (last && last.mondai === q.mondai && last.stimulusId === q.stimulusId) {
      last.items.push({ q, no: numberOf.get(q.qid) ?? 0 });
    } else {
      groups.push({
        key: `${q.mondai ?? "x"}:${q.stimulusId ?? ""}:${q.qid}`,
        mondai: q.mondai,
        stimulusId: q.stimulusId,
        items: [{ q, no: numberOf.get(q.qid) ?? 0 }],
      });
    }
  }
  return groups;
}

function PassageView({ s }: { s: Stimulus }) {
  return (
    <div className="space-y-3 text-base leading-relaxed text-[var(--foreground)]" lang="ja">
      {s.title && <p className="font-semibold"><FormattedText text={s.title} /></p>}
      {s.audio || s.audioUrl ? (
        <audio controls preload="none" src={s.audio ? audioSrc(s.audio) : s.audioUrl} className="w-full" />
      ) : s.kind === "listening" ? (
        <p className="rounded-lg bg-[var(--layer)] px-3 py-2 text-sm text-[var(--muted-foreground)]" lang="vi">
          Âm thanh của câu này chưa có (phần media đang chờ).
        </p>
      ) : null}
      {s.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.imageUrl} alt="" className="mx-auto max-h-96 w-auto max-w-full" />
      )}
      {s.body && <p className="whitespace-pre-wrap"><FormattedText text={s.body} /></p>}
      {s.bodyB && <p className="whitespace-pre-wrap border-t border-[var(--border)] pt-3"><FormattedText text={s.bodyB} /></p>}
      {s.notes && <p className="whitespace-pre-wrap text-sm text-[var(--muted-foreground)]"><FormattedText text={s.notes} /></p>}
    </div>
  );
}

function QuestionCard({
  q,
  no,
  picked,
  flagged,
  onPick,
  onFlag,
}: {
  q: SitQuestion;
  no: number;
  picked: number | null | undefined;
  flagged: boolean;
  onPick: (idx: number) => void;
  onFlag: () => void;
}) {
  const star = q.mondai === "star-order";
  return (
    <article
      id={`q-${q.qid}`}
      className="scroll-mt-4 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4 sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">Câu {no}</h3>
        <button
          type="button"
          aria-pressed={flagged}
          aria-label={flagged ? "Bỏ đánh dấu câu này" : "Đánh dấu câu này"}
          onClick={onFlag}
          className={
            "inline-flex size-9 items-center justify-center rounded-full text-base font-bold " +
            (flagged ? "bg-[#f59e0b] text-white" : "bg-[var(--layer)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]")
          }
        >
          !
        </button>
      </div>
      <p className="mt-3 break-words text-lg leading-snug text-[var(--foreground)]" lang="ja">
        <FormattedText text={q.prompt} />
      </p>
      {q.sub && <p className="mt-1 text-sm text-[var(--muted-foreground)]">{q.sub}</p>}
      {q.audio ? (
        <audio controls preload="none" src={audioSrc(q.audio)} className="mt-3 w-full" />
      ) : q.mondai === "listening" && !q.stimulusId ? (
        <p className="mt-3 rounded-lg bg-[var(--layer)] px-3 py-2 text-sm text-[var(--muted-foreground)]">
          Âm thanh của câu này chưa có.
        </p>
      ) : null}
      <div role="radiogroup" aria-label={`Câu ${no}`} className="mt-3 grid gap-2">
        {q.options.map((opt, idx) => {
          const on = picked === idx;
          return (
            <button
              key={idx}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onPick(idx)}
              className={
                "flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors " +
                (on
                  ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] ring-1 ring-[var(--primary)]"
                  : "border-[var(--border)] bg-[var(--background)] hover:bg-[var(--layer-hover)]")
              }
            >
              <span
                className={
                  "inline-flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold " +
                  (on ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]" : "border-[var(--border)] text-[var(--muted-foreground)]")
                }
              >
                {idx + 1}
              </span>
              <span
                className={"min-w-0 flex-1 break-words " + (star ? "font-medium" : "")}
                lang="ja"
              >
                <FormattedText text={opt} />
              </span>
            </button>
          );
        })}
      </div>
    </article>
  );
}

export function SectionedSitting({
  sit,
  now,
  remaining,
  answers,
  setAnswers,
  flagged,
  toggleFlag,
  busy,
  saveState,
  onSubmit,
}: {
  sit: ExamSit;
  now: number;
  remaining: number;
  answers: Record<string, number | null>;
  setAnswers: Dispatch<SetStateAction<Record<string, number | null>>>;
  flagged: string[];
  toggleFlag: (qid: string) => void;
  busy: boolean;
  saveState: "idle" | "saving" | "saved" | "error";
  onSubmit: () => void;
}) {
  const sections = useMemo(() => sit.sections ?? [], [sit.sections]);
  const stimuli = useMemo(() => new Map((sit.stimuli ?? []).map((s) => [s.id, s])), [sit.stimuli]);

  // Whole-paper numbering in served order (matches the printed 問題用紙).
  const numberOf = useMemo(() => new Map(sit.questions.map((q, i) => [q.qid, i + 1])), [sit.questions]);
  const bySection = useMemo(() => {
    const m = new Map<string, SitQuestion[]>();
    for (const sec of sections) m.set(sec.key, []);
    for (const q of sit.questions) {
      const k = sectionOf(q);
      (m.get(k) ?? m.set(k, []).get(k)!).push(q);
    }
    return m;
  }, [sit.questions, sections]);

  // Start on the first part whose cumulative deadline has not passed.
  const [active, setActive] = useState(
    () => sections.find((s) => s.deadlineMs === null || s.deadlineMs > Date.now())?.key ?? sections[0]?.key ?? "",
  );
  const [panelOpen, setPanelOpen] = useState(false);

  const answered = (qid: string) => answers[qid] !== null && answers[qid] !== undefined;
  const answeredCount = sit.questions.filter((q) => answered(q.qid)).length;
  const activeSec = sections.find((s) => s.key === active);
  const secRemaining = activeSec?.deadlineMs ? Math.max(0, activeSec.deadlineMs - now) : null;
  const groups = groupQuestions(bySection.get(active) ?? [], numberOf);

  function jump(q: SitQuestion) {
    const target = sectionOf(q);
    if (target !== active) setActive(target);
    setPanelOpen(false);
    // Wait a frame so the target part has rendered before scrolling.
    requestAnimationFrame(() =>
      document.getElementById(`q-${q.qid}`)?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  const clock = sit.deadlineMs ? fmtClock(remaining) : "∞";
  const urgent = !!sit.deadlineMs && remaining <= 5 * 60_000;

  const grid = (
    <nav aria-label="Điều hướng câu hỏi" className="space-y-4">
      {sections.map((sec) => {
        const qs = bySection.get(sec.key) ?? [];
        if (qs.length === 0) return null;
        const subs = groupQuestions(qs, numberOf);
        // Merge same-type groups so a passage-per-group still shows one label.
        const byType: { mondai?: string; qs: SitQuestion[] }[] = [];
        for (const g of subs) {
          const last = byType[byType.length - 1];
          if (last && last.mondai === g.mondai) last.qs.push(...g.items.map((i) => i.q));
          else byType.push({ mondai: g.mondai, qs: g.items.map((i) => i.q) });
        }
        return (
          <div key={sec.key}>
            <p className={"text-sm font-semibold " + (sec.key === active ? "text-[var(--primary)]" : "text-[var(--foreground)]")}>
              {sectionTitle(sec.key, sec.title)}
            </p>
            {byType.map((t, i) => (
              <div key={i} className="mt-2">
                <p className="text-xs text-[var(--muted-foreground)]">{mondaiLabel(t.mondai)}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {t.qs.map((q) => {
                    const done = answered(q.qid);
                    const flag = flagged.includes(q.qid);
                    return (
                      <button
                        key={q.qid}
                        type="button"
                        onClick={() => jump(q)}
                        title={flag ? "Đã đánh dấu" : done ? "Đã trả lời" : "Chưa trả lời"}
                        className={
                          "inline-flex size-9 items-center justify-center rounded-full border text-sm font-medium " +
                          (done
                            ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                            : "border-[var(--foreground)]/60 bg-[var(--background)] text-[var(--foreground)]") +
                          (flag ? " ring-2 ring-[#f59e0b] ring-offset-1 ring-offset-[var(--background)]" : "")
                        }
                      >
                        {numberOf.get(q.qid)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </nav>
  );

  const submitBtn = (
    <button
      type="button"
      disabled={busy}
      onClick={onSubmit}
      className="min-h-11 w-full rounded-full bg-[var(--primary)] px-6 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? "Đang nộp…" : "Nộp bài"}
    </button>
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-4 pb-28 sm:px-6 lg:pb-8">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6">
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <h1 className="truncate text-base font-semibold text-[var(--foreground)]">{sit.exam.title}</h1>
            <span className="shrink-0 text-xs text-[var(--muted-foreground)]">
              {saveState === "saving" && "đang lưu…"}
              {saveState === "saved" && "đã lưu"}
              {saveState === "error" && "lỗi lưu nháp"}
            </span>
          </div>

          <div role="tablist" aria-label="Phần thi" className="mt-3 flex justify-center">
            <div className="inline-flex max-w-full overflow-x-auto rounded-full bg-[#2f2f2f] p-1">
              {sections.map((sec) => {
                const on = sec.key === active;
                const n = bySection.get(sec.key)?.length ?? 0;
                return (
                  <button
                    key={sec.key}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    disabled={n === 0}
                    onClick={() => setActive(sec.key)}
                    className={
                      "whitespace-nowrap rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-40 " +
                      (on ? "text-[#ff9f1c]" : "text-white")
                    }
                  >
                    {sectionTitle(sec.key, sec.title)}
                  </button>
                );
              })}
            </div>
          </div>
          {secRemaining !== null && (
            <p className="mt-2 text-center text-xs text-[var(--muted-foreground)]">
              Hạn phần này: {fmtClock(secRemaining)}
            </p>
          )}

          <div className="mt-4 space-y-6">
            {groups.map((g) => {
              const stim = g.stimulusId ? stimuli.get(g.stimulusId) : undefined;
              const instruction = g.items[0].q.sub;
              const cards = (
                <div className="space-y-3">
                  {g.items.map(({ q, no }) => (
                    <QuestionCard
                      key={q.qid}
                      q={q}
                      no={no}
                      picked={answers[q.qid]}
                      flagged={flagged.includes(q.qid)}
                      onPick={(idx) => setAnswers((a) => ({ ...a, [q.qid]: idx }))}
                      onFlag={() => toggleFlag(q.qid)}
                    />
                  ))}
                </div>
              );
              return (
                <section key={g.key} aria-label={mondaiLabel(g.mondai)}>
                  <div className="rounded-2xl border border-[var(--foreground)]/70 px-4 py-3 text-sm font-semibold text-[var(--foreground)]" lang="ja">
                    <span lang="vi" className="mr-2 text-xs font-medium text-[var(--muted-foreground)]">
                      {mondaiLabel(g.mondai)}
                    </span>
                    {instruction ?? ""}
                  </div>
                  {stim ? (
                    <div className="mt-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
                      <details open className="mb-3 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4 lg:sticky lg:top-4 lg:mb-0 lg:max-h-[calc(100svh-2rem)] lg:overflow-y-auto">
                        <summary className="cursor-pointer text-sm font-semibold text-[var(--muted-foreground)] lg:hidden">
                          Bài đọc / đoạn nghe (chạm để thu gọn)
                        </summary>
                        <div className="mt-2 lg:mt-0">
                          <PassageView s={stim} />
                        </div>
                      </details>
                      {cards}
                    </div>
                  ) : (
                    <div className="mt-3">{cards}</div>
                  )}
                </section>
              );
            })}
            {groups.length === 0 && (
              <p className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
                Phần này chưa có câu hỏi.
              </p>
            )}
          </div>
        </div>

        {/* Desktop side panel: clock, submit, grid */}
        <aside className="hidden lg:sticky lg:top-4 lg:block">
          <div className="max-h-[calc(100svh-2rem)] overflow-y-auto rounded-2xl border-2 border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_8%,var(--background))] p-4">
            <p
              className={"text-center font-mono text-lg font-bold tabular-nums " + (urgent ? "text-[#b91c1c]" : "text-[var(--foreground)]")}
              aria-label={`Còn ${clock}`}
            >
              ⏱ {clock}
            </p>
            <div className="mt-3">{submitBtn}</div>
            <p className="mt-2 text-center text-xs text-[var(--muted-foreground)]">
              Đã trả lời {answeredCount}/{sit.questions.length} · Đánh dấu {flagged.length}
            </p>
            <div className="mt-4">{grid}</div>
          </div>
        </aside>
      </div>

      {/* Mobile bar: clock + count + grid toggle + submit stay under the thumb */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--background)]/95 px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        {panelOpen && (
          <div className="mb-2 max-h-[55svh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-3">
            {grid}
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-expanded={panelOpen}
            onClick={() => setPanelOpen((v) => !v)}
            className="min-h-11 shrink-0 rounded-full border border-[var(--border)] px-3 text-left"
          >
            <span className={"block font-mono text-sm font-bold tabular-nums leading-tight " + (urgent ? "text-[#b91c1c]" : "text-[var(--foreground)]")}>
              ⏱ {clock}
            </span>
            <span className="block text-[10px] leading-tight text-[var(--muted-foreground)]">
              {answeredCount}/{sit.questions.length} · lưới số câu
            </span>
          </button>
          <div className="min-w-0 flex-1">{submitBtn}</div>
        </div>
      </div>
    </div>
  );
}

/** Per-part score table + the (estimated) 0–60 scale, shown on the result screen. */
export function SectionScoreTable({ result }: { result: ExamResult }) {
  const scores = result.sectionScores;
  if (!scores || Object.keys(scores).length === 0) return null;
  const order = (result.sections ?? []).map((s) => s.key);
  const keys = [...new Set([...order, ...Object.keys(scores)])].filter((k) => scores[k]);
  return (
    <div className="mt-5 overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--background-1)]">
      <table className="w-full min-w-[20rem] text-left text-sm">
        <thead className="text-xs text-[var(--muted-foreground)]">
          <tr>
            <th className="px-4 py-2 font-semibold">Phần</th>
            <th className="px-4 py-2 font-semibold">Đúng</th>
            <th className="px-4 py-2 font-semibold">Điểm</th>
            <th className="px-4 py-2 font-semibold">Quy đổi ước tính</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => {
            const s = scores[k];
            const est = result.sectionEstimates?.[k];
            return (
              <tr key={k} className="border-t border-[var(--border)]">
                <td className="px-4 py-2 font-medium text-[var(--foreground)]" lang="ja">
                  {sectionTitle(k, result.sections?.find((x) => x.key === k)?.title)}
                </td>
                <td className="px-4 py-2">{s.score}/{s.total}</td>
                <td className="px-4 py-2">{s.points}/{s.maxPoints}</td>
                <td className="px-4 py-2">{est !== undefined ? `${est}/60` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-[var(--border)] px-4 py-2 text-xs text-[var(--muted-foreground)]">
        Điểm quy đổi chỉ là <strong>ước tính</strong> theo thang 0–60 mỗi phần, không phải thang chấm chính thức của JLPT.
      </p>
    </div>
  );
}
