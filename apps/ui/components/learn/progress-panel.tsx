"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Stats {
  total: number;
  unseen: number;
  levels: { key: string; count: number }[];
  newToday: number;
  newPerDay: number;
  series: { key: string; reviews: number; newCards: number }[];
  reviewsInRange: number;
  newInRange: number;
  label: string;
  offset: number;
}

type Range = "week" | "month" | "year" | "all";
const RANGES: { key: Range; label: string }[] = [
  { key: "week", label: "Tuần" },
  { key: "month", label: "Tháng" },
  { key: "year", label: "Năm" },
  { key: "all", label: "Tất cả" },
];

function barLabel(key: string, range: Range): string {
  if (range === "year") return `T${Number(key.slice(5, 7))}`;
  return range === "week" ? `${key.slice(8)}/${key.slice(5, 7)}` : String(Number(key.slice(8)));
}

const LEVELS: Record<string, { label: string; hint: string; color: string }> = {
  hard: { label: "Khó nhớ", hint: "Hay quên / vừa quên", color: "#dc2626" },
  learning: { label: "Đang học", hint: "Giãn cách < 7 ngày", color: "#f59e0b" },
  young: { label: "Khá nhớ", hint: "7–20 ngày", color: "#3b82f6" },
  known: { label: "Đã thuộc", hint: "21–59 ngày", color: "#10b981" },
  mastered: { label: "Thuộc sâu", hint: "≥ 60 ngày", color: "#047857" },
};
const UNSEEN_COLOR = "#9ca3af";

/** Daily new-card limit + mastery distribution chart for the learner. */
export function ProgressPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [perDay, setPerDay] = useState("20");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("week");
  const [shift, setShift] = useState(0); // 0 = current period, -1 = previous…

  // Per-period cache + latest-request guard: revisiting a period is instant,
  // and a slow earlier response can never overwrite a newer selection.
  const cache = useRef(new Map<string, Stats>());
  const latest = useRef(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (force = false) => {
    const key = `${range}:${shift}`;
    const id = ++latest.current;
    const hit = cache.current.get(key);
    if (hit && !force) {
      setStats(hit);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/srs/stats?range=${range}&offset=${shift}`, { cache: "no-store" });
      if (!res.ok || id !== latest.current) return;
      const data = (await res.json()) as Stats;
      if (id !== latest.current) return;
      cache.current.set(key, data);
      setStats(data);
      setPerDay(String(data.newPerDay));
    } catch {
      /* keep the previous data on screen */
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [range, shift]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    const n = Math.round(Number(perDay));
    if (!Number.isFinite(n) || n < 1 || n > 500) {
      setMsg("Nhập số từ 1 đến 500");
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/srs/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newCardsPerDay: n }),
      });
      setMsg(res.ok ? "Đã lưu" : "Không lưu được");
      if (res.ok) {
        cache.current.clear();
        await load(true);
      }
    } catch {
      setMsg("Không lưu được");
    } finally {
      setSaving(false);
    }
  }

  const segments = stats
    ? [
        ...stats.levels.map((l) => ({ key: l.key, count: l.count, ...LEVELS[l.key] })),
        { key: "unseen", count: stats.unseen, label: "Chưa học", hint: "Thẻ mới", color: UNSEEN_COLOR },
      ]
    : [];
  const sum = segments.reduce((a, s) => a + s.count, 0);
  const learned = stats ? stats.total - stats.unseen : 0;

  // Donut geometry
  const R = 52;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <section
      aria-busy={loading}
      className={
        "mt-8 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-6 transition-opacity " +
        (loading && stats ? "opacity-60" : "")
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">
          Tiến độ ghi nhớ
        </h2>
        <div role="tablist" aria-label="Khoảng thời gian" className="inline-flex rounded-lg border border-[var(--border)] p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={range === r.key}
              onClick={() => {
                setRange(r.key);
                setShift(0);
              }}
              className={
                "rounded-md px-3 py-1 text-xs font-medium " +
                (range === r.key
                  ? "bg-[var(--foreground)] text-[var(--background)]"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]")
              }
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {!stats ? (
        <p className="mt-3 text-sm text-[var(--muted-foreground)]">Đang tải…</p>
      ) : (
        <div className="mt-4 grid gap-6 sm:grid-cols-[180px_1fr]">
          <div className="relative mx-auto h-44 w-44">
            <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" role="img" aria-label="Biểu đồ mức độ ghi nhớ">
              <circle cx="60" cy="60" r={R} fill="none" stroke="var(--border)" strokeWidth="14" />
              {sum > 0 &&
                segments.map((s) => {
                  if (s.count === 0) return null;
                  const len = (s.count / sum) * C;
                  const el = (
                    <circle
                      key={s.key}
                      cx="60"
                      cy="60"
                      r={R}
                      fill="none"
                      stroke={s.color}
                      strokeWidth="14"
                      strokeDasharray={`${len} ${C - len}`}
                      strokeDashoffset={-offset}
                    />
                  );
                  offset += len;
                  return el;
                })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-semibold text-[var(--foreground)]">{learned}</span>
              <span className="text-xs text-[var(--muted-foreground)]">/ {stats.total} thẻ đã học</span>
            </div>
          </div>

          <ul className="space-y-2 self-center">
            {segments.map((s) => (
              <li key={s.key} className="flex items-center gap-3 text-sm">
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: s.color }} />
                <span className="font-medium text-[var(--foreground)]">{s.label}</span>
                <span className="text-xs text-[var(--muted-foreground)]">{s.hint}</span>
                <span className="ml-auto tabular-nums text-[var(--foreground)]">
                  {s.count}
                  {sum > 0 && (
                    <span className="ml-1 text-xs text-[var(--muted-foreground)]">
                      ({Math.round((s.count / sum) * 100)}%)
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {range !== "all" && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => setShift((o) => o - 1)}
            aria-label="Kỳ trước"
            className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
          >
            ‹
          </button>
          <span className="min-w-40 text-center font-medium text-[var(--foreground)]">
            {stats?.label ?? "…"}
          </span>
          <button
            type="button"
            onClick={() => setShift((o) => Math.min(0, o + 1))}
            disabled={shift >= 0}
            aria-label="Kỳ sau"
            className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[var(--foreground)] hover:bg-[var(--layer-hover)] disabled:opacity-40"
          >
            ›
          </button>
          {shift < 0 && (
            <button
              type="button"
              onClick={() => setShift(0)}
              className="text-xs text-[var(--primary)] hover:underline"
            >
              Hiện tại
            </button>
          )}
        </div>
      )}

      {stats && range !== "all" && stats.series.length > 0 && (() => {
        const max = Math.max(1, ...stats.series.map((b) => b.reviews));
        const step = range === "month" ? 5 : 1;
        return (
          <div className="mt-6 border-t border-[var(--border)] pt-4">
            <p className="text-sm font-medium text-[var(--foreground)]">
              Hoạt động học
              <span className="ml-2 text-xs font-normal text-[var(--muted-foreground)]">
                {stats.reviewsInRange} lượt ôn · {stats.newInRange} từ mới
              </span>
            </p>
            <div className="mt-3 flex h-28 items-end gap-1" role="img" aria-label="Số lượt ôn theo thời gian">
              {stats.series.map((b) => (
                <div
                  key={b.key}
                  className="flex h-full min-w-0 flex-1 items-end"
                  title={`${b.key}: ${b.reviews} lượt ôn, ${b.newCards} từ mới`}
                >
                  <div
                    className="w-full rounded-t bg-[#3b82f6]"
                    style={{ height: `${(b.reviews / max) * 100}%`, minHeight: b.reviews ? 2 : 0 }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-1">
              {stats.series.map((b, i) => (
                <span key={b.key} className="min-w-0 flex-1 text-center text-[10px] text-[var(--muted-foreground)]">
                  {i % step === 0 || i === stats.series.length - 1 ? barLabel(b.key, range) : ""}
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      <div className="mt-6 border-t border-[var(--border)] pt-4">
        <label htmlFor="new-per-day" className="text-sm font-medium text-[var(--foreground)]">
          Số từ mới mỗi ngày
        </label>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Bộ thẻ lớn sẽ được chia đều theo số này mỗi ngày
          {stats ? ` — hôm nay đã học ${stats.newToday} từ mới.` : "."}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <input
            id="new-per-day"
            type="number"
            min={1}
            max={500}
            value={perDay}
            onChange={(e) => setPerDay(e.target.value)}
            className="w-24 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)]"
          />
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-[var(--foreground)] px-3 py-1.5 text-sm font-medium text-[var(--background)] disabled:opacity-50"
          >
            Lưu
          </button>
          {msg && <span className="text-xs text-[var(--muted-foreground)]">{msg}</span>}
        </div>
      </div>
    </section>
  );
}
