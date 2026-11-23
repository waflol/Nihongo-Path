"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

interface ExamImportJob {
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
}
interface LogLine {
  at: string;
  level: "info" | "warn" | "error";
  msg: string;
}

const SEEN_KEY = "exam-import-seen";
const POLL_MS = 2500;
/** Fired by whatever starts an import so the tracker polls at once. */
export const EXAM_IMPORT_STARTED_EVENT = "exam-import-started";

function readSeen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}
function writeSeen(ids: string[]) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-30)));
  } catch {
    /* storage unavailable */
  }
}

/** Progress of a job as 0–100: pages are the first half, blocks the second. */
function percent(j: ExamImportJob): number {
  if (j.status === "done") return 100;
  const pages = j.numPages > 0 ? j.pagesDone / j.numPages : 0;
  if (j.phase !== "structuring") return Math.round(pages * 70);
  const blocks = j.blocksFound > 0 ? (j.blocksOk + j.blocksError) / j.blocksFound : 0;
  return Math.round(70 + blocks * 30);
}

/**
 * Floating progress for exam PDFs being imported in the background — same
 * look as the vocabulary-import card. Mounted once in the root layout, so it
 * keeps polling while the admin moves between pages; has Cancel and an
 * event log. Silent for anyone who is not a content admin (403 → stop).
 */
export function ExamImportTracker() {
  const [jobs, setJobs] = useState<ExamImportJob[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [seen, setSeen] = useState<string[]>(() => readSeen());
  const [logFor, setLogFor] = useState<string | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<() => Promise<void>>(async () => {});
  const logForRef = useRef<string | null>(null);

  const poll = useCallback(async () => {
    const res = await fetch("/api/exam-import", { cache: "no-store" }).catch(() => null);
    if (!res) {
      timer.current = setTimeout(() => void pollRef.current(), POLL_MS * 2);
      return;
    }
    if (res.status === 401 || res.status === 403) {
      setEnabled(false);
      return;
    }
    const list = res.ok ? ((await res.json().catch(() => [])) as ExamImportJob[]) : [];
    const arr = Array.isArray(list) ? list : [];
    setJobs(arr);
    const open = logForRef.current;
    if (open) {
      const lr = await fetch(`/api/exam-import?log=${encodeURIComponent(open)}`, { cache: "no-store" }).catch(() => null);
      const body = lr?.ok ? ((await lr.json().catch(() => null)) as { log?: LogLine[] } | null) : null;
      if (body?.log) setLog(body.log);
    }
    if (arr.some((j) => j.status === "running")) {
      timer.current = setTimeout(() => void pollRef.current(), POLL_MS);
    }
  }, []);

  useEffect(() => {
    pollRef.current = poll;
    timer.current = setTimeout(() => void poll(), 0);
    const onStart = () => {
      if (timer.current) clearTimeout(timer.current);
      setEnabled(true);
      void poll();
    };
    window.addEventListener(EXAM_IMPORT_STARTED_EVENT, onStart);
    return () => {
      window.removeEventListener(EXAM_IMPORT_STARTED_EVENT, onStart);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [poll]);

  function dismiss(id: string) {
    const next = [...new Set([...readSeen(), id])];
    writeSeen(next);
    setSeen(next);
    if (logForRef.current === id) toggleLog(id);
  }

  function cancel(id: string) {
    void fetch(`/api/exam-import?cancel=${encodeURIComponent(id)}`, { method: "POST" })
      .catch(() => null)
      .finally(() => window.dispatchEvent(new Event(EXAM_IMPORT_STARTED_EVENT)));
  }

  function toggleLog(id: string) {
    const next = logForRef.current === id ? null : id;
    logForRef.current = next;
    setLogFor(next);
    setLog([]);
    if (next) void pollRef.current();
  }

  if (!enabled) return null;
  // Running jobs, plus only the latest finished one (older cards would pile up
  // and push the running card + its log off the screen).
  const latestDone = jobs.find((j) => j.status !== "running" && !seen.includes(j._id));
  const visible = jobs.filter((j) => j.status === "running" || j._id === latestDone?._id);
  if (visible.length === 0) return null;

  const btn = "flex h-7 w-7 items-center justify-center rounded-md border text-sm transition-colors";
  const tone = {
    cancel: `${btn} border-[#ef4444]/40 bg-[#ef4444]/10 text-[#dc2626] hover:bg-[#ef4444]/25 dark:text-[#fca5a5]`,
    log: `${btn} border-[#3b82f6]/40 bg-[#3b82f6]/10 text-[#2563eb] hover:bg-[#3b82f6]/25 dark:text-[#93c5fd]`,
    page: `${btn} border-[color-mix(in_srgb,var(--primary)_40%,transparent)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)] hover:bg-[color-mix(in_srgb,var(--primary)_25%,transparent)]`,
  };

  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      {visible.map((j) => {
        const pct = percent(j);
        const active = j.status === "running";
        const failed = j.status === "error";
        const cancelled = j.status === "cancelled";
        const showLog = logFor === j._id;
        const badge = failed
          ? "bg-[#ef4444]/15 text-[#dc2626] dark:text-[#fca5a5]"
          : active
            ? "bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] text-[var(--primary)]"
            : cancelled
              ? "bg-[#f59e0b]/20 text-[#b45309] dark:text-[#fbbf24]"
              : "bg-[#22c55e]/15 text-[#15803d] dark:text-[#86efac]";
        const glyph = failed ? "✕" : cancelled ? "⏹" : active ? "試" : "✓";
        const subtitle = active
          ? `Đề ${j.level} · ${j.fileName}`
          : failed
            ? (j.error ?? "Nhập PDF thất bại")
            : cancelled
              ? "Đã hủy"
              : "Hoàn tất";
        const progress =
          j.phase === "structuring"
            ? `${j.blocksOk + j.blocksError}/${j.blocksFound} khối`
            : j.numPages > 0
              ? `${j.pagesDone}/${j.numPages} trang`
              : "Đang chuẩn bị…";
        return (
          <div key={j._id} className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background-1)] shadow-xl">
            <div className="flex items-center gap-3 p-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-semibold ${badge}`} aria-hidden="true">
                {glyph}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--foreground)]">Nhập đề JLPT từ PDF</p>
                <p className="truncate text-xs text-[var(--muted-foreground)]" title={`${j.level} · ${j.fileName}`}>
                  {subtitle}
                </p>
              </div>
              {active && <span className="text-lg font-semibold tabular-nums text-[var(--foreground)]">{j.numPages > 0 ? `${pct}%` : "…"}</span>}
              {!active && (
                <button
                  type="button"
                  onClick={() => dismiss(j._id)}
                  aria-label="Đóng"
                  className="rounded-md px-1.5 py-0.5 text-[var(--muted-foreground)] hover:bg-[var(--layer)] hover:text-[var(--foreground)]"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="px-3 pb-3">
              <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-[var(--layer)]">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    failed || cancelled
                      ? "bg-[var(--muted-foreground)]"
                      : !active
                        ? "bg-[#22c55e]"
                        : `bg-gradient-to-r from-[var(--primary)] to-[color-mix(in_srgb,var(--primary)_55%,#22c55e)] ${j.numPages === 0 ? "animate-pulse" : ""}`
                  }`}
                  style={{ width: `${active ? Math.max(pct, 4) : pct}%` }}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted-foreground)]">
                <span className="tabular-nums">{progress}</span>
                {j.blocksOk > 0 && (
                  <span className="rounded-full bg-[#22c55e]/15 px-2 py-0.5 font-semibold text-[#15803d] dark:text-[#86efac]">{j.blocksOk} khối ok</span>
                )}
                {j.blocksError > 0 && (
                  <span className="rounded-full bg-[#f59e0b]/20 px-2 py-0.5 font-semibold text-[#b45309] dark:text-[#fbbf24]">{j.blocksError} cần xem xét</span>
                )}
              </div>

              <div className="mt-3 flex items-center gap-1.5">
                {active && (
                  <button type="button" className={tone.cancel} onClick={() => cancel(j._id)} title="Hủy" aria-label="Hủy">
                    ✕
                  </button>
                )}
                <Link
                  href={`/admin/exams/import/${j._id}/drafts`}
                  className={tone.page}
                  title="Duyệt bản nháp"
                  aria-label="Duyệt bản nháp"
                >
                  ✎
                </Link>
                <Link
                  href="/admin/exams/import"
                  onClick={active ? undefined : () => dismiss(j._id)}
                  className={tone.page}
                  title="Mở trang nhập đề"
                  aria-label="Mở trang nhập đề"
                >
                  ▤
                </Link>
                <button
                  type="button"
                  className={`${tone.log} ${showLog ? "ring-2 ring-[#3b82f6]/40" : ""}`}
                  onClick={() => toggleLog(j._id)}
                  title={showLog ? "Ẩn log" : "Xem log"}
                  aria-label={showLog ? "Ẩn log" : "Xem log"}
                  aria-pressed={showLog}
                >
                  ☰
                </button>
                <Link href={`/admin/exams/import/${j._id}/log`} className={tone.page} title="Mở trang log" aria-label="Mở trang log">
                  ↗
                </Link>
              </div>
              {showLog && (
                <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-lg bg-[var(--layer)] p-2 text-xs">
                  {log.length === 0 && <li className="text-[var(--muted-foreground)]">Chưa có dòng log.</li>}
                  {[...log].reverse().map((l, i) => (
                    <li key={i} className="text-[var(--foreground)]">
                      <span className="mr-1 tabular-nums text-[var(--muted-foreground)]">{new Date(l.at).toLocaleTimeString("vi-VN")}</span>
                      <span className={l.level === "error" ? "text-[#dc2626] dark:text-[#fca5a5]" : l.level === "warn" ? "text-[#b45309] dark:text-[#fbbf24]" : ""}>{l.msg}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
