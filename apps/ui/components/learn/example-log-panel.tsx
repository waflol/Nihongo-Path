"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EXAMPLES_STARTED_EVENT } from "@/components/learn/example-job-tracker";
import { LogTabs } from "@/components/learn/log-tabs";

interface ExamplesLog {
  deckId: string;
  title: string;
  ran: boolean;
  finished: boolean;
  startedAt: number;
  finishedAt?: number;
  total: number;
  serviceId: string;
  batch: number;
  items: { stt: number; word: string; ok: boolean; sentence: string; translation: string; source: string }[];
}

interface Job {
  deckId: string;
  total: number;
  done: number;
  paused: boolean;
}

const SOURCE: Record<string, string> = { tatoeba: "Tatoeba", "ai-translated": "Tatoeba + AI dịch", ai: "AI tạo" };

/** Log of the latest “Tạo ví dụ” run of a deck: progress, and per card the sentence found (or none). */
export function ExamplesLogPanel({ deckId, mode }: { deckId: string; mode: "learn" | "admin" }) {
  const root = mode === "admin" ? "/admin/decks" : "/learn/decks";
  const [log, setLog] = useState<ExamplesLog | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [only, setOnly] = useState<"all" | "ok" | "miss">("all");
  const [serviceName, setServiceName] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<() => Promise<void>>(async () => {});

  const poll = useCallback(async () => {
    const [lr, jr] = await Promise.all([
      fetch(`/api/flashcards/import/examples/${deckId}/log`, { cache: "no-store" }).catch(() => null),
      fetch("/api/flashcards/example-jobs", { cache: "no-store" }).catch(() => null),
    ]);
    if (!lr?.ok) {
      setError(true);
      return;
    }
    setLog((await lr.json()) as ExamplesLog);
    const jobs = jr?.ok ? ((await jr.json().catch(() => [])) as Job[]) : [];
    const mine = Array.isArray(jobs) ? (jobs.find((j) => j.deckId === deckId) ?? null) : null;
    setJob(mine);
    if (mine && !mine.paused) timer.current = setTimeout(() => void pollRef.current(), 2000);
  }, [deckId]);

  useEffect(() => {
    pollRef.current = poll;
    timer.current = setTimeout(() => void poll(), 0);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [poll]);

  // The model's name, for admins (the list is admin-only; others just see "Tự động").
  useEffect(() => {
    if (!log?.serviceId) return;
    fetch("/api/flashcards/admin/ai/services", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((l: { id: string; label: string; model: string }[]) => {
        const s = Array.isArray(l) ? l.find((x) => x.id === log.serviceId) : null;
        if (s) setServiceName(s.label && s.model && !s.label.includes(s.model) ? `${s.label} · ${s.model}` : s.label || s.model);
      })
      .catch(() => undefined);
  }, [log?.serviceId]);

  async function act(action: "pause" | "resume" | "stop") {
    await fetch(`/api/flashcards/import/examples/${deckId}/${action}`, { method: "POST" }).catch(() => null);
    window.dispatchEvent(new Event(EXAMPLES_STARTED_EVENT)); // wake the floating tracker too
    if (timer.current) clearTimeout(timer.current);
    void poll();
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (log?.items ?? [])
      .filter((c) => (only === "all" ? true : only === "ok" ? c.ok : !c.ok))
      .filter((c) => !q || [String(c.stt), c.word, c.sentence, c.translation].some((v) => v.toLowerCase().includes(q)))
      .sort((a, b) => a.stt - b.stt);
  }, [log, search, only]);

  const active = !!job;
  const paused = !!job?.paused;
  const total = job?.total ?? log?.total ?? 0;
  const done = job?.done ?? (log?.finished ? total : (log?.items.length ?? 0));
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : log?.finished ? 100 : 0;
  const okCount = log?.items.filter((i) => i.ok).length ?? 0;
  const missCount = (log?.items.length ?? 0) - okCount;
  const state = active
    ? paused
      ? ["Tạm dừng", "bg-[#f59e0b]/20 text-[#b45309] dark:text-[#fbbf24]"]
      : ["Đang chạy", "bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] text-[var(--primary)]"]
    : log?.finished
      ? ["Hoàn tất", "bg-[#22c55e]/15 text-[#15803d] dark:text-[#86efac]"]
      : ["Đã dừng", "bg-[#ef4444]/15 text-[#dc2626] dark:text-[#fca5a5]"];
  const base = "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <Link href={`${root}/${deckId}`} className="text-xs font-medium text-[var(--primary)] hover:underline">
        ← Quay lại bộ thẻ
      </Link>
      <div className="mt-3 flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] text-2xl" aria-hidden="true">
          ✨
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">Log tạo ví dụ</h1>
          <p className="mt-0.5 max-w-3xl text-sm text-[var(--muted-foreground)]">
            {log ? `${log.title} · ` : ""}Từng thẻ ở lần tạo ví dụ gần nhất: câu tìm được và nguồn của nó.
          </p>
        </div>
      </div>
      <LogTabs root={root} deckId={deckId} active="examples" />

      {error && <p className="mt-6 text-sm text-[#dc2626]">Không tải được log.</p>}
      {!error && !log && <p className="mt-6 text-sm text-[var(--muted-foreground)]">Đang tải…</p>}
      {log && !log.ran && !job && (
        <p className="mt-6 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--background-1)] p-6 text-center text-sm text-[var(--muted-foreground)]">
          Chưa có lượt tạo ví dụ nào (log chỉ giữ đến khi máy chủ khởi động lại). Bấm “✨ Tạo ví dụ” ở trang bộ thẻ.
        </p>
      )}

      {log && (log.ran || job) && (
        <>
          <section className="mt-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background-1)] shadow-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${state[1]}`}>{state[0]}</span>
              {log.ran && (
                <span className="text-xs text-[var(--muted-foreground)]">
                  Bắt đầu {new Date(log.startedAt).toLocaleString("vi-VN")}
                  {log.finishedAt && ` · kết thúc ${new Date(log.finishedAt).toLocaleString("vi-VN")}`}
                </span>
              )}
              {log.ran && (
                <span className="text-xs text-[var(--muted-foreground)]">
                  · Model: {log.serviceId ? serviceName || "đã chọn" : "tự động"} · {log.batch || 10} thẻ/lần
                </span>
              )}
              <div className="ml-auto flex gap-2">
                {active && !paused && (
                  <button type="button" className={`${base} border-[#f59e0b]/40 bg-[#f59e0b]/15 text-[#b45309] hover:bg-[#f59e0b]/30 dark:text-[#fbbf24]`} onClick={() => void act("pause")}>
                    ⏸ Tạm dừng
                  </button>
                )}
                {paused && (
                  <button type="button" className={`${base} border-[#22c55e]/40 bg-[#22c55e]/15 text-[#15803d] hover:bg-[#22c55e]/30 dark:text-[#86efac]`} onClick={() => void act("resume")}>
                    ▶ Tiếp tục
                  </button>
                )}
                {active && (
                  <button type="button" className={`${base} border-[#ef4444]/40 bg-[#ef4444]/10 text-[#dc2626] hover:bg-[#ef4444]/25 dark:text-[#fca5a5]`} onClick={() => void act("stop")}>
                    ✕ Hủy
                  </button>
                )}
              </div>
            </div>
            <div className="px-4 pb-4">
              <span className="text-3xl font-semibold tabular-nums text-[var(--foreground)]">{pct}%</span>
              <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="mt-2 h-3 overflow-hidden rounded-full bg-[var(--layer)]">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${paused || (!active && !log.finished) ? "bg-[var(--muted-foreground)]" : !active ? "bg-[#22c55e]" : "bg-gradient-to-r from-[var(--primary)] to-[color-mix(in_srgb,var(--primary)_55%,#22c55e)]"}`}
                  style={{ width: `${active ? Math.max(pct, 2) : pct}%` }}
                />
              </div>
            </div>
            <dl className="grid grid-cols-3 divide-x divide-[var(--border)] border-t border-[var(--border)] text-center">
              {[
                { label: "Đã xử lý", value: `${done}/${total}`, color: "text-[var(--foreground)]" },
                { label: "Có ví dụ", value: String(okCount), color: "text-[#15803d] dark:text-[#86efac]" },
                { label: "Không tìm được", value: String(missCount), color: missCount > 0 ? "text-[#b45309] dark:text-[#fbbf24]" : "text-[var(--foreground)]" },
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
                ["all", `Tất cả (${log.items.length})`],
                ["ok", `Có ví dụ (${okCount})`],
                ["miss", `Không tìm được (${missCount})`],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={only === k}
                onClick={() => setOnly(k)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold ${only === k ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--layer-hover)]"}`}
              >
                {label}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm STT, từ hoặc câu…"
              className="ml-auto w-64 max-w-full rounded-full border border-[var(--border)] bg-[var(--background-1)] px-4 py-1.5 text-xs text-[var(--foreground)]"
            />
          </div>

          <div className="mt-3 max-h-[60vh] overflow-auto rounded-2xl border border-[var(--border)] bg-[var(--background-1)] shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-[var(--layer)] text-[var(--muted-foreground)]">
                <tr>
                  <th className="w-20 px-4 py-2.5 font-medium">STT</th>
                  <th className="px-3 py-2.5 font-medium">Từ</th>
                  <th className="px-3 py-2.5 font-medium">Ví dụ</th>
                  <th className="w-32 px-3 py-2.5 font-medium">Nguồn</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-10 text-center text-[var(--muted-foreground)]">
                      {log.items.length === 0 ? "Chưa có thẻ nào được xử lý." : "Không có dòng khớp."}
                    </td>
                  </tr>
                )}
                {rows.map((c, i) => (
                  <tr key={`${c.stt}-${i}`} className="border-t border-[var(--border)] align-top hover:bg-[var(--layer-hover)]">
                    <td className="px-4 py-2 tabular-nums text-[var(--muted-foreground)]">{c.stt}</td>
                    <td className="px-3 py-2 text-base font-semibold text-[var(--foreground)]">{c.word}</td>
                    <td className="px-3 py-2">
                      {c.ok ? (
                        <>
                          <p className="text-[var(--foreground)]">{c.sentence}</p>
                          {c.translation && <p className="mt-0.5 text-[var(--muted-foreground)]">{c.translation}</p>}
                        </>
                      ) : (
                        <span className="text-[#b45309] dark:text-[#fbbf24]">Không tìm được ví dụ</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[var(--muted-foreground)]">{SOURCE[c.source] ?? ""}</td>
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
