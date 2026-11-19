"use client";

import { useEffect, useState } from "react";

interface Usage {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usedPercent: number;
}
interface Stats {
  at: string;
  uptimeSeconds: number;
  cpu: { cores: number; model: string; usagePercent: number; load: [number, number, number] };
  memory: Usage;
  disk: (Usage & { path: string }) | null;
  process: { rssBytes: number; heapUsedBytes: number };
}

const INTERVAL_MS = 5000;
const HISTORY_REFRESH_MS = 60_000;
const RANGES = [
  { id: "1h", label: "1 giờ", windowMs: 3600_000 },
  { id: "6h", label: "6 giờ", windowMs: 6 * 3600_000 },
  { id: "day", label: "Ngày", windowMs: 24 * 3600_000 },
  { id: "week", label: "Tuần", windowMs: 7 * 24 * 3600_000 },
  { id: "month", label: "Tháng", windowMs: 30 * 24 * 3600_000 },
  { id: "year", label: "Năm", windowMs: 365 * 24 * 3600_000 },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

interface Point {
  t: number;
  cpu: number;
  ram: number;
  disk: number | null;
}

const SERIES = [
  { key: "cpu", label: "CPU", color: "#2a78d6" },
  { key: "ram", label: "RAM", color: "#eb6834" },
  { key: "disk", label: "Ổ đĩa", color: "#1baf7a" },
] as const;

function fmtBytes(n: number) {
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i > 1 ? 1 : 0)} ${u[i]}`;
}

function fmtUp(s: number) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d} ngày ${h} giờ` : h ? `${h} giờ ${m} phút` : `${m} phút`;
}

function barColor(p: number) {
  return p >= 90 ? "var(--destructive)" : p >= 75 ? "#d97706" : "var(--primary-focus)";
}

function Meter({ title, percent, detail }: { title: string; percent: number; detail: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--layer)] p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">{title}</h2>
        <span className="text-2xl font-semibold tabular-nums text-[var(--foreground)]">{percent.toFixed(1)}%</span>
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--border)]"
        role="progressbar"
        aria-label={title}
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, percent)}%`, background: barColor(percent) }} />
      </div>
      <p className="mt-2 text-xs text-[var(--muted-foreground)]">{detail}</p>
    </div>
  );
}


function fmtTick(t: number, windowMs: number) {
  const d = new Date(t);
  return windowMs <= 24 * 3600_000
    ? d.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })
    : d.toLocaleDateString("vi-VN");
}

/** Line chart of averaged history (0–100 %), plain SVG; the range comes from the server's saved samples. */
function HistoryChart() {
  const [range, setRange] = useState<RangeId>("day");
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [data, setData] = useState<{ range: RangeId; points: Point[] } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      const res = await fetch(`/api/admin/system?range=${range}`, { cache: "no-store" }).catch(() => null);
      if (!alive) return;
      if (!res || !res.ok) {
        setFailed(true);
        return;
      }
      setData((await res.json()) as { range: RangeId; points: Point[] });
      setFailed(false);
    }
    void load();
    const t = window.setInterval(() => {
      if (!document.hidden) void load();
    }, HISTORY_REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [range]);

  // Keep showing the previous range's chart (dimmed) until the new data lands, so the layout never collapses.
  const loading = !failed && (!data || data.range !== range);
  const windowMs = RANGES.find((r) => r.id === (data?.range ?? range))!.windowMs;
  const points = data?.points ?? [];
  const end = points.length ? points[points.length - 1].t : 0;
  // The axis starts at the first sample when the range is only partly filled, so a young history still fills the chart.
  const start = points.length ? Math.max(end - windowMs, points[0].t) : 0;
  const span = end - start;
  const W = 640;
  const H = 220;
  const L = 34;
  const R = 8;
  const T = 10;
  const B = 22;
  const x = (t: number) => L + (span > 0 ? Math.min(1, Math.max(0, (t - start) / span)) : 1) * (W - L - R);
  const y = (v: number) => T + (1 - Math.min(100, Math.max(0, v)) / 100) * (H - T - B);
  const last = points[points.length - 1];
  return (
    <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--layer)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">Biểu đồ trung bình theo thời gian</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Khoảng thời gian" className="flex overflow-hidden rounded-lg border border-[var(--border)]">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-pressed={range === r.id}
                onClick={() => setRange(r.id)}
                className={`h-8 px-3 text-xs font-semibold ${range === r.id ? "bg-[var(--primary-focus)] text-white" : "text-[var(--foreground)] hover:bg-[var(--layer-hover)]"}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <ul className="flex flex-wrap gap-2 text-xs">
            {SERIES.map((s) => {
              const v = last?.[s.key];
              const off = hidden.has(s.key);
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    aria-pressed={!off}
                    onClick={() =>
                      setHidden((h) => {
                        const n = new Set(h);
                        if (n.has(s.key)) n.delete(s.key);
                        else n.add(s.key);
                        return n;
                      })
                    }
                    className={`flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 hover:bg-[var(--layer-hover)] ${off ? "text-[var(--muted-foreground)] line-through" : "text-[var(--foreground)]"}`}
                  >
                    <span aria-hidden className="inline-block h-0.5 w-4 rounded" style={{ background: s.color, opacity: off ? 0.3 : 1 }} />
                    {s.label} <span className="inline-block min-w-[3.25rem] text-right tabular-nums">{typeof v === "number" ? `${v.toFixed(1)}%` : "—"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className={`mt-3 h-auto w-full transition-opacity ${loading ? "opacity-40" : ""}`} role="img" aria-label="Lịch sử CPU, RAM và ổ đĩa theo thời gian">
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="var(--border)" strokeWidth={1} />
            <text x={L - 6} y={y(g) + 4} textAnchor="end" fontSize={10} fill="var(--muted-foreground)">
              {g}%
            </text>
          </g>
        ))}
        {SERIES.filter((s) => !hidden.has(s.key)).map((s) => {
          const pts = points.flatMap((p) => (p[s.key] == null ? [] : [`${x(p.t).toFixed(1)},${y(p[s.key] as number).toFixed(1)}`]));
          if (pts.length === 1) {
            const [cx, cy] = pts[0].split(",");
            return <circle key={s.key} cx={cx} cy={cy} r={3} fill={s.color} />;
          }
          if (pts.length < 2) return null;
          return <polyline key={s.key} points={pts.join(" ")} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />;
        })}
        <text x={L} y={H - 6} fontSize={10} fill="var(--muted-foreground)">
          {points.length ? fmtTick(start, windowMs) : ""}
        </text>
        <text x={W - R} y={H - 6} textAnchor="end" fontSize={10} fill="var(--muted-foreground)">
          {points.length ? fmtTick(end, windowMs) : ""}
        </text>
      </svg>
      <p className={`mt-2 h-4 text-xs ${failed ? "text-[var(--destructive)]" : "text-[var(--muted-foreground)]"}`} aria-live="polite">
        {failed
          ? "Không tải được lịch sử."
          : loading
            ? "Đang tải…"
            : points.length === 0
              ? "Chưa có dữ liệu — máy chủ ghi một mẫu mỗi 5 phút."
              : ""}
      </p>
    </div>
  );
}

/** Admin server monitor: RAM, disk and CPU, refreshed every few seconds. */
export function SystemMonitor() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      const res = await fetch("/api/admin/system", { cache: "no-store" }).catch(() => null);
      if (!alive) return;
      if (!res || !res.ok) {
        const body = res ? ((await res.json().catch(() => null)) as { message?: string } | null) : null;
        setError(body?.message ?? "Không tải được số liệu máy chủ");
        return;
      }
      setStats((await res.json()) as Stats);
      setError(null);
    }
    void load();
    const t = window.setInterval(() => {
      if (!document.hidden) void load();
    }, INTERVAL_MS);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-xl font-semibold text-[var(--foreground)]">Giám sát máy chủ</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Tự làm mới mỗi {INTERVAL_MS / 1000} giây{stats ? ` · uptime ${fmtUp(stats.uptimeSeconds)}` : ""}.
      </p>
      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-[var(--destructive)] px-3 py-2 text-sm text-[var(--destructive)]">
          {error}
        </p>
      )}
      {!stats && !error && <p className="mt-6 text-sm text-[var(--muted-foreground)]">Đang tải…</p>}
      {stats && (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Meter
              title="CPU"
              percent={stats.cpu.usagePercent}
              detail={`${stats.cpu.cores} nhân · load ${stats.cpu.load.map((l) => l.toFixed(2)).join(" / ")}`}
            />
            <Meter
              title="RAM"
              percent={stats.memory.usedPercent}
              detail={`${fmtBytes(stats.memory.usedBytes)} / ${fmtBytes(stats.memory.totalBytes)} · trống ${fmtBytes(stats.memory.freeBytes)}`}
            />
            {stats.disk ? (
              <Meter
                title={`Ổ đĩa (${stats.disk.path})`}
                percent={stats.disk.usedPercent}
                detail={`${fmtBytes(stats.disk.usedBytes)} / ${fmtBytes(stats.disk.totalBytes)} · trống ${fmtBytes(stats.disk.freeBytes)}`}
              />
            ) : (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--layer)] p-4 text-sm text-[var(--muted-foreground)]">
                Không đọc được thông tin ổ đĩa.
              </div>
            )}
          </div>
          <HistoryChart />
          <p className="mt-4 text-xs text-[var(--muted-foreground)]">
            {stats.cpu.model} · tiến trình API: RSS {fmtBytes(stats.process.rssBytes)}, heap {fmtBytes(stats.process.heapUsedBytes)}
          </p>
        </>
      )}
    </div>
  );
}
