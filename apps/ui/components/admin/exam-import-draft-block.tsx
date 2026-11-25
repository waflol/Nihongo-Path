"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MONDAI_LABELS } from "@/components/learn/exam-sectioned";
import { FormattedText, PassageText, stripFormat } from "../rich-text";
import { type StarControls, starParts, StarSentence } from "../star-sentence";
import { DraftEditor, type EditQuestion, type EditStimulus } from "./exam-import-draft-editor";
import {
  deskButton,
  deskButtonPrimary,
  errorOf,
  fillAnswers,
  isOpen,
  missingCount,
  questionsOf,
  STATE_LABEL,
  STATE_TEXT,
  stateOf,
  type Draft,
  type ParsedQuestion,
  type ParsedStimulus,
} from "./exam-import-draft-model";
import { PagePreview } from "./exam-import-page-preview";

const PARSED_BY = {
  rules: { label: "Đọc bằng quy tắc", title: "Đọc đúng theo bố cục in, không dùng AI" },
  ai: { label: "AI tách khối", title: "AI tách khối, đã đối chiếu với text gốc" },
  manual: { label: "Đã sửa tay", title: "Đã được chỉnh sửa tay" },
};

/** Options print side by side when short, as on the paper. */
function optionColumns(options: string[]): string {
  const longest = Math.max(0, ...options.map((o) => stripFormat(o).length));
  if (longest <= 8) return "grid-cols-2 sm:grid-cols-4";
  if (longest <= 20) return "grid-cols-1 sm:grid-cols-2";
  return "grid-cols-1";
}

function Passage({ s }: { s: ParsedStimulus }) {
  return (
    <article className="exam-ja rounded-sm border border-[var(--sheet-ink)]/35 px-5 py-4 text-[15px] leading-8 sm:px-7 sm:py-5">
      {s.title && (
        <h3 className="mb-2 text-center text-base font-bold">
          <FormattedText text={s.title} />
        </h3>
      )}
      <PassageText text={s.body} />
      {s.bodyB && <PassageText text={s.bodyB} className="mt-4 border-t border-dashed border-[var(--sheet-rule)] pt-4" />}
      {s.notes && (
        <p className="mt-3 whitespace-pre-wrap text-[13px] leading-6 text-[var(--muted-foreground)]">
          <FormattedText text={s.notes} />
        </p>
      )}
    </article>
  );
}

/**
 * One 問題 block on the desk: the paper, its source pages, and the answer sheet.
 * Keys 1–4 fill the current question and move on, so an answer key is typed in one go.
 * Mount with `key={draft._id}`.
 */
export function DraftBlock({
  draft,
  jobId,
  answers,
  setAnswers,
  onChanged,
  onDone,
  onEditingChange,
  onStep,
}: {
  draft: Draft;
  jobId: string;
  answers: number[];
  setAnswers: (a: number[]) => void;
  onChanged: () => Promise<void>;
  /** The block was published or discarded. */
  onDone: (text: string) => void;
  onEditingChange: (editing: boolean) => void;
  onStep: (d: -1 | 1) => void;
}) {
  const questions = questionsOf(draft);
  const stimuli = draft.parsed?.stimuli ?? [];
  const [raw, setRaw] = useState(draft.status === "error");
  const [editing, setEditingState] = useState(false);
  const [showPage, setShowPage] = useState(false);
  const [cursor, setCursor] = useState(() => Math.max(0, questions.findIndex((q) => !(answers[q.no - 1] > 0))));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rows = useRef<(HTMLLIElement | null)[]>([]);
  const cells = useRef<(HTMLButtonElement | null)[]>([]);

  const hasPages = draft.pageFrom != null;
  // Editing always shows the source page beside the editor; otherwise it is a toggle.
  const pageOpen = hasPages && (editing || showPage);
  const open = isOpen(draft);
  const missing = missingCount(draft, answers);
  const state = stateOf(draft, answers);
  const canPublish = open && !editing && !busy && questions.length > 0 && missing === 0;

  const setEditing = (v: boolean) => {
    setEditingState(v);
    onEditingChange(v);
  };

  const goTo = useCallback((i: number) => {
    setCursor(i);
    rows.current[i]?.scrollIntoView({ block: "nearest" });
    cells.current[i]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, []);

  function pick(i: number, value: number) {
    const q = questions[i];
    if (!q || !open || busy) return;
    setAnswers(Object.assign([...answers], { [q.no - 1]: value }));
  }

  async function save(instruction: string, newStimuli: EditStimulus[], newQuestions: EditQuestion[]) {
    setSaving(true);
    setSaveError(null);
    const res = await fetch(`/api/exam-import?update=${draft._id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instruction,
        stimuli: newStimuli,
        questions: newQuestions.map((q) => ({
          printedNo: q.printedNo,
          prompt: q.prompt,
          options: q.options,
          stimulusKey: q.stimulusKey || undefined,
        })),
        answers: newQuestions.map((q) => q.answer),
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      setSaveError(res ? await errorOf(res) : "Không kết nối được máy chủ");
      return;
    }
    setAnswers(newQuestions.map((q) => q.answer));
    setEditing(false);
    await onChanged();
  }

  async function act(kind: "publish" | "discard") {
    if (kind === "discard" && !window.confirm("Loại khối này? Bạn không nhập khối này vào ngân hàng câu hỏi.")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/exam-import?${kind}=${draft._id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(kind === "publish" ? { answers: fillAnswers(draft, answers) } : {}),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError(res ? await errorOf(res) : "Không kết nối được máy chủ");
      return;
    }
    onDone(`Đã ${kind === "publish" ? "xuất bản" : "loại"} khối ${draft.blockIndex + 1}.`);
    await onChanged();
  }

  // Re-subscribed each render so the handler always sees the latest answers.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (editing || e.altKey || e.isComposing) return;
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "Enter" && canPublish) {
          e.preventDefault();
          void act("publish");
        }
        return;
      }
      const n = Number(e.key);
      if (open && Number.isInteger(n) && n >= 1 && n <= (questions[cursor]?.options.length ?? 0)) {
        e.preventDefault();
        pick(cursor, n);
        goTo(Math.min(cursor + 1, questions.length - 1));
      } else if (e.key === "Backspace" && open) {
        e.preventDefault();
        pick(cursor, 0);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (questions.length === 0) return;
        e.preventDefault();
        goTo(Math.min(Math.max(cursor + (e.key === "ArrowDown" ? 1 : -1), 0), questions.length - 1));
      } else if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        onStep(e.key === "j" ? 1 : -1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // A passage is printed once, above the questions that belong to it.
  const groups: { stim: ParsedStimulus | null; items: { q: ParsedQuestion; i: number }[] }[] = [
    ...stimuli.map((s) => ({ stim: s as ParsedStimulus | null, items: [] as { q: ParsedQuestion; i: number }[] })),
    { stim: null, items: [] },
  ];
  questions.forEach((q, i) => {
    (groups.find((g) => g.stim?.key === q.stimulusKey) ?? groups[groups.length - 1]).items.push({ q, i });
  });
  // Standalone questions come first when the block has no passage for them.
  groups.sort((a, b) => (a.items[0]?.i ?? Infinity) - (b.items[0]?.i ?? Infinity));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--sheet-rule)] bg-[var(--sheet)] px-4 py-2.5">
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="truncate text-base font-semibold text-[var(--sheet-ink)]">
            Khối {draft.blockIndex + 1}: {draft.mondai ? (MONDAI_LABELS[draft.mondai] ?? draft.mondai) : "chưa nhận ra dạng"}
          </h2>
          <p className="flex flex-wrap items-center gap-x-3 text-xs text-[var(--muted-foreground)]">
            <span className={`font-semibold ${STATE_TEXT[state]}`}>{STATE_LABEL[state]}</span>
            <span>Đề {draft.sitting}</span>
            <span>{questions.length} câu</span>
            {draft.parsedBy && <span title={PARSED_BY[draft.parsedBy].title}>{PARSED_BY[draft.parsedBy].label}</span>}
          </p>
        </div>
        {open && !editing && (
          <button type="button" className={deskButton} disabled={busy} onClick={() => setEditing(true)}>
            Chỉnh sửa
          </button>
        )}
        {hasPages && !editing && (
          <button type="button" className={deskButton} aria-pressed={showPage} onClick={() => setShowPage(!showPage)}>
            {showPage ? "Ẩn ảnh trang" : "Xem ảnh trang"}
          </button>
        )}
        <button type="button" className={deskButton} aria-pressed={raw} onClick={() => setRaw(!raw)}>
          {raw ? "Ẩn text gốc" : "Xem text gốc"}
        </button>
      </header>

      <div className={`flex min-h-0 flex-1 ${pageOpen ? "flex-col xl:flex-row" : "flex-col"}`}>
        {pageOpen && (
          <div className="h-[48%] shrink-0 border-b border-[var(--sheet-rule)] p-3 xl:order-2 xl:h-auto xl:w-[46%] xl:border-b-0 xl:border-l">
            <PagePreview jobId={jobId} from={draft.pageFrom!} to={draft.pageTo ?? draft.pageFrom!} />
          </div>
        )}
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-6 sm:py-6 xl:order-1">
          <div className="mx-auto max-w-3xl space-y-4">
            {draft.issues.length > 0 && (
              <div role="note" className="rounded-lg border border-[var(--bad)]/40 bg-[var(--bad)]/10 px-4 py-3 text-sm text-[var(--bad)]">
                <p className="font-semibold">Cần kiểm tra trước khi xuất bản</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {draft.issues.map((i, n) => (
                    <li key={n}>{i}</li>
                  ))}
                </ul>
              </div>
            )}
            {raw && (
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-dashed border-[var(--sheet-rule)] bg-[var(--sheet)] p-4 text-xs leading-6 text-[var(--sheet-ink)]">
                {draft.rawText || "(khối không có text gốc)"}
              </pre>
            )}

            {editing ? (
              <DraftEditor
                initialInstruction={draft.instruction}
                initialStimuli={stimuli.map((s) => ({ key: s.key, kind: s.kind, title: s.title, body: s.body, bodyB: s.bodyB, notes: s.notes }))}
                initialQuestions={questions.map((q) => ({
                  printedNo: q.printedNo,
                  prompt: q.prompt,
                  options: q.options,
                  stimulusKey: q.stimulusKey ?? "",
                  answer: answers[q.no - 1] ?? 0,
                }))}
                rawText={draft.rawText}
                optionCount={questions[0]?.options.length ?? 4}
                saving={saving}
                error={saveError}
                onSave={(ins, st, qs) => void save(ins, st, qs)}
                onCancel={() => {
                  setEditing(false);
                  setSaveError(null);
                }}
              />
            ) : (
              <div className="relative space-y-6 rounded-sm bg-[var(--sheet)] px-4 py-6 text-[var(--sheet-ink)] shadow-[0_1px_2px_rgba(10,14,30,0.12),0_18px_40px_-24px_rgba(10,14,30,0.45)] sm:px-10 sm:py-9">
                {draft.status === "published" && (
                  <span
                    aria-label="Đã xuất bản"
                    className="exam-seal exam-ja absolute right-4 top-4 grid h-14 w-14 place-items-center rounded-full border-[3px] border-[var(--seal)] text-2xl font-bold text-[var(--seal)]"
                  >
                    済
                  </span>
                )}
                {draft.instruction && (
                  <p className={`exam-ja whitespace-pre-wrap border-b-2 border-[var(--sheet-ink)] pb-3 text-[15px] font-bold leading-8 ${draft.status === "published" ? "pr-16" : ""}`}>
                    <FormattedText text={draft.instruction} />
                  </p>
                )}
                {questions.length === 0 && (
                  <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">
                    Chưa tách được câu hỏi nào. Bấm “Chỉnh sửa” để nhập tay theo text gốc, hoặc loại khối này.
                  </p>
                )}
                {groups.map((g) => (
                  <div key={g.stim?.key ?? "none"} className="space-y-5">
                    {g.stim && <Passage s={g.stim} />}
                    {g.items.length > 0 && (
                      <ol className="space-y-2">
                        {g.items.map(({ q, i }) => (
                          <li
                            key={q.no}
                            ref={(el) => {
                              rows.current[i] = el;
                            }}
                            onClick={() => setCursor(i)}
                            className={`-mx-3 rounded-lg px-3 py-3 ${open && cursor === i ? "bg-[var(--primary)]/[0.07] ring-1 ring-[var(--primary)]/40" : ""}`}
                          >
                            {(() => {
                              const star = draft.mondai === "star-order" ? starParts(q.prompt) : null;
                              const number = (
                                <span className="h-7 min-w-7 shrink-0 self-start border border-[var(--sheet-ink)] px-1 text-center text-sm font-bold leading-[1.65rem] tabular-nums">
                                  {q.printedNo ?? q.no}
                                </span>
                              );
                              const choices = (controls?: StarControls) => (
                            <div className={`mt-2 grid gap-1.5 ${controls ? "" : "sm:pl-10"} ${optionColumns(q.options)}`}>
                              {q.options.map((o, oi) => {
                                const picked = answers[q.no - 1] === oi + 1;
                                return (
                                  <button
                                    key={oi}
                                    type="button"
                                    {...controls?.drag(oi)}
                                    disabled={!open || busy}
                                    aria-pressed={picked}
                                    onClick={() => pick(i, picked ? 0 : oi + 1)}
                                    className={`group flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] enabled:hover:bg-[var(--primary)]/10 disabled:cursor-default ${picked ? "bg-[var(--primary)]/[0.12]" : ""}`}
                                  >
                                    <span
                                      className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-semibold tabular-nums ${
                                        picked
                                          ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                                          : "border-[var(--sheet-ink)]/45 group-enabled:group-hover:border-[var(--primary)]"
                                      }`}
                                    >
                                      {oi + 1}
                                    </span>
                                    <span className={`exam-ja min-w-0 text-base leading-7 ${picked ? "font-bold" : ""}`}>
                                      <FormattedText text={o} />
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                              );
                              if (!star) {
                                return (
                                  <>
                                    <div className="exam-ja flex gap-3 text-[17px] leading-8">
                                      {number}
                                      <p className="min-w-0 flex-1 whitespace-pre-wrap">
                                        <FormattedText text={q.prompt} />
                                      </p>
                                    </div>
                                    {choices()}
                                  </>
                                );
                              }
                              const a = answers[q.no - 1] ?? 0;
                              return (
                                <div className="flex gap-3">
                                  {number}
                                  <div className="exam-ja min-w-0 flex-1 text-[17px]">
                                    <StarSentence
                                      parts={star}
                                      options={q.options}
                                      picked={a > 0 ? a - 1 : null}
                                      onPick={(o) => pick(i, o === null ? 0 : o + 1)}
                                      disabled={!open || busy}
                                    >
                                      {choices}
                                    </StarSentence>
                                  </div>
                                </div>
                              );
                            })()}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {!editing && (
        <footer className="border-t border-[var(--sheet-rule)] bg-[var(--sheet)] px-4 py-2.5">
          {error && (
            <p role="alert" className="mb-2 text-sm text-[var(--bad)]">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {questions.length > 0 && (
              <div className="min-w-0 flex-1 basis-60">
                <div className="flex gap-1 overflow-x-auto p-0.5" aria-label="Phiếu đáp án">
                  {questions.map((q, i) => {
                    const a = answers[q.no - 1] ?? 0;
                    return (
                      <button
                        key={q.no}
                        type="button"
                        ref={(el) => {
                          cells.current[i] = el;
                        }}
                        onClick={() => goTo(i)}
                        aria-label={`Câu ${q.printedNo ?? q.no}: ${a ? `đáp án ${a}` : "chưa có đáp án"}`}
                        aria-current={open && cursor === i ? "true" : undefined}
                        className={`w-9 shrink-0 overflow-hidden rounded-md border text-center tabular-nums ${
                          open && cursor === i ? "border-[var(--primary)] ring-1 ring-[var(--primary)]" : "border-[var(--sheet-rule)]"
                        }`}
                      >
                        <span className="block border-b border-[var(--sheet-rule)] text-[10px] leading-4 text-[var(--muted-foreground)]">
                          {q.printedNo ?? q.no}
                        </span>
                        <span className={`block text-sm font-bold leading-6 ${a ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "text-[var(--muted-foreground)]"}`}>
                          {a || "\u00a0"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {open && (
                  <p className="mt-1 hidden text-xs text-[var(--muted-foreground)] md:block">
                    Gõ 1–{questions[cursor]?.options.length ?? 4} để điền, ↑ ↓ đổi câu, J K đổi khối, Ctrl+Enter xuất bản.
                  </p>
                )}
              </div>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button type="button" className={deskButton} onClick={() => onStep(-1)} title="Khối trước (K)">
                Trước
              </button>
              <button type="button" className={deskButton} onClick={() => onStep(1)} title="Khối sau (J)">
                Sau
              </button>
              {open && (
                <>
                  <button type="button" className={deskButton} disabled={busy} onClick={() => void act("discard")}>
                    Loại
                  </button>
                  <button type="button" className={deskButtonPrimary} disabled={!canPublish} onClick={() => void act("publish")}>
                    {busy ? "Đang xử lý…" : missing > 0 ? `Còn ${missing} câu chưa có đáp án` : "Xuất bản"}
                  </button>
                </>
              )}
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
