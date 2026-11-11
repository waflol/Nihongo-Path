"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

interface RecheckJob {
  deckId: string;
  title: string;
  status: "running" | "paused" | "done" | "error";
  done: number;
  total: number;
  flagged: number;
  changed?: number;
  recent?: { stt: number; word: string; oldHanViet: string; newHanViet: string }[];
  recentFlags?: { stt: number; word: string; field: "reading" | "back"; issue: string }[];
  field?: "all" | "hanViet" | "reading" | "back";
  error?: string;
}

/** Title and badge glyph of each kind of check. */
const FIELD_INFO = {
  all: { title: "Kiểm tra lại cả bộ", glyph: "検" },
  hanViet: { title: "Kiểm tra Hán tự", glyph: "漢" },
  reading: { title: "Kiểm tra phát âm", glyph: "音" },
  back: { title: "Kiểm tra nghĩa", glyph: "義" },
} as const;

/** Fired right after a whole-deck re-check is started so the tracker polls at once. */
export const RECHECK_STARTED_EVENT = "deck-recheck-started";
/** Fired by the tracker whenever a run's progress changes (the open deck page reloads its warnings). */
export const RECHECK_PROGRESS_EVENT = "deck-recheck-progress";

const POLL_MS = 2000;

/**
 * Floating progress for the whole-deck checks (Hán tự / phát âm / nghĩa). Mounted once in the root layout,
 * so the run keeps showing while the user moves between pages.
 */
export function RecheckTracker() {
  const [jobs, setJobs] = useState<RecheckJob[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [openLog, setOpenLog] = useState<string[]>([]);
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
    if (list.some((j) => j.status === "running" || j.status === "paused")) timer.current = setTimeout(() => void pollRef.current(), POLL_MS);
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

  function control(deckId: string, action: "pause" | "resume") {
    void fetch(`/api/flashcards/recheck-jobs/${deckId}/${action}`, { method: "POST" })
      .catch(() => null)
      .finally(() => {
        if (timer.current) clearTimeout(timer.current);
        void pollRef.current();
      });
  }

  const visible = jobs.filter((j) => j.status === "running" || j.status === "paused" || !hidden.includes(j.deckId + j.status));
  if (visible.length === 0) return null;

  const btn = "flex h-7 w-7 items-center justify-center rounded-md border text-sm transition-colors";
  const tone = {
    pause: `${btn} border-[#f59e0b]/40 bg-[#f59e0b]/15 text-[#b45309] hover:bg-[#f59e0b]/30 dark:text-[#fbbf24]`,
    resume: `${btn} border-[#22c55e]/40 bg-[#22c55e]/15 text-[#15803d] hover:bg-[#22c55e]/30 dark:text-[#86efac]`,
    cancel: `${btn} border-[#ef4444]/40 bg-[#ef4444]/10 text-[#dc2626] hover:bg-[#ef4444]/25 dark:text-[#fca5a5]`,
    log: `${btn} border-[#3b82f6]/40 bg-[#3b82f6]/10 text-[#2563eb] hover:bg-[#3b82f6]/25 dark:text-[#93c5fd]`,
    page: `${btn} border-[color-mix(in_srgb,var(--primary)_40%,transparent)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)] hover:bg-[color-mix(in_srgb,var(--primary)_25%,transparent)]`,
  };

  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      {visible.map((j) => {
        const pct = j.total > 0 ? Math.min(100, Math.round((j.done / j.total) * 100)) : 0;
        const root = window.location.pathname.startsWith("/admin") ? "/admin/decks" : "/learn/decks";
        const href = `${root}/${j.deckId}`;
        const logHref = `${href}/log${j.field === "reading" || j.field === "back" ? `?field=${j.field}` : ""}`;
        const info = FIELD_INFO[j.field ?? "all"];
        const active = j.status === "running" || j.status === "paused";
        const paused = j.status === "paused";
        const failed = j.status === "error";
        const hasLog = j.field === "hanViet" || j.field === "reading" || j.field === "back";
        const flagLog = j.field === "reading" || j.field === "back";
        const logCount = flagLog ? j.flagged : (j.changed ?? 0);
        const showLog = openLog.includes(j.deckId);
        const badge = failed
          ? "bg-[#ef4444]/15 text-[#dc2626] dark:text-[#fca5a5]"
          : j.status === "running"
            ? "bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] text-[var(--primary)]"
            : paused
              ? "bg-[#f59e0b]/20 text-[#b45309] dark:text-[#fbbf24]"
              : "bg-[#22c55e]/15 text-[#15803d] dark:text-[#86efac]";
        const glyph = failed ? "✕" : paused ? "⏸" : active ? info.glyph : "✓";
        const subtitle = paused ? "Đã tạm dừng" : active ? j.title : failed ? (j.error ?? "Kiểm tra thất bại") : "Hoàn tất";
        const close = () => {
          setHidden((h) => [...h, j.deckId + j.status]);
          void fetch(`/api/flashcards/recheck-jobs/${j.deckId}`, { method: "DELETE" }).catch(() => null); // gone for good, also after F5
        };
        const recent = [...(j.recent ?? [])].reverse();
        const recentFlags = [...(j.recentFlags ?? [])].filter((f) => f.field === j.field).reverse();
        return (
          <div key={j.deckId} className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background-1)] shadow-xl">
            <div className="flex items-center gap-3 p-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-semibold ${badge}`} aria-hidden="true">
                {glyph}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--foreground)]">{info.title}</p>
                <p className="truncate text-xs text-[var(--muted-foreground)]" title={j.title}>
                  {subtitle}
                </p>
              </div>
              {active && <span className="text-lg font-semibold tabular-nums text-[var(--foreground)]">{j.total > 0 ? `${pct}%` : "…"}</span>}
              {!active && (
                <button type="button" onClick={close} aria-label="Đóng" className="rounded-md px-1.5 py-0.5 text-[var(--muted-foreground)] hover:bg-[var(--layer)] hover:text-[var(--foreground)]">
                  ✕
                </button>
              )}
            </div>

            <div className="px-3 pb-3">
              <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-[var(--layer)]">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    paused || failed
                      ? "bg-[var(--muted-foreground)]"
                      : !active
                        ? "bg-[#22c55e]"
                        : `bg-gradient-to-r from-[var(--primary)] to-[color-mix(in_srgb,var(--primary)_55%,#22c55e)] ${j.total === 0 ? "animate-pulse" : ""}`
                  }`}
                  style={{ width: `${active ? Math.max(pct, 4) : pct}%` }}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted-foreground)]">
                <span className="tabular-nums">{j.total > 0 ? `${j.done}/${j.total} thẻ` : "Đang chuẩn bị…"}</span>
                {j.field === "hanViet" && <span className="rounded-full bg-[#22c55e]/15 px-2 py-0.5 font-semibold text-[#15803d] dark:text-[#86efac]">{j.changed ?? 0} đã sửa</span>}
                {j.flagged > 0 && <span className="rounded-full bg-[#f59e0b]/20 px-2 py-0.5 font-semibold text-[#b45309] dark:text-[#fbbf24]">{j.flagged} cần xem xét</span>}
              </div>

              <div className="mt-3 flex items-center gap-1.5">
                {j.status === "running" && (
                  <button type="button" className={tone.pause} onClick={() => control(j.deckId, "pause")} title="Tạm dừng" aria-label="Tạm dừng">
                    ⏸
                  </button>
                )}
                {paused && (
                  <button type="button" className={tone.resume} onClick={() => control(j.deckId, "resume")} title="Tiếp tục" aria-label="Tiếp tục">
                    ▶
                  </button>
                )}
                {active && (
                  <button type="button" className={tone.cancel} onClick={() => cancel(j.deckId)} title="Hủy" aria-label="Hủy">
                    ✕
                  </button>
                )}
                <Link href={href} onClick={active ? undefined : close} className={`${tone.page} ${hasLog ? "ml-auto" : "ml-auto"}`} title="Mở bộ thẻ" aria-label="Mở bộ thẻ">
                  ▤
                </Link>
                {hasLog && (
                  <>
                    <button
                      type="button"
                      className={`${tone.log} ${showLog ? "ring-2 ring-[#3b82f6]/40" : ""}`}
                      onClick={() => setOpenLog((v) => (showLog ? v.filter((x) => x !== j.deckId) : [...v, j.deckId]))}
                      title={showLog ? "Ẩn log" : `Xem log (${logCount})`}
                      aria-label={showLog ? "Ẩn log" : "Xem log"}
                      aria-pressed={showLog}
                    >
                      ☰
                    </button>
                    <Link href={logHref} className={tone.page} title="Mở trang log" aria-label="Mở trang log">
                      ↗
                    </Link>
                  </>
                )}
              </div>
              {hasLog && showLog && (
                <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-lg bg-[var(--layer)] p-2 text-xs">
                  {(flagLog ? recentFlags.length : recent.length) === 0 && <li className="text-[var(--muted-foreground)]">{flagLog ? "Chưa có từ nào cần xem xét." : "Chưa có từ nào được sửa."}</li>}
                  {flagLog
                    ? recentFlags.map((f, i) => (
                        <li key={`${f.stt}-${i}`} className="text-[var(--foreground)]">
                          <span className="mr-1 text-[var(--muted-foreground)]">#{f.stt}</span>
                          <span className="mr-1 font-semibold">{f.word}</span>
                          <span className="text-[#b45309] dark:text-[#fbbf24]">{f.issue}</span>
                        </li>
                      ))
                    : recent.map((c, i) => (
                        <li key={`${c.stt}-${i}`} className="text-[var(--foreground)]">
                          <span className="mr-1 text-[var(--muted-foreground)]">#{c.stt}</span>
                          <span className="mr-1 font-semibold">{c.word}</span>
                          <span className="text-[#dc2626] dark:text-[#fca5a5]">{c.oldHanViet || "(trống)"}</span> → <span className="text-[#15803d] dark:text-[#86efac]">{c.newHanViet}</span>
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
