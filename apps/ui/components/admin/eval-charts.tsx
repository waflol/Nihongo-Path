/**
 * Charts of the AI evaluation report — plain SVG, no chart library. Colours are CSS
 * custom properties (see `EVAL_VIZ_CSS`) so light / dark mode swap in one place;
 * every service keeps one categorical slot (its position in the run, never its rank).
 * Text inherits the page font. Every mark carries a <title> for hover, and values
 * are written on the chart so nothing depends on hovering or on colour alone.
 */

import type { ReactNode } from "react";

export interface ChartStat {
  mean: number | null;
  n: number;
  passRate: number | null;
}
export interface ChartCand {
  index: number;
  label: string;
  model: string;
  overall: ChartStat;
  byTask: Partial<Record<string, ChartStat>>;
  byLevel: Partial<Record<string, ChartStat>>;
  byTaskLevel: Partial<Record<string, Partial<Record<string, ChartStat>>>>;
  latency: { median: number; perItem: number } | null;
  cost: { total: number | null };
  topErrors: { tag: string; count: number; share: number; examples: string[] }[];
}

/** Validated reference palette (light / dark steps), chart ink and surfaces. */
export const EVAL_VIZ_CSS = `
.eval-viz{--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s4:#eda100;--s5:#e87ba4;--s6:#008300;
  --ink:#0b0b0b;--ink-2:#52514e;--ink-muted:#898781;--grid:#e1e0d9;--axis:#c3c2b7;--track:#efeee9;--band:#f6f5f1;--surface:var(--background-1,#fcfcfb)}
@media (prefers-color-scheme: dark){:root:where(:not([data-theme="light"])) .eval-viz{--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181;--s6:#008300;
  --ink:#f0efec;--ink-2:#c3c2b7;--ink-muted:#898781;--grid:#2c2c2a;--axis:#383835;--track:#262624;--band:#20201f;--surface:var(--background-1,#1a1a19)}}
:root[data-theme="dark"] .eval-viz{--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181;--s6:#008300;
  --ink:#f0efec;--ink-2:#c3c2b7;--ink-muted:#898781;--grid:#2c2c2a;--axis:#383835;--track:#262624;--band:#20201f;--surface:var(--background-1,#1a1a19)}
`;

export const seriesColor = (i: number) => `var(--s${(i % 6) + 1})`;
const fmt1 = (n: number) => n.toFixed(1);
/** Rough text width at a font size (proportional sans, Vietnamese diacritics included). */
const textW = (s: string, size: number) => s.length * size * 0.56;
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** Horizontal bar sitting in a rounded track: both ends follow the track's corner radius. */
function hBar(x: number, y: number, w: number, h: number, r = 4): string {
  if (w <= 0) return "";
  const rr = Math.min(r, w / 2, h / 2);
  return `M${x + rr},${y}h${w - 2 * rr}a${rr},${rr} 0 0 1 ${rr},${rr}v${h - 2 * rr}a${rr},${rr} 0 0 1 -${rr},${rr}h-${w - 2 * rr}a${rr},${rr} 0 0 1 -${rr},-${rr}v-${h - 2 * rr}a${rr},${rr} 0 0 1 ${rr},-${rr}z`;
}

function Svg({ w, h, label, children }: { w: number; h: number; label: string; children: ReactNode }) {
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={label} style={{ display: "block", height: "auto", overflow: "visible" }}>
      {children}
    </svg>
  );
}

// ── 1. Score by task: grouped horizontal bars ─────────────────────────────

/**
 * One group per task, one bar per service on a 0–100 track. The value sits at the
 * end of every bar (inside when there is room); the dashed line is the pass mark.
 */
export function TaskBarsChart({ cands, tasks, taskLabel, pass }: { cands: ChartCand[]; tasks: string[]; taskLabel: (t: string) => string; pass: number }) {
  const multi = cands.length > 1;
  const W = 640;
  // Several services: the task is a heading over its group and each bar is named on the left.
  const L = multi ? 132 : 92;
  const R = 8;
  const barH = cands.length > 3 ? 16 : 20;
  const gap = 5;
  const head = multi ? 24 : 0;
  const groupGap = 18;
  const top = 26;
  const groupH = head + cands.length * barH + (cands.length - 1) * gap;
  const H = top + tasks.length * groupH + (tasks.length - 1) * groupGap + 26;
  const plotW = W - L - R;
  const x = (v: number) => L + (v / 100) * plotW;
  const rows = tasks.flatMap((t, ti) => {
    const gy = top + ti * (groupH + groupGap);
    return cands.map((c, ci) => ({ t, ti, c, gy, y: gy + head + ci * (barH + gap), s: c.byTask[t] }));
  });
  return (
    <Svg w={W} h={H} label="Điểm theo từng việc của mỗi dịch vụ">
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line x1={x(v)} x2={x(v)} y1={top - 4} y2={H - 20} stroke="var(--grid)" strokeWidth="1" />
          <text x={x(v)} y={H - 4} textAnchor={v === 100 ? "end" : v === 0 ? "start" : "middle"} fontSize="11" fill="var(--ink-muted)">
            {v}
          </text>
        </g>
      ))}
      {tasks.map((t, ti) => {
        const gy = top + ti * (groupH + groupGap);
        return multi ? (
          <text key={t} x={0} y={gy + 12} fontSize="13" fontWeight="600" fill="var(--ink)">
            {taskLabel(t)}
          </text>
        ) : (
          <text key={t} x={0} y={gy + barH / 2} dy="0.35em" fontSize="13" fontWeight="600" fill="var(--ink)">
            {taskLabel(t)}
          </text>
        );
      })}
      {/* Tracks, then the pass line, then the bars: the line shows on the empty track, never across a value. */}
      {rows.map((r) => (
        <rect key={`${r.t}-${r.c.index}-track`} x={x(0)} y={r.y} width={plotW} height={barH} rx="5" fill="var(--track)" />
      ))}
      <line x1={x(pass)} x2={x(pass)} y1={top - 8} y2={H - 20} stroke="var(--ink-2)" strokeWidth="1.5" strokeDasharray="5 4" />
      <text x={x(pass)} y={top - 12} textAnchor="middle" fontSize="11" fill="var(--ink-2)">
        ngưỡng đạt {pass}
      </text>
      {rows.map(({ t, c, y, s }) => {
        const v = s?.mean ?? null;
        const end = v === null ? x(0) : x(v);
        const inside = v !== null && end - x(0) > 48;
        return (
          <g key={`${t}-${c.index}`}>
            <title>{`${taskLabel(t)} · ${c.label}: ${v === null ? "chưa có điểm" : `${fmt1(v)} điểm, ${fmt1(s!.passRate ?? 0)}% câu đạt, ${s!.n} câu`}`}</title>
            {multi && (
              <text x={L - 10} y={y + barH / 2} dy="0.35em" textAnchor="end" fontSize="11" fill="var(--ink-2)">
                {clip(c.label, 18)}
              </text>
            )}
            {v !== null && <path d={hBar(x(0), y, end - x(0), barH, 5)} fill={seriesColor(c.index)} />}
            <text
              x={v === null ? x(0) + 8 : inside ? end - 8 : end + 6}
              y={y + barH / 2}
              dy="0.35em"
              textAnchor={inside ? "end" : "start"}
              fontSize="12"
              fontWeight="600"
              fill={inside ? "#fff" : v === null ? "var(--ink-muted)" : "var(--ink)"}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {v === null ? "chưa có điểm" : fmt1(v)}
            </text>
          </g>
        );
      })}
    </Svg>
  );
}

// ── 4. Task × level heatmap of one service ────────────────────────────────

const HEAT = [
  { min: 85, bg: "#184f95", fg: "#ffffff" },
  { min: 70, bg: "#256abf", fg: "#ffffff" },
  { min: 55, bg: "#3987e5", fg: "#ffffff" },
  { min: 40, bg: "#86b6ef", fg: "#0b0b0b" },
  { min: 0, bg: "#b7d3f6", fg: "#0b0b0b" },
];

/** Darker blue = higher score; a red ring marks a cell under the pass mark. */
export function HeatmapChart({ c, tasks, levels, taskLabel, pass }: { c: ChartCand; tasks: string[]; levels: string[]; taskLabel: (t: string) => string; pass: number }) {
  const L = 92;
  const cw = 72;
  const ch = 40;
  const g = 4;
  const top = 22;
  const W = L + levels.length * (cw + g);
  const H = top + tasks.length * (ch + g) + 36;
  return (
    <Svg w={W} h={H} label={`Điểm theo việc và trình độ của ${c.label}`}>
      {levels.map((l, i) => (
        <text key={l} x={L + i * (cw + g) + cw / 2} y={14} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--ink-2)">
          {l}
        </text>
      ))}
      {tasks.map((t, ti) => (
        <g key={t}>
          <text x={0} y={top + ti * (ch + g) + ch / 2} dy="0.35em" fontSize="12" fontWeight="600" fill="var(--ink)">
            {taskLabel(t)}
          </text>
          {levels.map((l, li) => {
            const s = c.byTaskLevel[t]?.[l];
            const v = s?.mean ?? null;
            const step = v === null ? null : HEAT.find((h) => v >= h.min)!;
            const cx = L + li * (cw + g);
            const cy = top + ti * (ch + g);
            return (
              <g key={l}>
                <title>{v === null ? `${taskLabel(t)} ${l}: chưa có điểm` : `${taskLabel(t)} ${l}: ${fmt1(v)} điểm, ${fmt1(s!.passRate ?? 0)}% đạt, ${s!.n} câu`}</title>
                <rect
                  x={cx}
                  y={cy}
                  width={cw}
                  height={ch}
                  rx="6"
                  fill={step ? step.bg : "var(--track)"}
                  stroke={v !== null && v < pass ? "#d03b3b" : "none"}
                  strokeWidth="2.5"
                />
                <text x={cx + cw / 2} y={cy + ch / 2} dy="0.35em" textAnchor="middle" fontSize="13" fontWeight="600" fill={step ? step.fg : "var(--ink-muted)"} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {v === null ? "—" : Math.round(v)}
                </text>
              </g>
            );
          })}
        </g>
      ))}
      {[...HEAT].reverse().map((h, i, arr) => {
        const lx = i * 66;
        return (
          <g key={h.min}>
            <rect x={lx} y={H - 16} width="14" height="10" rx="2" fill={h.bg} />
            <text x={lx + 18} y={H - 11} dy="0.35em" fontSize="10" fill="var(--ink-muted)">
              {i === arr.length - 1 ? `${h.min}–100` : `${h.min}–${arr[i + 1].min - 1}`}
            </text>
          </g>
        );
      })}
      <rect x={5 * 66} y={H - 16} width="14" height="10" rx="2" fill="none" stroke="#d03b3b" strokeWidth="2" />
      <text x={5 * 66 + 18} y={H - 11} dy="0.35em" fontSize="10" fill="var(--ink-muted)">
        dưới ngưỡng
      </text>
    </Svg>
  );
}

// ── 5. Most frequent errors of one service ────────────────────────────────

/** Share of the service's results with each error kind; the most common first. */
export function ErrorChart({ c, tagLabel }: { c: ChartCand; tagLabel: (t: string) => string }) {
  const list = c.topErrors.slice(0, 7);
  if (list.length === 0) {
    return (
      <Svg w={320} h={40} label="Không có lỗi">
        <text x={0} y={20} fontSize="12" fill="var(--ink-muted)">
          Không có lỗi nào được ghi nhận.
        </text>
      </Svg>
    );
  }
  const W = 360;
  const rowH = 36;
  const H = list.length * rowH;
  const max = Math.max(...list.map((e) => e.share), 1);
  return (
    <Svg w={W} h={H} label={`Lỗi thường gặp của ${c.label}`}>
      {list.map((e, i) => {
        const y = i * rowH;
        const w = ((W - 4) * e.share) / max;
        return (
          <g key={e.tag}>
            <title>{`${tagLabel(e.tag)}: ${e.count} câu (${fmt1(e.share)}%) — ví dụ ${e.examples.join(", ")}`}</title>
            <text x={0} y={y + 12} fontSize="12" fill="var(--ink)">
              {tagLabel(e.tag)}
            </text>
            <text x={W} y={y + 12} textAnchor="end" fontSize="12" fill="var(--ink-muted)" style={{ fontVariantNumeric: "tabular-nums" }}>
              {`${e.count} câu`}
            </text>
            <text x={W - textW(`${e.count} câu`, 12) - 8} y={y + 12} textAnchor="end" fontSize="12" fontWeight="600" fill="var(--ink)" style={{ fontVariantNumeric: "tabular-nums" }}>
              {fmt1(e.share)}%
            </text>
            <rect x={0} y={y + 19} width={W} height="8" rx="4" fill="var(--track)" />
            <path d={hBar(0, y + 19, Math.max(4, w), 8)} fill={seriesColor(c.index)} />
          </g>
        );
      })}
    </Svg>
  );
}
