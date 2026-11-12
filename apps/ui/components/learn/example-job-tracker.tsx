"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useConfirm } from "@/components/learn/use-confirm";

interface ExampleJob {
  deckId: string;
  title: string;
  shared: boolean;
  total: number;
  done: number;
  paused: boolean;
}

interface FinishedJob {
  deckId: string;
  title: string;
  shared: boolean;
}

/** Fired right after example generation is started, so the popup shows up at once. */
export const EXAMPLES_STARTED_EVENT = "examples-started";

const POLL_BUSY_MS = 2500;
const POLL_IDLE_MS = 30_000;

/**
 * Floating progress for example sentences being generated in the background.
 * Mounted once in the root layout, so it keeps showing (and polling) while the
 * user moves between pages — generation itself runs on the server and does not
 * depend on this popup. When a deck finishes, a "done" card replaces its bar.
 */
export function ExampleJobTracker() {
  const [jobs, setJobs] = useState<ExampleJob[]>([]);
  const [finished, setFinished] = useState<FinishedJob[]>([]);
  const [signedIn, setSignedIn] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const { confirm, dialog } = useConfirm();
  const [busyId, setBusyId] = useState<string | null>(null);
  const prev = useRef<Map<string, ExampleJob>>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<() => Promise<void>>(async () => {});

  const poll = useCallback(async () => {
    const res = await fetch("/api/flashcards/example-jobs", { cache: "no-store" }).catch(() => null);
    if (!res) {
      timer.current = setTimeout(() => void pollRef.current(), POLL_IDLE_MS); // offline: retry slowly
      return;
    }
    if (res.status === 401 || res.status === 403) {
      setSignedIn(false);
      return;
    }
    const list = res.ok ? ((await res.json().catch(() => [])) as ExampleJob[]) : [];
    // A deck that was generating a moment ago and no longer is → finished (or stopped).
    const now = new Set(list.map((j) => j.deckId));
    const gone = [...prev.current.values()].filter((j) => !now.has(j.deckId));
    if (gone.length > 0) {
      setFinished((f) => [
        ...f.filter((x) => !gone.some((g) => g.deckId === x.deckId)),
        ...gone.map((g) => ({ deckId: g.deckId, title: g.title, shared: g.shared })),
      ]);
    }
    prev.current = new Map(list.map((j) => [j.deckId, j]));
    setJobs(list);
    const active = list.some((j) => !j.paused);
    timer.current = setTimeout(() => void pollRef.current(), active ? POLL_BUSY_MS : POLL_IDLE_MS);
  }, []);

  useEffect(() => {
    pollRef.current = poll;
    timer.current = setTimeout(() => void poll(), 0);
    const onStart = () => {
      if (timer.current) clearTimeout(timer.current);
      setSignedIn(true);
      void poll();
    };
    window.addEventListener(EXAMPLES_STARTED_EVENT, onStart);
    return () => {
      window.removeEventListener(EXAMPLES_STARTED_EVENT, onStart);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [poll]);

  // A "done" card fades away by itself after a while.
  useEffect(() => {
    if (finished.length === 0) return;
    const t = setTimeout(() => setFinished([]), 30_000);
    return () => clearTimeout(t);
  }, [finished]);

  async function stop(j: ExampleJob) {
    const ok = await confirm({
      title: "Hủy tạo ví dụ?",
      message: `Dừng tạo ví dụ cho "${j.title}". Các ví dụ đã tạo sẽ được giữ lại.`,
      confirmLabel: "Hủy tạo ví dụ",
      tone: "danger",
    });
    if (!ok) return;
    // Cancelled on purpose → forget it first so the next poll shows no "done" card.
    prev.current.delete(j.deckId);
    await control(j.deckId, "stop");
  }

  async function control(deckId: string, action: "pause" | "resume" | "stop") {
    setBusyId(deckId);
    await fetch(`/api/flashcards/import/examples/${deckId}/${action}`, { method: "POST" }).catch(() => null);
    setBusyId(null);
    if (timer.current) clearTimeout(timer.current);
    void poll();
  }

  if (!signedIn || (jobs.length === 0 && finished.length === 0)) return null;

  const hrefOf = (j: { deckId: string; shared: boolean }) =>
    `${j.shared && window.location.pathname.startsWith("/admin") ? "/admin/decks" : "/learn/decks"}/${j.deckId}`;
  const total = jobs.reduce((a, j) => a + j.total, 0);
  const done = jobs.reduce((a, j) => a + j.done, 0);
  const allPct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  return (
    <div
      className="flex flex-col gap-2"
      aria-live="polite"
    >
      {dialog}
      {jobs.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background-1)] p-3 text-sm shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-[var(--foreground)]">
              ✨ Đang tạo ví dụ{jobs.length > 1 ? ` (${jobs.length} bộ)` : ""}
            </p>
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Mở rộng" : "Thu gọn"}
              className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              {collapsed ? "▲" : "▼"}
            </button>
          </div>
          {collapsed ? (
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              {done}/{total} ({allPct}%) — chạy nền, bạn có thể sang trang khác
            </p>
          ) : (
            <ul className="mt-2 space-y-3">
              {jobs.map((j) => {
                const pct = j.total > 0 ? Math.min(100, Math.round((j.done / j.total) * 100)) : 0;
                return (
                  <li key={j.deckId}>
                    <div className="flex items-baseline justify-between gap-2">
                      <Link href={hrefOf(j)} className="min-w-0 truncate text-xs font-medium text-[var(--primary)] hover:underline" title={j.title}>
                        {j.title}
                      </Link>
                      <span className="shrink-0 text-xs tabular-nums text-[var(--muted-foreground)]">
                        {j.done}/{j.total}
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Tiến trình tạo ví dụ: ${j.title}`}
                      className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--layer)]"
                    >
                      <div
                        className={`h-full transition-all ${j.paused ? "bg-[var(--muted-foreground)]" : "bg-[var(--primary)]"}`}
                        style={{ width: `${Math.max(pct, 3)}%` }}
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className="text-xs text-[var(--muted-foreground)]">
                        {j.paused ? "Đã tạm dừng" : `${pct}% — chạy nền, bạn có thể sang trang khác`}
                      </p>
                      <div className="flex shrink-0 gap-1">
                        <Link
                          href={`${hrefOf(j)}/log?field=examples`}
                          className="rounded-md border border-[var(--border)] px-2 py-0.5 text-xs font-medium text-[var(--primary)] hover:bg-[var(--layer-hover)]"
                        >
                          Log
                        </Link>
                        <button
                          type="button"
                          disabled={busyId === j.deckId}
                          onClick={() => void control(j.deckId, j.paused ? "resume" : "pause")}
                          className="rounded-md border border-[var(--border)] px-2 py-0.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)] disabled:opacity-60"
                        >
                          {j.paused ? "Tiếp tục" : "Tạm dừng"}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === j.deckId}
                          onClick={() => void stop(j)}
                          className="rounded-md border border-[var(--border)] px-2 py-0.5 text-xs font-medium text-red-500 hover:bg-[var(--layer-hover)] disabled:opacity-60"
                        >
                          Hủy
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {finished.map((f) => (
        <div
          key={f.deckId}
          className="flex items-start justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--background-1)] p-3 text-sm shadow-lg"
        >
          <p className="min-w-0 text-xs text-[var(--muted-foreground)]">
            Đã tạo xong ví dụ cho <strong className="text-[var(--foreground)]">{f.title}</strong>.{" "}
            <Link href={hrefOf(f)} onClick={() => setFinished((x) => x.filter((y) => y.deckId !== f.deckId))} className="font-medium text-[var(--primary)] hover:underline">
              Xem bộ thẻ →
            </Link>{" "}
            <Link href={`${hrefOf(f)}/log?field=examples`} onClick={() => setFinished((x) => x.filter((y) => y.deckId !== f.deckId))} className="font-medium text-[var(--primary)] hover:underline">
              Xem log →
            </Link>
          </p>
          <button
            type="button"
            onClick={() => setFinished((x) => x.filter((y) => y.deckId !== f.deckId))}
            aria-label="Đóng"
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
