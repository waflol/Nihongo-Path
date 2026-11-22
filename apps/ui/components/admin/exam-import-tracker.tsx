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
  const visible = jobs.filter((j) => j.status === "running" || !seen.includes(j._id));
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      {visible.map((j) => {
        const pct = percent(j);
        const running = j.status === "running";
        const label =
          j.phase === "structuring"
            ? `Cấu trúc hoá khối ${j.blocksOk + j.blocksError}/${j.blocksFound}`
            : j.numPages > 0
              ? `Đọc trang ${j.pagesDone}/${j.numPages}`
              : "Đang chuẩn bị…";
        return (
          <div key={j._id} className="rounded-xl border border-[var(--border)] bg-[var(--background-1)] p-3 text-sm shadow-lg">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate font-medium text-[var(--foreground)]" title={j.fileName}>
                Đề {j.level}: {j.fileName}
              </p>
              {!running && (
                <button
                  type="button"
                  onClick={() => dismiss(j._id)}
                  aria-label="Đóng"
                  className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                >
                  ✕
                </button>
              )}
            </div>
            {running && (
              <>
                <div
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--layer)]"
                >
                  <div className="h-full bg-[var(--primary)] transition-all" style={{ width: `${Math.max(pct, 3)}%` }} />
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-[var(--muted-foreground)]">
                  <span>
                    {label} ({pct}%) — bạn có thể sang trang khác
                  </span>
                  <button type="button" onClick={() => cancel(j._id)} className="font-medium text-[var(--foreground)] underline">
                    Hủy
                  </button>
                </p>
              </>
            )}
            {j.status === "done" && (
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Đã nhập xong · {j.blocksOk} khối ok{j.blocksError > 0 ? ` · ${j.blocksError} khối cần xem lại` : ""}.{" "}
                <Link href="/admin/exams" onClick={() => dismiss(j._id)} className="font-medium text-[var(--primary)] hover:underline">
                  Xem kết quả →
                </Link>
              </p>
            )}
            {j.status === "cancelled" && (
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Đã hủy ở {j.phase === "structuring" ? `khối ${j.blocksOk + j.blocksError}/${j.blocksFound}` : `trang ${j.pagesDone}/${j.numPages}`}.
              </p>
            )}
            {j.status === "error" && <p className="mt-1 text-xs text-[#b91c1c]">{j.error ?? "Nhập PDF thất bại"}</p>}
            <button
              type="button"
              onClick={() => toggleLog(j._id)}
              aria-expanded={logFor === j._id}
              className="mt-1 text-xs font-medium text-[var(--muted-foreground)] underline hover:text-[var(--foreground)]"
            >
              {logFor === j._id ? "Ẩn nhật ký" : "Nhật ký"}
            </button>
            {logFor === j._id && (
              <ul className="mt-1 max-h-40 overflow-y-auto rounded-md bg-[var(--layer)] p-2 font-mono text-[11px] leading-snug">
                {log.length === 0 && <li className="text-[var(--muted-foreground)]">Chưa có dòng nhật ký.</li>}
                {[...log].reverse().map((l, i) => (
                  <li key={i} className={l.level === "error" ? "text-[#b91c1c]" : l.level === "warn" ? "text-[#b45309]" : "text-[var(--foreground)]"}>
                    <span className="text-[var(--muted-foreground)]">{new Date(l.at).toLocaleTimeString("vi-VN")}</span> {l.msg}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
