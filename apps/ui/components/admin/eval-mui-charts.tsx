"use client";

/**
 * The two report charts that compare services across a continuous scale — score by JLPT
 * level, and speed against score — built on MUI X Charts (community) for its legend,
 * axis tooltip and hover highlighting. The score axis zooms to the data (scores often sit
 * within a few points of each other) and always shows the pass line.
 */

import { useMemo, useSyncExternalStore } from "react";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { LineChart } from "@mui/x-charts/LineChart";
import { ScatterChart } from "@mui/x-charts/ScatterChart";
import { ChartsReferenceLine } from "@mui/x-charts/ChartsReferenceLine";
import { useDrawingArea, useXScale, useYScale } from "@mui/x-charts/hooks";
import type { ChartCand } from "@/components/admin/eval-charts";

/**
 * Names next to the scatter points, so a dot is readable without hovering or matching
 * colours. Each label tries right, left, above, below its dot and takes the first spot
 * that stays inside the plot and clears the labels and dots already placed.
 */
function PointLabels({ points, ink, halo }: { points: { key: string; x: number; y: number; text: string }[]; ink: string; halo: string }) {
  const xs = useXScale<"linear">();
  const ys = useYScale<"linear">();
  const area = useDrawingArea();
  const size = 12;
  const w = (t: string) => t.length * size * 0.62;
  const dots = points.map((p) => ({ x: xs(p.x) ?? 0, y: ys(p.y) ?? 0 }));
  const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const hits = (b: { x0: number; y0: number; x1: number; y1: number }) =>
    placed.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0) ||
    dots.some((d) => d.x > b.x0 - 7 && d.x < b.x1 + 7 && d.y > b.y0 - 7 && d.y < b.y1 + 7);
  // The top margin is reserved for labels, so a label may rise into it.
  const inside = (b: { x0: number; y0: number; x1: number; y1: number }) =>
    b.x0 >= area.left - 4 && b.x1 <= area.left + area.width && b.y0 >= area.top - 26 && b.y1 <= area.top + area.height;
  // Fill the most crowded corner first: points sorted by how many others sit near them.
  const crowd = (i: number) => dots.filter((d, j) => j !== i && Math.hypot(d.x - dots[i].x, d.y - dots[i].y) < 80).length;
  const order = points.map((_, i) => i).sort((a, b) => crowd(b) - crowd(a));
  const placedBy = new Map<number, { tx: number; ty: number; anchor: "start" | "end" | "middle" }>();
  for (const i of order) {
    const { x, y } = dots[i];
    const tw = w(points[i].text);
    const box = (x0: number, yc: number) => ({ x0, x1: x0 + tw, y0: yc - 8, y1: yc + 8 });
    const spots = [
      { tx: x + 13, ty: y, anchor: "start" as const, b: box(x + 13, y) },
      { tx: x - 13, ty: y, anchor: "end" as const, b: box(x - 13 - tw, y) },
      { tx: x + 10, ty: y - 16, anchor: "start" as const, b: box(x + 10, y - 16) },
      { tx: x + 10, ty: y + 16, anchor: "start" as const, b: box(x + 10, y + 16) },
      { tx: x - 10, ty: y - 16, anchor: "end" as const, b: box(x - 10 - tw, y - 16) },
      { tx: x - 10, ty: y + 16, anchor: "end" as const, b: box(x - 10 - tw, y + 16) },
      { tx: x, ty: y - 20, anchor: "middle" as const, b: box(x - tw / 2, y - 20) },
      { tx: x, ty: y + 22, anchor: "middle" as const, b: box(x - tw / 2, y + 22) },
      { tx: x + 13, ty: y - 30, anchor: "start" as const, b: box(x + 13, y - 30) },
      { tx: x + 13, ty: y + 30, anchor: "start" as const, b: box(x + 13, y + 30) },
    ];
    const pick = spots.find((s) => inside(s.b) && !hits(s.b)) ?? spots.find((s) => inside(s.b)) ?? spots[0];
    placed.push(pick.b);
    placedBy.set(i, pick);
  }
  const out = points.map((p, i) => ({ ...p, ...placedBy.get(i)!, dot: dots[i] }));
  return (
    <g pointerEvents="none" aria-hidden>
      {/* A label pushed away from its dot gets a thin leader line back to it. */}
      {out
        .filter((l) => Math.abs(l.ty - l.dot.y) > 18)
        .map((l) => (
          <line key={`${l.key}-lead`} x1={l.dot.x} y1={l.dot.y + Math.sign(l.ty - l.dot.y) * 10} x2={l.anchor === "end" ? l.tx + 2 : l.anchor === "start" ? l.tx - 2 : l.tx} y2={l.ty - Math.sign(l.ty - l.dot.y) * 7} stroke={ink} strokeOpacity={0.45} strokeWidth={1} />
        ))}
      {out.map((l) => (
        <text key={l.key} x={l.tx} y={l.ty} dy="0.35em" textAnchor={l.anchor} fontSize={size} fontWeight={600} fill={ink} stroke={halo} strokeWidth={4} paintOrder="stroke">
          {l.text}
        </text>
      ))}
    </g>
  );
}

/** Validated categorical palette, light / dark steps — the same slots as the other report charts. */
const SERIES = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300"],
};
const INK = {
  light: { text: "#0b0b0b", muted: "#52514e", grid: "#e1e0d9", pass: "#52514e", paper: "#ffffff" },
  dark: { text: "#f0efec", muted: "#c3c2b7", grid: "#2c2c2a", pass: "#c3c2b7", paper: "#1a1a19" },
};

/** The page's theme: an explicit `data-theme` on <html> wins, else the OS setting. */
function subscribe(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
  mq.addEventListener("change", cb);
  return () => {
    mo.disconnect();
    mq.removeEventListener("change", cb);
  };
}
function readDark(): boolean {
  const t = document.documentElement.dataset.theme;
  if (t === "dark") return true;
  if (t === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
function useMode(): "light" | "dark" {
  return useSyncExternalStore(subscribe, readDark, () => false) ? "dark" : "light";
}

function useChartTheme(mode: "light" | "dark") {
  return useMemo(
    () =>
      createTheme({
        palette: { mode, background: { paper: INK[mode].paper, default: INK[mode].paper }, text: { primary: INK[mode].text, secondary: INK[mode].muted }, divider: INK[mode].grid },
        typography: { fontFamily: "inherit", fontSize: 13 },
      }),
    [mode],
  );
}

/** Score axis that zooms to the data: a few points of room below the lowest score (and the pass line), up to 100. */
function scoreDomain(values: number[], pass: number): { min: number; max: number } {
  const lo = Math.min(pass, ...values);
  const min = Math.max(0, Math.floor((lo - 3) / 5) * 5);
  return { min, max: 100 };
}

/** Label on the dot: the model id when it tells services apart (several share a provider label), clipped. */
const shortName = (c: ChartCand) => {
  const s = c.model || c.label;
  return s.length > 22 ? `${s.slice(0, 21)}…` : s;
};
const seriesName = (c: ChartCand) => (c.model && !c.label.includes(c.model) ? `${c.label} · ${c.model}` : c.label);
const pts = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v.toFixed(1)} điểm`);
const secs = (s: number) => `${s < 10 ? s.toFixed(1) : Math.round(s)}s`;

const legendTop = { legend: { position: { vertical: "top", horizontal: "start" } } } as const;

/** Score per JLPT level, one line per service; hovering a level lists every service's score there. */
/** `width` is only for rendering outside a browser (previews); on the page the chart fills its box. */
export function LevelLineChart({ cands, levels, pass, width }: { cands: ChartCand[]; levels: string[]; pass: number; width?: number }) {
  const mode = useMode();
  const theme = useChartTheme(mode);
  const values = cands.flatMap((c) => levels.map((l) => c.byLevel[l]?.mean).filter((v): v is number => typeof v === "number"));
  const y = scoreDomain(values, pass);
  return (
    <ThemeProvider theme={theme}>
      <LineChart
        height={340}
        width={width}
        skipAnimation
        xAxis={[
          {
            scaleType: "point",
            data: levels,
            valueFormatter: (l: string, ctx) => (ctx.location === "tick" ? (l === levels[0] ? `${l} (dễ)` : l === levels[levels.length - 1] ? `${l} (khó)` : l) : `Trình độ ${l}`),
          },
        ]}
        yAxis={[{ min: y.min, max: y.max, width: 44, valueFormatter: (v: number) => `${v}` }]}
        series={cands.map((c) => ({
          id: `c${c.index}`,
          label: seriesName(c),
          data: levels.map((l) => c.byLevel[l]?.mean ?? null),
          color: SERIES[mode][c.index % 6],
          valueFormatter: (v: number | null) => pts(v),
          showMark: true,
          connectNulls: true,
          // Straight segments: a smoothed curve would invent values between levels.
          curve: "linear" as const,
        }))}
        grid={{ horizontal: true }}
        slotProps={{ ...legendTop, tooltip: { trigger: "axis" } }}
        margin={{ top: 12, right: 24, bottom: 8, left: 8 }}
        sx={{ "& .MuiLineElement-root": { strokeWidth: 2.5 }, "& .MuiMarkElement-root": { strokeWidth: 2, r: 4.5 } }}
      >
        <ChartsReferenceLine
          y={pass}
          label={`ngưỡng đạt ${pass}`}
          labelAlign="end"
          lineStyle={{ stroke: INK[mode].pass, strokeDasharray: "5 4", strokeWidth: 1.5 }}
          labelStyle={{ fill: INK[mode].muted, fontSize: 12 }}
        />
      </LineChart>
    </ThemeProvider>
  );
}

/** Median time per call (x) against overall score (y): up and to the left is fast and accurate. */
export function SpeedScatterChart({ cands, pass, width }: { cands: ChartCand[]; pass: number; width?: number }) {
  const mode = useMode();
  const theme = useChartTheme(mode);
  const rows = cands.filter((c) => c.latency && c.overall.mean !== null);
  if (rows.length === 0) return <p className="text-xs text-[var(--muted-foreground)]">Chưa có dữ liệu thời gian.</p>;
  const y = scoreDomain(
    rows.map((c) => c.overall.mean!),
    pass,
  );
  const times = rows.map((c) => c.latency!.median / 1000);
  const maxS = Math.max(...times);
  const minS = Math.min(...times);
  // One slow service would squeeze every other dot into a corner: past a 6× spread the time axis goes logarithmic.
  const log = rows.length > 1 && maxS / Math.max(minS, 0.1) > 6;
  const STEPS = [0.5, 1, 2, 3, 5, 10, 20, 30, 60, 120, 300];
  const logMin = [...STEPS].reverse().find((s) => s <= minS * 0.8) ?? 0.5;
  const logMax = STEPS.find((s) => s >= maxS * 1.25) ?? Math.ceil(maxS * 1.25);
  const xAxis = log
    ? {
        scaleType: "log" as const,
        min: logMin,
        max: logMax,
        tickInterval: STEPS.filter((s) => s >= logMin && s <= logMax),
        label: "Thời gian mỗi lần gọi (giây, trung vị, thang log) — càng trái càng nhanh",
        valueFormatter: (v: number) => `${v}s`,
      }
    : { min: 0, max: Math.ceil((maxS * 1.15) / 5) * 5 || 5, label: "Thời gian mỗi lần gọi (giây, trung vị) — càng trái càng nhanh", valueFormatter: (v: number) => `${v}s` };
  return (
    <ThemeProvider theme={theme}>
      <ScatterChart
        height={340}
        width={width}
        skipAnimation
        series={rows.map((c) => ({
          id: `c${c.index}`,
          label: seriesName(c),
          color: SERIES[mode][c.index % 6],
          markerSize: 9,
          data: [{ id: c.index, x: Math.round((c.latency!.median / 1000) * 10) / 10, y: c.overall.mean! }],
          valueFormatter: (v: { x: number; y: number } | null) =>
            v ? `${pts(v.y)}, ${secs(v.x)} mỗi lần gọi (${secs(c.latency!.perItem / 1000)} mỗi câu)${c.cost.total !== null ? `, chi phí $${c.cost.total.toFixed(4)}` : ""}` : "—",
        }))}
        xAxis={[xAxis]}
        yAxis={[{ min: y.min, max: y.max, width: 56, label: "Điểm tổng" }]}
        grid={{ horizontal: true, vertical: true }}
        slotProps={legendTop}
        margin={{ top: 30, right: 24, bottom: 8, left: 8 }}
        sx={{ "& .MuiScatter-root circle, & .MuiScatterMarker-root": { stroke: INK[mode].paper, strokeWidth: 2 } }}
      >
        <ChartsReferenceLine
          y={pass}
          label={`ngưỡng đạt ${pass}`}
          labelAlign="end"
          lineStyle={{ stroke: INK[mode].pass, strokeDasharray: "5 4", strokeWidth: 1.5 }}
          labelStyle={{ fill: INK[mode].muted, fontSize: 12 }}
        />
        <PointLabels
          ink={INK[mode].text}
          halo={INK[mode].paper}
          points={rows.map((c) => ({
            key: `c${c.index}`,
            x: Math.round((c.latency!.median / 1000) * 10) / 10,
            y: c.overall.mean!,
            text: shortName(c),
          }))}
        />
      </ScatterChart>
    </ThemeProvider>
  );
}
