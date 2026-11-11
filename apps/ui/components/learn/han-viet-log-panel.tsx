"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RECHECK_STARTED_EVENT } from "@/components/learn/recheck-tracker";

interface HanVietLog {
  deckId: string;
  title: string;
  ran: boolean;
  finished: boolean;
  total: number;
  startedAt: number;
  finishedAt?: number;
  changes: { stt: number; word: string; oldHanViet: string; newHanViet: string }[];
}

interface Job {
  deckId: string;
  status: "running" | "paused" | "done" | "error";
  done: number;
  total: number;
  field?: string;
  flagged?: number;
  changed?: number;
  error?: string;
}

/** Log of the latest “Kiểm tra Hán tự” run of a deck: which word (STT) changed, old → new Hán Việt. */
export function HanVietLogPanel({ deckId, mode }: { deckId: string; mode: "learn" | "admin" }) {
  const [log, setLog] = useState<HanVietLog | null>(null);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const back = `${mode === "admin" ? "/admin/decks" : "/learn/decks"}/${deckId}`;

  const [job, setJob] = useState<Job | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<() => Promise<void>>(async () => {});

  const poll = useCallback(async () => {
    const [lr, jr] = await Promise.all([
      fetch(`/api/flashcards/decks/${deckId}/han-viet-log`, { cache: "no-store" }).catch(() => null),
      fetch("/api/flashcards/recheck-jobs", { cache: "no-store" }).catch(() => null),
    ]);
    if (!lr?.ok) {
      setError(true);
      return;
    }
    setLog((await lr.json()) as HanVietLog);
    const jobs = jr?.ok ? ((await jr.json().catch(() => [])) as Job[]) : [];
    const mine = Array.isArray(jobs) ? (jobs.find((j) => j.deckId === deckId && j.field === "hanViet") ?? null) : null;
    setJob(mine);
    if (mine && (mine.status === "running" || mine.status === "paused")) timer.current = setTimeout(() => void pollRef.current(), 1500);
  }, [deckId]);

  useEffect(() => {
    pollRef.current = poll;
    timer.current = setTimeout(() => void poll(), 0);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [poll]);

  async function act(action: "pause" | "resume" | "cancel") {
    if (action === "cancel") await fetch(`/api/flashcards/recheck-jobs/${deckId}`, { method: "DELETE" }).catch(() => null);
    else await fetch(`/api/flashcards/recheck-jobs/${deckId}/${action}`, { method: "POST" }).catch(() => null);
    window.dispatchEvent(new Event(RECHECK_STARTED_EVENT)); // wake the floating tracker too
    if (timer.current) clearTimeout(timer.current);
    void poll();
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (log?.changes ?? [])
      .filter((c) => !q || [String(c.stt), c.word, c.oldHanViet, c.newHanViet].some((v) => v.toLowerCase().includes(q)))
      .sort((a, b) => a.stt - b.stt);
  }, [log, search]);

  const active = job?.status === "running" || job?.status === "paused";
  const paused = job?.status === "paused";
  const pct = job && job.total > 0 ? Math.min(100, Math.round((job.done / job.total) * 100)) : log?.finished ? 100 : 0;
  const base = "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors";
  const tone = {
    pause: `${base} border-[#f59e0b]/40 bg-[#f59e0b]/15 text-[#b45309] hover:bg-[#f59e0b]/30 dark:text-[#fbbf24]`,
    resume: `${base} border-[#22c55e]/40 bg-[#22c55e]/15 text-[#15803d] hover:bg-[#22c55e]/30 dark:text-[#86efac]`,
    cancel: `${base} border-[#ef4444]/40 bg-[#ef4444]/10 text-[#dc2626] hover:bg-[#ef4444]/25 dark:text-[#fca5a5]`,
  };
  const state = job
    ? {
        running: ["Đang chạy", "bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] text-[var(--primary)]"],
        paused: ["Tạm dừng", "bg-[#f59e0b]/20 text-[#b45309] dark:text-[#fbbf24]"],
        done: ["Hoàn tất", "bg-[#22c55e]/15 text-[#15803d] dark:text-[#86efac]"],
        error: [job.error ?? "Đã dừng", "bg-[#ef4444]/15 text-[#dc2626] dark:text-[#fca5a5]"],
      }[job.status]
    : log?.ran
      ? log.finished
        ? ["Hoàn tất", "bg-[#22c55e]/15 text-[#15803d] dark:text-[#86efac]"]
        : ["Đã dừng", "bg-[#ef4444]/15 text-[#dc2626] dark:text-[#fca5a5]"]
      : null;
  const changed = job?.changed ?? log?.changes.length ?? 0;
  const done = job?.done ?? log?.total ?? 0;
  const total = job?.total ?? log?.total ?? 0;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <Link href={back} className="text-xs font-medium text-[var(--primary)] hover:underline">
        ← Quay lại bộ thẻ
      </Link>
      <div className="mt-3 flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] text-2xl font-semibold text-[var(--primary)]" aria-hidden="true">
          漢
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">Log kiểm tra Hán tự</h1>
          <p className="mt-0.5 max-w-3xl text-sm text-[var(--muted-foreground)]">
            {log ? `${log.title} · ` : ""}Những từ được cập nhật Hán Việt ở lần kiểm tra gần nhất, đối chiếu với dữ liệu Kanji admin.
          </p>
        </div>
      </div>

      {error && <p className="mt-6 text-sm text-[#dc2626]">Không tải được log.</p>}
      {!error && !log && <p className="mt-6 text-sm text-[var(--muted-foreground)]">Đang tải…</p>}
      {log && !log.ran && !job && (
        <p className="mt-6 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--background-1)] p-6 text-center text-sm text-[var(--muted-foreground)]">
          Chưa có lượt kiểm tra Hán tự nào. Bấm “↻ Kiểm tra Hán tự” ở trang bộ thẻ.
        </p>
      )}

      {log && (log.ran || job) && state && (
        <>
          <section className="mt-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background-1)] shadow-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${state[1]}`}>{state[0]}</span>
              {log.ran && <span className="text-xs text-[var(--muted-foreground)]">Bắt đầu {new Date(log.startedAt).toLocaleString("vi-VN")}{log.finishedAt && ` · kết thúc ${new Date(log.finishedAt).toLocaleString("vi-VN")}`}</span>}
              <div className="ml-auto flex gap-2">
                {job?.status === "running" && (
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
              <span className="text-3xl font-semibold tabular-nums text-[var(--foreground)]">{pct}%</span>
              <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="mt-2 h-3 overflow-hidden rounded-full bg-[var(--layer)]">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    paused || job?.status === "error" || (!job && !log.finished)
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
                { label: "Đã xử lý", value: `${done}/${total}`, color: "text-[var(--foreground)]" },
                { label: "Đã sửa", value: String(changed), color: "text-[#15803d] dark:text-[#86efac]" },
                { label: "Cần xem xét", value: String(job?.flagged ?? 0), color: (job?.flagged ?? 0) > 0 ? "text-[#b45309] dark:text-[#fbbf24]" : "text-[var(--foreground)]" },
              ].map((t) => (
                <div key={t.label} className="px-3 py-3">
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">{t.label}</dt>
                  <dd className={`mt-0.5 text-lg font-semibold tabular-nums ${t.color}`}>{t.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[var(--primary)] bg-[var(--primary)] px-3.5 py-1.5 text-xs font-semibold text-white">Tất cả ({log.changes.length})</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm STT, từ hoặc Hán Việt…"
              className="ml-auto w-64 max-w-full rounded-full border border-[var(--border)] bg-[var(--background-1)] px-4 py-1.5 text-xs text-[var(--foreground)]"
            />
          </div>

          <div className="mt-3 max-h-[60vh] overflow-auto rounded-2xl border border-[var(--border)] bg-[var(--background-1)] shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-[var(--layer)] text-[var(--muted-foreground)]">
                <tr>
                  <th className="w-20 px-4 py-2.5 font-medium">STT</th>
                  <th className="px-3 py-2.5 font-medium">Từ</th>
                  <th className="px-3 py-2.5 font-medium">Hán Việt cũ</th>
                  <th className="px-3 py-2.5 font-medium">Hán Việt mới</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-10 text-center text-[var(--muted-foreground)]">
                      {log.changes.length === 0 ? "Chưa có từ nào cần sửa Hán Việt." : "Không có dòng khớp."}
                    </td>
                  </tr>
                )}
                {rows.map((c, i) => (
                  <tr key={`${c.stt}-${i}`} className="border-t border-[var(--border)] align-middle hover:bg-[var(--layer-hover)]">
                    <td className="px-4 py-2 tabular-nums text-[var(--muted-foreground)]">{c.stt}</td>
                    <td className="px-3 py-2 text-base font-semibold text-[var(--foreground)]">{c.word}</td>
                    <td className="px-3 py-2 text-[#dc2626] dark:text-[#fca5a5]">{c.oldHanViet || "(trống)"}</td>
                    <td className="px-3 py-2 font-medium text-[#15803d] dark:text-[#86efac]">{c.newHanViet}</td>
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
