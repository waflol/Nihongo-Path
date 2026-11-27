"use client";

import { useConfirm } from "@/components/learn/use-confirm";
import { ReviewChart } from "@/components/learn/review-chart";
import { capitalize, PILLAR_NOUN, type PillarId } from "@/components/learn/pillar-nav";
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
  overview?: {
    heatmap: { key: string; reviews: number }[];
    streak: number;
    bestStreak: number;
    totalReviews: number;
    studyDays: number;
  };
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
export function ProgressPanel({
  compact = false,
  dense = false,
  pillar,
}: { compact?: boolean; dense?: boolean; /** Only this pillar; omitted → all together. */ pillar?: PillarId } = {}) {
  const noun = PILLAR_NOUN[pillar ?? "vocab"];
  const { confirm, dialog } = useConfirm();
  const [stats, setStats] = useState<Stats | null>(null);
  const [perDay, setPerDay] = useState("20");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("week");
  const [shift, setShift] = useState(0); // 0 = current period, -1 = previous…

  // Per-period cache + in-flight dedupe: every range is prefetched in the
  // background, so switching tabs / periods is instant. `latest` stops a slow
  // earlier response from overwriting a newer selection.
  const cache = useRef(new Map<string, Stats>());
  const inflight = useRef(new Map<string, Promise<Stats | null>>());
  const latest = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const fetchOne = useCallback((r: Range, sh: number, force = false): Promise<Stats | null> => {
    const key = `${r}:${sh}`;
    const hit = cache.current.get(key);
    if (hit && !force) return Promise.resolve(hit);
    const pending = inflight.current.get(key);
    if (pending) return pending;
    const p = fetch(`/api/srs/stats?range=${r}&offset=${sh}${pillar ? `&pillar=${pillar}` : ""}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = (await res.json()) as Stats;
        cache.current.set(key, data);
        return data;
      })
      .catch(() => null)
      .finally(() => inflight.current.delete(key));
    inflight.current.set(key, p);
    return p;
  }, [pillar]);

  /** Warm the cache: all ranges for now, then the previous period of each. */
  const prefetch = useCallback(async () => {
    await Promise.all(RANGES.map((r) => fetchOne(r.key, 0)));
    await Promise.all(RANGES.filter((r) => r.key !== "all").map((r) => fetchOne(r.key, -1)));
  }, [fetchOne]);

  const load = useCallback(async (force = false) => {
    const id = ++latest.current;
    const hit = cache.current.get(`${range}:${shift}`);
    if (hit && !force) {
      setStats(hit);
      setLoading(false);
      setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    const data = await fetchOne(range, shift, force);
    if (id !== latest.current) return;
    setLoading(false);
    if (!data) {
      setError(true);
      return;
    }
    setStats(data);
    setPerDay(String(data.newPerDay));
  }, [range, shift, fetchOne]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void prefetch();
  }, [prefetch]);

  async function save() {
    const n = Math.round(Number(perDay));
    if (!Number.isFinite(n) || n < 1 || n > 500) {
      setMsg("Nhập số từ 1 đến 500");
      return;
    }
    if (!(await confirm({ title: "Lưu cài đặt?", message: `Giới hạn ${noun} mới mỗi ngày: ${n}.`, confirmLabel: "Lưu", tone: "primary" }))) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/srs/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pillar ? { newCardsPerDayByPillar: { [pillar]: n } } : { newCardsPerDay: n }),
      });
      setMsg(res.ok ? "Đã lưu" : "Không lưu được");
      if (res.ok) {
        cache.current.clear();
        await load(true);
        void prefetch();
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
        (compact
          ? "flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border lg:flex-1 border-[var(--border)] bg-[var(--background-1)] p-3 sm:p-4 transition-opacity "
          : dense
            ? "mt-0 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4 transition-opacity [&_.mt-4]:!mt-2 [&_.mt-5]:!mt-3 [&_.mt-6]:!mt-3 [&_.space-y-6>*+*]:!mt-3 "
            : "mt-8 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-6 transition-opacity ") +
        (loading && stats ? "opacity-60" : "")
      }
    >
      {dialog}
      <div className={compact ? "min-h-0 shrink overflow-y-auto" : ""}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">
          Tiến độ<span className={compact ? "max-lg:hidden" : ""}> ghi nhớ</span>
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
                "rounded-md px-2 py-1 text-xs font-medium sm:px-3 " +
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

      {error && (
        <p className="mt-3 text-sm text-[#dc2626]">
          Không tải được thống kê.{" "}
          <button type="button" className="underline" onClick={() => void load(true)}>
            Thử lại
          </button>
        </p>
      )}

      {!stats ? (
        <p className="mt-3 text-sm text-[var(--muted-foreground)]">{error ? "" : "Đang tải…"}</p>
      ) : (
        <div className={compact ? "mt-3 grid grid-cols-[6.5rem_1fr] items-center gap-3 max-lg:mt-2 max-lg:grid-cols-[4.5rem_1fr]" : (dense ? "mt-3 grid items-center gap-4 sm:grid-cols-[7.5rem_1fr]" : "mt-4 grid gap-6 sm:grid-cols-[180px_1fr]")}>
          <div className={"relative mx-auto " + (compact ? "size-18 lg:size-26" : dense ? "size-28" : "h-44 w-44")}>
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
              <span className={(compact ? "text-lg" : "text-2xl") + " font-semibold text-[var(--foreground)]"}>{learned}</span>
              <span className={(compact ? "text-[9px] lg:text-[10px]" : "text-[10px]") + " text-[var(--muted-foreground)]"}>/ {stats.total} thẻ</span>
            </div>
          </div>

          <ul className={compact ? "grid grid-cols-2 gap-x-3 gap-y-1 self-center lg:block lg:space-y-1" : "space-y-2 self-center"}>
            {segments.map((s) => (
              <li key={s.key} className={"flex items-center gap-2 " + (compact ? "text-[11px] lg:text-xs" : "gap-3 text-sm")}>
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: s.color }} />
                <span className="font-medium text-[var(--foreground)]">{s.label}</span>
                {!compact && <span className="text-xs text-[var(--muted-foreground)]">{s.hint}</span>}
                <span className="ml-auto tabular-nums text-[var(--foreground)]">
                  {s.count}
                  {sum > 0 && (
                    <span className={"ml-1 text-xs text-[var(--muted-foreground)]" + (compact ? " max-lg:hidden" : "")}>
                      ({Math.round((s.count / sum) * 100)}%)
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {compact && stats && (() => {
        const o = stats.overview;
        const items =
          range === "all" && o
            ? [
                { v: o.streak, l: "Chuỗi ngày học" },
                { v: o.bestStreak, l: "Chuỗi dài nhất" },
                { v: o.totalReviews, l: "Tổng lượt ôn" },
                { v: o.studyDays, l: "Ngày đã học" },
              ]
            : [
                { v: stats.reviewsInRange, l: "Lượt ôn" },
                { v: stats.newInRange, l: `${capitalize(noun)} mới` },
                { v: stats.newToday, l: "Mới hôm nay" },
              ];
        return (
          <div className={"mt-3 hidden gap-2 lg:grid [@media(min-height:950px)]:grid " + (items.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
            {items.map((t) => (
              <div key={t.l} className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-2.5 py-2">
                <p className="text-lg font-semibold leading-tight tabular-nums text-[var(--foreground)]">{t.v}</p>
                <p className="mt-0.5 text-[11px] leading-tight text-[var(--muted-foreground)]">{t.l}</p>
              </div>
            ))}
          </div>
        );
      })()}


      {!compact && (
        <>
      {(
        <div
          aria-hidden={range === "all"}
          className={"mt-4 flex items-center justify-center gap-3 text-sm " + (range === "all" ? "invisible" : "")}
        >
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

      {/* Roughly the height of the "Tất cả" overview, so switching tabs doesn't jolt. */}
      <div className={dense ? "min-h-[13rem]" : "min-h-[22rem]"}>
      {stats && range !== "all" && stats.series.length > 0 && (() => {
        const series = stats.series;
        const max = Math.max(1, ...series.map((b) => b.reviews));
        // Round the axis top to a tidy number.
        const pow = 10 ** Math.floor(Math.log10(max));
        const top = Math.max(4, Math.ceil(max / pow / 2) * 2 * pow);
        const step = range === "month" ? 5 : 1;
        const d = new Date();
        const todayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const isNow = (k: string) => (range === "year" ? k === todayKey.slice(0, 7) : k === todayKey);
        const activeDays = series.filter((b) => b.reviews > 0).length;
        const avg = activeDays ? Math.round(stats.reviewsInRange / activeDays) : 0;
        const unit = range === "year" ? "tháng" : "ngày";
        const tiles = [
          { v: stats.reviewsInRange, l: "Lượt ôn", c: "#3b82f6" },
          { v: stats.newInRange, l: `${capitalize(noun)} mới`, c: "#10b981" },
          { v: `${activeDays}/${series.length}`, l: `${unit[0].toUpperCase()}${unit.slice(1)} có học`, c: "#8b5cf6" },
          { v: avg, l: `TB mỗi ${unit} học`, c: "#f59e0b" },
        ];
        return (
          <div className="mt-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {tiles.map((t) => (
                <div key={t.l} className="rounded-xl border border-[var(--border)] px-3 py-2.5">
                  <p className="text-xl font-semibold tabular-nums" style={{ color: t.c }}>{t.v}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">{t.l}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between">
              <p className="text-sm font-medium text-[var(--foreground)]">Hoạt động học</p>
              <div className="flex items-center gap-3 text-[11px] text-[var(--muted-foreground)]">
                <span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-[#93c5fd]" />Lượt ôn</span>
                <span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-[#10b981]" />{capitalize(noun)} mới</span>
              </div>
            </div>

            <div className={"mt-3 flex gap-2 " + (dense ? "h-24" : "h-40")}>
              <div className="flex w-6  shrink-0 flex-col justify-between text-right text-[10px] tabular-nums text-[var(--muted-foreground)]">
                <span>{top}</span>
                <span>{top / 2}</span>
                <span>0</span>
              </div>
              <div className="relative h-full min-w-0 flex-1">
                {[0, 50, 100].map((p) => (
                  <div key={p} className="absolute inset-x-0 border-t border-dashed border-[var(--border)]" style={{ bottom: `${p}%` }} />
                ))}
                <div className="absolute inset-0 flex items-end gap-[3px]" role="img" aria-label="Số lượt ôn theo thời gian">
                  {series.map((b) => {
                    const h = (b.reviews / top) * 100;
                    const nh = (Math.min(b.newCards, b.reviews) / top) * 100;
                    return (
                      <div
                        key={b.key}
                        className="group relative flex h-full min-w-0 flex-1 items-end"
                        title={`${b.key}: ${b.reviews} lượt ôn, ${b.newCards} ${noun} mới`}
                      >
                        {range === "week" && b.reviews > 0 && (
                          <span
                            className="absolute left-0 right-0 text-center text-[10px] font-medium tabular-nums text-[var(--foreground)]"
                            style={{ bottom: `calc(${h}% + 2px)` }}
                          >
                            {b.reviews}
                          </span>
                        )}
                        <div
                          className={"relative w-full overflow-hidden rounded-t-md transition-opacity group-hover:opacity-80 " + (isNow(b.key) ? "bg-[#3b82f6]" : "bg-[#93c5fd]")}
                          style={{ height: `${h}%`, minHeight: b.reviews ? 3 : 0 }}
                        >
                          {b.newCards > 0 && (
                            <div className="absolute inset-x-0 bottom-0 bg-[#10b981]" style={{ height: `${h ? (nh / h) * 100 : 0}%` }} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="ml-[calc(0.5rem+1.5rem)] mt-1.5 flex gap-[3px]">
              {series.map((b, i) => (
                <span
                  key={b.key}
                  className={"min-w-0 flex-1 text-center text-[10px] " + (isNow(b.key) ? "font-semibold text-[var(--foreground)]" : "text-[var(--muted-foreground)]")}
                >
                  {i % step === 0 || i === series.length - 1 ? barLabel(b.key, range) : ""}
                </span>
              ))}
            </div>
            {stats.reviewsInRange === 0 && (
              <p className="mt-3 text-center text-xs text-[var(--muted-foreground)]">
                Chưa có hoạt động học trong kỳ này.
              </p>
            )}
          </div>
        );
      })()}

      {stats?.overview && range === "all" && (() => {
        const o = stats.overview;
        const total = Math.max(1, stats.total);
        const lv = Object.fromEntries(stats.levels.map((l) => [l.key, l.count]));
        const solid = (lv.known ?? 0) + (lv.mastered ?? 0);
        const journey = [
          { key: "unseen", label: "Chưa học", count: stats.unseen, color: UNSEEN_COLOR },
          ...["hard", "learning", "young", "known", "mastered"].map((k) => ({
            key: k,
            label: LEVELS[k].label,
            count: lv[k] ?? 0,
            color: LEVELS[k].color,
          })),
        ];
        const shade = (n: number) =>
          n === 0 ? 0 : n < 10 ? 1 : n < 25 ? 2 : n < 50 ? 3 : 4;
        const cellBg = [
          "var(--border)",
          "color-mix(in srgb, #10b981 30%, var(--border))",
          "color-mix(in srgb, #10b981 55%, var(--border))",
          "color-mix(in srgb, #10b981 80%, var(--border))",
          "#047857",
        ];
        const tiles = [
          { v: o.streak, u: "ngày", l: "Chuỗi hiện tại", accent: o.streak > 0 },
          { v: o.bestStreak, u: "ngày", l: "Chuỗi dài nhất" },
          { v: o.totalReviews, u: "lượt", l: "Tổng lượt ôn" },
          { v: o.studyDays, u: "ngày", l: "Đã học" },
        ];
        return (
          <div className="mt-6 space-y-6 border-t border-[var(--border)] pt-4">
            <div>
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-medium text-[var(--foreground)]">Hành trình ghi nhớ</p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  <span className="text-base font-semibold text-[var(--foreground)]">
                    {Math.round((solid / total) * 100)}%
                  </span>{" "}
                  đã thuộc vững
                </p>
              </div>
              <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-[var(--border)]" role="img" aria-label="Hành trình ghi nhớ">
                {journey.map((j) =>
                  j.count > 0 ? (
                    <div
                      key={j.key}
                      title={`${j.label}: ${j.count}`}
                      style={{ width: `${(j.count / total) * 100}%`, background: j.color }}
                    />
                  ) : null,
                )}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-[var(--muted-foreground)]">
                <span>Chưa học</span>
                <span>Thuộc sâu</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {tiles.map((t) => (
                <div key={t.l} className="rounded-xl border border-[var(--border)] px-3 py-2.5">
                  <p className={"text-xl font-semibold tabular-nums " + (t.accent ? "text-[#f59e0b]" : "text-[var(--foreground)]")}>
                    {t.accent ? "🔥 " : ""}
                    {t.v}
                    <span className="ml-1 text-xs font-normal text-[var(--muted-foreground)]">{t.u}</span>
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">{t.l}</p>
                </div>
              ))}
            </div>

            <div>
              <p className="text-sm font-medium text-[var(--foreground)]">
                Lịch học 26 tuần gần đây
              </p>
              <div className="mt-2 overflow-x-auto pb-1">
                <div className="grid w-max grid-flow-col grid-rows-7 gap-[3px]">
                  {o.heatmap.map((c) => (
                    <div
                      key={c.key}
                      title={`${c.key}: ${c.reviews} lượt ôn`}
                      className="size-3 rounded-[3px]"
                      style={{ background: cellBg[shade(c.reviews)] }}
                    />
                  ))}
                </div>
              </div>
              <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[var(--muted-foreground)]">
                Ít
                {cellBg.map((c, i) => (
                  <span key={i} className="size-3 rounded-[3px]" style={{ background: c }} />
                ))}
                Nhiều
              </div>
            </div>
          </div>
        );
      })()}

      </div>

        </>
      )}

      </div>

      {(compact || dense) && (
      <div className={"mt-4 shrink-0 border-t border-[var(--border)] pt-3 lg:mt-auto lg:pt-4 " + (compact ? "max-lg:hidden" : "lg:hidden")}>
        <label htmlFor="new-per-day" className="text-sm font-medium text-[var(--foreground)]">
          Số {noun} mới mỗi ngày
        </label>
        <p className="mt-1 hidden text-xs text-[var(--muted-foreground)]">
          Bộ thẻ lớn sẽ được chia đều theo số này mỗi ngày
          {stats ? ` — hôm nay đã học ${stats.newToday} ${noun} mới.` : "."}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            id="new-per-day"
            type="number"
            min={1}
            max={500}
            value={perDay}
            onChange={(e) => setPerDay(e.target.value)}
            className="w-20 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)]"
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
      )}

      {compact && <ReviewChart embedded bare pillar={pillar} range={range === "month" ? "month" : "week"} className="mt-2 h-24 shrink-0 [@media(max-height:700px)]:h-[4.5rem] lg:hidden" />}

    </section>
  );
}
