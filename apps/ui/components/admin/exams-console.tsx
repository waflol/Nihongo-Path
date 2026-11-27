"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useConfirm } from "@/components/learn/use-confirm";
import { JLPT_LEVELS, LevelBadge } from "@/components/learn/level-select";
import { FormattedText } from "../rich-text";

/**
 * Admin exam authoring (P4-EXAM-09). Talks to the
 * `/api/admin/exams/…` gateway (the access token stays server-side; the API
 * enforces `@ContentAdmin`, so a non-admin gets 403 even if this gate were
 * bypassed — T-P2-04).
 *
 * Two surfaces:
 * - **Đề thi** — create / edit / publish / delete exams (settings + the
 *   question list picked from the bank + shuffle toggles).
 * - **Câu hỏi** — author standalone bank questions (deck/card = null) and
 *   browse the bank (learner-generated + standalone).
 */

interface BankQuestion {
  _id: string;
  kind: string;
  prompt: string;
  sub?: string;
  options: string[];
  answer: string;
  explain?: string;
  level?: string;
  source: string;
  standalone: boolean;
  createdAt: string;
}

interface AdminExam {
  _id: string;
  title: string;
  description?: string;
  examType?: string;
  year?: number | null;
  level?: string;
  timeLimitMin: number | null;
  shuffle: { questions: boolean; options: boolean };
  status: "DRAFT" | "PUBLISHED";
  questionIds: string[];
  questionCount: number;
  createdAt: string;
  updatedAt: string;
}

const KINDS: { value: string; label: string }[] = [
  { value: "kanji-pick", label: "問題2 Chọn chữ kanji" },
  { value: "reading-pick", label: "問題1 Cách đọc kanji" },
  { value: "meaning-pick", label: "Chọn nghĩa" },
  { value: "synonym-pick", label: "問題4 Đồng nghĩa" },
  { value: "sentence-pick", label: "問題6 Cách dùng từ" },
  { value: "formation-pick", label: "問題3 Cấu tạo từ" },
  { value: "context-pick", label: "問題5 Biểu hiện từ" },
];

const inputClass =
  "block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-focus)]";

const examTypeFamilies = ["JLPT", "NAT (Nattest)", "JFT", "Tự soạn"];

export function ExamsConsole() {
  const { confirm, dialog } = useConfirm();
  const [tab, setTab] = useState<"exams" | "questions">("exams");

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">Đề thi</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/learn/exams/structure"
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
          >
            Cấu trúc đề N5–N1
          </Link>
          <Link
            href="/admin/exams/import"
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
          >
            Nhập PDF / file nghe
          </Link>
        </div>
      </div>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Soạn đề từ ngân hàng câu hỏi 問題, đặt thời gian / xáo trộn / công
        khai. Người học làm đề tại <Link href="/learn/exams" className="font-medium text-[var(--primary)] hover:underline">Khu học · Đề thi</Link>.
      </p>

      <div className="mt-5 inline-flex flex-wrap rounded-xl border border-[var(--border)] bg-[var(--background-1)] p-0.5">
        {(
          [
            ["exams", "Đề thi"],
            ["questions", "Ngân hàng câu hỏi"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={tab === k}
            onClick={() => setTab(k)}
            className={
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors " +
              (tab === k
                ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]")
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5">{tab === "exams" ? <ExamsTab confirm={confirm} /> : <QuestionsTab />}</div>
    </div>
  );
}

// ── Exams tab ───────────────────────────────────────────────────────

function ExamsTab({ confirm }: { confirm: ReturnType<typeof useConfirm>["confirm"] }) {
  const [exams, setExams] = useState<AdminExam[]>([]);
  const [bank, setBank] = useState<BankQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form.
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState(examTypeFamilies[0]);
  const [newLevel, setNewLevel] = useState("");
  const [newYear, setNewYear] = useState("");
  const [newTime, setNewTime] = useState("");
  const [shuffleQ, setShuffleQ] = useState(true);
  const [shuffleO, setShuffleO] = useState(true);

  // Editing one exam's settings / question list / status.
  const [editing, setEditing] = useState<AdminExam | null>(null);
  const [editQuestions, setEditQuestions] = useState<string[]>([]);
  const [picker, setPicker] = useState("");
  const [pickerKind, setPickerKind] = useState("");
  const [pickerLevel, setPickerLevel] = useState("");
  const [saving, setSaving] = useState(false);
  const refetch = useCallback(async () => {
    setLoading(true);
    const [examsRes, bankRes] = await Promise.all([
      fetch("/api/admin/exams/exams", { cache: "no-store" }).catch(() => null),
      fetch("/api/admin/exams/exam-questions?limit=500", { cache: "no-store" }).catch(() => null),
    ]);
    if (!examsRes || !examsRes.ok) {
      setError(examsRes?.status === 403 ? "Tài khoản hiện tại không có quyền quản trị" : "Không tải được danh sách đề thi");
      setLoading(false);
      return;
    }
    setExams(((await examsRes.json().catch(() => [])) as AdminExam[]) ?? []);
    setBank(((await bankRes?.json().catch(() => [])) as BankQuestion[]) ?? []);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function createExam() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/exams/exams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newTitle.trim(),
        examType: newType.trim() || undefined,
        level: newLevel || undefined,
        year: newYear ? Number(newYear) : undefined,
        timeLimitMin: newTime ? Number(newTime) : undefined,
        shuffle: { questions: shuffleQ, options: shuffleO },
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res || !res.ok) {
      const data = (res ? (await res.json().catch(() => null)) : null) as { message?: string } | null;
      setError(data?.message ? `Lỗi: ${data.message}` : "Tạo đề thất bại");
      return;
    }
    setCreating(false);
    setNewTitle("");
    setNewYear("");
    setNewTime("");
    void refetch();
  }

  function openEditor(exam: AdminExam) {
    setEditing(exam);
    setEditQuestions([...(exam.questionIds ?? [])]);
  }

  async function saveExam(exam: AdminExam, patch: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/exams/exams/${exam._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => null);
    setSaving(false);
    if (!res || !res.ok) {
      const data = (res ? (await res.json().catch(() => null)) : null) as { message?: string } | null;
      setError(data?.message ? `Lỗi: ${data.message}` : "Cập nhật thất bại");
      return;
    }
    if (patch.status !== undefined) setEditing(null);
    void refetch();
  }

  async function removeExam(exam: AdminExam) {
    if (
      !(await confirm({
        title: "Xoá đề thi?",
        message: `"${exam.title}" sẽ bị xoá. Các kết quả người học đã làm vẫn được giữ (chúng lưu ảnh chụp tên đề).`,
        confirmLabel: "Xoá",
      }))
    )
      return;
    setSaving(true);
    const res = await fetch(`/api/admin/exams/exams/${exam._id}`, { method: "DELETE" }).catch(() => null);
    setSaving(false);
    if (!res || !res.ok) {
      setError("Xoá thất bại");
      return;
    }
    setEditing(null);
    void refetch();
  }

  const pickerResults = bank.filter(
    (q) =>
      (!picker || (q.prompt + " " + (q.sub ?? "")).toLowerCase().includes(picker.toLowerCase())) &&
      (!pickerKind || q.kind === pickerKind) &&
      (!pickerLevel || q.level === pickerLevel),
  );

  return (
    <div>
      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">
          {error}
        </p>
      )}

      {/* Create */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void createExam();
        }}
        className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-5"
      >
        <h2 className="text-sm font-semibold text-[var(--foreground)]">Tạo đề thi</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-5">
          <label className="block text-sm sm:col-span-2">
            <span className="text-[var(--muted-foreground)]">Tên đề (bắt buộc)</span>
            <input
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className={`mt-1 ${inputClass}`}
              placeholder="JLPT N5 — Từ vựng (20 đề)"
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--muted-foreground)]">Nhóm đề</span>
            <select value={newType} onChange={(e) => setNewType(e.target.value)} className={`mt-1 ${inputClass}`}>
              {examTypeFamilies.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <div className="block text-sm">
            <span className="text-[var(--muted-foreground)]">Cấp độ</span>
            <select value={newLevel} onChange={(e) => setNewLevel(e.target.value)} className={`mt-1 ${inputClass}`}>
              <option value="">—</option>
              {JLPT_LEVELS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <label className="block text-sm">
            <span className="text-[var(--muted-foreground)]">Năm</span>
            <input
              type="number"
              min={1990}
              max={2100}
              value={newYear}
              onChange={(e) => setNewYear(e.target.value)}
              className={`mt-1 ${inputClass}`}
              placeholder="2026"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="block text-sm">
            <span className="mr-1 text-[var(--muted-foreground)]">Thời gian (phút, bỏ trống = không giới hạn)</span>
            <input
              type="number"
              min={1}
              max={240}
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              className={`w-28 ${inputClass}`}
            />
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={shuffleQ} onChange={(e) => setShuffleQ(e.target.checked)} />
            Xáo câu hỏi
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={shuffleO} onChange={(e) => setShuffleO(e.target.checked)} />
            Xáo lựa chọn
          </label>
          <button
            type="submit"
            disabled={saving || newTitle.trim() === ""}
            className="ml-auto rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Tạo (bản nháp)
          </button>
        </div>
      </form>

      {/* List */}
      <div className="mt-5 space-y-3">
        {loading && (
          <p className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
            Đang tải…
          </p>
        )}
        {!loading && exams.length === 0 && (
          <p className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
            Chưa có đề thi nào. Tạo đề đầu tiên phía trên.
          </p>
        )}
        {exams.map((exam) => {
          const published = exam.status === "PUBLISHED";
          return (
            <div key={exam._id} className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold text-[var(--foreground)]">
                    {exam.title}
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-xs font-medium " +
                        (published ? "bg-[#f0fdf4] text-[#15803d]" : "bg-[#fef9c3] text-[#a16207]")
                      }
                    >
                      {published ? "Công khai" : "Bản nháp"}
                    </span>
                    {exam.level && <LevelBadge level={exam.level} />}
                  </h3>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    {exam.examType ? `${exam.examType}${exam.year ? ` · ${exam.year}` : ""} · ` : ""}
                    {exam.questionCount} câu · {exam.timeLimitMin ? `${exam.timeLimitMin} phút` : "không giới hạn"} · xáo{" "}
                    {exam.shuffle?.questions && exam.shuffle?.options ? "câu + lựa chọn" : exam.shuffle?.questions ? "câu" : exam.shuffle?.options ? "lựa chọn" : "tắt"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => openEditor(exam)}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)] disabled:opacity-60"
                  >
                    Sửa
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void saveExam(exam, { status: published ? "DRAFT" : "PUBLISHED" })}
                    title={published ? "Bỏ công khai" : "Công khai (người học làm được)"}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)] disabled:opacity-60"
                  >
                    {published ? "Gỡ công khai" : "Công khai"}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void removeExam(exam)}
                    className="rounded-lg border border-[var(--destructive)] px-3 py-1.5 text-xs font-medium text-[var(--destructive)] hover:bg-[#fef2f2] disabled:opacity-60"
                  >
                    Xoá
                  </button>
                </div>
              </div>

              {editing?._id === exam._id && (
                <ExamEditor
                  exam={exam}
                  picker={picker}
                  setPicker={setPicker}
                  pickerKind={pickerKind}
                  setPickerKind={setPickerKind}
                  pickerLevel={pickerLevel}
                  setPickerLevel={setPickerLevel}
                  pickerResults={pickerResults}
                  editQuestions={editQuestions}
                  setEditQuestions={setEditQuestions}
                  saving={saving}
                  onSave={(patch) => void saveExam(exam, patch)}
                  onClose={() => setEditing(null)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface EditorProps {
  exam: AdminExam;
  picker: string;
  setPicker: (v: string) => void;
  pickerKind: string;
  setPickerKind: (v: string) => void;
  pickerLevel: string;
  setPickerLevel: (v: string) => void;
  pickerResults: BankQuestion[];
  editQuestions: string[];
  setEditQuestions: (v: string[]) => void;
  saving: boolean;
  onSave: (patch: Record<string, unknown>) => void;
  onClose: () => void;
}

/** The expanded editor: settings + the question picker + save. */
function ExamEditor(props: EditorProps) {
  const {
    exam, picker, setPicker, pickerKind, setPickerKind, pickerLevel, setPickerLevel,
    pickerResults, editQuestions, setEditQuestions, saving, onSave, onClose,
  } = props;
  const selected = editQuestions;

  return (
    <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <label className="block text-sm">
          <span className="text-[var(--muted-foreground)]">Tên</span>
          <input
            defaultValue={exam.title}
            id={`exam-title-${exam._id}`}
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted-foreground)]">Cấp độ</span>
          <select
            defaultValue={exam.level ?? ""}
            id={`exam-level-${exam._id}`}
            className={`mt-1 ${inputClass}`}
          >
            <option value="">—</option>
            {JLPT_LEVELS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted-foreground)]">Thời gian (phút)</span>
          <input
            type="number"
            min={1}
            max={240}
            defaultValue={exam.timeLimitMin ?? ""}
            id={`exam-time-${exam._id}`}
            className={`mt-1 ${inputClass}`}
            placeholder="không giới hạn"
          />
        </label>
        <div className="block text-sm">
          <span className="text-[var(--muted-foreground)]">Xáo trộn</span>
          <div className="mt-1 flex gap-3 text-xs">
            <label className="flex items-center gap-1">
              <input type="checkbox" defaultChecked={exam.shuffle?.questions} id={`exam-sq-${exam._id}`} />
              Câu
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" defaultChecked={exam.shuffle?.options} id={`exam-so-${exam._id}`} />
              Lựa chọn
            </label>
          </div>
        </div>
      </div>

      {/* Question picker */}
      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
          Câu hỏi trong đề ({selected.length} đã chọn)
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={picker}
            onChange={(e) => setPicker(e.target.value)}
            placeholder="Tìm trong ngân hàng…"
            className={`w-56 ${inputClass}`}
          />
          <select value={pickerKind} onChange={(e) => setPickerKind(e.target.value)} className={`w-48 ${inputClass}`}>
            <option value="">Mọi dạng câu hỏi</option>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
          <select value={pickerLevel} onChange={(e) => setPickerLevel(e.target.value)} className={`w-28 ${inputClass}`}>
            <option value="">Mọi cấp</option>
            {JLPT_LEVELS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>

        <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
          {pickerResults.slice(0, 50).map((q) => {
            const chosen = selected.includes(q._id);
            return (
              <button
                key={q._id}
                type="button"
                aria-pressed={chosen}
                onClick={() =>
                  setEditQuestions(chosen ? selected.filter((x) => x !== q._id) : [...selected, q._id])
                }
                className={
                  "flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors " +
                  (chosen
                    ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]"
                    : "border-[var(--border)] hover:bg-[var(--layer-hover)]")
                }
              >
                <span aria-hidden className="mt-0.5 text-[var(--primary)]">{chosen ? "✓" : "○"}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-[var(--foreground)]" lang="ja"><FormattedText text={q.prompt} /></span>
                  <span className="ml-2 text-[var(--muted-foreground)]">
                    {KINDS.find((k) => k.value === q.kind)?.label?.replace(/^[^ ]+\s/, "") ?? q.kind}
                    {q.level ? ` · ${q.level}` : ""}
                    {q.standalone ? "" : " · (từ bài luyện)"}
                  </span>
                </span>
              </button>
            );
          })}
          {pickerResults.length === 0 && (
            <p className="rounded-lg border border-dashed border-[var(--border)] p-4 text-center text-xs text-[var(--muted-foreground)]">
              Không có câu hỏi phù hợp. Tạo ở tab “Ngân hàng câu hỏi”.
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          Huỷ
        </button>
        <button
          type="button"
          disabled={saving || selected.length === 0}
          onClick={() => {
            const title = (document.getElementById(`exam-title-${exam._id}`) as HTMLInputElement | null)?.value ?? exam.title;
            const level = (document.getElementById(`exam-level-${exam._id}`) as HTMLSelectElement | null)?.value ?? exam.level;
            const timeRaw = (document.getElementById(`exam-time-${exam._id}`) as HTMLInputElement | null)?.value;
            const sq = (document.getElementById(`exam-sq-${exam._id}`) as HTMLInputElement | null)?.checked;
            const so = (document.getElementById(`exam-so-${exam._id}`) as HTMLInputElement | null)?.checked;
            onSave({
              title: title.trim() || undefined,
              level: level || undefined,
              timeLimitMin: timeRaw === "" ? undefined : Number(timeRaw),
              clearTimeLimit: timeRaw === "",
              shuffle: { questions: sq !== false, options: so !== false },
              questionIds: selected,
            });
          }}
          className="rounded-lg bg-[var(--primary)] px-4 py-1.5 text-xs font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Đang lưu…" : "Lưu đề"}
        </button>
      </div>
    </div>
  );
}

// ── Questions tab ───────────────────────────────────────────────────

function QuestionsTab() {
  const [rows, setRows] = useState<BankQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState("");
  const [standaloneOnly, setStandaloneOnly] = useState(false);
  const [search, setSearch] = useState("");

  // Author form.
  const [kind, setKind] = useState(KINDS[1].value);
  const [prompt, setPrompt] = useState("");
  const [sub, setSub] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [answer, setAnswer] = useState(0);
  const [explain, setExplain] = useState("");
  const [qLevel, setQLevel] = useState("");
  const [saving, setSaving] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (kindFilter) qs.set("kind", kindFilter);
    if (standaloneOnly) qs.set("standalone", "true");
    qs.set("limit", "300");
    const res = await fetch(`/api/admin/exams/exam-questions?${qs}`, { cache: "no-store" }).catch(() => null);
    if (!res || !res.ok) {
      setError("Không tải được ngân hàng câu hỏi");
      setLoading(false);
      return;
    }
    setRows(((await res.json().catch(() => [])) as BankQuestion[]) ?? []);
    setLoading(false);
  }, [kindFilter, standaloneOnly]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function author() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/exams/exam-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        prompt: prompt.trim(),
        sub: sub.trim() || undefined,
        options: options.map((o) => o.trim()),
        answer: options[answer]?.trim() ?? "",
        explain: explain.trim() || undefined,
        level: qLevel || undefined,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res || !res.ok) {
      const data = (res ? (await res.json().catch(() => null)) : null) as { message?: string } | null;
      setError(data?.message ? `Lỗi: ${data.message}` : "Lưu câu hỏi thất bại");
      return;
    }
    setPrompt("");
    setSub("");
    setOptions(["", "", "", ""]);
    setExplain("");
    void refetch();
  }

  const valid =
    prompt.trim().length > 0 &&
    options.every((o) => o.trim().length > 0) &&
    new Set(options.map((o) => o.trim())).size === 4;

  const shown = rows.filter(
    (q) =>
      (!search || (q.prompt + " " + (q.sub ?? "")).toLowerCase().includes(search.toLowerCase())) ||
      search === "",
  );

  return (
    <div>
      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">
          {error}
        </p>
      )}

      {/* Author form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void author();
        }}
        className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-5"
      >
        <h2 className="text-sm font-semibold text-[var(--foreground)]">Tạo câu hỏi (độc lập, không gắn bộ thẻ)</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-[var(--muted-foreground)]">Dạng câu</span>
            <select value={kind} onChange={(e) => setKind(e.target.value)} className={`mt-1 ${inputClass}`}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--muted-foreground)]">Cấp độ</span>
            <select value={qLevel} onChange={(e) => setQLevel(e.target.value)} className={`mt-1 ${inputClass}`}>
              <option value="">—</option>
              {JLPT_LEVELS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--muted-foreground)]">Câu hỏi / tiêu đề (bắt buộc)</span>
            <input value={prompt} onChange={(e) => setPrompt(e.target.value)} className={`mt-1 ${inputClass}`} placeholder="猫" lang="ja" />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--muted-foreground)]">Gợi ý (nghĩa tiếng Việt…)</span>
            <input value={sub} onChange={(e) => setSub(e.target.value)} className={`mt-1 ${inputClass}`} placeholder="con mèo" />
          </label>
        </div>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
          4 lựa chọn (đánh dấu đáp án đúng)
        </p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name="exam-answer"
                checked={answer === i}
                onChange={() => setAnswer(i)}
                aria-label={`Đáp án: lựa chọn ${i + 1}`}
                className="size-4 accent-[var(--primary)]"
              />
              <input
                value={opt}
                onChange={(e) => setOptions((os) => os.map((x, j) => (j === i ? e.target.value : x)))}
                className={inputClass}
                placeholder={`Lựa chọn ${"ABCD"[i]}`}
                lang="ja"
              />
            </div>
          ))}
        </div>
        <label className="mt-3 block text-sm">
          <span className="text-[var(--muted-foreground)]">Giải thích (hiện sau khi nộp)</span>
          <textarea value={explain} onChange={(e) => setExplain(e.target.value)} rows={2} className={`mt-1 ${inputClass}`} />
        </label>
        <button
          type="submit"
          disabled={saving || !valid}
          title={valid ? undefined : "Cần tiêu đề + 4 lựa chọn khác nhau"}
          className="mt-3 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Đang lưu…" : "Lưu câu hỏi"}
        </button>
      </form>

      {/* Bank list */}
      <div className="mt-5">
        <div className="flex flex-wrap items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm câu hỏi…" className={`w-56 ${inputClass}`} />
          <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className={`w-48 ${inputClass}`}>
            <option value="">Mọi dạng</option>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-[var(--muted-foreground)]">
            <input
              type="checkbox"
              checked={standaloneOnly}
              onChange={(e) => setStandaloneOnly(e.target.checked)}
            />
            Chỉ câu tự soạn
          </label>
        </div>

        <div className="mt-3 space-y-2">
          {loading && (
            <p className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
              Đang tải…
            </p>
          )}
          {!loading && shown.length === 0 && (
            <p className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
              Chưa có câu hỏi phù hợp.
            </p>
          )}
          {shown.slice(0, 100).map((q) => (
            <div key={q._id} className="rounded-xl border border-[var(--border)] bg-[var(--background-1)] p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-[var(--foreground)]" lang="ja"><FormattedText text={q.prompt} /></span>
                {q.sub && <span className="text-[var(--muted-foreground)]">{q.sub}</span>}
                {q.level && <LevelBadge level={q.level} />}
                <span className="rounded-full bg-[var(--layer)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">
                  {q.standalone ? "tự soạn" : "từ bài luyện"}
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Đáp án: <span className="font-semibold text-[#15803d]">{q.answer}</span>
                {q.explain ? ` · ${q.explain}` : ""}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
