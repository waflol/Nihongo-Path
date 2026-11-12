"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RECHECK_STARTED_EVENT } from "@/components/learn/recheck-tracker";
import { ExamplesLogPanel } from "@/components/learn/example-log-panel";
import { LogTabs } from "@/components/learn/log-tabs";

interface HanVietLog {
  deckId: string;
  title: string;
  ran: boolean;
  finished: boolean;
  total: number;
  startedAt: number;
  finishedAt?: number;
  changes: { stt: number; word: string; oldHanViet: string; newHanViet: string }[];
  reading: FlagLog;
  back: FlagLog;
}

interface FlagLog {
  ran: boolean;
  finished: boolean;
  total: number;
  startedAt: number;
  finishedAt?: number;
  flags: { stt: number; word: string; issue: string }[];
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

/** Log page of a deck: the checks (Hán tự / phát âm / nghĩa) or the example generation, picked by `?field=`. */
export function HanVietLogPanel({ deckId, mode }: { deckId: string; mode: "learn" | "admin" }) {
  return useSearchParams().get("field") === "examples" ? <ExamplesLogPanel deckId={deckId} mode={mode} /> : <CheckLogPanel deckId={deckId} mode={mode} />;
}

/** Log of the latest “Kiểm tra Hán tự” run of a deck: which word (STT) changed, old → new Hán Việt. */
function CheckLogPanel({ deckId, mode }: { deckId: string; mode: "learn" | "admin" }) {
  const sp = useSearchParams().get("field");
  // Reading and meaning share one log (they are checked together); old ?field=reading / back links land there too.
  const field: "hanViet" | "readingBack" = sp === "reading" || sp === "back" || sp === "readingBack" ? "readingBack" : "hanViet";
  const flagMode = field !== "hanViet";
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
    const mine = Array.isArray(jobs) ? (jobs.find((j) => j.deckId === deckId && (field === "hanViet" ? j.field === "hanViet" : j.field === "reading" || j.field === "back" || j.field === "readingBack")) ?? null) : null;
    setJob(mine);
    if (mine && (mine.status === "running" || mine.status === "paused")) timer.current = setTimeout(() => void pollRef.current(), 1500);
  }, [deckId, field]);

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

  // Reading + meaning: merge the two flag logs of the latest run(s) into one list.
  const fl = useMemo(() => {
    if (!flagMode || !log) return null;
    const parts = [log.reading, log.back].filter((p) => p?.ran);
    const flags = [
      ...(log.reading?.flags ?? []).map((f) => ({ ...f, kind: "Phát âm" })),
      ...(log.back?.flags ?? []).map((f) => ({ ...f, kind: "Nghĩa" })),
    ].sort((a, b) => a.stt - b.stt);
    return {
      ran: parts.length > 0,
      finished: parts.length > 0 && parts.every((p) => p.finished),
      total: Math.max(0, ...parts.map((p) => p.total)),
      startedAt: Math.max(0, ...parts.map((p) => p.startedAt)),
      finishedAt: parts.every((p) => p.finishedAt) ? Math.max(0, ...parts.map((p) => p.finishedAt ?? 0)) : undefined,
      flags,
    };
  }, [flagMode, log]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (log?.changes ?? [])
      .filter((c) => !q || [String(c.stt), c.word, c.oldHanViet, c.newHanViet].some((v) => v.toLowerCase().includes(q)))
      .sort((a, b) => a.stt - b.stt);
  }, [log, search]);
  const flagRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (fl?.flags ?? []).filter((c) => !q || [String(c.stt), c.word, c.issue].some((v) => v.toLowerCase().includes(q)));
  }, [fl, search]);
  const meta = { hanViet: { title: "Log kiểm tra Hán tự", glyph: "漢", cmd: "Kiểm tra Hán tự" }, readingBack: { title: "Log kiểm tra từ vựng", glyph: "音", cmd: "Kiểm tra từ vựng" } }[field];
  const ranAny = flagMode ? !!fl?.ran : !!log?.ran;
  const finishedAny = flagMode ? !!fl?.finished : !!log?.finished;
  const startedAt = (flagMode ? fl?.startedAt : log?.startedAt) ?? 0;
  const finishedAt = flagMode ? fl?.finishedAt : log?.finishedAt;
  const logTotal = (flagMode ? fl?.total : log?.total) ?? 0;
  const count = flagMode ? (fl?.flags.length ?? 0) : (log?.changes.length ?? 0);

  const active = job?.status === "running" || job?.status === "paused";
  const paused = job?.status === "paused";
  const pct = job && job.total > 0 ? Math.min(100, Math.round((job.done / job.total) * 100)) : finishedAny ? 100 : 0;
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
    : ranAny
      ? finishedAny
        ? ["Hoàn tất", "bg-[#22c55e]/15 text-[#15803d] dark:text-[#86efac]"]
        : ["Đã dừng", "bg-[#ef4444]/15 text-[#dc2626] dark:text-[#fca5a5]"]
      : null;
  const changed = job?.changed ?? count;
  const done = job?.done ?? logTotal;
  const total = job?.total ?? logTotal;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <Link href={back} className="text-xs font-medium text-[var(--primary)] hover:underline">
        ← Quay lại bộ thẻ
      </Link>
      <div className="mt-3 flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] text-2xl font-semibold text-[var(--primary)]" aria-hidden="true">
          {meta.glyph}
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">{meta.title}</h1>
          <p className="mt-0.5 max-w-3xl text-sm text-[var(--muted-foreground)]">
            {log ? `${log.title} · ` : ""}{flagMode ? "Những từ cần xem xét ở lần kiểm tra gần nhất." : "Những từ được cập nhật Hán Việt ở lần kiểm tra gần nhất, đối chiếu với dữ liệu Kanji admin."}
          </p>
        </div>
      </div>

      <LogTabs root={mode === "admin" ? "/admin/decks" : "/learn/decks"} deckId={deckId} active={field} />

      {error && <p className="mt-6 text-sm text-[#dc2626]">Không tải được log.</p>}
      {!error && !log && <p className="mt-6 text-sm text-[var(--muted-foreground)]">Đang tải…</p>}
      {log && !ranAny && !job && (
        <p className="mt-6 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--background-1)] p-6 text-center text-sm text-[var(--muted-foreground)]">
          Chưa có lượt {meta.cmd.toLowerCase()} nào. Bấm “↻ {meta.cmd}” ở trang bộ thẻ.
        </p>
      )}

      {log && (ranAny || job) && state && (
        <>
          <section className="mt-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background-1)] shadow-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${state[1]}`}>{state[0]}</span>
              {ranAny && <span className="text-xs text-[var(--muted-foreground)]">Bắt đầu {new Date(startedAt).toLocaleString("vi-VN")}{finishedAt && ` · kết thúc ${new Date(finishedAt).toLocaleString("vi-VN")}`}</span>}
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
                    paused || job?.status === "error" || (!job && !finishedAny)
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
                flagMode
                  ? { label: "Cần xem xét", value: String(job?.flagged ?? count), color: (job?.flagged ?? count) > 0 ? "text-[#b45309] dark:text-[#fbbf24]" : "text-[var(--foreground)]" }
                  : { label: "Đã sửa", value: String(changed), color: "text-[#15803d] dark:text-[#86efac]" },
                { label: flagMode ? "Hoàn thành" : "Cần xem xét", value: flagMode ? `${pct}%` : String(job?.flagged ?? 0), color: !flagMode && (job?.flagged ?? 0) > 0 ? "text-[#b45309] dark:text-[#fbbf24]" : "text-[var(--foreground)]" },
              ].map((t) => (
                <div key={t.label} className="px-3 py-3">
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">{t.label}</dt>
                  <dd className={`mt-0.5 text-lg font-semibold tabular-nums ${t.color}`}>{t.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[var(--primary)] bg-[var(--primary)] px-3.5 py-1.5 text-xs font-semibold text-white">Tất cả ({count})</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={flagMode ? "Tìm STT, từ hoặc cảnh báo…" : "Tìm STT, từ hoặc Hán Việt…"}
              className="ml-auto w-64 max-w-full rounded-full border border-[var(--border)] bg-[var(--background-1)] px-4 py-1.5 text-xs text-[var(--foreground)]"
            />
          </div>

          <div className="mt-3 max-h-[60vh] overflow-auto rounded-2xl border border-[var(--border)] bg-[var(--background-1)] shadow-sm">
            {flagMode ? (
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-[var(--layer)] text-[var(--muted-foreground)]">
                  <tr>
                    <th className="w-20 px-4 py-2.5 font-medium">STT</th>
                    <th className="px-3 py-2.5 font-medium">Từ</th>
                    <th className="w-24 px-3 py-2.5 font-medium">Loại</th>
                    <th className="px-3 py-2.5 font-medium">Cảnh báo</th>
                  </tr>
                </thead>
                <tbody>
                  {flagRows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-10 text-center text-[var(--muted-foreground)]">
                        {count === 0 ? "Chưa có từ nào cần xem xét." : "Không có dòng khớp."}
                      </td>
                    </tr>
                  )}
                  {flagRows.map((c, i) => (
                    <tr key={`${c.stt}-${i}`} className="border-t border-[var(--border)] align-middle hover:bg-[var(--layer-hover)]">
                      <td className="px-4 py-2 tabular-nums text-[var(--muted-foreground)]">{c.stt}</td>
                      <td className="px-3 py-2 text-base font-semibold text-[var(--foreground)]">{c.word}</td>
                      <td className="px-3 py-2 text-[var(--muted-foreground)]">{c.kind}</td>
                      <td className="px-3 py-2 text-[#b45309] dark:text-[#fbbf24]">{c.issue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
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
            )}
          </div>
        </>
      )}
    </div>
  );
}
