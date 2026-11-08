"use client";

import { AiTaskTabs } from "@/components/admin/ai-task-tabs";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/learn/icons";
import { bestOf, DEFAULT_SPEED_WEIGHT, MIN_ACCURACY, rankServices, speedScore, TASK_LABELS, type BenchTask, type Ranked } from "@/lib/ai-benchmark-score";

export interface BenchRun {
  ok: boolean;
  at: string;
  ms: number;
  accuracy?: number;
  answered?: number;
  error?: string;
}

export interface Bench {
  ok: boolean;
  at: string;
  /** Median latency of the successful runs. */
  ms: number;
  accuracy: number;
  chrf: number;
  terminology?: number;
  completeness?: number;
  matchAcc: number;
  writeScore: number;
  items: number;
  answered: number;
  error?: string;
  /** Translator: only the translations were scored. */
  translateOnly?: boolean;
  details?: BenchDetail[];
  raw?: string;
  runs?: BenchRun[];
  successRate?: number;
  latency?: { mean: number; median: number; min: number; max: number; stdev: number; cv: number; p95?: number };
  charsPerSec?: number;
  lastAttempt?: { at: string; error?: string; ms: number };
  task?: BenchTask;
  /** Rebuilt from an older combined benchmark — score again to measure this task on its own. */
  legacy?: boolean;
  grammarHit?: number;
  grammarSplit?: number;
  grammarTrans?: number;
  pronounceReading?: number;
  pronounceRomaji?: number;
  pronounceWords?: number;
  pronounceViet?: number;
}

/** One line of a task's history: how a past run of that task went. */
export interface HistoryEntry {
  at: string;
  ok: boolean;
  accuracy: number;
  ms: number;
  successRate: number;
  runs: number;
  error?: string;
}

export interface BenchDetail {
  id: number;
  kind: "translate" | "write" | "grammar" | "pronounce";
  term: string;
  meaning: string;
  source?: string;
  expected?: string;
  expectMatch?: boolean;
  answered: boolean;
  vi?: string;
  ja?: string;
  matches?: boolean;
  terminology?: number;
  completeness?: number;
  chrf?: number;
  matchOk?: boolean;
  writeScore?: number;
  hit?: number;
  split?: number;
  points?: string[];
  readingScore?: number;
  romajiScore?: number;
  wordsScore?: number;
  gotReading?: string;
  gotRomaji?: string;
  gotViet?: string;
}

export interface BenchService {
  id: string;
  label: string;
  providerName: string;
  model: string;
  enabled: boolean;
  /** Latest result of each task, scored on its own. */
  benchTasks?: Partial<Record<BenchTask, Bench>>;
  benchHistory?: Partial<Record<BenchTask, HistoryEntry[]>>;
}

const API = "/api/flashcards/admin/ai";
/** Same look as the buttons on the service rows: one height, no wrapping. */
const iconBtn =
  "inline-flex size-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--layer-hover)] disabled:opacity-60";
const btn =
  "inline-flex h-8 min-w-[5.5rem] items-center justify-center whitespace-nowrap rounded-lg border border-[var(--border)] px-3 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)] disabled:opacity-50";
/** The two main actions share one width. */
const btnWide = `${btn} flex-1`;
const field =
  "h-8 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 text-xs text-[var(--foreground)]";

const short = (s: string, n = 26) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const secs = (ms: number) => (ms / 1000).toFixed(ms < 10_000 ? 1 : 0);

interface Tip {
  x: number;
  y: number;
  lines: string[];
}

type SortKey = "final" | "accuracy" | "speed";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "final", label: "Tổng hợp" },
  { key: "accuracy", label: "Chính xác" },
  { key: "speed", label: "Tốc độ" },
];

const HOW: Record<BenchTask, string> = {
  translate:
    "10 câu mẫu (8 đúng nghĩa, 2 cố ý sai nghĩa). Chính xác = 35% độ giống bản dịch chuẩn (chrF) + 15% dùng đúng thuật ngữ + 10% đủ ý (độ dài hợp lý) + 20% đoán đúng nghĩa của từ (model chuyên dịch chỉ tính 3 phần đầu).",
  write: "4 từ mẫu. Chính xác = câu model viết có dùng đúng từ (100), quá 25 ký tự (60) hoặc thiếu từ / không phải tiếng Nhật (0), trung bình 4 từ.",
  grammar:
    "3 câu mẫu. Chính xác = 60% nêu đúng các mẫu ngữ pháp cần có + 25% tách câu thành đủ từ có chú thích (từ loại / nghĩa) + 15% có bản dịch tiếng Việt.",
  pronounce:
    "2 từ mẫu (一人住まい — ひとりずまい, 放っておく — ほうっておく). Chính xác = 55% hiragana đúng với cách đọc chuẩn + 20% romaji khớp (cách viết trường âm ō/ou coi như nhau) + 15% tách từ có kèm cách đọc + 10% có cách đọc theo tiếng Việt.",
};
const ITEMS: Record<BenchTask, string> = { translate: "10 câu dịch", write: "4 từ đặt câu", grammar: "3 câu ngữ pháp", pronounce: "2 từ phát âm" };

export function AiBenchmarkPanel({
  services,
  onChanged,
  task,
  onTaskChange,
}: {
  services: BenchService[];
  onChanged: () => Promise<void> | void;
  /** Selected task, shared with the priority list above. */
  task: BenchTask;
  onTaskChange: (t: BenchTask) => void;
}) {
  const [weight, setWeight] = useState(Math.round(DEFAULT_SPEED_WEIGHT * 100)); // speed share, %
  const [minAcc, setMinAcc] = useState(MIN_ACCURACY);
  const [runs, setRuns] = useState(3);
  const [sortBy, setSortBy] = useState<SortKey>("final");
  const [autoSort, setAutoSort] = useState(true);
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // The task can change from outside (priority tabs): drop selections of the old one.
  useEffect(() => {
    setPicked(new Set());
    setOpenId(null);
  }, [task]);

  const { rows, byId, best } = useMemo(() => {
    // Every number below is the selected task's own accuracy / latency.
    const withBench = services.flatMap((s) => (s.benchTasks?.[task] ? [{ ...s, bench: s.benchTasks[task]! }] : []));
    const ranked = rankServices(
      withBench.map((s) => ({ id: s.id, bench: s.bench })),
      weight / 100,
      minAcc,
    );
    const rk = new Map<string, Ranked>(ranked.map((r) => [r.id, r]));
    const order = (a: Ranked, b: Ranked) =>
      sortBy === "final" ? 0 : sortBy === "accuracy" ? b.accuracy - a.accuracy : b.speed - a.speed;
    const sortedRanked = [...ranked].sort((a, b) => Number(b.eligible) - Number(a.eligible) || order(a, b) || ranked.indexOf(a) - ranked.indexOf(b));
    const ids = new Map(sortedRanked.map((r, i) => [r.id, i]));
    const rows = withBench
      .map((s) => ({ ...s, r: rk.get(s.id) ?? null }))
      .sort((a, b) => (ids.get(a.id) ?? 1e9) - (ids.get(b.id) ?? 1e9));
    return { rows, byId: new Map(rows.map((r) => [r.id, r])), best: bestOf(ranked) };
  }, [services, weight, minAcc, sortBy, task]);

  const ok = rows.filter((s) => s.bench.ok);
  const enabled = services.filter((s) => s.enabled);
  const compared = rows.filter((r) => picked.has(r.id) && r.bench.ok);

  function sortBody() {
    return JSON.stringify({ speedWeight: weight / 100, minAccuracy: minAcc, task });
  }

  async function run(ids: string[]) {
    setMsg(null);
    setRunning((r) => new Set([...r, ...ids]));
    await Promise.all(
      ids.map((id) =>
        fetch(`${API}/services/${id}/benchmark`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runs, task }),
        }).catch(() => null),
      ),
    );
    setRunning((r) => {
      const n = new Set(r);
      ids.forEach((i) => n.delete(i));
      return n;
    });
    if (autoSort) {
      const res = await fetch(`${API}/services/auto-sort`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: sortBody(),
      }).catch(() => null);
      setMsg(
        res?.ok
          ? { ok: true, text: `Đã chấm điểm “${TASK_LABELS[task]}” và sắp xếp lại thứ tự ưu tiên của việc này.` }
          : { ok: false, text: "Đã chấm điểm nhưng không sắp xếp được." },
      );
    } else {
      setMsg({ ok: true, text: `Đã chấm điểm “${TASK_LABELS[task]}”.` });
    }
    await onChanged();
  }

  async function sortNow() {
    setMsg(null);
    const res = await fetch(`${API}/services/auto-sort`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: sortBody(),
    }).catch(() => null);
    setMsg(res?.ok ? { ok: true, text: `Đã sắp xếp thứ tự ưu tiên của “${TASK_LABELS[task]}” theo điểm hiện có.` } : { ok: false, text: "Không sắp xếp được." });
    await onChanged();
  }

  function togglePick(id: string) {
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const busy = running.size > 0;
  const cards: { key: keyof typeof best; title: string; hint: string; value: (id: string) => string }[] = [
    { key: "overall", title: "Tổng hợp tốt nhất", hint: "Cân bằng chính xác và tốc độ", value: (id) => `${byId.get(id)!.r!.final.toFixed(1)} điểm` },
    { key: "accuracy", title: "Chính xác nhất", hint: "Chênh dưới 1 điểm thì chọn bên nhanh hơn", value: (id) => `${byId.get(id)!.bench.accuracy.toFixed(1)} điểm` },
    { key: "speed", title: "Nhanh nhất", hint: "Trong số dịch vụ đạt ngưỡng", value: (id) => `${secs(byId.get(id)!.bench.ms)}s` },
    { key: "value", title: "Giá trị tốt nhất", hint: "Nhanh nhất trong nhóm chính xác sát đầu bảng (≤ 5 điểm)", value: (id) => `${byId.get(id)!.bench.accuracy.toFixed(1)} điểm · ${secs(byId.get(id)!.bench.ms)}s` },
  ];

  return (
    <section className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-5" aria-labelledby="bench-title">
      <style>{`
        .bench-viz{--viz-1:#2a78d6;--viz-surface:var(--background-1)}
        :root[data-theme="dark"] .bench-viz{--viz-1:#3987e5}
      `}</style>
      <h2 id="bench-title" className="text-sm font-semibold text-[var(--foreground)]">
        Chấm điểm & so sánh dịch vụ
      </h2>
      <AiTaskTabs
        className="mt-3"
        label="Loại việc"
        value={task}
        onChange={onTaskChange}
      />
      <p className="mt-3 text-xs text-[var(--muted-foreground)]">
        <b>Cách chấm “{TASK_LABELS[task]}”:</b> {HOW[task]} <b>Tốc độ</b> = độ trễ trung vị của lượt gọi, quy ra điểm trên thang log cố định (≤ 2s = 100, ≥ 30s = 0)
        nên điểm không đổi khi thêm bớt dịch vụ khác. <b>Tổng hợp</b> = ((1 − tỉ trọng) × chính xác + tỉ trọng × tốc độ) × tỉ lệ chạy thành công; dịch vụ dưới ngưỡng
        chỉ hiển thị, không được xếp hạng. Điểm, biểu đồ, xếp hạng, lịch sử và thứ tự ưu tiên của từng việc tách biệt hoàn toàn; khi chạy thật, mỗi việc dùng thứ tự riêng của nó
        (dịch vụ chưa sắp xếp riêng dùng thứ tự chung).
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnWide} disabled={busy || enabled.length === 0} onClick={() => void run(enabled.map((s) => s.id))}>
            {busy ? `Đang chấm (${running.size})…` : `Chấm điểm “${TASK_LABELS[task]}” cho mọi dịch vụ đang bật`}
          </button>
          <button type="button" className={btnWide} disabled={busy || ok.length === 0} onClick={() => void sortNow()}>
            Sắp xếp “{TASK_LABELS[task]}” theo điểm
          </button>
        </div>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <label className="flex w-full flex-col gap-1 text-xs text-[var(--muted-foreground)] sm:w-64">
            <span>
              Ưu tiên: chính xác {100 - weight}% · tốc độ {weight}%
            </span>
            <input type="range" min={0} max={100} step={5} value={weight} onChange={(e) => setWeight(Number(e.target.value))} aria-label="Tỉ trọng tốc độ" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
            Ngưỡng chính xác tối thiểu
            <input
              type="number"
              min={0}
              max={100}
              value={minAcc}
              onChange={(e) => setMinAcc(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
              className={`${field} w-28`}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
            Số lần chạy mỗi dịch vụ
            <select value={runs} onChange={(e) => setRuns(Number(e.target.value))} className={`${field} w-28`}>
              <option value={1}>1 (nhanh)</option>
              <option value={3}>3 (khuyến nghị)</option>
              <option value={5}>5 (kỹ, có P95)</option>
            </select>
          </label>
          <label className="flex h-8 items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <input type="checkbox" checked={autoSort} onChange={(e) => setAutoSort(e.target.checked)} />
            Tự sắp xếp thứ tự ưu tiên sau khi chấm
          </label>
        </div>
        <p className="text-[11px] text-[var(--muted-foreground)]">
          Mỗi lần chạy tốn một lượt gọi API ({ITEMS[task]}{task === "translate" ? "; model chuyên dịch gọi mỗi câu một lần" : ""}) nên {runs} lần chạy dùng khoảng {runs}× hạn mức — chú ý dịch vụ miễn phí có hạn mức thấp.
          Gặp lỗi hết hạn mức/từ chối thì dừng ngay để khỏi tốn thêm.
        </p>
      </div>
      {msg && (
        <p role="status" className={"mt-3 text-xs " + (msg.ok ? "text-[#15803d] dark:text-[#86efac]" : "text-[#b91c1c]")}>
          {msg.text}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="mt-5 text-sm text-[var(--muted-foreground)]">Chưa có điểm “{TASK_LABELS[task]}” nào — bấm “Chấm điểm” để bắt đầu.</p>
      ) : (
        <>
          {/* Best-of views */}
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((c) => {
              const id = best[c.key];
              return (
                <div key={c.key} className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">{c.title}</p>
                  {id ? (
                    <>
                      <p className="mt-1 truncate text-sm font-semibold text-[var(--foreground)]" title={byId.get(id)!.label}>
                        {byId.get(id)!.label}
                      </p>
                      <p className="text-xs tabular-nums text-[var(--foreground)]">{c.value(id)}</p>
                    </>
                  ) : (
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">Chưa có dịch vụ đạt ngưỡng {minAcc}</p>
                  )}
                  <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">{c.hint}</p>
                </div>
              );
            })}
          </div>

          {ok.length > 0 && (
            <div className="bench-viz relative mt-5 grid gap-5 lg:grid-cols-2" onMouseLeave={() => setTip(null)}>
              <BarChart
                title="Độ chính xác (điểm 0–100, cao hơn = tốt; vạch = ngưỡng)"
                rows={ok.map((s) => ({ key: s.id, label: s.label, value: s.bench.accuracy, text: s.bench.accuracy.toFixed(1), tip: [s.label, `Chính xác ${s.bench.accuracy.toFixed(1)}`, `chrF ${s.bench.chrf} · thuật ngữ ${s.bench.terminology ?? "–"} · đủ ý ${s.bench.completeness ?? "–"}`] }))}
                max={100}
                mark={minAcc}
                onTip={setTip}
              />
              <BarChart
                title="Độ trễ trung vị (giây cho một lượt gọi, thấp hơn = tốt)"
                rows={[...ok].sort((a, b) => a.bench.ms - b.bench.ms).map((s) => ({ key: s.id, label: s.label, value: s.bench.ms / 1000, text: `${secs(s.bench.ms)}s`, tip: [s.label, `${(s.bench.ms / 1000).toFixed(2)} giây (trung vị)`, `Điểm tốc độ ${speedScore(s.bench.ms).toFixed(1)}`] }))}
                max={Math.max(...ok.map((s) => s.bench.ms / 1000)) * 1.1}
                onTip={setTip}
              />
              <div className="lg:col-span-2">
                <Scatter
                  points={ok.map((s) => ({ key: s.id, label: s.label, x: s.bench.ms / 1000, y: s.bench.accuracy, pareto: Boolean(s.r?.pareto), eligible: Boolean(s.r?.eligible) }))}
                  threshold={minAcc}
                  onTip={setTip}
                />
              </div>
              {tip && (
                <div
                  role="tooltip"
                  className="pointer-events-none absolute z-10 max-w-64 rounded-lg border border-[var(--border)] bg-[var(--layer)] px-3 py-2 text-xs shadow-lg"
                  style={{ left: tip.x, top: tip.y, transform: "translate(-50%, calc(-100% - 10px))" }}
                >
                  {tip.lines.map((l, i) => (
                    <div key={i} className={i === 0 ? "font-semibold text-[var(--foreground)]" : "text-[var(--muted-foreground)]"}>
                      {l}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Ranking table */}
          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <span>Xếp hạng theo:</span>
            <div role="group" aria-label="Xếp hạng theo" className="inline-flex rounded-full border border-[var(--border)] p-0.5">
              {SORTS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  aria-pressed={sortBy === o.key}
                  onClick={() => setSortBy(o.key)}
                  className={
                    "rounded-full px-3 py-1 font-medium " +
                    (sortBy === o.key ? "bg-[var(--primary)] text-[var(--primary-foreground,#fff)]" : "hover:text-[var(--foreground)]")
                  }
                >
                  {o.label}
                </button>
              ))}
            </div>
            <span className="ml-2">Tick ô đầu dòng để so sánh 2 dịch vụ trở lên · ⭐ = nằm trên biên Pareto (không ai vừa nhanh vừa chính xác hơn)</span>
          </div>
          <div className="mt-2 overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">Xếp hạng các dịch vụ</caption>
              <thead className="whitespace-nowrap bg-[var(--layer)] text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-2 py-2">
                    <span className="sr-only">So sánh</span>
                  </th>
                  <th className="px-2 py-2">#</th>
                  <th className="px-3 py-2">Dịch vụ</th>
                  <th className="px-3 py-2">Tổng hợp</th>
                  <th className="px-3 py-2">Chính xác</th>
                  <th className="px-3 py-2">Tốc độ</th>
                  <th className="px-3 py-2">Ổn định</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] text-[var(--foreground)]">
                {rows.map((s) => {
                  const rank = s.r?.eligible ? rows.filter((x) => x.r?.eligible).indexOf(s) + 1 : 0;
                  return (
                    <Fragment key={s.id}>
                      <tr className={s.r && !s.r.eligible ? "opacity-70" : undefined}>
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            aria-label={`So sánh ${s.label}`}
                            disabled={!s.bench.ok}
                            checked={picked.has(s.id)}
                            onChange={() => togglePick(s.id)}
                          />
                        </td>
                        <td className="px-2 py-2 tabular-nums">{rank || "—"}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1.5 font-medium">
                            {s.label}
                            {s.r?.pareto && <span title="Nằm trên biên Pareto">⭐</span>}
                            {s.r && !s.r.eligible && (
                              <span className="rounded-full bg-[#fef9c3] px-2 py-0.5 text-[10px] font-medium text-[#a16207] dark:bg-[#3a3210] dark:text-[#fde047]">dưới ngưỡng</span>
                            )}
                            {s.bench.translateOnly && <span className="rounded-full bg-[var(--layer)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted-foreground)]">chỉ dịch</span>}
                          </div>
                          <div className="text-[var(--muted-foreground)]">
                            {s.providerName} · <code>{s.model}</code>
                          </div>
                          {!s.bench.ok && <div className="mt-0.5 text-[#b91c1c]">Lỗi: {s.bench.error ?? "không đọc được câu trả lời"}</div>}
                          {s.bench.ok && s.bench.lastAttempt && (
                            <div className="mt-0.5 text-[#a16207] dark:text-[#fde047]">
                              Lần chấm gần nhất lỗi ({new Date(s.bench.lastAttempt.at).toLocaleString("vi-VN")}): {s.bench.lastAttempt.error ?? "?"} — đang giữ kết quả tốt trước đó.
                            </div>
                          )}
                        </td>
                        {s.bench.ok && s.r ? (
                          <>
                            <td className="px-3 py-2 font-semibold tabular-nums">{s.r.final.toFixed(1)}</td>
                            <td className="px-3 py-2 tabular-nums">{s.bench.accuracy.toFixed(1)}</td>
                            <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                              {s.r.speed.toFixed(1)} <span className="text-[var(--muted-foreground)]">· {secs(s.bench.ms)}s</span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                              {Math.round((s.bench.successRate ?? 1) * 100)}%
                              {s.bench.latency && s.bench.runs && s.bench.runs.length > 1 && (
                                <span className="text-[var(--muted-foreground)]"> · ±{Math.round(s.bench.latency.cv * 100)}%</span>
                              )}
                            </td>
                          </>
                        ) : (
                          <td colSpan={4} className="px-3 py-2 text-[var(--muted-foreground)]">
                            {new Date(s.bench.at).toLocaleString("vi-VN")}
                          </td>
                        )}
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              className={iconBtn}
                              aria-expanded={openId === s.id}
                              aria-label={openId === s.id ? "Ẩn kết quả" : "Xem kết quả"}
                              title={openId === s.id ? "Ẩn kết quả" : "Xem kết quả"}
                              onClick={() => setOpenId(openId === s.id ? null : s.id)}
                            >
                              <Icon name={openId === s.id ? "chevron-up" : "eye"} />
                            </button>
                            <button
                              type="button"
                              className={iconBtn}
                              disabled={running.has(s.id)}
                              aria-label="Chấm lại"
                              title={running.has(s.id) ? "Đang chấm…" : "Chấm lại"}
                              onClick={() => void run([s.id])}
                            >
                              <Icon name="refresh" className={"size-4" + (running.has(s.id) ? " animate-spin" : "")} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {openId === s.id && (
                        <tr className="bg-[var(--layer)]">
                          <td colSpan={8} className="px-3 py-3">
                            <ResultDetails bench={s.bench} label={s.label} task={task} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {compared.length >= 2 && <Compare rows={compared} task={task} onClear={() => setPicked(new Set())} />}

          <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">
            Bộ mẫu nhỏ nên điểm chỉ mang tính tham khảo — chrF so với một bản dịch chuẩn duy nhất, một bản dịch hay nhưng khác cách diễn đạt có thể bị chấm thấp. Các lần chạy
            thất bại luôn được ghi lại (xem “Xem kết quả”) và làm giảm tỉ lệ ổn định.
          </p>
        </>
      )}

      <History services={services} task={task} />
    </section>
  );
}

/* ── history (kept separately for each task) ─────────────────────────── */

function History({ services, task }: { services: BenchService[]; task: BenchTask }) {
  const lines = services
    .flatMap((s) => (s.benchHistory?.[task] ?? []).map((h) => ({ ...h, label: s.label, model: s.model })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 40);
  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-[var(--foreground)]">Lịch sử chấm điểm “{TASK_LABELS[task]}”</h3>
      <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
        Mỗi lần bấm chấm một dòng (kể cả lần lỗi); chỉ lưu riêng cho việc này, mỗi dịch vụ giữ 30 lần gần nhất.
      </p>
      {lines.length === 0 ? (
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">Chưa có lần chấm nào được lưu.</p>
      ) : (
        <div className="mt-2 max-h-80 overflow-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Lịch sử chấm điểm {TASK_LABELS[task]}</caption>
            <thead className="sticky top-0 whitespace-nowrap bg-[var(--layer)] text-[var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2">Thời gian</th>
                <th className="px-3 py-2">Dịch vụ</th>
                <th className="px-3 py-2">Chính xác</th>
                <th className="px-3 py-2">Độ trễ</th>
                <th className="px-3 py-2">Thành công</th>
                <th className="px-3 py-2">Số lần chạy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] text-[var(--foreground)]">
              {lines.map((h, i) => (
                <tr key={`${h.label}-${h.at}-${i}`}>
                  <td className="whitespace-nowrap px-3 py-1.5">{new Date(h.at).toLocaleString("vi-VN")}</td>
                  <td className="px-3 py-1.5">
                    {h.label} <span className="text-[var(--muted-foreground)]">· {short(h.model, 28)}</span>
                  </td>
                  {h.ok ? (
                    <>
                      <td className="px-3 py-1.5 tabular-nums">{h.accuracy.toFixed(1)}</td>
                      <td className="px-3 py-1.5 tabular-nums">{secs(h.ms)}s</td>
                      <td className="px-3 py-1.5 tabular-nums">{Math.round(h.successRate * 100)}%</td>
                    </>
                  ) : (
                    <td colSpan={3} className="px-3 py-1.5 text-[#b91c1c]" title={h.error}>
                      ✗ lỗi {h.error ? `(${short(h.error, 60)})` : ""}
                    </td>
                  )}
                  <td className="px-3 py-1.5 tabular-nums">{h.runs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── side-by-side comparison ────────────────────────────────────────── */

type Row = BenchService & { bench: Bench; r: Ranked | null };

function Compare({ rows, task, onClear }: { rows: Row[]; task: BenchTask; onClear: () => void }) {
  const metrics: { label: string; get: (r: Row) => number | undefined; fmt: (n: number) => string; higherIsBetter: boolean }[] = [
    { label: "Tổng hợp", get: (r) => r.r?.final, fmt: (n) => n.toFixed(1), higherIsBetter: true },
    { label: "Chính xác", get: (r) => r.bench.accuracy, fmt: (n) => n.toFixed(1), higherIsBetter: true },
    ...(task === "translate"
      ? [
          { label: "chrF", get: (r: Row) => r.bench.chrf, fmt: (n: number) => n.toFixed(1), higherIsBetter: true },
          { label: "Thuật ngữ", get: (r: Row) => r.bench.terminology, fmt: (n: number) => n.toFixed(1), higherIsBetter: true },
          { label: "Đủ ý", get: (r: Row) => r.bench.completeness, fmt: (n: number) => n.toFixed(1), higherIsBetter: true },
          { label: "Đúng nghĩa của từ", get: (r: Row) => (r.bench.translateOnly ? undefined : r.bench.matchAcc), fmt: (n: number) => n.toFixed(1), higherIsBetter: true },
        ]
      : task === "pronounce"
        ? [
            { label: "Hiragana đúng", get: (r: Row) => r.bench.pronounceReading, fmt: (n: number) => n.toFixed(1), higherIsBetter: true },
            { label: "Romaji đúng", get: (r: Row) => r.bench.pronounceRomaji, fmt: (n: number) => n.toFixed(1), higherIsBetter: true },
            { label: "Tách từ có cách đọc", get: (r: Row) => r.bench.pronounceWords, fmt: (n: number) => n.toFixed(1), higherIsBetter: true },
            { label: "Có đọc theo tiếng Việt", get: (r: Row) => r.bench.pronounceViet, fmt: (n: number) => n.toFixed(1), higherIsBetter: true },
          ]
      : task === "grammar"
        ? [
            { label: "Nêu đúng mẫu ngữ pháp", get: (r: Row) => r.bench.grammarHit, fmt: (n: number) => n.toFixed(1), higherIsBetter: true },
            { label: "Tách từ có chú thích", get: (r: Row) => r.bench.grammarSplit, fmt: (n: number) => n.toFixed(1), higherIsBetter: true },
            { label: "Có bản dịch", get: (r: Row) => r.bench.grammarTrans, fmt: (n: number) => n.toFixed(1), higherIsBetter: true },
          ]
        : []),
    { label: "Điểm tốc độ", get: (r) => r.r?.speed, fmt: (n) => n.toFixed(1), higherIsBetter: true },
    { label: "Độ trễ trung vị", get: (r) => r.bench.latency?.median ?? r.bench.ms, fmt: (n) => `${(n / 1000).toFixed(2)}s`, higherIsBetter: false },
    { label: "Độ trễ lớn nhất", get: (r) => r.bench.latency?.max, fmt: (n) => `${(n / 1000).toFixed(2)}s`, higherIsBetter: false },
    { label: "Độ lệch chuẩn", get: (r) => r.bench.latency?.stdev, fmt: (n) => `${(n / 1000).toFixed(2)}s`, higherIsBetter: false },
    { label: "P95 (từ 5 lần chạy)", get: (r) => (typeof r.bench.latency?.p95 === "number" ? r.bench.latency.p95 : undefined), fmt: (n) => `${(n / 1000).toFixed(2)}s`, higherIsBetter: false },
    { label: "Tỉ lệ thành công", get: (r) => (r.bench.successRate ?? 1) * 100, fmt: (n) => `${Math.round(n)}%`, higherIsBetter: true },
    { label: "Ký tự/giây (tham khảo)", get: (r) => r.bench.charsPerSec, fmt: (n) => String(Math.round(n)), higherIsBetter: true },
  ];
  return (
    <div className="mt-5 rounded-xl border border-[var(--border)]">
      <div className="flex items-center justify-between px-3 py-2">
        <p className="text-xs font-semibold text-[var(--foreground)]">So sánh {rows.length} dịch vụ (in đậm = tốt nhất ở dòng đó)</p>
        <button type="button" className={btn} onClick={onClear}>
          Bỏ chọn
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[var(--layer)] text-[var(--muted-foreground)]">
            <tr>
              <th className="px-3 py-2">Chỉ số</th>
              {rows.map((r) => (
                <th key={r.id} className="px-3 py-2">
                  {short(r.label, 22)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)] text-[var(--foreground)]">
            {metrics.map((m) => {
              const vals = rows.map(m.get);
              const defined = vals.filter((v): v is number => v !== undefined);
              const best = defined.length > 1 ? (m.higherIsBetter ? Math.max(...defined) : Math.min(...defined)) : undefined;
              return (
                <tr key={m.label}>
                  <td className="px-3 py-1.5 text-[var(--muted-foreground)]">{m.label}</td>
                  {vals.map((v, i) => (
                    <td key={rows[i].id} className={"px-3 py-1.5 tabular-nums " + (v !== undefined && v === best ? "font-bold" : "")}>
                      {v === undefined ? "—" : m.fmt(v)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── per-item results ───────────────────────────────────────────────── */

/** ✓ / ✗ with a word, so the verdict never rests on colour alone. */
function Verdict({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return (
    <span className={ok ? "text-[#15803d] dark:text-[#86efac]" : "text-[#b91c1c]"}>
      {ok ? "✓" : "✗"} {ok ? yes : no}
    </span>
  );
}

function ResultDetails({ bench, label, task }: { bench: Bench; label: string; task: BenchTask }) {
  const details = bench.details;
  return (
    <div className="text-xs">
      <p className="font-medium text-[var(--foreground)]">
        Kết quả của {label} · {new Date(bench.at).toLocaleString("vi-VN")} · trả lời {bench.answered}/{bench.items} câu
      </p>
      {bench.legacy && (
        <p className="mt-1 text-[#a16207] dark:text-[#fde047]">
          Điểm này được suy ra từ lần chấm gộp cũ (chưa đo riêng việc này, chưa có lịch sử) — bấm “Chấm lại” để đo riêng.
        </p>
      )}
      {bench.ok && (
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
          {(
            [
              ...(task === "translate"
                ? ([
                    ["chrF", bench.chrf],
                    ["Thuật ngữ", bench.terminology],
                    ["Đủ ý", bench.completeness],
                    ["Đúng nghĩa của từ", bench.translateOnly ? undefined : bench.matchAcc],
                  ] as [string, number | undefined][])
                : task === "write"
                  ? ([["Viết câu", bench.writeScore]] as [string, number | undefined][])
                  : task === "pronounce"
                    ? ([
                        ["Hiragana đúng", bench.pronounceReading],
                        ["Romaji đúng", bench.pronounceRomaji],
                        ["Tách từ có cách đọc", bench.pronounceWords],
                        ["Có đọc theo tiếng Việt", bench.pronounceViet],
                      ] as [string, number | undefined][])
                  : ([
                      ["Nêu đúng mẫu ngữ pháp", bench.grammarHit],
                      ["Tách từ có chú thích", bench.grammarSplit],
                      ["Có bản dịch", bench.grammarTrans],
                    ] as [string, number | undefined][])),
              ["Ký tự/giây (tham khảo)", bench.charsPerSec],
            ] as [string, number | undefined][]
          ).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2 border-b border-[var(--border)] py-0.5">
              <dt className="text-[var(--muted-foreground)]">{k}</dt>
              <dd className="font-medium tabular-nums">{v === undefined ? "—" : v}</dd>
            </div>
          ))}
          {bench.latency && (
            <>
              <div className="flex justify-between gap-2 border-b border-[var(--border)] py-0.5">
                <dt className="text-[var(--muted-foreground)]">Độ trễ TB / trung vị</dt>
                <dd className="font-medium tabular-nums">
                  {secs(bench.latency.mean)}s / {secs(bench.latency.median)}s
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-[var(--border)] py-0.5">
                <dt className="text-[var(--muted-foreground)]">Nhỏ nhất / lớn nhất</dt>
                <dd className="font-medium tabular-nums">
                  {secs(bench.latency.min)}s / {secs(bench.latency.max)}s
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-[var(--border)] py-0.5">
                <dt className="text-[var(--muted-foreground)]">Độ lệch chuẩn</dt>
                <dd className="font-medium tabular-nums">
                  {secs(bench.latency.stdev)}s (±{Math.round(bench.latency.cv * 100)}%)
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-[var(--border)] py-0.5">
                <dt className="text-[var(--muted-foreground)]">P95</dt>
                <dd className="font-medium tabular-nums">{typeof bench.latency.p95 === "number" ? `${secs(bench.latency.p95)}s` : "cần ≥ 5 lần chạy"}</dd>
              </div>
            </>
          )}
        </dl>
      )}
      {bench.runs && bench.runs.length > 0 && (
        <p className="mt-2 text-[var(--muted-foreground)]">
          Các lần chạy:{" "}
          {bench.runs.map((r, i) => (
            <span key={i} className="mr-3 whitespace-nowrap">
              #{i + 1}{" "}
              {r.ok ? (
                <span className="text-[var(--foreground)]">
                  {r.accuracy?.toFixed(1)} điểm · {secs(r.ms)}s
                </span>
              ) : (
                <span className="text-[#b91c1c]" title={r.error}>
                  ✗ lỗi ({short(r.error ?? "?", 40)})
                </span>
              )}
            </span>
          ))}
        </p>
      )}
      {!details ? (
        <p className="mt-2 text-[var(--muted-foreground)]">
          {bench.ok ? "Lần chấm này chưa lưu chi tiết từng câu — bấm “Chấm lại” để xem." : `Lần chấm này lỗi: ${bench.error ?? "không đọc được câu trả lời"}.`}
        </p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--background-1)]">
          <table className="w-full text-left align-top">
            <thead className="bg-[var(--layer)] text-[var(--muted-foreground)]">
              <tr>
                <th className="px-2 py-1.5">#</th>
                <th className="px-2 py-1.5">Đề bài</th>
                <th className="px-2 py-1.5">Đáp án mẫu / yêu cầu</th>
                <th className="px-2 py-1.5">Model trả lời</th>
                <th className="px-2 py-1.5">Chấm</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] text-[var(--foreground)]">
              {details.map((d) => (
                <tr key={d.id}>
                  <td className="px-2 py-1.5 tabular-nums">{d.id}</td>
                  <td className="px-2 py-1.5">
                    {d.kind === "grammar" || d.kind === "pronounce" ? (
                      <div lang="ja">{d.source}</div>
                    ) : d.kind === "translate" ? (
                      <>
                        <div lang="ja">{d.source}</div>
                        <div className="text-[var(--muted-foreground)]">
                          từ <span lang="ja">{d.term}</span> = “{d.meaning}”
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          Viết câu với <span lang="ja">{d.term}</span>
                        </div>
                        <div className="text-[var(--muted-foreground)]">nghĩa “{d.meaning}”</div>
                      </>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {d.kind === "pronounce" ? (
                      <div className="text-[var(--muted-foreground)]">
                        hiragana: <span lang="ja">{d.expected}</span>
                      </div>
                    ) : d.kind === "grammar" ? (
                      <div className="text-[var(--muted-foreground)]">
                        phải nêu: <span lang="ja">{d.expected}</span>
                      </div>
                    ) : d.kind === "translate" ? (
                      <>
                        <div>{d.expected}</div>
                        <div className="text-[var(--muted-foreground)]">
                          đúng nghĩa: {d.expectMatch ? "có" : "không (cố ý sai)"}
                        </div>
                      </>
                    ) : (
                      <div className="text-[var(--muted-foreground)]">
                        chứa “<span lang="ja">{d.expected}</span>”, ≤ 25 ký tự
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {!d.answered ? (
                      <span className="text-[#b91c1c]">✗ Không có câu trả lời đọc được</span>
                    ) : d.kind === "pronounce" ? (
                      <>
                        <div lang="ja">{d.gotReading}</div>
                        <div className="text-[var(--muted-foreground)]">
                          {d.gotRomaji}
                          {d.gotViet ? ` · ${d.gotViet}` : ""}
                        </div>
                      </>
                    ) : d.kind === "grammar" ? (
                      <>
                        <div>{d.vi}</div>
                        <div className="text-[var(--muted-foreground)]" lang="ja">
                          {d.points && d.points.length > 0 ? d.points.join(" · ") : "không nêu mẫu ngữ pháp nào"}
                        </div>
                      </>
                    ) : d.kind === "translate" ? (
                      <>
                        <div>{d.vi}</div>
                        {!bench.translateOnly && (
                          <div className="text-[var(--muted-foreground)]">
                            model nói: {d.matches === undefined ? "không rõ" : d.matches ? "đúng nghĩa" : "sai nghĩa"}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div lang="ja">{d.ja}</div>
                        <div className="text-[var(--muted-foreground)]">{d.vi}</div>
                      </>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    {d.kind === "pronounce" ? (
                      <>
                        <div className="tabular-nums">hiragana {d.readingScore ?? 0}</div>
                        <div className="tabular-nums text-[var(--muted-foreground)]">
                          romaji {d.romajiScore ?? 0} · từ {d.wordsScore ?? 0}
                        </div>
                        <Verdict ok={(d.readingScore ?? 0) === 100} yes="đọc đúng" no="đọc sai" />
                      </>
                    ) : d.kind === "grammar" ? (
                      <>
                        <div className="tabular-nums">mẫu ngữ pháp {d.hit ?? 0}</div>
                        <div className="tabular-nums text-[var(--muted-foreground)]">tách từ {d.split ?? 0}</div>
                        <Verdict ok={(d.hit ?? 0) === 100} yes="đủ mẫu" no="thiếu mẫu" />
                      </>
                    ) : d.kind === "translate" ? (
                      <>
                        <div className="tabular-nums">chrF {d.chrf}</div>
                        <div className="tabular-nums text-[var(--muted-foreground)]">
                          {d.terminology !== undefined && <>thuật ngữ {d.terminology} · </>}đủ ý {d.completeness ?? "–"}
                        </div>
                        {!bench.translateOnly && <Verdict ok={Boolean(d.matchOk)} yes="nhận định đúng" no="nhận định sai" />}
                      </>
                    ) : (
                      <>
                        <div className="tabular-nums">{d.writeScore} điểm</div>
                        <Verdict ok={d.writeScore === 100} yes="đạt" no={d.writeScore === 60 ? "quá dài" : "thiếu từ"} />
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {bench.raw && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[var(--primary)]">Phản hồi thô của model</summary>
          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--background-1)] p-2 text-[11px] leading-relaxed">{bench.raw}</pre>
        </details>
      )}
    </div>
  );
}

/* ── charts ─────────────────────────────────────────────────────────── */

const ROW_H = 34;
const BAR_H = 16;

function BarChart({
  title,
  rows,
  max,
  mark,
  onTip,
}: {
  title: string;
  rows: { key: string; label: string; value: number; text: string; tip: string[] }[];
  max: number;
  /** Optional reference line (the accuracy threshold). */
  mark?: number;
  onTip: (t: Tip | null) => void;
}) {
  const W = 420;
  const labelW = 150;
  const pad = 44; // room for the value label at the bar tip
  const plotW = W - labelW - pad;
  const H = rows.length * ROW_H + 26;
  const ticks = [0, 0.5, 1].map((f) => f * max);
  return (
    <figure>
      <figcaption className="mb-1 text-xs font-medium text-[var(--foreground)]">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title}>
        {ticks.map((t) => {
          const x = labelW + (t / max) * plotW;
          return (
            <g key={t}>
              <line x1={x} x2={x} y1={0} y2={H - 20} stroke="var(--border)" strokeWidth={1} />
              <text x={x} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)">
                {max > 20 ? Math.round(t) : t.toFixed(1)}
              </text>
            </g>
          );
        })}
        {mark !== undefined && mark > 0 && mark <= max && (
          <g>
            <line x1={labelW + (mark / max) * plotW} x2={labelW + (mark / max) * plotW} y1={0} y2={H - 20} stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="4 3" />
            <text x={labelW + (mark / max) * plotW} y={H - 6} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--foreground)" stroke="var(--background-1)" strokeWidth={3} paintOrder="stroke">
              ngưỡng {mark}
            </text>
          </g>
        )}
        {rows.map((r, i) => {
          const y = i * ROW_H + (ROW_H - BAR_H) / 2;
          const w = Math.max(2, (r.value / max) * plotW);
          const x0 = labelW;
          // right end rounded 4px, left end square on the baseline
          const d = `M${x0},${y} H${x0 + w - 4} a4,4 0 0 1 4,4 V${y + BAR_H - 4} a4,4 0 0 1 -4,4 H${x0} Z`;
          return (
            <g
              key={r.key}
              onMouseEnter={(e) => hover(e, r.tip, onTip)}
              onMouseMove={(e) => hover(e, r.tip, onTip)}
            >
              <rect x={0} y={i * ROW_H} width={W} height={ROW_H} fill="transparent" />
              <text x={labelW - 8} y={y + BAR_H / 2 + 4} textAnchor="end" fontSize={11} fill="var(--foreground)">
                {short(r.label, 22)}
              </text>
              <path d={d} fill="var(--viz-1)" />
              <text x={x0 + w + 6} y={y + BAR_H / 2 + 4} fontSize={11} fontWeight={600} fill="var(--foreground)">
                {r.text}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

function Scatter({
  points,
  threshold,
  onTip,
}: {
  points: { key: string; label: string; x: number; y: number; pareto: boolean; eligible: boolean }[];
  /** Accuracy bar: points below it are drawn hollow. */
  threshold: number;
  onTip: (t: Tip | null) => void;
}) {
  const W = 860;
  const H = 280;
  const m = { l: 44, r: 150, t: 12, b: 38 };
  const maxX = Math.max(...points.map((p) => p.x)) * 1.15 || 1;
  const sx = (v: number) => m.l + (v / maxX) * (W - m.l - m.r);
  const sy = (v: number) => m.t + (1 - v / 100) * (H - m.t - m.b);
  const xt = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxX);
  return (
    <figure>
      <figcaption className="mb-1 text-xs font-medium text-[var(--foreground)]">
        Tốc độ so với độ chính xác — góc trên bên trái là tốt nhất; ⭐ = biên Pareto, vòng rỗng = dưới ngưỡng
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Biểu đồ tốc độ so với độ chính xác">
        {[0, 25, 50, 75, 100].map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={sy(t)} y2={sy(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={m.l - 6} y={sy(t) + 3} textAnchor="end" fontSize={10} fill="var(--muted-foreground)">
              {t}
            </text>
          </g>
        ))}
        {xt.map((t) => (
          <text key={t} x={sx(t)} y={H - m.b + 16} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)">
            {t.toFixed(1)}s
          </text>
        ))}
        <text x={(m.l + W - m.r) / 2} y={H - 4} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)">
          Thời gian (giây) →
        </text>
        <text x={12} y={(m.t + H - m.b) / 2} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)" transform={`rotate(-90 12 ${(m.t + H - m.b) / 2})`}>
          Chính xác →
        </text>
        <line x1={m.l} x2={W - m.r} y1={sy(threshold)} y2={sy(threshold)} stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="4 3" />
        <text x={W - m.r + 6} y={sy(threshold) + 3} fontSize={10} fill="var(--muted-foreground)">
          ngưỡng {threshold}
        </text>
        {(() => {
          // Labels sit to the right of their dot, nudged apart vertically when dots are close;
          // a thin leader line keeps each label tied to its dot.
          const GAP = 14;
          const sorted = [...points].sort((a, b) => sy(a.y) - sy(b.y));
          const labelY = new Map<string, number>();
          let prev = -Infinity;
          for (const p of sorted) {
            const y = Math.max(sy(p.y) + 4, prev + GAP);
            labelY.set(p.key, y);
            prev = y;
          }
          return points.map((p) => {
            const tip = [p.label, `Chính xác ${p.y.toFixed(1)}`, `${p.x.toFixed(2)} giây`, p.eligible ? (p.pareto ? "Biên Pareto ⭐" : "Đạt ngưỡng") : "Dưới ngưỡng — không xếp hạng"];
            const ly = labelY.get(p.key)!;
            const moved = Math.abs(ly - 4 - sy(p.y)) > 2;
            return (
              <g key={p.key} onMouseEnter={(e) => hover(e, tip, onTip)} onMouseMove={(e) => hover(e, tip, onTip)}>
                {moved && <line x1={sx(p.x) + 5} y1={sy(p.y)} x2={sx(p.x) + 9} y2={ly - 4} stroke="var(--muted-foreground)" strokeWidth={1} />}
                <circle cx={sx(p.x)} cy={sy(p.y)} r={14} fill="transparent" />
                {p.eligible ? (
                  <circle cx={sx(p.x)} cy={sy(p.y)} r={5} fill="var(--viz-1)" stroke="var(--background-1)" strokeWidth={2} />
                ) : (
                  <circle cx={sx(p.x)} cy={sy(p.y)} r={5} fill="var(--background-1)" stroke="var(--viz-1)" strokeWidth={2} />
                )}
                <text x={sx(p.x) + 11} y={ly} fontSize={11} fill="var(--foreground)" stroke="var(--background-1)" strokeWidth={3} paintOrder="stroke">
                  {p.pareto ? "⭐ " : ""}
                  {short(p.label, 20)}
                </text>
              </g>
            );
          });
        })()}
      </svg>
    </figure>
  );
}

/** Position the tooltip relative to the chart container (`.bench-viz`). */
function hover(e: React.MouseEvent<SVGGElement>, lines: string[], onTip: (t: Tip | null) => void) {
  const host = (e.currentTarget.closest(".bench-viz") as HTMLElement | null)?.getBoundingClientRect();
  if (!host) return;
  onTip({ x: e.clientX - host.left, y: e.clientY - host.top, lines });
}
