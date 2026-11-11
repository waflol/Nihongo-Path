"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

export interface MaziiSyncJob {
  id: string;
  status: "running" | "paused" | "done" | "cancelled";
  total: number;
  done: number;
  ok: number;
  failed: number;
  skipped?: number;
  current: string;
  startedAt: number;
  finishedAt?: number;
  dismissed?: boolean;
  log: { at: number; char: string; ok: boolean; message: string }[];
}

/** Fired by the Kanji page right after it starts a run, so the tracker polls at once. */
export const MAZII_SYNC_STARTED_EVENT = "mazii-sync-started";
/** Fired by the tracker whenever the run advances, so an open Kanji list can reload. */
export const MAZII_SYNC_PROGRESS_EVENT = "mazii-sync-progress";

/** Whether a run is going (running or paused) — shared so the Kanji page can disable its Mazii buttons. */
let maziiRunning = false;
function setMaziiRunning(next: boolean): void {
  if (maziiRunning === next) return;
  maziiRunning = next;
  window.dispatchEvent(new Event(MAZII_SYNC_PROGRESS_EVENT));
}

/** True while a Mazii sync run is going; follows the tracker's polling. */
export function useMaziiRunning(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(MAZII_SYNC_PROGRESS_EVENT, cb);
      return () => window.removeEventListener(MAZII_SYNC_PROGRESS_EVENT, cb);
    },
    () => maziiRunning,
    () => false,
  );
}

const POLL_MS = 1500;
const BASE = "/api/admin/kanji/mazii-sync";

/**
 * Floating progress for the "update Hán Việt / On / Kun from Mazii" run. Mounted
 * once in the root layout: the run lives on the server, so it keeps going (and
 * this card keeps showing) while the admin moves between pages.
 */
export function MaziiSyncTracker() {
  const [job, setJob] = useState<MaziiSyncJob | null>(null);
  const [showLog, setShowLog] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<() => Promise<void>>(async () => {});
  const sig = useRef("");

  const poll = useCallback(async () => {
    const res = await fetch(BASE, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return; // signed out / not an admin / offline: stay quiet
    const next = (await res.json().catch(() => null)) as MaziiSyncJob | null;
    setJob(next && typeof next === "object" && "id" in next ? next : null);
    setMaziiRunning(!!next && (next.status === "running" || next.status === "paused"));
    const s = next ? `${next.id}:${next.status}:${next.done}` : "";
    if (s !== sig.current) {
      sig.current = s;
      window.dispatchEvent(new Event(MAZII_SYNC_PROGRESS_EVENT));
    }
    if (next && (next.status === "running" || next.status === "paused")) {
      timer.current = setTimeout(() => void pollRef.current(), POLL_MS);
    }
  }, []);

  useEffect(() => {
    pollRef.current = poll;
    timer.current = setTimeout(() => void poll(), 0);
    const onStart = () => {
      if (timer.current) clearTimeout(timer.current);
      void poll();
    };
    window.addEventListener(MAZII_SYNC_STARTED_EVENT, onStart);
    return () => {
      window.removeEventListener(MAZII_SYNC_STARTED_EVENT, onStart);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [poll]);

  async function act(action: "pause" | "resume" | "cancel") {
    await fetch(`${BASE}/${action}`, { method: "POST" }).catch(() => null);
    if (timer.current) clearTimeout(timer.current);
    void poll();
  }

  async function dismiss() {
    await fetch(BASE, { method: "DELETE" }).catch(() => null);
    setJob(null);
    setMaziiRunning(false);
  }

  if (!job || job.dismissed) return null;
  const active = job.status === "running" || job.status === "paused";
  const paused = job.status === "paused";
  const pct = job.total > 0 ? Math.min(100, Math.round((job.done / job.total) * 100)) : 0;
  const base = "flex h-7 w-7 items-center justify-center rounded-md border text-sm transition-colors";
  const tone = {
    pause: `${base} border-[#f59e0b]/40 bg-[#f59e0b]/15 text-[#b45309] hover:bg-[#f59e0b]/30 dark:text-[#fbbf24]`,
    resume: `${base} border-[#22c55e]/40 bg-[#22c55e]/15 text-[#15803d] hover:bg-[#22c55e]/30 dark:text-[#86efac]`,
    cancel: `${base} border-[#ef4444]/40 bg-[#ef4444]/10 text-[#dc2626] hover:bg-[#ef4444]/25 dark:text-[#fca5a5]`,
    log: `${base} border-[#3b82f6]/40 bg-[#3b82f6]/10 text-[#2563eb] hover:bg-[#3b82f6]/25 dark:text-[#93c5fd]`,
    page: `${base} border-[color-mix(in_srgb,var(--primary)_40%,transparent)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)] hover:bg-[color-mix(in_srgb,var(--primary)_25%,transparent)]`,
  };
  const recent = [...job.log].reverse().slice(0, 100);
  const badge =
    job.status === "running"
      ? "bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] text-[var(--primary)]"
      : job.status === "done"
        ? "bg-[#22c55e]/15 text-[#15803d] dark:text-[#86efac]"
        : "bg-[#f59e0b]/20 text-[#b45309] dark:text-[#fbbf24]"; // paused / cancelled
  const glyph = job.status === "done" ? "✓" : job.status === "cancelled" ? "✕" : paused ? "⏸" : "漢";
  const subtitle =
    job.status === "running"
      ? `Đang xử lý ${job.current || "…"}`
      : paused
        ? "Đã tạm dừng"
        : job.status === "done"
          ? "Hoàn tất"
          : "Đã hủy";

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background-1)] shadow-xl" aria-live="polite">
      <div className="flex items-center gap-3 p-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-semibold ${badge}`} aria-hidden="true">
          {glyph}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--foreground)]">Cập nhật Hán Việt từ Mazii</p>
          <p className="truncate text-xs text-[var(--muted-foreground)]">{subtitle}</p>
        </div>
        {active && <span className="text-lg font-semibold tabular-nums text-[var(--foreground)]">{pct}%</span>}
        {!active && (
          <button
            type="button"
            onClick={() => void dismiss()}
            aria-label="Đóng"
            className="rounded-md px-1.5 py-0.5 text-[var(--muted-foreground)] hover:bg-[var(--layer)] hover:text-[var(--foreground)]"
          >
            ✕
          </button>
        )}
      </div>

      <div className="px-3 pb-3">
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2 overflow-hidden rounded-full bg-[var(--layer)]"
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              paused || job.status === "cancelled"
                ? "bg-[var(--muted-foreground)]"
                : job.status === "done"
                  ? "bg-[#22c55e]"
                  : "bg-gradient-to-r from-[var(--primary)] to-[color-mix(in_srgb,var(--primary)_55%,#22c55e)]"
            }`}
            style={{ width: `${active ? Math.max(pct, 4) : pct}%` }}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted-foreground)]">
          <span className="tabular-nums">
            {job.done}/{job.total} chữ
          </span>
          <span className="rounded-full bg-[#22c55e]/15 px-2 py-0.5 font-semibold text-[#15803d] dark:text-[#86efac]">{job.ok} thành công</span>
          {job.failed > 0 && <span className="rounded-full bg-[#ef4444]/15 px-2 py-0.5 font-semibold text-[#dc2626] dark:text-[#fca5a5]">{job.failed} lỗi</span>}
        </div>

        <div className="mt-3 flex items-center gap-1.5">
          {job.status === "running" && (
            <button type="button" className={tone.pause} onClick={() => void act("pause")} title="Tạm dừng" aria-label="Tạm dừng">
              ⏸
            </button>
          )}
          {paused && (
            <button type="button" className={tone.resume} onClick={() => void act("resume")} title="Tiếp tục" aria-label="Tiếp tục">
              ▶
            </button>
          )}
          {active && (
            <button type="button" className={tone.cancel} onClick={() => void act("cancel")} title="Hủy" aria-label="Hủy">
              ✕
            </button>
          )}
          <button
            type="button"
            className={`${tone.log} ml-auto ${showLog ? "ring-2 ring-[#3b82f6]/40" : ""}`}
            onClick={() => setShowLog((v) => !v)}
            title={showLog ? "Ẩn log" : `Xem log (${job.log.length})`}
            aria-label={showLog ? "Ẩn log" : "Xem log"}
            aria-pressed={showLog}
          >
            ☰
          </button>
          <Link href="/admin/kanji/mazii-log" className={tone.page} title="Mở trang log" aria-label="Mở trang log">
            ↗
          </Link>
        </div>
        {showLog && (
          <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-lg bg-[var(--layer)] p-2 text-xs">
            {recent.length === 0 && <li className="text-[var(--muted-foreground)]">Chưa có log.</li>}
            {recent.map((l, i) => (
              <li key={`${l.at}-${i}`} className={l.ok ? "text-[var(--foreground)]" : "text-[#b91c1c]"}>
                <span className="mr-1 text-[var(--muted-foreground)]">{new Date(l.at).toLocaleTimeString("vi-VN")}</span>
                <span className="mr-1 font-semibold">{l.ok ? "✓" : "✗"} {l.char}</span>
                {l.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
