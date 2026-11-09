"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

interface RecheckJob {
  deckId: string;
  title: string;
  status: "running" | "done" | "error";
  done: number;
  total: number;
  flagged: number;
  error?: string;
}

/** Fired right after a whole-deck re-check is started so the tracker polls at once. */
export const RECHECK_STARTED_EVENT = "deck-recheck-started";
/** Fired by the tracker whenever a run's progress changes (the open deck page reloads its warnings). */
export const RECHECK_PROGRESS_EVENT = "deck-recheck-progress";

const POLL_MS = 2000;

/**
 * Floating progress for "Kiểm tra lại cả bộ". Mounted once in the root layout,
 * so the run keeps showing while the user moves between pages.
 */
export function RecheckTracker() {
  const [jobs, setJobs] = useState<RecheckJob[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef("");
  const pollRef = useRef<() => Promise<void>>(async () => {});

  const poll = useCallback(async () => {
    const res = await fetch("/api/flashcards/recheck-jobs", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return; // signed out / offline: stop quietly
    const list = (await res.json().catch(() => [])) as RecheckJob[];
    if (!Array.isArray(list)) return;
    setJobs(list);
    const sig = list.map((j) => `${j.deckId}:${j.status}:${j.done}`).join("|");
    if (sig !== last.current) {
      last.current = sig;
      window.dispatchEvent(new Event(RECHECK_PROGRESS_EVENT));
    }
    if (list.some((j) => j.status === "running")) timer.current = setTimeout(() => void pollRef.current(), POLL_MS);
  }, []);

  useEffect(() => {
    pollRef.current = poll;
    timer.current = setTimeout(() => void poll(), 0);
    const onStart = () => {
      if (timer.current) clearTimeout(timer.current);
      setHidden([]);
      void poll();
    };
    window.addEventListener(RECHECK_STARTED_EVENT, onStart);
    return () => {
      window.removeEventListener(RECHECK_STARTED_EVENT, onStart);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [poll]);

  function cancel(deckId: string) {
    void fetch(`/api/flashcards/recheck-jobs/${deckId}`, { method: "DELETE" })
      .catch(() => null)
      .finally(() => void pollRef.current());
  }

  const visible = jobs.filter((j) => j.status === "running" || !hidden.includes(j.deckId + j.status));
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      {visible.map((j) => {
        const pct = j.total > 0 ? Math.round((j.done / j.total) * 100) : 0;
        const href = `${window.location.pathname.startsWith("/admin") ? "/admin/decks" : "/learn/decks"}/${j.deckId}`;
        return (
          <div key={j.deckId} className="rounded-xl border border-[var(--border)] bg-[var(--background-1)] p-3 text-sm shadow-lg">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate font-medium text-[var(--foreground)]" title={j.title}>
                Kiểm tra lại: {j.title}
              </p>
              {j.status !== "running" && (
                <button
                  type="button"
                  onClick={() => setHidden((h) => [...h, j.deckId + j.status])}
                  aria-label="Đóng"
                  className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                >
                  ✕
                </button>
              )}
            </div>
            {j.status === "running" && (
              <>
                <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--layer)]">
                  <div className="h-full bg-[var(--primary)] transition-all" style={{ width: `${Math.max(pct, 3)}%` }} />
                </div>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  {j.total > 0 ? `AI đang kiểm tra ${j.done}/${j.total} thẻ (${pct}%)` : "Đang chuẩn bị…"} — bạn có thể sang trang khác{" "}
                  <button type="button" onClick={() => cancel(j.deckId)} className="font-medium text-[var(--foreground)] underline">
                    Hủy
                  </button>
                </p>
              </>
            )}
            {j.status === "done" && (
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Đã kiểm tra {j.total} thẻ · {j.flagged} thẻ cần xem xét.{" "}
                <Link href={href} onClick={() => setHidden((h) => [...h, j.deckId + j.status])} className="font-medium text-[var(--primary)] hover:underline">
                  Xem bộ thẻ →
                </Link>
              </p>
            )}
            {j.status === "error" && <p className="mt-1 text-xs text-[#b91c1c]">{j.error ?? "Kiểm tra thất bại"}</p>}
          </div>
        );
      })}
    </div>
  );
}
