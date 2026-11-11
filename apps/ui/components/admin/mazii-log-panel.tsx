"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAZII_SYNC_STARTED_EVENT, type MaziiSyncJob } from "./mazii-sync-tracker";

const BASE = "/api/admin/kanji/mazii-sync";
const POLL_MS = 1500;
const STATUS_LABEL: Record<MaziiSyncJob["status"], string> = {
  running: "Đang chạy",
  paused: "Tạm dừng",
  done: "Hoàn tất",
  cancelled: "Đã hủy",
};

/** Full page for the Mazii sync run: progress, controls and the whole log (filterable, live). */
export function MaziiLogPanel() {
  const [job, setJob] = useState<MaziiSyncJob | null>(null);
  const [loaded, setLoaded] = useState(false);
  /** Time of the last poll — the running job's clock moves with it (no impure `Date.now()` in render). */
  const [now, setNow] = useState(0);
  const [filter, setFilter] = useState<"all" | "errors">("all");
  const [search, setSearch] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<() => Promise<void>>(async () => {});

  const poll = useCallback(async () => {
    const res = await fetch(BASE, { cache: "no-store" }).catch(() => null);
    if (res?.ok) {
      const next = (await res.json().catch(() => null)) as MaziiSyncJob | null;
      setJob(next && typeof next === "object" && "id" in next ? next : null);
      setLoaded(true);
      setNow(Date.now());
      if (next && (next.status === "running" || next.status === "paused")) {
        timer.current = setTimeout(() => void pollRef.current(), POLL_MS);
      }
    } else {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    pollRef.current = poll;
    timer.current = setTimeout(() => void poll(), 0);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [poll]);

  async function act(action: "pause" | "resume" | "cancel") {
    await fetch(`${BASE}/${action}`, { method: "POST" }).catch(() => null);
    window.dispatchEvent(new Event(MAZII_SYNC_STARTED_EVENT)); // wake the floating tracker too
    if (timer.current) clearTimeout(timer.current);
    void poll();
  }

  const rows = useMemo(() => {
    const q = search.trim();
    return (job?.log ?? [])
      .filter((l) => (filter === "errors" ? !l.ok : true))
      .filter((l) => (q ? l.char.includes(q) || l.message.includes(q) : true))
      .reverse();
  }, [job, filter, search]);

  const active = job?.status === "running" || job?.status === "paused";
  const paused = job?.status === "paused";
  const pct = job && job.total > 0 ? Math.min(100, Math.round((job.done / job.total) * 100)) : 0;
  const errors = job ? job.log.filter((l) => !l.ok).length : 0;
  const base = "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors";
  const tone = {
    pause: `${base} border-[#f59e0b]/40 bg-[#f59e0b]/15 text-[#b45309] hover:bg-[#f59e0b]/30 dark:text-[#fbbf24]`,
    resume: `${base} border-[#22c55e]/40 bg-[#22c55e]/15 text-[#15803d] hover:bg-[#22c55e]/30 dark:text-[#86efac]`,
    cancel: `${base} border-[#ef4444]/40 bg-[#ef4444]/10 text-[#dc2626] hover:bg-[#ef4444]/25 dark:text-[#fca5a5]`,
  };
  const status = job
    ? {
        running: "bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] text-[var(--primary)]",
        paused: "bg-[#f59e0b]/20 text-[#b45309] dark:text-[#fbbf24]",
        done: "bg-[#22c55e]/15 text-[#15803d] dark:text-[#86efac]",
        cancelled: "bg-[#ef4444]/15 text-[#dc2626] dark:text-[#fca5a5]",
      }[job.status]
    : "";
  const elapsed = job ? Math.max(0, Math.round(((job.finishedAt ?? (now || job.startedAt)) - job.startedAt) / 1000)) : 0;
  const duration = elapsed >= 3600 ? `${Math.floor(elapsed / 3600)}g ${Math.floor((elapsed % 3600) / 60)}p` : elapsed >= 60 ? `${Math.floor(elapsed / 60)}p ${elapsed % 60}s` : `${elapsed}s`;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <Link href="/admin/kanji" className="text-xs font-medium text-[var(--primary)] hover:underline">
        ← Quay lại Quản lý Kanji
      </Link>
      <div className="mt-3 flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] text-2xl font-semibold text-[var(--primary)]" aria-hidden="true">
          漢
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">Log đồng bộ Mazii</h1>
          <p className="mt-0.5 max-w-3xl text-sm text-[var(--muted-foreground)]">
            Lượt cập nhật Hán Việt, On, Kun từ mazii.net gần nhất. Log chỉ lưu trong bộ nhớ server (tối đa 1000 dòng), mất khi server khởi động lại.
          </p>
        </div>
      </div>

      {!loaded && <p className="mt-6 text-sm text-[var(--muted-foreground)]">Đang tải…</p>}
      {loaded && !job && (
        <p className="mt-6 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--background-1)] p-6 text-center text-sm text-[var(--muted-foreground)]">
          Chưa có lượt đồng bộ nào. Vào <Link href="/admin/kanji" className="text-[var(--primary)] hover:underline">Quản lý Kanji</Link> và bấm “Đồng bộ toàn bộ từ Mazii” hoặc chọn các chữ rồi cập nhật.
        </p>
      )}

      {job && (
        <>
          <section className="mt-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background-1)] shadow-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${status}`}>{STATUS_LABEL[job.status]}</span>
              <span className="text-xs text-[var(--muted-foreground)]">
                Bắt đầu {new Date(job.startedAt).toLocaleString("vi-VN")}
                {job.finishedAt && ` · kết thúc ${new Date(job.finishedAt).toLocaleString("vi-VN")}`}
              </span>
              <div className="ml-auto flex gap-2">
                {job.status === "running" && (
                  <button type="button" className={tone.pause} onClick={() => void act("pause")}>
                    ⏸ Tạm dừng
                  </button>
                )}
                {paused && (
                  <button type="button" className={tone.resume} onClick={() => void act("resume")}>
                    ▶ Tiếp tục
                  </button>
                )}
                {active && (
                  <button type="button" className={tone.cancel} onClick={() => void act("cancel")}>
                    ✕ Hủy
                  </button>
                )}
              </div>
            </div>

            <div className="px-4 pb-4">
              <div className="flex items-end justify-between">
                <span className="text-3xl font-semibold tabular-nums text-[var(--foreground)]">{pct}%</span>
                {job.status === "running" && job.current && (
                  <span className="text-xs text-[var(--muted-foreground)]">
                    Đang xử lý <span className="text-base font-semibold text-[var(--foreground)]">{job.current}</span>
                  </span>
                )}
              </div>
              <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="mt-2 h-3 overflow-hidden rounded-full bg-[var(--layer)]">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    paused || job.status === "cancelled"
                      ? "bg-[var(--muted-foreground)]"
                      : job.status === "done"
                        ? "bg-[#22c55e]"
                        : "bg-gradient-to-r from-[var(--primary)] to-[color-mix(in_srgb,var(--primary)_55%,#22c55e)]"
                  }`}
                  style={{ width: `${active ? Math.max(pct, 2) : pct}%` }}
                />
              </div>
            </div>

            <dl className="grid grid-cols-2 divide-x divide-y divide-[var(--border)] border-t border-[var(--border)] text-center sm:grid-cols-4 sm:divide-y-0">
              {[
                { label: "Đã xử lý", value: `${job.done}/${job.total}`, color: "text-[var(--foreground)]" },
                { label: "Thành công", value: String(job.ok), color: "text-[#15803d] dark:text-[#86efac]" },
                { label: "Lỗi", value: String(job.failed), color: job.failed > 0 ? "text-[#dc2626] dark:text-[#fca5a5]" : "text-[var(--foreground)]" },
                { label: "Thời gian", value: duration, color: "text-[var(--foreground)]" },
              ].map((t) => (
                <div key={t.label} className="px-3 py-3">
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">{t.label}</dt>
                  <dd className={`mt-0.5 text-lg font-semibold tabular-nums ${t.color}`}>{t.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {(
              [
                ["all", `Tất cả (${job.log.length})`, "border-[var(--primary)] bg-[var(--primary)] text-white"],
                ["errors", `Chỉ lỗi (${errors})`, "border-[#ef4444] bg-[#ef4444] text-white"],
              ] as const
            ).map(([id, label, on]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  filter === id ? on : "border-[var(--border)] bg-[var(--background-1)] text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
                }`}
              >
                {label}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm chữ Kanji hoặc nội dung…"
              className="ml-auto w-64 max-w-full rounded-full border border-[var(--border)] bg-[var(--background-1)] px-4 py-1.5 text-xs text-[var(--foreground)]"
            />
          </div>

          <div className="mt-3 max-h-[60vh] overflow-auto rounded-2xl border border-[var(--border)] bg-[var(--background-1)] shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-[var(--layer)] text-[var(--muted-foreground)]">
                <tr>
                  <th className="w-24 px-4 py-2.5 font-medium">Giờ</th>
                  <th className="w-20 px-3 py-2.5 font-medium">Chữ</th>
                  <th className="w-16 px-3 py-2.5 font-medium">Kết quả</th>
                  <th className="px-3 py-2.5 font-medium">Nội dung</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-10 text-center text-[var(--muted-foreground)]">
                      Không có dòng log nào.
                    </td>
                  </tr>
                )}
                {rows.map((l, i) => (
                  <tr key={`${l.at}-${i}`} className={`border-t border-[var(--border)] align-middle hover:bg-[var(--layer-hover)] ${l.ok ? "" : "bg-[#ef4444]/5"}`}>
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums text-[var(--muted-foreground)]">{new Date(l.at).toLocaleTimeString("vi-VN")}</td>
                    <td className="px-3 py-2">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--layer)] text-xl font-semibold text-[var(--foreground)]">{l.char}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        role="img"
                        aria-label={l.ok ? "Thành công" : "Lỗi"}
                        title={l.ok ? "Thành công" : "Lỗi"}
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                          l.ok ? "bg-[#22c55e]/15 text-[#16a34a] dark:text-[#4ade80]" : "bg-[#ef4444]/15 text-[#dc2626] dark:text-[#f87171]"
                        }`}
                      >
                        {l.ok ? "✓" : "✗"}
                      </span>
                    </td>
                    <td className={`px-3 py-2 ${l.ok ? "text-[var(--foreground)]" : "text-[#b91c1c] dark:text-[#fca5a5]"}`}>{l.message}</td>
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
