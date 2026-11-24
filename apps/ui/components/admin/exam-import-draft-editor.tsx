"use client";

import { useLayoutEffect, useRef, useState } from "react";

export interface EditStimulus {
  key: string;
  kind: string;
  title?: string;
  body: string;
  bodyB?: string;
  notes?: string;
}
export interface EditQuestion {
  /** The number printed on the paper (55…); empty = unknown. */
  printedNo?: number;
  prompt: string;
  options: string[];
  stimulusKey: string;
  /** 1-based picked option, `0` = none yet. */
  answer: number;
}

const btn =
  "rounded-lg border border-[var(--border)] px-2.5 py-1 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--background-1)] disabled:cursor-not-allowed disabled:opacity-60";
const btnPrimary =
  "rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60";
const KINDS: { value: string; label: string }[] = [
  { value: "passage", label: "Bài đọc" },
  { value: "cloze", label: "Bài điền chỗ trống" },
  { value: "notice", label: "Thông báo / bảng" },
  { value: "pair", label: "Hai bài A / B" },
];

/** A textarea that always shows all its text (no inner scrollbar), like a page you type on. */
function AutoText({
  value,
  onChange,
  className,
  placeholder,
  onFocus,
  onBlur,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      onFocus={onFocus}
      onBlur={onBlur}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`block w-full resize-none overflow-hidden bg-transparent outline-none ${className ?? ""}`}
    />
  );
}

/** The next unused blank number for a cloze: one after the largest `[n]` already in the passage. */
function nextBlank(body: string, fallback: number): number {
  const used = [...body.matchAll(/\[(\d{1,3})\]/g)].map((m) => Number(m[1]));
  return used.length > 0 ? Math.max(...used) + 1 : fallback;
}

/**
 * Word-like editor of one draft block: each passage is a page you type straight
 * into (undo/redo, line breaks, paste all behave as in a word processor), the
 * questions are editable fields with the right answer picked in place.
 * Only plain text is kept — learners see the passage as plain text too.
 */
export function DraftEditor({
  initialStimuli,
  initialQuestions,
  rawText,
  optionCount,
  saving,
  error,
  onSave,
  onCancel,
}: {
  initialStimuli: EditStimulus[];
  initialQuestions: EditQuestion[];
  rawText: string;
  optionCount: number;
  saving: boolean;
  error: string | null;
  onSave: (stimuli: EditStimulus[], questions: EditQuestion[]) => void;
  onCancel: () => void;
}) {
  const [stimuli, setStimuli] = useState<EditStimulus[]>(initialStimuli);
  const [questions, setQuestions] = useState<EditQuestion[]>(initialQuestions);
  const [showRaw, setShowRaw] = useState(initialStimuli.length === 0 && initialQuestions.length === 0);
  const [focused, setFocused] = useState<string | null>(null);

  const patchStimulus = (key: string, p: Partial<EditStimulus>) =>
    setStimuli((l) => l.map((s) => (s.key === key ? { ...s, ...p } : s)));
  const patchQuestion = (i: number, p: Partial<EditQuestion>) =>
    setQuestions((l) => l.map((q, n) => (n === i ? { ...q, ...p } : q)));

  function addStimulus(kind = "passage") {
    const n = Math.max(0, ...stimuli.map((s) => Number(s.key.slice(1)) || 0)) + 1;
    setStimuli((l) => [...l, { key: `s${n}`, kind, body: "" }]);
  }
  function removeStimulus(key: string) {
    if (!window.confirm("Xoá bài này? Các câu hỏi đang gắn với bài sẽ thành câu độc lập.")) return;
    setStimuli((l) => l.filter((s) => s.key !== key));
    setQuestions((l) => l.map((q) => (q.stimulusKey === key ? { ...q, stimulusKey: "" } : q)));
  }
  function addQuestion(stimulusKey: string) {
    setQuestions((l) => [...l, { prompt: "", options: Array.from({ length: optionCount }, () => ""), stimulusKey, answer: 0 }]);
  }
  function removeQuestion(i: number) {
    if (!window.confirm(`Xoá câu ${i + 1}?`)) return;
    setQuestions((l) => l.filter((_, n) => n !== i));
  }
  function moveQuestion(i: number, d: -1 | 1) {
    setQuestions((l) => {
      const j = i + d;
      if (j < 0 || j >= l.length) return l;
      const next = [...l];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  // The toolbar keeps focus in the textarea (onMouseDown preventDefault) so the
  // browser's own undo stack and caret are used, exactly like a word processor.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();
  const exec = (cmd: "undo" | "redo") => document.execCommand(cmd);
  function insertBlank(key: string) {
    const s = stimuli.find((x) => x.key === key);
    if (!s) return;
    const n = nextBlank(s.body, 1);
    document.execCommand("insertText", false, `[${n}]`);
  }

  const groups: { stim: EditStimulus | null; items: { q: EditQuestion; i: number }[] }[] = [
    ...stimuli.map((s) => ({ stim: s as EditStimulus | null, items: [] as { q: EditQuestion; i: number }[] })),
    { stim: null, items: [] },
  ];
  questions.forEach((q, i) => {
    const g = groups.find((x) => (x.stim?.key ?? "") === q.stimulusKey) ?? groups[groups.length - 1];
    g.items.push({ q, i });
  });

  const canSave = questions.length > 0 && !saving;

  return (
    <div className="mt-3 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={() => setShowRaw(!showRaw)}>
          {showRaw ? "Ẩn text gốc" : "Xem text gốc để đối chiếu / sao chép"}
        </button>
        <button type="button" className={btn} onClick={() => addStimulus()}>
          + Thêm bài đọc
        </button>
        <span className="text-xs text-[var(--muted-foreground)]">
          Gõ trực tiếp vào trang bài đọc; Ctrl+Z / Ctrl+Y để hoàn tác, dán từ text gốc được.
        </span>
      </div>
      {showRaw && (
        <pre className="max-h-72 select-text overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-xs text-[var(--foreground)]">
          {rawText || "(khối không có text gốc)"}
        </pre>
      )}

      {groups.map((g) => (
        <div key={g.stim?.key ?? "none"} className="space-y-3">
          {g.stim && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--background)]">
              <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-3 py-2">
                <span className="text-xs font-semibold text-[var(--muted-foreground)]">Bài {g.stim.key}</span>
                <select
                  aria-label="Loại bài"
                  value={g.stim.kind}
                  onChange={(e) => patchStimulus(g.stim!.key, { kind: e.target.value })}
                  className="rounded-md border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.5 text-xs"
                >
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
                <span className="mx-1 h-4 w-px bg-[var(--border)]" aria-hidden />
                <button type="button" className={btn} onMouseDown={keepFocus} onClick={() => exec("undo")} title="Hoàn tác (Ctrl+Z)">
                  ↶ Hoàn tác
                </button>
                <button type="button" className={btn} onMouseDown={keepFocus} onClick={() => exec("redo")} title="Làm lại (Ctrl+Y)">
                  ↷ Làm lại
                </button>
                <button
                  type="button"
                  className={btn}
                  onMouseDown={keepFocus}
                  disabled={focused !== `body:${g.stim.key}`}
                  onClick={() => insertBlank(g.stim!.key)}
                  title="Chèn ký hiệu chỗ trống [n] tại vị trí con trỏ"
                >
                  [n] Chèn chỗ trống
                </button>
                <button type="button" className={`${btn} ml-auto`} onClick={() => removeStimulus(g.stim!.key)}>
                  Xoá bài
                </button>
              </div>
              <div className="bg-white px-6 py-5 text-[var(--foreground)] dark:bg-[var(--background-1)]">
                <input
                  value={g.stim.title ?? ""}
                  onChange={(e) => patchStimulus(g.stim!.key, { title: e.target.value })}
                  placeholder="Tiêu đề (không bắt buộc)"
                  className="mb-2 w-full bg-transparent text-base font-semibold outline-none placeholder:font-normal"
                />
                <AutoText
                  value={g.stim.body}
                  onChange={(v) => patchStimulus(g.stim!.key, { body: v })}
                  placeholder="Nội dung bài đọc…"
                  onFocus={() => setFocused(`body:${g.stim!.key}`)}
                  onBlur={() => setFocused(null)}
                  className="min-h-[8rem] font-serif text-[15px] leading-8"
                />
                {g.stim.kind === "pair" && (
                  <div className="mt-3 border-t border-dashed border-[var(--border)] pt-3">
                    <p className="text-xs text-[var(--muted-foreground)]">Bài B</p>
                    <AutoText
                      value={g.stim.bodyB ?? ""}
                      onChange={(v) => patchStimulus(g.stim!.key, { bodyB: v })}
                      className="min-h-[4rem] font-serif text-[15px] leading-8"
                    />
                  </div>
                )}
                <div className="mt-3 border-t border-dashed border-[var(--border)] pt-2">
                  <p className="text-xs text-[var(--muted-foreground)]">Chú thích (注)</p>
                  <AutoText
                    value={g.stim.notes ?? ""}
                    onChange={(v) => patchStimulus(g.stim!.key, { notes: v })}
                    className="font-serif text-sm leading-7"
                  />
                </div>
              </div>
            </div>
          )}

          {g.items.map(({ q, i }) => (
            <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">Câu</span>
                <input
                  type="number"
                  min={1}
                  max={999}
                  inputMode="numeric"
                  aria-label="Số câu in trên đề"
                  title="Số thứ tự của câu như in trên đề (ví dụ 55)"
                  value={q.printedNo ?? ""}
                  placeholder={String(i + 1)}
                  onChange={(e) => patchQuestion(i, { printedNo: e.target.value === "" ? undefined : Number(e.target.value) })}
                  className="w-16 rounded-md border border-[var(--border)] bg-transparent px-1.5 py-0.5 text-sm"
                />
                <select
                  aria-label="Thuộc bài"
                  value={q.stimulusKey}
                  onChange={(e) => patchQuestion(i, { stimulusKey: e.target.value })}
                  className="rounded-md border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.5 text-xs"
                >
                  <option value="">Câu độc lập</option>
                  {stimuli.map((s) => (
                    <option key={s.key} value={s.key}>
                      Thuộc bài {s.key}
                    </option>
                  ))}
                </select>
                <button type="button" className={`${btn} ml-auto`} onClick={() => moveQuestion(i, -1)} disabled={i === 0} aria-label="Lên">
                  ↑
                </button>
                <button type="button" className={btn} onClick={() => moveQuestion(i, 1)} disabled={i === questions.length - 1} aria-label="Xuống">
                  ↓
                </button>
                <button type="button" className={btn} onClick={() => removeQuestion(i)}>
                  Xoá câu
                </button>
              </div>
              <div className="mt-2 rounded-md border border-[var(--border)] px-2 py-1.5">
                <AutoText
                  value={q.prompt}
                  onChange={(v) => patchQuestion(i, { prompt: v })}
                  placeholder="Đề / câu hỏi"
                  className="min-h-[1.75rem] text-[15px] leading-7"
                />
              </div>
              <ul className="mt-2 space-y-1.5">
                {q.options.map((o, oi) => (
                  <li key={oi} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`ans-${i}`}
                      checked={q.answer === oi + 1}
                      onChange={() => patchQuestion(i, { answer: oi + 1 })}
                      aria-label={`Đáp án đúng là phương án ${oi + 1}`}
                      title="Chọn làm đáp án đúng"
                    />
                    <span className="w-4 text-xs text-[var(--muted-foreground)]">{oi + 1}</span>
                    <input
                      value={o}
                      onChange={(e) =>
                        patchQuestion(i, { options: q.options.map((x, n) => (n === oi ? e.target.value : x)) })
                      }
                      className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-transparent px-2 py-1"
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {g.stim && (
            <button type="button" className={btn} onClick={() => addQuestion(g.stim!.key)}>
              + Thêm câu cho bài {g.stim.key}
            </button>
          )}
          {!g.stim && g.items.length === 0 && stimuli.length === 0 && questions.length === 0 && (
            <p className="text-sm text-[var(--muted-foreground)]">
              Khối chưa có nội dung. Thêm bài đọc (nếu có) và các câu hỏi, đối chiếu với text gốc ở trên.
            </p>
          )}
        </div>
      ))}
      <button type="button" className={btn} onClick={() => addQuestion("")}>
        + Thêm câu độc lập
      </button>

      {error && (
        <p role="alert" className="text-sm text-[#b91c1c]">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnPrimary} disabled={!canSave} onClick={() => onSave(stimuli, questions)}>
          {saving ? "Đang lưu…" : "Lưu chỉnh sửa"}
        </button>
        <button type="button" className={btn} disabled={saving} onClick={onCancel}>
          Huỷ
        </button>
      </div>
    </div>
  );
}
