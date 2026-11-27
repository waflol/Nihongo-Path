"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/learn/use-confirm";
import { JLPT_LEVELS, LevelBadge } from "@/components/learn/level-select";
import { ExamEditor } from "./exam-admin-editor";
import { adminCall, btn, btnPrimary, inputClass, KIND_LABEL, type AdminExam } from "./exam-admin-model";

/**
 * Admin exams (P4-EXAM-09, plan-exam-by-source). Talks to the
 * `/api/admin/exams/…` gateway (the access token stays server-side; the API
 * enforces `@ContentAdmin`, so a non-admin gets 403 even if this gate were
 * bypassed — T-P2-04).
 *
 * Exams come from imported files, or are composed by hand: every question
 * belongs to one exam.
 */

const FILTERS = [
  { key: "", label: "Tất cả" },
  { key: "full", label: "Đầy đủ" },
  { key: "section", label: "Theo phần" },
  { key: "hand", label: "Soạn tay" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

const chip = "rounded-full px-2 py-0.5 text-xs font-medium";

export function ExamsConsole() {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [exams, setExams] = useState<AdminExam[] | null>(null);
  const [filter, setFilter] = useState<Filter>("");
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await adminCall<AdminExam[]>("exams");
    if ("error" in r) setError(r.error);
    else setExams(r.data);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  /** A change from the list itself; its refusal is shown above the list. */
  async function change<T>(path: string, method: string, body?: object): Promise<T | null> {
    setBusy(true);
    setError(null);
    const r = await adminCall<T>(path, method, body);
    setBusy(false);
    if ("error" in r) {
      setError(r.error);
      return null;
    }
    await load();
    return r.data;
  }

  async function remove(exam: AdminExam) {
    const rebuilt = exam.origin ? " Xuất bản thêm một khối của kỳ thi này sẽ dựng lại đề." : "";
    if (
      !(await confirm({
        title: "Xoá đề thi?",
        message: `"${exam.title}" sẽ bị xoá. Các kết quả người học đã làm vẫn được giữ.${rebuilt}`,
        confirmLabel: "Xoá",
      }))
    )
      return;
    await change(`exams/${exam._id}`, "DELETE");
  }

  /** Sit the exam as it is (an admin may sit drafts and reference exams). */
  async function tryOut(exam: AdminExam) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/exams/${exam._id}/start`, { method: "POST" }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { attemptId?: string; message?: string } | null;
    if (res?.ok && data?.attemptId) {
      router.push(`/learn/exams/${data.attemptId}`);
      return;
    }
    setBusy(false);
    setError(data?.message ?? "Không bắt đầu được đề thi");
  }

  const shown = (exams ?? []).filter((e) => !filter || (filter === "hand" ? !e.origin : e.kind === filter));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">Đề thi</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/learn/exams/structure" className={`inline-flex items-center ${btn}`}>
            Cấu trúc đề N5–N1
          </Link>
          <Link href="/admin/exams/import" className={`inline-flex items-center ${btnPrimary}`}>
            Nhập đề từ PDF
          </Link>
        </div>
      </div>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Đề được dựng khi xuất bản bản nháp của một file đã nhập, hoặc soạn tay. Người học làm đề tại{" "}
        <Link href="/learn/exams" className="font-medium text-[var(--primary)] hover:underline">
          Khu học · Đề thi
        </Link>
        .
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">
          {error}
        </p>
      )}

      <CreateExam busy={busy} onCreate={async (body) => {
        const made = await change<{ id: string }>("exams", "POST", body);
        if (made) {
          setFilter("");
          setOpen(made.id);
        }
        return !!made;
      }} />

      <div role="group" aria-label="Loại đề" className="mt-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={filter === f.key ? btnPrimary : btn}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {shown.length === 0 && (
          <p className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
            {exams === null ? (error ? "Không tải được danh sách đề thi." : "Đang tải…") : "Chưa có đề thi nào ở mục này."}
          </p>
        )}
        {shown.map((exam) => {
          const published = exam.status === "PUBLISHED";
          const reference = exam.rights === "reference";
          const expanded = open === exam._id;
          return (
            <article key={exam._id} className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-[var(--foreground)]">
                    {exam.title}
                    <span className={`${chip} ${published ? "bg-[#f0fdf4] text-[#15803d]" : "bg-[#fef9c3] text-[#a16207]"}`}>
                      {published ? "Công khai" : "Bản nháp"}
                    </span>
                    <span className={`${chip} bg-[var(--layer)] text-[var(--muted-foreground)]`}>
                      {exam.kind ? KIND_LABEL[exam.kind] : "Soạn tay"}
                    </span>
                    {reference && <span className={`${chip} bg-[#fef2f2] text-[#b91c1c]`}>Tham khảo</span>}
                    {exam.level && <LevelBadge level={exam.level} />}
                  </h2>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    {exam.origin ? `${exam.origin.setName} · ${exam.origin.sitting} · ` : ""}
                    {exam.questionCount} câu · {exam.timeLimitMin ? `${exam.timeLimitMin} phút` : "không giới hạn"}
                  </p>
                  {exam.warnings.length > 0 && (
                    <details className="mt-2 text-xs text-[#a16207]">
                      <summary className="cursor-pointer font-medium">{exam.warnings.length} cảnh báo</summary>
                      <ul className="mt-1 list-disc space-y-0.5 pl-5">
                        {exam.warnings.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : exam._id)} className={btn}>
                    {expanded ? "Đóng" : "Sửa"}
                  </button>
                  <button type="button" disabled={busy || exam.questionCount === 0} onClick={() => void tryOut(exam)} className={btn}>
                    Làm thử
                  </button>
                  <button
                    type="button"
                    disabled={busy || (!published && (reference || exam.questionCount === 0))}
                    title={!published && reference ? "Đề nguồn tham khảo không công khai được" : undefined}
                    onClick={() => void change(`exams/${exam._id}`, "PATCH", { status: published ? "DRAFT" : "PUBLISHED" })}
                    className={btn}
                  >
                    {published ? "Gỡ công khai" : "Công khai"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void remove(exam)}
                    className="min-h-9 rounded-lg border border-[var(--destructive)] px-3 py-1.5 text-xs font-medium text-[var(--destructive)] hover:bg-[#fef2f2] disabled:opacity-60"
                  >
                    Xoá
                  </button>
                </div>
              </div>
              {/* Re-mounted when the exam changes shape, so the fields show what is stored. */}
              {expanded && <ExamEditor key={exam._id} exam={exam} onSaved={load} />}
            </article>
          );
        })}
      </div>
    </div>
  );
}

/** Start a hand-composed exam; its questions are written once it is open. */
function CreateExam({ busy, onCreate }: { busy: boolean; onCreate: (body: object) => Promise<boolean> }) {
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState("");

  return (
    <details className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4 sm:p-5">
      <summary className="cursor-pointer text-sm font-semibold text-[var(--foreground)]">Soạn đề bằng tay</summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await onCreate({ title: title.trim(), level: level || undefined })) setTitle("");
        }}
        className="mt-3 flex flex-wrap items-end gap-3"
      >
        <label className="block min-w-0 flex-1 basis-56 text-sm">
          <span className="text-[var(--muted-foreground)]">Tên đề</span>
          <input required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className={`mt-1 ${inputClass}`} />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted-foreground)]">Cấp độ</span>
          <select value={level} onChange={(e) => setLevel(e.target.value)} className={`mt-1 ${inputClass}`}>
            <option value="">—</option>
            {JLPT_LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={busy || !title.trim()} className={btnPrimary}>
          Tạo bản nháp
        </button>
      </form>
    </details>
  );
}
