"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EXAM_IMPORT_STARTED_EVENT } from "@/components/admin/exam-import-tracker";

interface LogLine {
  at: string;
  level: "info" | "warn" | "error";
  msg: string;
}
interface Job {
  _id: string;
  fileName: string;
  level: string;
  status: "running" | "done" | "error" | "cancelled";
  phase?: string;
  numPages: number;
  pagesDone: number;
  blocksFound: number;
  blocksOk: number;
  blocksError: number;
  error?: string;
  createdAt?: string;
  finishedAt?: string;
}

/** Log page of one exam-PDF import: progress, counters and the full event log (same layout as the vocabulary check log). */
export function ExamImportLogPanel({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "warn" | "error">("all");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<() => Promise<void>>(async () => {});

  const poll = useCallback(async () => {
    const res = await fetch(`/api/exam-import?log=${encodeURIComponent(jobId)}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) {
      setError(true);
      return;
    }
    const body = (await res.json().catch(() => null)) as { job?: Job; log?: LogLine[] } | null;
    let found = body?.job;
    if (!found) {
      // Older API: the log has no job counters — read them from the job list.
      const lr = await fetch("/api/exam-import", { cache: "no-store" }).catch(() => null);
      const list = lr?.ok ? ((await lr.json().catch(() => [])) as Job[]) : [];
      found = Array.isArray(list) ? list.find((j) => j._id === jobId) : undefined;
    }
    if (!found || !body) {
      setError(true);
      return;
    }
    setError(false);
    setJob(found);
    setLog(body.log ?? []);
    if (found.status === "running") timer.current = setTimeout(() => void pollRef.current(), 2000);
  }, [jobId]);

  useEffect(() => {
    pollRef.current = poll;
    timer.current = setTimeout(() => void poll(), 0);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [poll]);

  async function cancel() {
    await fetch(`/api/exam-import?cancel=${encodeURIComponent(jobId)}`, { method: "POST" }).catch(() => null);
    window.dispatchEvent(new Event(EXAM_IMPORT_STARTED_EVENT)); // wake the floating tracker too
    if (timer.current) clearTimeout(timer.current);
    void poll();
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...log]
      .reverse()
      .filter((l) => (filter === "all" || l.level === filter) && (!q || l.msg.toLowerCase().includes(q)));
  }, [log, search, filter]);
  const warns = log.filter((l) => l.level === "warn").length;
  const errs = log.filter((l) => l.level === "error").length;

  const active = job?.status === "running";
  const structuring = job?.phase === "structuring";
  const pct = !job
    ? 0
    : job.status === "done"
      ? 100
      : structuring
        ? Math.round(70 + (job.blocksFound > 0 ? ((job.blocksOk + job.blocksError) / job.blocksFound) * 30 : 0))
        : Math.round((job.numPages > 0 ? job.pagesDone / job.numPages : 0) * 70);
  const state = job
    ? {
        running: ["Đang chạy", "bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] text-[var(--primary)]"],
        done: ["Hoàn tất", "bg-[#22c55e]/15 text-[#15803d] dark:text-[#86efac]"],
        cancelled: ["Đã hủy", "bg-[#f59e0b]/20 text-[#b45309] dark:text-[#fbbf24]"],
        error: [job.error ?? "Đã dừng", "bg-[#ef4444]/15 text-[#dc2626] dark:text-[#fca5a5]"],
      }[job.status]
    : null;
  const levelTone = {
    info: "text-[var(--foreground)]",
    warn: "text-[#b45309] dark:text-[#fbbf24]",
    error: "text-[#dc2626] dark:text-[#fca5a5]",
  };
  const levelName = { info: "Thông tin", warn: "Cảnh báo", error: "Lỗi" };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <Link href="/admin/exams/import" className="text-xs font-medium text-[var(--primary)] hover:underline">
        ← Quay lại nhập đề
      </Link>
      <Link href={`/admin/exams/import/${jobId}/drafts`} className="ml-4 text-xs font-medium text-[var(--primary)] hover:underline">
        Duyệt bản nháp →
      </Link>
      <div className="mt-3 flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] text-2xl font-semibold text-[var(--primary)]" aria-hidden="true">
          試
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">Log nhập đề JLPT</h1>
          <p className="mt-0.5 truncate text-sm text-[var(--muted-foreground)]">
            {job ? `${job.level} · ${job.fileName} · ` : ""}Từng trang và từng khối 問題 của lần nhập này.
          </p>
        </div>
      </div>

      {error && <p className="mt-6 text-sm text-[#dc2626]">Không tải được log.</p>}
      {!error && !job && <p className="mt-6 text-sm text-[var(--muted-foreground)]">Đang tải…</p>}

      {job && state && (
        <>
          <section className="mt-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background-1)] shadow-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${state[1]}`}>{state[0]}</span>
              {job.createdAt && (
                <span className="text-xs text-[var(--muted-foreground)]">
                  Bắt đầu {new Date(job.createdAt).toLocaleString("vi-VN")}
                  {job.finishedAt && ` · kết thúc ${new Date(job.finishedAt).toLocaleString("vi-VN")}`}
                </span>
              )}
              <div className="ml-auto flex gap-2">
                {active && (
                  <button
                    type="button"
                    onClick={() => void cancel()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/10 px-3 py-1.5 text-xs font-semibold text-[#dc2626] transition-colors hover:bg-[#ef4444]/25 dark:text-[#fca5a5]"
                  >
                    ✕ Hủy
                  </button>
                )}
              </div>
            </div>

            <div className="px-4 pb-4">
              <span className="text-3xl font-semibold tabular-nums text-[var(--foreground)]">{pct}%</span>
              <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="mt-2 h-3 overflow-hidden rounded-full bg-[var(--layer)]">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    job.status === "error" || job.status === "cancelled"
                      ? "bg-[var(--muted-foreground)]"
                      : !active
                        ? "bg-[#22c55e]"
                        : "bg-gradient-to-r from-[var(--primary)] to-[color-mix(in_srgb,var(--primary)_55%,#22c55e)]"
                  }`}
                  style={{ width: `${active ? Math.max(pct, 2) : pct}%` }}
                />
              </div>
            </div>

            <dl className="grid grid-cols-3 divide-x divide-[var(--border)] border-t border-[var(--border)] text-center">
              {[
                { label: "Đã đọc", value: `${job.pagesDone}/${job.numPages} trang`, color: "text-[var(--foreground)]" },
                { label: "Khối đã xử lý", value: `${job.blocksOk + job.blocksError}/${job.blocksFound}`, color: "text-[#15803d] dark:text-[#86efac]" },
                { label: "Cần xem xét", value: String(job.blocksError), color: job.blocksError > 0 ? "text-[#b45309] dark:text-[#fbbf24]" : "text-[var(--foreground)]" },
              ].map((t) => (
                <div key={t.label} className="px-3 py-3">
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">{t.label}</dt>
                  <dd className={`mt-0.5 text-lg font-semibold tabular-nums ${t.color}`}>{t.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
              Mức
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as typeof filter)}
                className="rounded-full border border-[var(--border)] bg-[var(--background-1)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)]"
              >
                <option value="all">Tất cả ({log.length})</option>
                <option value="warn">Cảnh báo ({warns})</option>
                <option value="error">Lỗi ({errs})</option>
              </select>
            </label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm trong log…"
              className="ml-auto w-64 max-w-full rounded-full border border-[var(--border)] bg-[var(--background-1)] px-4 py-1.5 text-xs text-[var(--foreground)]"
            />
          </div>

          <div className="mt-3 max-h-[60vh] overflow-auto rounded-2xl border border-[var(--border)] bg-[var(--background-1)] shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-[var(--layer)] text-[var(--muted-foreground)]">
                <tr>
                  <th className="w-24 px-4 py-2.5 font-medium">Giờ</th>
                  <th className="w-24 px-3 py-2.5 font-medium">Mức</th>
                  <th className="px-3 py-2.5 font-medium">Nội dung</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-10 text-center text-[var(--muted-foreground)]">
                      {log.length === 0 ? "Chưa có dòng log." : "Không có dòng khớp."}
                    </td>
                  </tr>
                )}
                {rows.map((l, i) => (
                  <tr key={`${l.at}-${i}`} className="border-t border-[var(--border)] align-middle hover:bg-[var(--layer-hover)]">
                    <td className="px-4 py-2 tabular-nums text-[var(--muted-foreground)]">{new Date(l.at).toLocaleTimeString("vi-VN")}</td>
                    <td className={`px-3 py-2 ${levelTone[l.level]}`}>{levelName[l.level]}</td>
                    <td className={`px-3 py-2 ${levelTone[l.level]}`}>{l.msg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
