"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface ParsedStimulus {
  key: string;
  kind: string;
  title?: string;
  body: string;
  bodyB?: string;
}
interface ParsedQuestion {
  no: number;
  prompt: string;
  options: string[];
  stimulusKey?: string;
}
interface Draft {
  _id: string;
  blockIndex: number;
  sitting: string;
  mondai?: string | null;
  section: string;
  instruction: string;
  rawText: string;
  parsed?: { stimuli?: ParsedStimulus[]; questions?: ParsedQuestion[] };
  answers: number[];
  issues: string[];
  status: "needs_review" | "error" | "published" | "discarded";
}
interface Job {
  fileName: string;
  level: string;
  status: string;
}

const STATUS: Record<Draft["status"], { label: string; cls: string }> = {
  needs_review: { label: "Cần duyệt", cls: "bg-[#f59e0b]/15 text-[#b45309]" },
  error: { label: "Lỗi đọc", cls: "bg-[#ef4444]/15 text-[#b91c1c]" },
  published: { label: "Đã xuất bản", cls: "bg-[#22c55e]/15 text-[#15803d]" },
  discarded: { label: "Đã loại", cls: "bg-[var(--background-2,transparent)] text-[var(--muted-foreground)]" },
};
const btn =
  "rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--background-1)] disabled:cursor-not-allowed disabled:opacity-60";
const btnPrimary =
  "rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60";

async function errorOf(res: Response): Promise<string> {
  const b = (await res.json().catch(() => null)) as { message?: string | string[]; error?: string } | null;
  const m = b?.message ?? b?.error;
  return Array.isArray(m) ? m.join("; ") : (m ?? `Lỗi ${res.status}`);
}

/** Review screen of one exam-PDF import (NP-407): check each 問題 block, type the printed answers, publish or discard. */
export function ExamImportDrafts({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const [dr, lr] = await Promise.all([
      fetch(`/api/exam-import?drafts=${encodeURIComponent(jobId)}`, { cache: "no-store" }).catch(() => null),
      fetch(`/api/exam-import?log=${encodeURIComponent(jobId)}`, { cache: "no-store" }).catch(() => null),
    ]);
    if (!dr?.ok) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setDrafts((await dr.json()) as Draft[]);
    const body = lr?.ok ? ((await lr.json().catch(() => null)) as { job?: Job } | null) : null;
    if (body?.job) setJob(body.job);
  }, [jobId]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const shown = (drafts ?? []).filter((d) => filter === "all" || d.status === "needs_review" || d.status === "error");
  const counts = (drafts ?? []).reduce<Record<string, number>>((m, d) => ({ ...m, [d.status]: (m[d.status] ?? 0) + 1 }), {});

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-8 sm:px-6">
      <Link href="/admin/exams/import" className="text-xs font-medium text-[var(--primary)] hover:underline">
        ← Quay lại nhập đề
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">Duyệt bản nháp đề</h1>
        <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
          {job ? `${job.level} · ${job.fileName} · ` : ""}
          Đối chiếu với text gốc, điền đáp án theo bảng 答案 rồi xuất bản. Không có đáp án thì không xuất bản được.
        </p>
      </div>

      {drafts && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--muted-foreground)]">
          <span>
            {drafts.length} khối · cần duyệt {counts.needs_review ?? 0} · lỗi {counts.error ?? 0} · xuất bản {counts.published ?? 0} · loại {counts.discarded ?? 0}
          </span>
          <button type="button" className={`${btn} ml-auto`} onClick={() => setFilter(filter === "open" ? "all" : "open")}>
            {filter === "open" ? "Hiện cả khối đã xử lý" : "Chỉ khối chưa xử lý"}
          </button>
          <button type="button" className={btn} onClick={() => void load()}>
            Tải lại
          </button>
        </div>
      )}

      {failed && <p className="text-sm text-[#b91c1c]">Không tải được bản nháp (cần quyền admin nội dung).</p>}
      {drafts === null && !failed && <p className="text-sm text-[var(--muted-foreground)]">Đang tải…</p>}
      {drafts && shown.length === 0 && (
        <p className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4 text-sm text-[var(--muted-foreground)]">
          {drafts.length === 0
            ? "Lần nhập này chưa tạo bản nháp nào. Nếu job còn chạy, đợi xong rồi bấm Tải lại; nếu job đã xong, xem log để biết lý do."
            : "Không còn khối nào cần duyệt."}
        </p>
      )}
      {shown.map((d) => (
        <DraftCard key={d._id} draft={d} onChanged={load} />
      ))}
    </div>
  );
}

function DraftCard({ draft, onChanged }: { draft: Draft; onChanged: () => Promise<void> }) {
  const questions = draft.parsed?.questions ?? [];
  const stimuli = draft.parsed?.stimuli ?? [];
  const [answers, setAnswers] = useState<number[]>(() => {
    const a: number[] = [];
    for (const q of questions) a[q.no - 1] = draft.answers[q.no - 1] ?? 0;
    return a;
  });
  const [raw, setRaw] = useState(draft.status === "error");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const open = draft.status === "needs_review" || draft.status === "error";
  const missing = questions.filter((q) => !(answers[q.no - 1] > 0)).length;
  const st = STATUS[draft.status];

  async function act(kind: "publish" | "discard") {
    if (kind === "discard" && !window.confirm("Loại khối này? Bạn không nhập khối này vào ngân hàng câu hỏi.")) return;
    setBusy(true);
    setMsg(null);
    const filled = Array.from({ length: Math.max(0, ...questions.map((q) => q.no)) }, (_, i) => answers[i] ?? 0);
    const res = await fetch(`/api/exam-import?${kind}=${draft._id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(kind === "publish" ? { answers: filled } : {}),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setMsg({ ok: false, text: res ? await errorOf(res) : "Không kết nối được máy chủ" });
      return;
    }
    await onChanged();
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-[var(--foreground)]">
          #{draft.blockIndex + 1} · {draft.mondai ?? "dạng chưa nhận ra"} · {draft.sitting}
        </h2>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
        <span className="text-xs text-[var(--muted-foreground)]">{questions.length} câu</span>
      </div>
      {draft.instruction && <p className="mt-1 text-sm text-[var(--muted-foreground)]">{draft.instruction}</p>}

      {draft.issues.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-[#b91c1c]">
          {draft.issues.map((i, n) => (
            <li key={n}>{i}</li>
          ))}
        </ul>
      )}

      {stimuli.map((s) => (
        <div key={s.key} className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-sm">
          <p className="text-xs font-medium text-[var(--muted-foreground)]">
            Bài dùng chung {s.key} ({s.kind}){s.title ? ` · ${s.title}` : ""}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-[var(--foreground)]">{s.body}</p>
          {s.bodyB && <p className="mt-2 whitespace-pre-wrap text-[var(--foreground)]">{s.bodyB}</p>}
        </div>
      ))}

      <ol className="mt-3 space-y-3">
        {questions.map((q) => (
          <li key={q.no} className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-sm">
            <p className="whitespace-pre-wrap text-[var(--foreground)]">
              <span className="font-semibold">{q.no}.</span> {q.prompt}
              {q.stimulusKey && <span className="ml-2 text-xs text-[var(--muted-foreground)]">({q.stimulusKey})</span>}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {q.options.map((o, i) => {
                const picked = answers[q.no - 1] === i + 1;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!open || busy}
                    aria-pressed={picked}
                    onClick={() => setAnswers((a) => Object.assign([...a], { [q.no - 1]: picked ? 0 : i + 1 }))}
                    className={`rounded-lg border px-2.5 py-1 text-left ${
                      picked
                        ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] font-semibold"
                        : "border-[var(--border)] hover:bg-[var(--background-1)]"
                    } disabled:cursor-default`}
                  >
                    {i + 1}. {o}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={() => setRaw(!raw)}>
          {raw ? "Ẩn text gốc" : "Xem text gốc"}
        </button>
        {open && (
          <>
            <button type="button" className={`${btn} ml-auto`} disabled={busy} onClick={() => void act("discard")}>
              Loại
            </button>
            <button
              type="button"
              className={btnPrimary}
              disabled={busy || questions.length === 0 || missing > 0}
              title={missing > 0 ? `Còn ${missing} câu chưa chọn đáp án` : undefined}
              onClick={() => void act("publish")}
            >
              {busy ? "Đang xử lý…" : missing > 0 ? `Còn ${missing} câu chưa có đáp án` : "Xuất bản"}
            </button>
          </>
        )}
      </div>
      {msg && (
        <p role="status" className={`mt-2 text-sm ${msg.ok ? "text-[var(--muted-foreground)]" : "text-[#b91c1c]"}`}>
          {msg.text}
        </p>
      )}
      {raw && (
        <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-xs text-[var(--foreground)]">
          {draft.rawText}
        </pre>
      )}
    </section>
  );
}
