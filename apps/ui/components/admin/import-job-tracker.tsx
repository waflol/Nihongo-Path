"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

/** A background PDF reading job, as the API reports it. */
export interface PdfJob {
  id: string;
  deckId: string;
  fileName: string;
  status: "running" | "done" | "error";
  done: number;
  total: number;
  rows?: number;
  error?: string;
  /** OCR'd PDFs: rows per page (for the page-by-page check). */
  pages?: { n: number; rows: number; ok: boolean; lostKanji?: number; numIssues?: number }[];
  /** Rows the last confirmed import rejected. */
  importErrors?: { rowNumber: number; no?: number; front: string; back: string; error: string }[];
  /** `table`: a CSV/XLSX/text-PDF file shown in blocks of rows (no page images, no re-reading). */
  kind?: "pdf" | "table";
  /** Table files read from a PDF: each block is one PDF page. */
  byPage?: boolean;
  /** Set on a deck's saved review: false when the viewer did not import it (read-only). */
  mine?: boolean;
  /** Pages being read again in the background. */
  retry?: { total: number; done: number; queue: number[] };
}

/** A preview / confirm run that is checking an import file (Hán Việt, readings, meanings). */
export interface CheckTask {
  id: string;
  deckId: string;
  fileName: string;
  status: "running" | "done" | "error";
  error?: string;
  phase: string;
  done: number;
  total: number;
}

/** Fired by the wizard right after it starts a job, so the tracker starts polling at once. */
export const JOB_STARTED_EVENT = "import-job-started";

const SEEN_KEY = "import-jobs-seen";
const POLL_MS = 2500;

function readSeen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}
/** Hide a job's card for good (used when the wizard cancels or abandons it). */
export function dismissImportJob(id: string) {
  writeSeen([...new Set([...readSeen(), id])]);
  window.dispatchEvent(new Event(JOB_STARTED_EVENT)); // tracker: re-read the list + the seen ids
}

function writeSeen(ids: string[]) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-30)));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Floating progress for PDF files being read in the background. Mounted once
 * in the root layout, so it keeps polling while the user moves between pages;
 * when a job finishes it shows a card (and a browser notification when
 * allowed) with a link back to the import wizard to review the result.
 */
export function ImportJobTracker() {
  const [jobs, setJobs] = useState<PdfJob[]>([]);
  const [tasks, setTasks] = useState<CheckTask[]>([]);
  const [signedIn, setSignedIn] = useState(true);
  const notified = useRef<Set<string>>(new Set());
  const [seenIds, setSeenIds] = useState<string[]>(() => readSeen());
  const pollRef = useRef<() => Promise<void>>(async () => {});
  const firstPoll = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async () => {
    const res = await fetch("/api/import", { cache: "no-store" }).catch(() => null);
    if (!res) {
      timer.current = setTimeout(() => void pollRef.current(), POLL_MS * 2); // offline: retry slowly
      return;
    }
    if (res.status === 401) {
      setSignedIn(false);
      return;
    }
    const list = res.ok ? ((await res.json().catch(() => [])) as PdfJob[]) : [];
    setJobs(list);
    const tres = await fetch("/api/import?tasks=1", { cache: "no-store" }).catch(() => null);
    const tlist = tres?.ok ? ((await tres.json().catch(() => [])) as CheckTask[]) : [];
    setTasks(Array.isArray(tlist) ? tlist : []);
    const initial = firstPoll.current;
    firstPoll.current = false;
    for (const j of list) {
      // Jobs already finished when the page loaded stay as cards but don't re-notify.
      if (!initial && j.status !== "running" && !notified.current.has(j.id) && !readSeen().includes(j.id)) {
        notified.current.add(j.id);
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification(j.status === "done" ? "Đã đọc xong PDF" : "Đọc PDF thất bại", {
            body: j.status === "done" ? `${j.fileName}: ${j.rows ?? 0} dòng — quay lại để xem` : (j.error ?? j.fileName),
          });
        }
      }
    }
    if (list.some((j) => j.status === "running" || j.retry) || (Array.isArray(tlist) && tlist.some((t) => t.status === "running"))) {
      timer.current = setTimeout(() => void pollRef.current(), POLL_MS);
    }
  }, []);

  useEffect(() => {
    pollRef.current = poll;
    timer.current = setTimeout(() => void poll(), 0);
    const onStart = () => {
      if (timer.current) clearTimeout(timer.current);
      setSeenIds(readSeen());
      void poll();
    };
    window.addEventListener(JOB_STARTED_EVENT, onStart);
    return () => {
      window.removeEventListener(JOB_STARTED_EVENT, onStart);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [poll]);

  function dismiss(id: string) {
    const next = [...new Set([...readSeen(), id])];
    writeSeen(next);
    setSeenIds(next);
  }

  /** ✕ on a job card: delete the job (and its saved pages) from the DB, not just hide it. */
  function removeJob(id: string) {
    dismiss(id);
    setJobs((prev) => prev.filter((j) => j.id !== id));
    void fetch(`/api/import?job=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
  }

  if (!signedIn) return null;
  const visible = jobs.filter((j) => j.status === "running" || j.retry || !seenIds.includes(j.id));
  const visibleTasks = tasks.filter((t) => t.status === "running" || !seenIds.includes(t.id));
  if (visible.length === 0 && visibleTasks.length === 0) return null;

  function cancelTask(id: string) {
    void fetch(`/api/import?progress=${encodeURIComponent(id)}`, { method: "DELETE" })
      .catch(() => null)
      .finally(() => window.dispatchEvent(new Event(JOB_STARTED_EVENT)));
  }

  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      {visibleTasks.map((t) => {
        const pct = t.total > 0 ? Math.round((t.done / t.total) * 100) : 0;
        const href = `${window.location.pathname.startsWith("/learn") ? "/learn/import" : "/admin/import"}?task=${t.id}`;
        return (
          <div key={t.id} className="rounded-xl border border-[var(--border)] bg-[var(--background-1)] p-3 text-sm shadow-lg">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate font-medium text-[var(--foreground)]" title={t.fileName}>
                {t.fileName}
              </p>
              {t.status !== "running" && (
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label="Đóng"
                  className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                >
                  ✕
                </button>
              )}
            </div>
            {t.status === "running" && (
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
                    {t.phase} {t.done}/{t.total} ({pct}%) — bạn có thể sang trang khác
                  </span>
                  <button type="button" onClick={() => cancelTask(t.id)} className="font-medium text-[var(--foreground)] underline">
                    Hủy
                  </button>
                </p>
              </>
            )}
            {t.status === "done" && (
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Đã kiểm tra xong.{" "}
                <Link href={href} onClick={() => dismiss(t.id)} className="font-medium text-[var(--primary)] hover:underline">
                  Xem kết quả →
                </Link>
              </p>
            )}
            {t.status === "error" && <p className="mt-1 text-xs text-[#b91c1c]">{t.error ?? "Kiểm tra thất bại"}</p>}
          </div>
        );
      })}
      {visible.map((j) => {
        const pct = j.total > 0 ? Math.round((j.done / j.total) * 100) : 0;
        const href = `${window.location.pathname.startsWith("/learn") ? "/learn/import" : "/admin/import"}?job=${j.id}`;
        return (
          <div
            key={j.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--background-1)] p-3 text-sm shadow-lg"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate font-medium text-[var(--foreground)]" title={j.fileName}>
                {j.fileName}
              </p>
              {j.status !== "running" && (
                <button
                  type="button"
                  onClick={() => removeJob(j.id)}
                  aria-label="Xóa"
                  title="Xóa kết quả đọc này"
                  className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                >
                  ✕
                </button>
              )}
            </div>
            {j.status === "running" && (
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
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  {j.total > 0 ? `Đang đọc trang ${j.done}/${j.total} (${pct}%)` : "Đang chuẩn bị…"} — bạn có thể sang trang khác
                </p>
              </>
            )}
            {j.status === "done" && j.retry && (
              <>
                <div
                  role="progressbar"
                  aria-valuenow={Math.round((j.retry.done / j.retry.total) * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--layer)]"
                >
                  <div
                    className="h-full bg-[var(--primary)] transition-all"
                    style={{ width: `${Math.max((j.retry.done / j.retry.total) * 100, 3)}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  Đang đọc lại trang {Math.min(j.retry.done + 1, j.retry.total)}/{j.retry.total} — bạn có thể làm việc khác
                </p>
              </>
            )}
            {j.status === "done" && !j.retry && (
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Đã đọc xong · {j.rows ?? 0} dòng
                {(j.pages?.filter((p) => !p.ok || p.rows === 0 || (p.lostKanji ?? 0) > 0).length ?? 0) > 0 &&
                  ` · ${j.pages!.filter((p) => !p.ok || p.rows === 0 || (p.lostKanji ?? 0) > 0).length} trang cần xem lại`}
                .{" "}
                <Link href={href} onClick={() => dismiss(j.id)} className="font-medium text-[var(--primary)] hover:underline">
                  Xem kết quả →
                </Link>
              </p>
            )}
            {j.status === "error" && <p className="mt-1 text-xs text-[#b91c1c]">{j.error ?? "Đọc PDF thất bại"}</p>}
          </div>
        );
      })}
    </div>
  );
}
