"use client";

import { useCallback, useEffect, useState } from "react";
import { JLPT_LEVELS } from "@/components/learn/level-select";
import { MONDAI_LABELS } from "@/components/learn/exam-sectioned";
import { FormattedText } from "../rich-text";
import { adminCall, btn, btnPrimary, inputClass, type AdminExam } from "./exam-admin-model";

interface Question {
  _id: string;
  kind: string;
  mondai?: string;
  prompt: string;
  options: string[];
  answer: string;
  explain?: string;
}

const KINDS: { value: string; label: string }[] = [
  { value: "reading-pick", label: "問題1 Cách đọc kanji" },
  { value: "kanji-pick", label: "問題2 Chọn chữ kanji" },
  { value: "formation-pick", label: "問題3 Cấu tạo từ" },
  { value: "synonym-pick", label: "問題4 Đồng nghĩa" },
  { value: "context-pick", label: "問題5 Biểu hiện từ" },
  { value: "sentence-pick", label: "問題6 Cách dùng từ" },
  { value: "meaning-pick", label: "Chọn nghĩa" },
  { value: "grammar-form", label: "Ngữ pháp: chọn dạng" },
  { value: "star-order", label: "Ngữ pháp: sắp xếp câu ★" },
];

/**
 * One exam, opened. An imported exam is rebuilt from its drafts, so only its
 * title and part times change here; a hand-composed one also takes questions.
 */
export function ExamEditor({ exam, onSaved }: { exam: AdminExam; onSaved: () => Promise<void> }) {
  const sectional = exam.sections.length > 0;
  const fixed = sectional || !!exam.origin;
  const [title, setTitle] = useState(exam.title);
  const [level, setLevel] = useState(exam.level ?? "");
  const [time, setTime] = useState(exam.timeLimitMin?.toString() ?? "");
  const [shuffle, setShuffle] = useState(exam.shuffle);
  /** Only the part times the admin typed: an untouched part stays automatic. */
  const [partTimes, setPartTimes] = useState<Record<string, string>>({});
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadQuestions = useCallback(async () => {
    const r = await adminCall<Question[]>(`exams/${exam._id}/questions`);
    if ("error" in r) setError(r.error);
    else setQuestions(r.data);
  }, [exam._id]);

  useEffect(() => {
    const t = setTimeout(() => void loadQuestions(), 0);
    return () => clearTimeout(t);
  }, [loadQuestions, exam.questionCount]);

  async function patch(body: object) {
    setSaving(true);
    setError(null);
    const r = await adminCall(`exams/${exam._id}`, "PATCH", body);
    setSaving(false);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    setPartTimes({});
    await onSaved();
    await loadQuestions();
  }

  function save() {
    const sectionTimes = Object.fromEntries(
      Object.entries(partTimes)
        .filter(([, v]) => v !== "")
        .map(([k, v]) => [k, Number(v)]),
    );
    void patch({
      title: title.trim() || undefined,
      shuffle,
      ...(!exam.origin && level ? { level } : {}),
      ...(sectional
        ? Object.keys(sectionTimes).length > 0
          ? { sectionTimes }
          : {}
        : time === ""
          ? { clearTimeLimit: true }
          : { timeLimitMin: Number(time) }),
    });
  }

  return (
    <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-[#fef2f2] px-3 py-2 text-sm text-[#b91c1c]">
          {error}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <label className="block text-sm sm:col-span-2">
            <span className="text-[var(--muted-foreground)]">Tên</span>
            <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className={`mt-1 ${inputClass}`} />
          </label>
          {!exam.origin && (
            <label className="block text-sm">
              <span className="text-[var(--muted-foreground)]">Cấp độ</span>
              <select value={level} onChange={(e) => setLevel(e.target.value)} className={`mt-1 ${inputClass}`}>
                <option value="">—</option>
                {JLPT_LEVELS.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
          )}
          {!sectional && (
            <label className="block text-sm">
              <span className="text-[var(--muted-foreground)]">Thời gian (phút)</span>
              <input
                type="number"
                min={1}
                max={240}
                value={time}
                onChange={(e) => setTime(e.target.value)}
                placeholder="không giới hạn"
                className={`mt-1 ${inputClass}`}
              />
            </label>
          )}
        </div>

        {sectional && (
          <fieldset className="mt-3">
            <legend className="text-sm text-[var(--muted-foreground)]">Thời gian từng phần (phút)</legend>
            <ul className="mt-1 space-y-2">
              {exam.sections.map((s) => (
                <li key={s.key} className="flex flex-wrap items-center gap-3 text-sm">
                  <input
                    type="number"
                    min={1}
                    max={240}
                    aria-label={`Thời gian phần ${s.title ?? s.key}`}
                    value={partTimes[s.key] ?? s.timeLimitMin?.toString() ?? ""}
                    onChange={(e) => setPartTimes((m) => ({ ...m, [s.key]: e.target.value }))}
                    className={`!w-24 ${inputClass}`}
                  />
                  <span className="text-[var(--foreground)]" lang="ja">
                    {s.title ?? s.key}
                  </span>
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {s.questionCount} câu · {s.timeLocked ? "đã chỉnh tay" : "tự tính"}
                  </span>
                </li>
              ))}
            </ul>
          </fieldset>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={shuffle.questions} onChange={(e) => setShuffle({ ...shuffle, questions: e.target.checked })} />
            Xáo câu hỏi
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={shuffle.options} onChange={(e) => setShuffle({ ...shuffle, options: e.target.checked })} />
            Xáo lựa chọn
          </label>
          <button type="submit" disabled={saving} className={`ml-auto ${btnPrimary}`}>
            {saving ? "Đang lưu…" : "Lưu đề"}
          </button>
        </div>
      </form>

      <div className="mt-5">
        <h4 className="text-sm font-semibold text-[var(--foreground)]">Câu hỏi ({exam.questionCount})</h4>
        {fixed && (
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Danh sách câu được dựng từ bản nháp đã xuất bản. Thêm hoặc sửa câu ở màn duyệt bản nháp.
          </p>
        )}
        {questions === null ? (
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">Đang tải…</p>
        ) : (
          <ol className="mt-2 max-h-96 space-y-1.5 overflow-y-auto">
            {questions.map((q, i) => (
              <li key={q._id} className="flex items-start gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
                <span className="w-7 shrink-0 tabular-nums text-[var(--muted-foreground)]">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[var(--foreground)]" lang="ja">
                    <FormattedText text={q.prompt} />
                  </span>
                  <span className="block text-xs text-[var(--muted-foreground)]">
                    {q.mondai ? `${MONDAI_LABELS[q.mondai] ?? q.mondai} · ` : ""}Đáp án:{" "}
                    <span className="font-semibold text-[#15803d]" lang="ja">
                      <FormattedText text={q.answer} />
                    </span>
                  </span>
                </span>
                {!fixed && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void patch({ questionIds: exam.questionIds.filter((id) => id !== q._id) })}
                    className={btn}
                  >
                    Bỏ
                  </button>
                )}
              </li>
            ))}
            {questions.length === 0 && <li className="text-sm text-[var(--muted-foreground)]">Đề chưa có câu nào.</li>}
          </ol>
        )}
      </div>

      {!fixed && (
        <QuestionForm
          examId={exam._id}
          onAdded={async () => {
            await onSaved();
            await loadQuestions();
          }}
        />
      )}
    </div>
  );
}

/** Write one question into a hand-composed exam. */
function QuestionForm({ examId, onAdded }: { examId: string; onAdded: () => Promise<void> }) {
  const [kind, setKind] = useState(KINDS[0].value);
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [answer, setAnswer] = useState(0);
  const [explain, setExplain] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = options.map((o) => o.trim());
  const valid = prompt.trim() !== "" && trimmed.every(Boolean) && new Set(trimmed).size === 4;

  async function add() {
    setSaving(true);
    setError(null);
    const r = await adminCall(`exams/${examId}/questions`, "POST", {
      kind,
      prompt: prompt.trim(),
      options: trimmed,
      answer: trimmed[answer],
      explain: explain.trim() || undefined,
    });
    setSaving(false);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    setPrompt("");
    setOptions(["", "", "", ""]);
    setAnswer(0);
    setExplain("");
    await onAdded();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) void add();
      }}
      className="mt-4 border-t border-[var(--border)] pt-4"
    >
      <h4 className="text-sm font-semibold text-[var(--foreground)]">Soạn câu mới</h4>
      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-[#fef2f2] px-3 py-2 text-sm text-[#b91c1c]">
          {error}
        </p>
      )}
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="text-[var(--muted-foreground)]">Dạng câu</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={`mt-1 ${inputClass}`}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-[var(--muted-foreground)]">Câu hỏi</span>
          <input value={prompt} maxLength={400} onChange={(e) => setPrompt(e.target.value)} lang="ja" className={`mt-1 ${inputClass}`} />
        </label>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name={`answer-${examId}`}
              checked={answer === i}
              onChange={() => setAnswer(i)}
              aria-label={`Đáp án: lựa chọn ${i + 1}`}
              className="size-4 accent-[var(--primary)]"
            />
            <input
              value={opt}
              maxLength={400}
              onChange={(e) => setOptions((os) => os.map((x, j) => (j === i ? e.target.value : x)))}
              aria-label={`Lựa chọn ${i + 1}`}
              placeholder={`Lựa chọn ${i + 1}`}
              lang="ja"
              className={inputClass}
            />
          </div>
        ))}
      </div>
      <label className="mt-2 block text-sm">
        <span className="text-[var(--muted-foreground)]">Giải thích (hiện sau khi nộp)</span>
        <textarea value={explain} maxLength={400} onChange={(e) => setExplain(e.target.value)} rows={2} className={`mt-1 ${inputClass}`} />
      </label>
      <button type="submit" disabled={saving || !valid} title={valid ? undefined : "Cần câu hỏi và 4 lựa chọn khác nhau"} className={`mt-3 ${btnPrimary}`}>
        {saving ? "Đang lưu…" : "Thêm vào đề"}
      </button>
    </form>
  );
}
