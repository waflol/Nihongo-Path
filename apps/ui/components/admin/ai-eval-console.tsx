"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorChart, EVAL_VIZ_CSS, HeatmapChart, seriesColor, TaskBarsChart } from "@/components/admin/eval-charts";
import { LevelLineChart, SpeedScatterChart } from "@/components/admin/eval-mui-charts";

/**
 * Admin console of the Japanese AI evaluation benchmark (`/api/flashcards/admin/ai/eval`):
 * datasets, new runs, run history, reports with human review, run comparison and prices.
 */

const API = "/api/flashcards/admin/ai/eval";
const SERVICES = "/api/flashcards/admin/ai/services";

const btn =
  "inline-flex h-8 items-center justify-center whitespace-nowrap rounded-lg border border-[var(--border)] px-3 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)] disabled:opacity-50";
const btnPrimary =
  "inline-flex h-9 items-center justify-center whitespace-nowrap rounded-lg bg-[var(--primary,#2563eb)] px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50";
const field = "h-8 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 text-xs text-[var(--foreground)]";
const card = "rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-5";
const th = "px-2 py-1.5 text-left text-xs font-medium text-[var(--muted-foreground)]";
const td = "px-2 py-1.5 align-top";
const muted = "text-[var(--muted-foreground)]";

type Task = "translation" | "sentence_generation" | "vocabulary_check" | "grammar_analysis";
type Level = "N5" | "N4" | "N3" | "N2" | "N1";
const TASKS: Task[] = ["translation", "sentence_generation", "vocabulary_check", "grammar_analysis"];
const LEVELS: Level[] = ["N5", "N4", "N3", "N2", "N1"];
const SPLITS = ["dev", "val", "test"] as const;
const TASK_LABEL: Record<Task, string> = {
  translation: "Dịch",
  sentence_generation: "Đặt câu",
  vocabulary_check: "Từ vựng",
  grammar_analysis: "Ngữ pháp",
};
const SPLIT_LABEL: Record<string, string> = { dev: "Dev (60%) — thử prompt", val: "Val (20%) — chọn ngưỡng", test: "Test (20%) — chốt kết quả" };
const STATUS_LABEL: Record<string, string> = {
  queued: "Đang chờ",
  running: "Đang chạy",
  completed: "Hoàn tất",
  failed: "Lỗi",
  cancelled: "Đã huỷ",
  interrupted: "Bị gián đoạn",
};
const TAG_LABEL: Record<string, string> = {
  empty: "Không trả lời",
  parse_error: "Không đọc được JSON",
  call_error: "Lỗi gọi API",
  wrong_language: "Sai ngôn ngữ",
  meaning_error: "Sai nghĩa",
  omission: "Thiếu ý",
  addition: "Thêm ý",
  grammar_error: "Sai ngữ pháp",
  unnatural: "Không tự nhiên",
  register_mismatch: "Sai văn phong",
  pattern_missing: "Thiếu / sai mẫu",
  pattern_misused: "Dùng sai mẫu",
  copied_reference: "Chép câu mẫu",
  instruction_ignored: "Không theo yêu cầu",
  level_mismatch: "Sai trình độ",
  too_long: "Quá dài",
  wrong_reading: "Sai cách đọc",
  wrong_meaning: "Sai nghĩa từ",
  wrong_pos: "Sai từ loại",
  missing_nuance: "Thiếu sắc thái",
  wrong_formation: "Sai cách kết hợp",
  wrong_translation: "Dịch sai",
  breakdown_error: "Phân tích câu sai",
  no_confusion_note: "Không phân biệt mẫu dễ nhầm",
  hallucinated_rule: "Bịa quy tắc",
};

interface Service {
  id: string;
  label: string;
  provider: string;
  providerName: string;
  model: string;
  enabled: boolean;
  translationOnly?: boolean;
}
interface Dataset {
  key: string;
  name: string;
  version: string;
  checksum: string;
  status: string;
  qualityNotice: string;
  caseCount: number;
  duplicateCount?: number;
  source: string;
  importedAt: string;
}
interface Ref {
  serviceId: string;
  label: string;
  provider: string;
  model: string;
  modelOverride?: boolean;
}
interface Run {
  id: string;
  label: string;
  datasetKey: string;
  status: string;
  caseCount: number;
  progress: Progress;
  events?: RunEvent[];
  candidates: Ref[];
  judges: Ref[];
  promptVersion: string;
  judgePromptVersion: string;
  temperature: number;
  batchSize: number;
  repeats: number;
  updateRanking: boolean;
  filter: { tasks?: Task[]; levels?: Level[]; splits?: string[]; perTaskLevel?: number; dedupe?: boolean };
  candidateErrors?: Record<string, string>;
  summary?: { candidates: { label: string; model: string; overall: number | null; errorRate: number; latencyMedian: number | null; cost: number | null }[] };
  error?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}
interface Counts {
  total: number;
  done: number;
  errors: number;
  scored?: number;
  scoreSum?: number;
  needsReview?: number;
}
interface Progress extends Counts {
  byCandidate?: Record<string, Counts>;
  byTask?: Record<string, Counts>;
  calls?: { candidate: number; judge: number; failed: number };
  current?: {
    candidate: number;
    task: Task;
    repeat: number;
    batchNo: number;
    batches: number;
    caseIds: string[];
    phase: "calling" | "judging" | "waiting" | "retrying";
    who: string;
    since: string;
    waitUntil?: string;
  } | null;
  sessionStartedAt?: string;
  sessionStartDone?: number;
  updatedAt?: string;
}
interface RunEvent {
  at: string;
  level: "info" | "warn" | "error";
  text: string;
}
interface Stat {
  mean: number | null;
  n: number;
  passRate: number | null;
}
interface CandReport {
  index: number;
  label: string;
  provider: string;
  model: string;
  modelVersion?: string;
  modelOverride?: boolean;
  stopped?: string;
  expected: number;
  scored: number;
  errors: number;
  judgeFailed: number;
  missing: number;
  errorRate: number;
  parseErrorRate: number;
  overall: Stat & { stdev: number | null };
  byTask: Partial<Record<Task, Stat>>;
  byLevel: Partial<Record<Level, Stat>>;
  byTaskLevel: Partial<Record<Task, Partial<Record<Level, Stat>>>>;
  /** Mean score per knowledge point (grammar pattern / translation skill), lowest first. */
  byFocus?: { focus: string; mean: number; n: number; passRate: number }[];
  latency: { calls: number; mean: number; median: number; p95: number; perItem: number } | null;
  tokens: { input: number; output: number; estimated: boolean; judgeInput: number; judgeOutput: number };
  cost: { candidate: number | null; judge: number | null; total: number | null; perCase: number | null };
  consistency: { repeats: number; meanStdev: number; stableShare: number; outputAgreement: number; passAllShare: number } | null;
  topErrors: { tag: string; count: number; share: number; examples: string[] }[];
  needsReview: number;
  reviewed: number;
}
interface Report {
  runId: string;
  label: string;
  datasetKey: string;
  status: string;
  promptVersion: string;
  judgePromptVersion: string;
  temperature: number;
  batchSize: number;
  repeats: number;
  passThreshold: number;
  judges: { label: string; model: string }[];
  caseCount: number;
  candidates: CandReport[];
}
interface ResultRow {
  id: string;
  candidate: number;
  caseId: string;
  task: Task;
  level: Level;
  repeat: number;
  status: string;
  total: number | null;
  humanTotal?: number | null;
  reviewed?: boolean;
  errorTags: string[];
  needsReview: boolean;
  reviewReason?: string;
  outputText?: string;
  error?: string;
}
interface Verdict {
  judge: string;
  scores: Record<string, number>;
  errorTags: string[];
  confidence: number;
  note: string;
  error?: string;
}
interface ResultDetail extends ResultRow {
  case: Record<string, unknown> | null;
  parsed?: Record<string, unknown> | null;
  deterministic?: { checks: Record<string, unknown>; points: Record<string, number>; caps?: Record<string, number>; flags: string[]; fatal?: boolean };
  verdicts?: Verdict[];
  parts?: Record<string, number>;
  call?: { raw?: string; ms?: number; modelVersion?: string; ok?: boolean; error?: string } | null;
  reviews: { reviewer: string; verdict: string; previousTotal: number | null; correctedTotal: number | null; notes: string; createdAt: string }[];
}

async function api<T>(path: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string; problems?: string[] }> {
  try {
    const res = await fetch(path, { ...init, headers: { ...(init?.body && typeof init.body === "string" && !init.headers ? { "Content-Type": "application/json" } : {}), ...(init?.headers ?? {}) } });
    if (res.status === 204) return { ok: true, data: undefined as T };
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const m = body?.message;
      const msg = typeof m === "string" ? m : Array.isArray(m) ? m.join("; ") : m?.message ?? `Lỗi ${res.status}`;
      const problems = body?.problems ?? m?.problems;
      return { ok: false, error: msg, problems };
    }
    return { ok: true, data: body as T };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

const fmt = (n: number | null | undefined, d = 1) => (n === null || n === undefined ? "—" : n.toFixed(d));
const usd = (n: number | null | undefined) => (n === null || n === undefined ? "chưa có giá" : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
const secs = (ms: number | null | undefined) => (ms === null || ms === undefined ? "—" : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`);
const when = (s?: string) => (s ? new Date(s).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "—");

/** A 0–100 score with a thin bar; red / amber / green by value. */
function Score({ v, pass = 70 }: { v: number | null | undefined; pass?: number }) {
  if (v === null || v === undefined) return <span className={muted}>—</span>;
  const color = v >= pass ? "#16a34a" : v >= pass - 20 ? "#d97706" : "#dc2626";
  return (
    <span className="inline-flex min-w-[4.5rem] flex-col gap-0.5">
      <span className="tabular-nums font-medium text-[var(--foreground)]">{v.toFixed(1)}</span>
      <span className="h-1 w-full rounded bg-[var(--border)]" aria-hidden>
        <span className="block h-1 rounded" style={{ width: `${Math.max(0, Math.min(100, v))}%`, background: color }} />
      </span>
    </span>
  );
}

function Msg({ m }: { m: { ok: boolean; text: string; problems?: string[] } | null }) {
  if (!m) return null;
  return (
    <div role="status" className={"mt-3 text-xs " + (m.ok ? "text-[#15803d] dark:text-[#86efac]" : "text-[#b91c1c] dark:text-[#fca5a5]")}>
      {m.text}
      {m.problems?.length ? (
        <ul className="mt-1 list-disc pl-5">
          {m.problems.slice(0, 20).map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Checks<T extends string>({ all, value, onChange, label }: { all: readonly T[]; value: T[]; onChange: (v: T[]) => void; label: (t: T) => string }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {all.map((t) => (
        <label key={t} className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={value.includes(t)} onChange={(e) => onChange(e.target.checked ? [...value, t] : value.filter((x) => x !== t))} />
          {label(t)}
        </label>
      ))}
    </div>
  );
}

type Tab = "new" | "runs" | "report" | "compare" | "datasets" | "prices";

export function AiEvalConsole() {
  const [tab, setTab] = useState<Tab>("runs");
  const [services, setServices] = useState<Service[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [reportId, setReportId] = useState<string | null>(null);

  const loadDatasets = useCallback(async () => {
    const r = await api<Dataset[]>(`${API}/datasets`);
    if (r.ok) setDatasets(r.data);
  }, []);
  const loadRuns = useCallback(async () => {
    const r = await api<Run[]>(`${API}/runs`);
    if (r.ok) setRuns(r.data);
  }, []);
  useEffect(() => {
    void (async () => {
      const r = await api<Service[]>(SERVICES);
      if (r.ok) setServices(r.data);
      await Promise.all([loadDatasets(), loadRuns()]);
    })();
  }, [loadDatasets, loadRuns]);

  // Poll while something is queued / running.
  const live = runs.some((r) => r.status === "queued" || r.status === "running");
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => void loadRuns(), 3000);
    return () => clearInterval(t);
  }, [live, loadRuns]);

  const openReport = (id: string) => {
    setReportId(id);
    setTab("report");
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "runs", label: "Lịch sử chạy" },
    { key: "new", label: "Chạy mới" },
    { key: "report", label: "Báo cáo" },
    { key: "compare", label: "So sánh 2 lần chạy" },
    { key: "datasets", label: "Bộ dữ liệu" },
    { key: "prices", label: "Giá token" },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">Đánh giá AI (benchmark)</h1>
      <p className={`mt-1 max-w-3xl text-sm ${muted}`}>
        Chấm các dịch vụ AI trên cùng bộ câu JLPT N5–N1 cho 4 việc: dịch, đặt câu, kiểm tra từ vựng, phân tích ngữ pháp. Mỗi câu trả lời được kiểm tra bằng code và do 2 AI
        chấm (khác model với bài làm) cho điểm theo thang 100; đáp án tham chiếu chỉ là một đáp án đúng, không phải duy nhất. Kết quả lưu riêng, không đụng dữ liệu học của người
        dùng, và dùng để xếp thứ tự ưu tiên dịch vụ.
      </p>
      <div role="tablist" aria-label="Mục" className="mt-5 flex flex-wrap gap-1 border-b border-[var(--border)]">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={
              "-mb-px border-b-2 px-3 py-2 text-sm " +
              (tab === t.key ? "border-[var(--foreground)] font-medium text-[var(--foreground)]" : `border-transparent ${muted} hover:text-[var(--foreground)]`)
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {tab === "runs" && <RunsTab runs={runs} reload={loadRuns} openReport={openReport} onNew={() => setTab("new")} />}
        {tab === "new" && (
          <NewRunTab
            services={services}
            datasets={datasets}
            onCreated={async () => {
              await loadRuns();
              setTab("runs");
            }}
            onNeedDataset={() => setTab("datasets")}
          />
        )}
        {tab === "report" &&
          (reportId ? (
            <ReportTab key={reportId} runId={reportId} run={runs.find((r) => r.id === reportId)} reloadRuns={loadRuns} />
          ) : (
            <p className={`text-sm ${muted}`}>Chọn một lần chạy trong “Lịch sử chạy” để xem báo cáo.</p>
          ))}
        {tab === "compare" && <CompareTab runs={runs.filter((r) => r.status === "completed")} />}
        {tab === "datasets" && <DatasetsTab datasets={datasets} reload={loadDatasets} />}
        {tab === "prices" && <PricesTab services={services} />}
      </div>
    </div>
  );
}

// ── Runs ─────────────────────────────────────────────────────────────────

function RunsTab({ runs, reload, openReport, onNew }: { runs: Run[]; reload: () => Promise<void>; openReport: (id: string) => void; onNew: () => void }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [openProgress, setOpenProgress] = useState<string | null>(null);
  const active = runs.find((r) => r.status === "running");
  // Oldest first: position 1 starts next.
  const queue = runs.filter((r) => r.status === "queued").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  async function act(id: string, what: "cancel" | "resume" | "apply-ranking" | "delete") {
    if (what === "delete" && !confirm("Xoá lần chạy này cùng toàn bộ kết quả và lịch sử duyệt của nó?")) return;
    const r = what === "delete" ? await api(`${API}/runs/${id}`, { method: "DELETE" }) : await api<{ updated?: unknown[] }>(`${API}/runs/${id}/${what}`, { method: "POST" });
    setMsg(
      r.ok
        ? {
            ok: true,
            text:
              what === "apply-ranking"
                ? `Đã dùng điểm của lần chạy này để xếp lại thứ tự dịch vụ (${((r.data as { updated?: unknown[] })?.updated ?? []).length} điểm được cập nhật).`
                : "Đã cập nhật.",
          }
        : { ok: false, text: r.error },
    );
    await reload();
  }
  const [filterBy, setFilterBy] = useState<RunFilter>("all");
  const [q, setQ] = useState("");

  if (runs.length === 0) {
    return (
      <div className={`${card} flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between`}>
        <div>
          <p className="text-sm font-medium">Chưa có lần chạy nào</p>
          <p className={`mt-1 text-xs ${muted}`}>Chọn dịch vụ cần chấm và 2 AI chấm, kết quả sẽ hiện ở đây.</p>
        </div>
        <button type="button" className={btnPrimary} onClick={onNew}>
          Tạo lần chạy đầu tiên
        </button>
      </div>
    );
  }

  const needle = q.trim().toLowerCase();
  const shown = runs.filter(
    (r) =>
      RUN_FILTERS[filterBy].match(r.status) &&
      (!needle || [r.label, r.datasetKey, ...r.candidates.flatMap((c) => [c.label, c.model])].some((t) => t.toLowerCase().includes(needle))),
  );
  const groups: { day: string; runs: Run[] }[] = [];
  for (const r of shown) {
    const day = dayLabel(r.createdAt);
    const g = groups.at(-1);
    if (g && g.day === day) g.runs.push(r);
    else groups.push({ day, runs: [r] });
  }

  return (
    <div className="flex flex-col gap-5">
      {active && <RunProgressPanel runId={active.id} onDone={reload} />}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="group" aria-label="Lọc theo trạng thái" className="inline-flex flex-wrap gap-1 rounded-xl border border-[var(--border)] bg-[var(--background-1)] p-1">
          {(Object.keys(RUN_FILTERS) as RunFilter[]).map((k) => {
            const n = runs.filter((r) => RUN_FILTERS[k].match(r.status)).length;
            const on = filterBy === k;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => setFilterBy(k)}
                className={
                  "rounded-lg px-3 py-1.5 text-xs " +
                  (on ? "bg-[var(--foreground)] font-medium text-[var(--background)]" : `${muted} hover:bg-[var(--layer-hover)] hover:text-[var(--foreground)]`)
                }
              >
                {RUN_FILTERS[k].label} <span className="tabular-nums opacity-70">{n}</span>
              </button>
            );
          })}
        </div>
        <input
          type="search"
          aria-label="Tìm lần chạy"
          placeholder="Tìm theo tên, dịch vụ, model…"
          className={`${field} h-9 w-full sm:w-64`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <Msg m={msg} />

      {shown.length === 0 ? (
        <p className={`rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm ${muted}`}>Không có lần chạy nào khớp bộ lọc.</p>
      ) : (
        groups.map((g) => (
          <section key={g.day} aria-label={g.day}>
            <h3 className={`mb-2 text-xs font-medium ${muted}`}>{g.day}</h3>
            <ol className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background-1)]">
              {g.runs.map((r) => (
                <RunItem
                  key={r.id}
                  run={r}
                  queuePos={r.status === "queued" ? queue.findIndex((x) => x.id === r.id) + 1 : 0}
                  progressOpen={openProgress === r.id}
                  onToggleProgress={() => setOpenProgress(openProgress === r.id ? null : r.id)}
                  onReport={() => openReport(r.id)}
                  onAct={(what) => void act(r.id, what)}
                  reload={reload}
                />
              ))}
            </ol>
          </section>
        ))
      )}
    </div>
  );
}

type RunFilter = "all" | "live" | "done" | "stopped";
const RUN_FILTERS: Record<RunFilter, { label: string; match: (s: string) => boolean }> = {
  all: { label: "Tất cả", match: () => true },
  live: { label: "Đang chạy / chờ", match: (s) => s === "running" || s === "queued" },
  done: { label: "Hoàn tất", match: (s) => s === "completed" },
  stopped: { label: "Dừng / lỗi", match: (s) => s === "failed" || s === "cancelled" || s === "interrupted" },
};

/** "Hôm nay", "Hôm qua" or the date. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(new Date()) - start(d)) / 86_400_000);
  if (diff === 0) return "Hôm nay";
  if (diff === 1) return "Hôm qua";
  return d.toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "numeric", year: "numeric" });
}

/** "5 phút trước", "2 giờ trước", or the time. */
function ago(iso?: string): string {
  if (!iso) return "";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "vừa xong";
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86_400) return `${Math.floor(s / 3600)} giờ trước`;
  return new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

const STATUS_TONE: Record<string, { color: string; text: string }> = {
  running: { color: "#2a78d6", text: "text-[#1d5fb0] dark:text-[#7cb3f0]" },
  queued: { color: "var(--muted-foreground)", text: muted },
  completed: { color: "#16a34a", text: "text-[#15803d] dark:text-[#86efac]" },
  failed: { color: "#dc2626", text: "text-[#b91c1c] dark:text-[#fca5a5]" },
  cancelled: { color: "#d97706", text: "text-[#b45309] dark:text-[#fcd34d]" },
  interrupted: { color: "#d97706", text: "text-[#b45309] dark:text-[#fcd34d]" },
};

/** Status mark: a progress ring while a run is unfinished, a filled mark once it ended. */
function StatusRing({ status, pct }: { status: string; pct: number }) {
  const tone = STATUS_TONE[status] ?? STATUS_TONE.queued;
  const r = 13;
  const c = 2 * Math.PI * r;
  const ended = status === "completed" || status === "failed";
  return (
    <svg viewBox="0 0 32 32" className="size-8 shrink-0" role="img" aria-label={`${STATUS_LABEL[status] ?? status}${ended ? "" : `, ${Math.round(pct)}%`}`}>
      <circle cx="16" cy="16" r={r} fill={ended ? tone.color : "none"} stroke={ended ? tone.color : "var(--border)"} strokeWidth="3" />
      {!ended && (
        <circle
          cx="16"
          cy="16"
          r={r}
          fill="none"
          stroke={tone.color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${(c * pct) / 100} ${c}`}
          transform="rotate(-90 16 16)"
          className="transition-[stroke-dasharray] duration-700"
        />
      )}
      {status === "completed" && <path d="M10.5 16.5l3.5 3.5 7.5-8" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
      {status === "failed" && <path d="M12 12l8 8M20 12l-8 8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />}
      {(status === "cancelled" || status === "interrupted") && <path d="M13.5 12v8M18.5 12v8" stroke={tone.color} strokeWidth="2.5" strokeLinecap="round" />}
    </svg>
  );
}

/** Small "more actions" menu; closes when focus leaves it or on Escape. */
function MoreMenu({ items }: { items: { label: string; hint?: string; danger?: boolean; onClick: () => void }[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <button type="button" className={`${btn} min-w-0 px-2`} aria-haspopup="menu" aria-expanded={open} aria-label="Thao tác khác" onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 20 20" className="size-4" aria-hidden fill="currentColor">
          <circle cx="4" cy="10" r="1.6" />
          <circle cx="10" cy="10" r="1.6" />
          <circle cx="16" cy="10" r="1.6" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-60 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)] py-1 shadow-lg">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className={"block w-full px-3 py-2 text-left text-xs hover:bg-[var(--layer-hover)] " + (it.danger ? "text-[#b91c1c] dark:text-[#fca5a5]" : "")}
            >
              {it.label}
              {it.hint && <span className={`mt-0.5 block text-[11px] ${muted}`}>{it.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** One run in the history: status, what it covered, its leaderboard (or progress), actions. */
function RunItem({
  run: r,
  queuePos,
  progressOpen,
  onToggleProgress,
  onReport,
  onAct,
  reload,
}: {
  run: Run;
  queuePos: number;
  progressOpen: boolean;
  onToggleProgress: () => void;
  onReport: () => void;
  onAct: (what: "cancel" | "resume" | "apply-ranking" | "delete") => void;
  reload: () => Promise<void>;
}) {
  const p = r.progress ?? { total: 0, done: 0, errors: 0 };
  const pct = p.total ? (100 * p.done) / p.total : 0;
  const tone = STATUS_TONE[r.status] ?? STATUS_TONE.queued;
  const live = r.status === "running" || r.status === "queued";
  const scored = r.summary?.candidates?.length
    ? r.candidates
        .map((c, i) => ({ c, i, s: r.summary!.candidates[i] }))
        .sort((a, b) => (b.s?.overall ?? -1) - (a.s?.overall ?? -1))
    : null;
  const tasks = r.filter?.tasks?.length && r.filter.tasks.length < TASKS.length ? r.filter.tasks.map((t) => TASK_LABEL[t]).join(", ") : "4 việc";
  const lv = r.filter?.levels?.length && r.filter.levels.length < LEVELS.length ? LEVELS.filter((l) => r.filter.levels!.includes(l)).join(", ") : "N5–N1";
  const chips = [`${r.caseCount} câu${r.repeats > 1 ? ` × ${r.repeats} lần` : ""}`, tasks, lv, ...(r.filter?.splits?.length ? [r.filter.splits.join("+")] : [])];
  const statusText =
    r.status === "queued"
      ? `Đang chờ${queuePos ? `, thứ ${queuePos} trong hàng` : ""}`
      : r.status === "running"
        ? `Đang chạy ${Math.floor(pct)}%`
        : r.status === "completed"
          ? `Hoàn tất ${ago(r.finishedAt)}`
          : `${STATUS_LABEL[r.status] ?? r.status}${r.finishedAt ? ` ${ago(r.finishedAt)}` : ""}`;
  const more = [
    ...(r.status === "completed"
      ? [{ label: "Dùng điểm này để xếp hạng dịch vụ", hint: "Ghi điểm từng việc vào dịch vụ và sắp lại thứ tự ưu tiên", onClick: () => onAct("apply-ranking") }]
      : []),
    ...(["interrupted", "cancelled", "failed"].includes(r.status) ? [{ label: "Chạy tiếp phần còn thiếu", onClick: () => onAct("resume") }] : []),
    ...(live ? [{ label: "Huỷ lần chạy", hint: "Kết quả đã chấm vẫn được giữ", danger: true, onClick: () => onAct("cancel") }] : []),
    ...(!live ? [{ label: "Xoá lần chạy", hint: "Xoá cả kết quả và lịch sử duyệt", danger: true, onClick: () => onAct("delete") }] : []),
  ];

  return (
    <li className="border-b border-[var(--border)] last:border-0">
      <div className="grid gap-4 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start">
        <div className="hidden sm:block">
          <StatusRing status={r.status} pct={pct} />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2 sm:block">
            <span className="sm:hidden">
              <StatusRing status={r.status} pct={pct} />
            </span>
            <div className="min-w-0">
              <button type="button" onClick={onReport} className="block max-w-full truncate text-left text-sm font-semibold text-[var(--foreground)] hover:underline">
                {r.label}
              </button>
              <p className={`text-xs ${tone.text}`}>
                {statusText}
                <span className={muted}> · bắt đầu {ago(r.createdAt)}</span>
              </p>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span key={c} className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--muted-foreground)]">
                {c}
              </span>
            ))}
          </div>

          {live || !scored ? (
            <div className="mt-3 max-w-xl">
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
                <div className="h-1.5 rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, background: tone.color }} />
              </div>
              <p className={`mt-1 text-[11px] tabular-nums ${muted}`}>
                {p.done}/{p.total} kết quả{p.errors ? `, ${p.errors} lỗi` : ""} · {r.candidates.map((c) => c.label).join(", ")}
              </p>
            </div>
          ) : (
            <ol className="mt-3 flex max-w-xl flex-col gap-1.5" aria-label="Điểm tổng theo dịch vụ">
              {scored.map(({ c, i, s }, rank) => {
                const v = s?.overall ?? null;
                const stopped = r.candidateErrors?.[String(i)];
                const color = v === null ? "var(--border)" : v >= 70 ? "#16a34a" : v >= 50 ? "#d97706" : "#dc2626";
                return (
                  <li key={i} className="grid grid-cols-[1.25rem_minmax(0,9rem)_minmax(0,1fr)_3rem] items-center gap-2 text-xs sm:grid-cols-[1.25rem_minmax(0,12rem)_minmax(0,1fr)_3rem]">
                    <span className={`tabular-nums ${rank === 0 && v !== null ? "font-semibold text-[var(--foreground)]" : muted}`}>{rank + 1}</span>
                    <span className="min-w-0 truncate" title={`${c.label} · ${c.model}`}>
                      <span className={rank === 0 && v !== null ? "font-medium" : ""}>{c.label}</span> <span className={muted}>{c.model}</span>
                    </span>
                    <span className="h-2 overflow-hidden rounded-full bg-[var(--border)]" aria-hidden>
                      <span className="block h-2 rounded-full" style={{ width: `${Math.max(0, Math.min(100, v ?? 0))}%`, background: color }} />
                    </span>
                    <span className="text-right tabular-nums font-semibold">
                      {stopped ? <span className="font-normal text-[#b91c1c] dark:text-[#fca5a5]" title={stopped}>dừng</span> : fmt(v)}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          {r.error && <p className="mt-2 text-xs text-[#b91c1c] dark:text-[#fca5a5]">{r.error}</p>}

          <details className="group mt-2 text-[11px]">
            <summary className={`cursor-pointer select-none ${muted} hover:text-[var(--foreground)]`}>Cấu hình</summary>
            <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              <dt className={muted}>Bộ dữ liệu</dt>
              <dd>{r.datasetKey}</dd>
              <dt className={muted}>Prompt</dt>
              <dd>
                {r.promptVersion}, AI chấm {r.judgePromptVersion}
              </dd>
              <dt className={muted}>Gửi mỗi lần</dt>
              <dd>{r.batchSize} câu, nhiệt độ {r.temperature}</dd>
              <dt className={muted}>AI chấm</dt>
              <dd>{r.judges.map((j) => `${j.label} (${j.model})`).join(" và ")}</dd>
              <dt className={muted}>Xếp hạng dịch vụ</dt>
              <dd>{r.updateRanking ? "tự cập nhật khi xong" : "không cập nhật"}</dd>
            </dl>
          </details>
        </div>

        <div className="flex items-center gap-1.5 sm:justify-end">
          {live ? (
            <button type="button" className={btn} aria-expanded={progressOpen} onClick={onToggleProgress}>
              {progressOpen ? "Ẩn tiến trình" : "Theo dõi"}
            </button>
          ) : (
            <button type="button" className={btn} onClick={onReport}>
              Xem báo cáo
            </button>
          )}
          {!live && (
            <button type="button" className={`${btn} min-w-0`} aria-expanded={progressOpen} onClick={onToggleProgress}>
              {progressOpen ? "Ẩn nhật ký" : "Nhật ký"}
            </button>
          )}
          <MoreMenu items={more} />
        </div>
      </div>
      {progressOpen && (
        <div className="border-t border-[var(--border)] bg-[var(--layer)] p-4">
          <RunProgressPanel runId={r.id} embedded onDone={reload} />
        </div>
      )}
    </li>
  );
}

const PHASE_LABEL: Record<NonNullable<Progress["current"]>["phase"], string> = {
  calling: "Đang gọi",
  judging: "Đang chấm bởi",
  waiting: "Chờ hạn mức của",
  retrying: "Thử lại",
};

function dur(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}ph ${s % 60}s`;
  return `${Math.floor(m / 60)}g ${m % 60}ph`;
}

/** Same as the server's `speedAndEta`: results per minute and time left, from the current session only. */
function speedAndEta(p: Progress, now: number): { perMinute: number | null; etaMs: number | null } {
  if (!p.sessionStartedAt) return { perMinute: null, etaMs: null };
  const elapsed = now - new Date(p.sessionStartedAt).getTime();
  const doneNow = p.done - (p.sessionStartDone ?? 0);
  if (elapsed < 5_000 || doneNow <= 0) return { perMinute: null, etaMs: null };
  const perMs = doneNow / elapsed;
  return { perMinute: Math.round(perMs * 60_000 * 10) / 10, etaMs: Math.round(Math.max(0, p.total - p.done) / perMs) };
}

function Bar({ done, total, errors = 0 }: { done: number; total: number; errors?: number }) {
  const ok = total ? (100 * Math.max(0, done - errors)) / total : 0;
  const bad = total ? (100 * errors) / total : 0;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded bg-[var(--border)]" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
      <div className="h-2 bg-[#2a78d6] transition-[width] duration-500" style={{ width: `${ok}%` }} />
      <div className="h-2 bg-[#dc2626] transition-[width] duration-500" style={{ width: `${bad}%` }} />
    </div>
  );
}

/**
 * Live view of one run: overall / per-service / per-task progress, the step in progress
 * (with a countdown while waiting for a rate limit), speed, time left and the activity log.
 * Polls every 2 s while the run is queued or running.
 */
function RunProgressPanel({ runId, embedded = false, onDone }: { runId: string; embedded?: boolean; onDone?: () => Promise<void> | void }) {
  const [run, setRun] = useState<Run | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [err, setErr] = useState<string | null>(null);
  const prevStatus = useRef<string | null>(null);
  // Latest callback without restarting the polling when the parent passes a new function.
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });
  const live = !run || run.status === "running" || run.status === "queued";

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const r = await api<Run>(`${API}/runs/${runId}`);
      if (!alive) return;
      if (r.ok) {
        setRun(r.data);
        setErr(null);
        const was = prevStatus.current;
        prevStatus.current = r.data.status;
        if (was && was !== r.data.status) void doneRef.current?.();
      } else setErr(r.error);
    };
    void load();
    if (!live) return () => void (alive = false);
    const t = setInterval(() => void load(), 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [runId, live]);

  // 1 s clock for the elapsed time and the countdown.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [live]);

  if (err) return <Msg m={{ ok: false, text: err }} />;
  if (!run) return <p className={`text-xs ${muted}`}>Đang tải tiến trình…</p>;
  const p = run.progress ?? { total: 0, done: 0, errors: 0 };
  const pct = p.total ? (100 * p.done) / p.total : 0;
  const { perMinute, etaMs } = speedAndEta(p, now);
  const cur = p.current;
  const stale = run.status === "running" && p.updatedAt && now - new Date(p.updatedAt).getTime() > 90_000;
  const mean = (c?: Counts) => (c?.scored ? (c.scoreSum ?? 0) / c.scored : null);
  const started = p.sessionStartedAt ?? run.startedAt;
  const events = [...(run.events ?? [])].reverse();
  const eventColor: Record<RunEvent["level"], string> = { info: "", warn: "text-[#b45309] dark:text-[#fcd34d]", error: "text-[#b91c1c] dark:text-[#fca5a5]" };

  return (
    <section className={embedded ? "" : card} aria-live="polite" aria-label={`Tiến trình ${run.label}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {embedded ? "Tiến trình" : `Đang chạy: ${run.label}`} <span className={`font-normal ${muted}`}>· {STATUS_LABEL[run.status] ?? run.status}</span>
        </h2>
        <div className={`text-xs tabular-nums ${muted}`}>
          {started && live ? `đã chạy ${dur(now - new Date(started).getTime())} · ` : ""}
          {perMinute !== null ? `${perMinute} kết quả/phút · ` : ""}
          {live && etaMs !== null ? `còn khoảng ${dur(etaMs)}` : live ? "đang ước tính thời gian còn lại…" : run.finishedAt ? `xong lúc ${when(run.finishedAt)}` : ""}
        </div>
      </div>

      <div className="mt-3">
        <Bar done={p.done} total={p.total} errors={p.errors} />
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
          <span>
            <b>{p.done}</b>/{p.total} kết quả ({pct.toFixed(pct < 10 ? 1 : 0)}%)
          </span>
          {p.errors > 0 && <span className="text-[#b91c1c] dark:text-[#fca5a5]">{p.errors} lỗi</span>}
          {mean(p) !== null && <span>điểm TB tạm tính {fmt(mean(p))}</span>}
          {(p.needsReview ?? 0) > 0 && <span className="text-[#b45309] dark:text-[#fcd34d]">{p.needsReview} cần duyệt</span>}
          {p.calls && (
            <span className={muted}>
              {p.calls.candidate} lượt gọi dịch vụ · {p.calls.judge} lượt AI chấm{p.calls.failed ? ` · ${p.calls.failed} lượt lỗi` : ""}
            </span>
          )}
        </div>
      </div>

      {run.status === "running" && (
        <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-xs">
          {cur ? (
            <>
              <div>
                <span className={cur.phase === "waiting" || cur.phase === "retrying" ? "font-medium text-[#b45309] dark:text-[#fcd34d]" : "font-medium"}>
                  {PHASE_LABEL[cur.phase]} {cur.who}
                </span>
                {cur.waitUntil ? (
                  <span className="tabular-nums"> — thử lại sau {dur(new Date(cur.waitUntil).getTime() - now)}</span>
                ) : (
                  <span className={`tabular-nums ${muted}`}> · {dur(now - new Date(cur.since).getTime())}</span>
                )}
              </div>
              <div className={`mt-1 ${muted}`}>
                {run.candidates[cur.candidate]?.label} · {TASK_LABEL[cur.task]}
                {run.repeats > 1 ? ` · lần ${cur.repeat}/${run.repeats}` : ""} · lô {cur.batchNo}/{cur.batches} · {cur.caseIds.length} câu: {cur.caseIds.slice(0, 6).join(", ")}
                {cur.caseIds.length > 6 ? "…" : ""}
              </div>
            </>
          ) : (
            <span className={muted}>Đang chuẩn bị lô tiếp theo…</span>
          )}
          {stale && <div className="mt-1 text-[#b45309] dark:text-[#fcd34d]">Hơn 90 giây chưa có cập nhật — dịch vụ có thể đang phản hồi chậm.</div>}
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <div className={`mb-1.5 text-xs font-medium ${muted}`}>Theo dịch vụ</div>
          <div className="flex flex-col gap-2">
            {run.candidates.map((c, i) => {
              const k = p.byCandidate?.[String(i)];
              const stopped = run.candidateErrors?.[String(i)];
              const isCur = run.status === "running" && cur?.candidate === i;
              return (
                <div key={i} className="text-xs">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className={isCur ? "font-medium" : ""}>
                      {isCur ? "▶ " : ""}
                      {c.label} <span className={muted}>({c.model})</span>
                    </span>
                    <span className="tabular-nums">
                      {k ? `${k.done}/${k.total}` : "—"}
                      {k?.errors ? <span className="text-[#b91c1c] dark:text-[#fca5a5]"> · {k.errors} lỗi</span> : null}
                      {mean(k) !== null ? <span className={muted}> · TB {fmt(mean(k))}</span> : null}
                    </span>
                  </div>
                  {k && <Bar done={k.done} total={k.total} errors={k.errors} />}
                  {stopped && <div className="text-[#b91c1c] dark:text-[#fca5a5]">Dừng: {stopped}</div>}
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <div className={`mb-1.5 text-xs font-medium ${muted}`}>Theo việc</div>
          <div className="flex flex-col gap-2">
            {TASKS.filter((t) => p.byTask?.[t]).map((t) => {
              const k = p.byTask![t];
              return (
                <div key={t} className="text-xs">
                  <div className="flex justify-between gap-2">
                    <span className={run.status === "running" && cur?.task === t ? "font-medium" : ""}>{TASK_LABEL[t]}</span>
                    <span className="tabular-nums">
                      {k.done}/{k.total}
                      {mean(k) !== null ? <span className={muted}> · TB {fmt(mean(k))}</span> : null}
                    </span>
                  </div>
                  <Bar done={k.done} total={k.total} errors={k.errors} />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className={`mb-1.5 text-xs font-medium ${muted}`}>Nhật ký (mới nhất ở trên)</div>
        {events.length === 0 ? (
          <p className={`text-xs ${muted}`}>Chưa có sự kiện.</p>
        ) : (
          <ol className="max-h-64 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--background)] p-2 font-mono text-[11px] leading-relaxed">
            {events.map((e, i) => (
              <li key={`${e.at}-${i}`} className={eventColor[e.level]}>
                <span className={muted}>{new Date(e.at).toLocaleTimeString("vi-VN")}</span> {e.text}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

// ── New run ──────────────────────────────────────────────────────────────

interface Pick {
  serviceId: string;
  model: string;
}

interface PreviewData {
  cases: number;
  byTask: Record<string, number>;
  candidateCalls: number;
  judgeCalls: number;
  results: number;
}

/** One automatic setting: the value that will be sent, the suggestion, why, and a note when a typed value was adjusted. */
interface Suggested<T> {
  value: T;
  suggestion: T;
  why: string;
  /** The typed value was out of range / larger than useful and was changed. */
  adjusted?: string;
  auto: boolean;
}

const LIMIT = { batch: 25, judge: 10, temp: 1.5, cap: 1000 };
/** Below this many cases per service a run is small enough to need no cap (prompt iteration). */
const QUICK_RUN_CASES = 200;
/** Preferred batch sizes: model calls stay short enough that few items get dropped. */
const BATCH_TARGET = 8;
const JUDGE_TARGET = 5;

/** Even batches of at most `target`: 15 items → 2 × 8, 3 → 3. */
const evenBatch = (n: number, target: number) => (n <= 0 ? target : Math.ceil(n / Math.ceil(n / target)));

/**
 * Suggested run settings from the selection, and what is actually sent:
 * a typed value wins but is clamped to the server's limits and to what can
 * be used (a call never mixes tasks, so a batch is at most one task's cases;
 * judges only see one batch at a time).
 */
function suggest(x: {
  uncappedCases: number | null;
  cells: number;
  finalSplit: boolean;
  maxPerTask: number | null;
  repeats: number;
  typed: { perTaskLevel: string; batchSize: string; judgeBatch: string; temperature: string };
}) {
  const int = (s: string) => (s.trim() === "" ? null : Math.round(Number(s)));
  // Cap per task × level
  const capSug =
    x.finalSplit || x.uncappedCases === null || x.uncappedCases <= QUICK_RUN_CASES ? null : Math.max(1, Math.floor(QUICK_RUN_CASES / x.cells));
  const capWhy = x.finalSplit
    ? "có phần Test — chấm chính thức nên lấy hết"
    : x.uncappedCases === null
      ? "đang tính…"
      : x.uncappedCases <= QUICK_RUN_CASES
        ? `bộ lọc chỉ có ${x.uncappedCases} câu — lấy hết`
        : `${x.uncappedCases} câu là nhiều cho một lần thử — giữ khoảng ${QUICK_RUN_CASES} câu`;
  const capTyped = int(x.typed.perTaskLevel);
  const capVal = capTyped === null ? capSug : Math.min(LIMIT.cap, Math.max(1, capTyped));
  const perTaskLevel: Suggested<number | null> = {
    value: capVal,
    suggestion: capSug,
    why: capWhy,
    auto: capTyped === null,
    adjusted: capTyped !== null && capTyped !== capVal ? `dùng ${capVal} (giới hạn 1–${LIMIT.cap})` : undefined,
  };

  // Cases per call
  const perTask = x.maxPerTask ?? 0;
  const bSug = Math.min(LIMIT.batch, evenBatch(perTask, BATCH_TARGET));
  const bTyped = int(x.typed.batchSize);
  const bClamped = bTyped === null ? bSug : Math.min(LIMIT.batch, Math.max(1, bTyped));
  const bUsed = perTask ? Math.min(bClamped, perTask) : bClamped;
  const batchSize: Suggested<number> = {
    value: bClamped,
    suggestion: bSug,
    why: perTask
      ? perTask <= BATCH_TARGET
        ? `mỗi việc có ${perTask} câu — gửi 1 lần`
        : `mỗi việc có ${perTask} câu — chia đều ${Math.ceil(perTask / bSug)} lần, ≤ ${BATCH_TARGET} câu/lần để model ít bỏ sót`
      : "đang tính…",
    auto: bTyped === null,
    adjusted:
      bTyped !== null && bUsed !== bTyped
        ? `thực tế ${bUsed} — ${bUsed < bClamped ? `mỗi việc chỉ có ${perTask} câu, một lần gọi không trộn các việc` : bTyped < 1 ? "tối thiểu 1" : `tối đa ${LIMIT.batch}`}`
        : undefined,
  };

  // Answers per judge call (judges only see one batch)
  const jSug = Math.min(LIMIT.judge, evenBatch(bUsed, JUDGE_TARGET));
  const jTyped = int(x.typed.judgeBatch);
  const jClamped = jTyped === null ? jSug : Math.min(LIMIT.judge, Math.max(1, jTyped));
  const jUsed = Math.min(jClamped, bUsed);
  const judgeBatch: Suggested<number> = {
    value: jClamped,
    suggestion: jSug,
    why: bUsed <= JUDGE_TARGET ? `lô ${bUsed} câu — chấm 1 lần` : `lô ${bUsed} câu — chia ${Math.ceil(bUsed / jSug)} lần, ≤ ${JUDGE_TARGET} bài/lần để chấm kỹ`,
    auto: jTyped === null,
    adjusted:
      jTyped !== null && jUsed !== jTyped
        ? `thực tế ${jUsed} — ${jUsed < jClamped ? `AI chấm chỉ chấm trong một lô ${bUsed} câu` : jTyped < 1 ? "tối thiểu 1" : `tối đa ${LIMIT.judge}`}`
        : undefined,
  };

  // Temperature
  const tSug = x.repeats > 1 ? 0.4 : 0.2;
  const tRaw = x.typed.temperature.trim() === "" ? null : Number(x.typed.temperature.replace(",", "."));
  const tVal = tRaw === null || !Number.isFinite(tRaw) ? tSug : Math.min(LIMIT.temp, Math.max(0, Math.round(tRaw * 100) / 100));
  const temperature: Suggested<number> = {
    value: tVal,
    suggestion: tSug,
    why: x.repeats > 1 ? "lặp nhiều lần — dùng mức của app thật (0.4) để đo độ ổn định" : "thấp để so sánh các model công bằng",
    auto: tRaw === null,
    adjusted: tRaw !== null && (!Number.isFinite(tRaw) || tRaw !== tVal) ? `dùng ${tVal} (giới hạn 0–${LIMIT.temp})` : undefined,
  };
  return { perTaskLevel, batchSize, judgeBatch, temperature };
}

/** A setting that is automatic while empty: shows the value in use and why, or the adjusted value when typed. */
function AutoField<T extends number | null>({
  label: l,
  value,
  onChange,
  s,
  show,
  decimal = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  s: Suggested<T>;
  show: (v: T) => string;
  decimal?: boolean;
}) {
  return (
    <div className="flex w-56 flex-col gap-1 text-xs">
      <label className="flex flex-col gap-1">
        <span className={muted}>{l}</span>
        <input
          className={`${field} w-28`}
          inputMode={decimal ? "decimal" : "numeric"}
          placeholder={`tự động: ${show(s.suggestion)}`}
          value={value}
          onChange={(e) => onChange(decimal ? e.target.value.replace(/[^\d.,]/g, "") : e.target.value.replace(/\D/g, ""))}
        />
      </label>
      {s.auto ? (
        <span className={`text-[11px] ${muted}`}>
          Tự động <b className="text-[var(--foreground)]">{show(s.suggestion)}</b> — {s.why}
        </span>
      ) : (
        <span className="text-[11px]">
          {s.adjusted ? <span className="text-[#b45309] dark:text-[#fcd34d]">{s.adjusted}. </span> : null}
          <span className={muted}>Gợi ý {show(s.suggestion)}. </span>
          <button type="button" className="underline" onClick={() => onChange("")}>
            Dùng tự động
          </button>
        </span>
      )}
    </div>
  );
}

/** A service picker plus an optional other model of that service. */
function ServiceSelect({ services, value, onChange, label: l }: { services: Service[]; value: Pick; onChange: (p: Pick) => void; label: string }) {
  const svc = services.find((s) => s.id === value.serviceId);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label={l} className={`${field} min-w-[14rem]`} value={value.serviceId} onChange={(e) => onChange({ serviceId: e.target.value, model: "" })}>
        <option value="">— chọn dịch vụ —</option>
        {services.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label} · {s.model}
            {s.enabled ? "" : " (đang tắt)"}
          </option>
        ))}
      </select>
      <input
        aria-label={`${l}: model khác (tuỳ chọn)`}
        className={`${field} w-56`}
        placeholder={svc ? `model khác (mặc định ${svc.model})` : "model khác (tuỳ chọn)"}
        value={value.model}
        onChange={(e) => onChange({ ...value, model: e.target.value })}
      />
    </div>
  );
}

function NewRunTab({ services, datasets, onCreated, onNeedDataset }: { services: Service[]; datasets: Dataset[]; onCreated: () => Promise<void>; onNeedDataset: () => void }) {
  const usable = services.filter((s) => !s.translationOnly);
  const [label, setLabel] = useState("");
  const [pickedKey, setDatasetKey] = useState("");
  // The newest dataset until the admin picks one.
  const datasetKey = pickedKey || datasets[0]?.key || "";
  const [tasks, setTasks] = useState<Task[]>([...TASKS]);
  const [levels, setLevels] = useState<Level[]>([...LEVELS]);
  const [splits, setSplits] = useState<string[]>(["dev"]);
  const [perTaskLevel, setPerTaskLevel] = useState("");
  const [dedupe, setDedupe] = useState(true);
  const [candidates, setCandidates] = useState<Pick[]>([]);
  const [judgeA, setJudgeA] = useState<Pick>({ serviceId: "", model: "" });
  const [judgeB, setJudgeB] = useState<Pick>({ serviceId: "", model: "" });
  const [allowSelf, setAllowSelf] = useState(false);
  // Empty = automatic: the suggestion below is used (see `suggest`).
  const [temperature, setTemperature] = useState("");
  const [batchSize, setBatchSize] = useState("");
  const [judgeBatch, setJudgeBatch] = useState("");
  const [repeats, setRepeats] = useState("1");
  const [pass, setPass] = useState("70");
  const [updateRanking, setUpdateRanking] = useState(true);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  /** The same selection without a per-cell cap: how big the run would be uncapped. */
  const [uncapped, setUncapped] = useState<PreviewData | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);


  const base = useMemo(() => ({ tasks, levels, splits, dedupe }), [tasks, levels, splits, dedupe]);
  useEffect(() => {
    if (!datasetKey) return;
    const t = setTimeout(() => {
      void api<PreviewData>(`${API}/runs/preview`, { method: "POST", body: JSON.stringify({ datasetKey, filter: base }) }).then((r) => setUncapped(r.ok ? r.data : null));
    }, 300);
    return () => clearTimeout(t);
  }, [datasetKey, base]);

  const sug = suggest({
    uncappedCases: uncapped?.cases ?? null,
    cells: Math.max(1, tasks.length * levels.length),
    finalSplit: splits.includes("test"),
    maxPerTask: preview ? Math.max(0, ...Object.values(preview.byTask)) : null,
    repeats: Number(repeats),
    typed: { perTaskLevel, batchSize, judgeBatch, temperature },
  });
  const filter = useMemo(() => ({ ...base, perTaskLevel: sug.perTaskLevel.value ?? undefined }), [base, sug.perTaskLevel.value]);
  useEffect(() => {
    if (!datasetKey) return;
    const t = setTimeout(() => {
      void api<PreviewData>(`${API}/runs/preview`, {
        method: "POST",
        body: JSON.stringify({ datasetKey, filter, candidates: Math.max(1, candidates.length), repeats: Number(repeats), batchSize: sug.batchSize.value, judgeBatchSize: sug.judgeBatch.value }),
      }).then((r) => setPreview(r.ok ? r.data : null));
    }, 300);
    return () => clearTimeout(t);
  }, [datasetKey, filter, candidates.length, repeats, sug.batchSize.value, sug.judgeBatch.value]);

  const svc = (id: string) => services.find((s) => s.id === id);
  const modelOf = (p: Pick) => p.model.trim() || svc(p.serviceId)?.model || "";
  const sameAs = (a: Pick, b: Pick) => Boolean(a.serviceId && b.serviceId) && modelOf(a).toLowerCase() === modelOf(b).toLowerCase();
  const selfClash = candidates.filter((c) => [judgeA, judgeB].some((j) => sameAs(c, j)));

  if (datasets.length === 0) {
    return (
      <div className={card}>
        <p className="text-sm">Chưa có bộ dữ liệu nào.</p>
        <button type="button" className={`${btnPrimary} mt-3`} onClick={onNeedDataset}>
          Nhập bộ dữ liệu
        </button>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await api<Run>(`${API}/runs`, {
      method: "POST",
      body: JSON.stringify({
        label,
        datasetKey,
        filter,
        candidates,
        judges: [judgeA, judgeB],
        allowSelfJudge: allowSelf,
        temperature: sug.temperature.value,
        batchSize: sug.batchSize.value,
        judgeBatchSize: sug.judgeBatch.value,
        repeats: Number(repeats),
        passThreshold: Number(pass),
        updateRanking,
      }),
    });
    setBusy(false);
    if (!r.ok) {
      setMsg({ ok: false, text: r.error });
      return;
    }
    await onCreated();
  }


  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <section className={card}>
        <h2 className="text-sm font-semibold">1. Bộ câu hỏi</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className={muted}>Tên lần chạy</span>
            <input className={field} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="vd. So sánh Gemini vs Claude — prompt v1" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className={muted}>Bộ dữ liệu</span>
            <select className={field} value={datasetKey} onChange={(e) => setDatasetKey(e.target.value)}>
              {datasets.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.key} ({d.caseCount} câu)
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <div className={`mb-1 text-xs ${muted}`}>Việc</div>
            <Checks all={TASKS} value={tasks} onChange={setTasks} label={(t) => TASK_LABEL[t]} />
          </div>
          <div>
            <div className={`mb-1 text-xs ${muted}`}>Trình độ JLPT</div>
            <Checks all={LEVELS} value={levels} onChange={setLevels} label={(l) => l} />
          </div>
          <div>
            <div className={`mb-1 text-xs ${muted}`}>Phần dữ liệu (chia theo câu gốc)</div>
            <Checks all={SPLITS} value={splits as (typeof SPLITS)[number][]} onChange={setSplits} label={(s) => SPLIT_LABEL[s]} />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-start gap-4">
          <AutoField
            label="Tối đa số câu mỗi việc × trình độ"
            value={perTaskLevel}
            onChange={setPerTaskLevel}
            s={sug.perTaskLevel}
            show={(v) => (v === null ? "tất cả" : String(v))}
          />
          <label className="flex h-8 items-center gap-2 text-xs">
            <input type="checkbox" checked={dedupe} onChange={(e) => setDedupe(e.target.checked)} />
            Bỏ câu trùng hệt nội dung (đỡ tốn lượt gọi)
          </label>
        </div>
      </section>

      <section className={card}>
        <h2 className="text-sm font-semibold">2. Dịch vụ được chấm</h2>
        <p className={`mt-1 text-xs ${muted}`}>Cùng bộ câu và cùng prompt cho mọi dịch vụ. Nhập “model khác” để thử model khác của cùng tài khoản (điểm khi đó không dùng để xếp hạng dịch vụ).</p>
        <div className="mt-3 flex flex-col gap-2">
          {candidates.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <ServiceSelect services={usable} label={`Dịch vụ ${i + 1}`} value={c} onChange={(p) => setCandidates(candidates.map((x, j) => (j === i ? p : x)))} />
              <button type="button" className={btn} onClick={() => setCandidates(candidates.filter((_, j) => j !== i))}>
                Bỏ
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} disabled={candidates.length >= 6} onClick={() => setCandidates([...candidates, { serviceId: "", model: "" }])}>
              + Thêm dịch vụ
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => setCandidates(usable.filter((s) => s.enabled).slice(0, 6).map((s) => ({ serviceId: s.id, model: "" })))}
            >
              Chọn mọi dịch vụ đang bật
            </button>
          </div>
        </div>
      </section>

      <section className={card}>
        <h2 className="text-sm font-semibold">3. Hai AI chấm</h2>
        <p className={`mt-1 text-xs ${muted}`}>
          Hai AI chấm phải là 2 model khác nhau và khác model của bài làm. Chúng không biết bài là của dịch vụ nào, chấm ở nhiệt độ 0; lệch nhau &gt; 20 điểm hoặc không chắc
          chắn thì câu đó được đưa vào danh sách cần người duyệt.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <ServiceSelect services={usable} label="AI chấm 1" value={judgeA} onChange={setJudgeA} />
          <ServiceSelect services={usable} label="AI chấm 2" value={judgeB} onChange={setJudgeB} />
        </div>
        {sameAs(judgeA, judgeB) && <p className="mt-2 text-xs text-[#b91c1c]">Hai AI chấm đang cùng một model.</p>}
        {selfClash.length > 0 && (
          <div className="mt-2 text-xs text-[#b45309]">
            AI chấm trùng model với: {selfClash.map((c) => `${svc(c.serviceId)?.label} (${modelOf(c)})`).join(", ")}.
            <label className="ml-2 inline-flex items-center gap-1.5">
              <input type="checkbox" checked={allowSelf} onChange={(e) => setAllowSelf(e.target.checked)} />
              Cho phép có kiểm soát (bài đó chỉ do AI chấm còn lại chấm và luôn cần người duyệt)
            </label>
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className="text-sm font-semibold">4. Cách chạy</h2>
        <div className="mt-3 flex flex-wrap items-start gap-4">
          <AutoField label="Nhiệt độ (temperature)" value={temperature} onChange={setTemperature} s={sug.temperature} decimal show={(v) => String(v)} />
          <AutoField label="Số câu mỗi lần gọi" value={batchSize} onChange={setBatchSize} s={sug.batchSize} show={(v) => String(v)} />
          <AutoField label="Số bài mỗi lần AI chấm" value={judgeBatch} onChange={setJudgeBatch} s={sug.judgeBatch} show={(v) => String(v)} />
          <label className="flex flex-col gap-1 text-xs" title="Chạy lại cùng bộ câu nhiều lần để đo độ ổn định">
            <span className={muted}>Số lần lặp</span>
            <select className={`${field} w-24`} value={repeats} onChange={(e) => setRepeats(e.target.value)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className={muted}>Ngưỡng đạt (điểm)</span>
            <input className={`${field} w-24`} inputMode="numeric" value={pass} onChange={(e) => setPass(e.target.value.replace(/\D/g, ""))} />
          </label>
          <label className="flex h-8 items-center gap-2 text-xs">
            <input type="checkbox" checked={updateRanking} onChange={(e) => setUpdateRanking(e.target.checked)} />
            Xong thì cập nhật xếp hạng dịch vụ theo điểm này
          </label>
        </div>
        {preview && (
          <p className={`mt-3 text-xs ${muted}`}>
            <b className="text-[var(--foreground)]">{preview.cases} câu</b> ({TASKS.filter((t) => preview.byTask[t]).map((t) => `${TASK_LABEL[t]} ${preview.byTask[t]}`).join(", ")}) →{" "}
            {preview.results} kết quả, khoảng {preview.candidateCalls} lượt gọi dịch vụ được chấm và {preview.judgeCalls} lượt gọi AI chấm (ít hơn nếu câu trả lời lặp lại đã được chấm).
            Chạy nền, mỗi lần một run.
          </p>
        )}
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className={btnPrimary}
          disabled={busy || !preview?.cases || candidates.length === 0 || candidates.some((c) => !c.serviceId) || !judgeA.serviceId || !judgeB.serviceId}
        >
          {busy ? "Đang tạo…" : "Bắt đầu chạy"}
        </button>
        <Msg m={msg} />
      </div>
    </form>
  );
}

// ── Report ───────────────────────────────────────────────────────────────

function ReportTab({ runId, run, reloadRuns }: { runId: string; run?: Run; reloadRuns: () => Promise<void> }) {
  const [rep, setRep] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await api<Report>(`${API}/runs/${runId}/report`);
    if (r.ok) setRep(r.data);
    else setErr(r.error);
  }, [runId]);
  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);
  // Refresh while the run is still going.
  const live = run && (run.status === "running" || run.status === "queued");
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [live, load]);
  const [cand, setCand] = useState(0);

  if (err) return <Msg m={{ ok: false, text: err }} />;
  if (!rep) return <p className={`text-sm ${muted}`}>Đang tải…</p>;
  const c = rep.candidates[cand];
  const tasks = TASKS.filter((t) => rep.candidates.some((x) => x.byTask[t]));
  const levels = LEVELS.filter((l) => rep.candidates.some((x) => x.byLevel[l]));

  return (
    <div className="flex flex-col gap-5">
      {live && <RunProgressPanel runId={runId} onDone={async () => {
        await load();
        await reloadRuns();
      }} />}
      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{rep.label}</h2>
            <p className={`mt-1 text-xs ${muted}`}>
              {STATUS_LABEL[rep.status] ?? rep.status} · {rep.datasetKey} · {rep.caseCount} câu × {rep.repeats} lần · {rep.batchSize} câu/lần gọi · nhiệt độ {rep.temperature} · prompt{" "}
              {rep.promptVersion} · AI chấm {rep.judgePromptVersion}: {rep.judges.map((j) => j.model).join(" + ")} · ngưỡng đạt {rep.passThreshold}
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" className={btn} onClick={() => void load().then(reloadRuns)}>
              Làm mới
            </button>
            <a className={btn} href={`${API}/runs/${runId}/report.csv`} download={`eval-${runId}.csv`}>
              Tải CSV
            </a>
            <a className={btn} href={`${API}/runs/${runId}/report`} download={`eval-${runId}.json`}>
              Tải JSON
            </a>
          </div>
        </div>
      </section>

      <style>{EVAL_VIZ_CSS}</style>
      <section className={card} aria-labelledby="verdict-title">
        <h3 id="verdict-title" className="text-sm font-semibold">
          Kết luận
        </h3>
        <ul className="mt-3 flex flex-col gap-2">
          {verdict(rep).map((v, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm">
              <span
                className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${TONE_MARK[v.tone].cls}`}
                role="img"
                aria-label={TONE_MARK[v.tone].label}
              >
                {TONE_MARK[v.tone].icon}
              </span>
              <span>{v.text}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="eval-viz grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(15rem, 1fr))" }}>
        {[...rep.candidates]
          .sort((a, b) => (b.overall.mean ?? -1) - (a.overall.mean ?? -1))
          .map((x, rank) => (
            <article key={x.index} className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4" aria-label={`${x.label}: ${fmt(x.overall.mean)} điểm`}>
              <div className="flex items-start gap-2">
                <span className="mt-1 inline-block size-2.5 shrink-0 rounded-sm" style={{ background: seriesColor(x.index) }} aria-hidden />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{x.label}</div>
                  <div className={`truncate text-[11px] ${muted}`}>{x.model}</div>
                </div>
                {rank === 0 && x.overall.mean !== null && rep.candidates.length > 1 && (
                  <span className="ml-auto shrink-0 rounded-full bg-[var(--foreground)] px-2 py-0.5 text-[10px] font-medium text-[var(--background)]">Cao nhất</span>
                )}
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-semibold tracking-tight">{fmt(x.overall.mean)}</span>
                <span className={`text-xs ${muted}`}>/ 100 điểm</span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <dt className={muted}>Câu đạt</dt>
                <dd className="text-right tabular-nums">{x.overall.passRate === null ? "—" : `${fmt(x.overall.passRate)}%`}</dd>
                <dt className={muted}>Lỗi</dt>
                <dd className={"text-right tabular-nums " + (x.errorRate >= 10 ? "text-[#b91c1c] dark:text-[#fca5a5]" : "")}>{fmt(x.errorRate)}%</dd>
                <dt className={muted}>Mỗi lần gọi</dt>
                <dd className="text-right tabular-nums">{secs(x.latency?.median)}</dd>
                <dt className={muted}>Chi phí</dt>
                <dd className="text-right tabular-nums">{usd(x.cost.total)}</dd>
                {x.consistency && (
                  <>
                    <dt className={muted}>Ổn định</dt>
                    <dd className="text-right tabular-nums">{fmt(x.consistency.stableShare)}%</dd>
                  </>
                )}
                {x.needsReview > 0 && (
                  <>
                    <dt className={muted}>Cần duyệt</dt>
                    <dd className="text-right tabular-nums">{x.needsReview}</dd>
                  </>
                )}
              </dl>
              {x.stopped && <p className="mt-2 text-[11px] text-[#b91c1c] dark:text-[#fca5a5]">Dừng: {x.stopped}</p>}
            </article>
          ))}
      </div>

      <section className={`${card} eval-viz`} aria-labelledby="by-task-title">
        <h3 id="by-task-title" className="text-sm font-semibold">
          Điểm theo từng việc
        </h3>
        <p className={`mt-1 text-xs ${muted}`}>Thanh càng dài điểm càng cao; vạch đứt là ngưỡng đạt. Rê chuột lên thanh để xem tỉ lệ câu đạt và số câu.</p>
        <div className="mt-4 max-w-3xl">
          <TaskBarsChart cands={rep.candidates} tasks={tasks} taskLabel={(t) => TASK_LABEL[t as Task]} pass={rep.passThreshold} />
        </div>
      </section>

      <section className={`${card} eval-viz`} aria-labelledby="by-level-title">
        <h3 id="by-level-title" className="text-sm font-semibold">
          Điểm theo trình độ JLPT
        </h3>
        <p className={`mt-1 text-xs ${muted}`}>Từ dễ (N5) đến khó (N1). Trục điểm phóng theo dữ liệu để thấy rõ chênh lệch. Rê chuột lên một trình độ để xem điểm của mọi dịch vụ; bấm tên ở chú thích để ẩn/hiện.</p>
        <div className="mt-4 max-w-3xl">
          <LevelLineChart cands={rep.candidates} levels={levels} pass={rep.passThreshold} />
        </div>
      </section>

      <section className={`${card} eval-viz`} aria-labelledby="speed-title">
        <h3 id="speed-title" className="text-sm font-semibold">
          Tốc độ và điểm
        </h3>
        <p className={`mt-1 text-xs ${muted}`}>Mỗi chấm là một dịch vụ: càng cao càng chính xác, càng sang trái càng nhanh — góc trên bên trái là lựa chọn tốt. Rê chuột lên chấm để xem điểm, thời gian và chi phí.</p>
        <div className="mt-4 max-w-3xl">
          <SpeedScatterChart cands={rep.candidates} pass={rep.passThreshold} />
        </div>
      </section>

      <details className={card}>
        <summary className="cursor-pointer text-sm font-semibold">Bảng số liệu đầy đủ</summary>
        <p className={`mt-1 text-xs ${muted}`}>Cùng số liệu với các biểu đồ trên, kèm token, thời gian chi tiết và độ ổn định.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className={th}>Dịch vụ</th>
                <th className={th}>Điểm tổng</th>
                <th className={th}>Tỉ lệ đạt</th>
                <th className={th}>Tỉ lệ lỗi</th>
                <th className={th}>Thời gian / lần gọi</th>
                <th className={th}>Token (vào / ra)</th>
                <th className={th}>Chi phí ước tính</th>
                <th className={th}>Ổn định</th>
                <th className={th}>Cần duyệt</th>
              </tr>
            </thead>
            <tbody>
              {rep.candidates.map((x) => (
                <tr key={x.index} className="border-b border-[var(--border)] last:border-0">
                  <td className={td}>
                    <div className="font-medium">{x.label}</div>
                    <div className={muted}>
                      {x.model}
                      {x.modelVersion && x.modelVersion !== x.model ? ` · ${x.modelVersion}` : ""}
                      {x.modelOverride ? " · model khác" : ""}
                    </div>
                    {x.stopped && <div className="text-[#b91c1c]">Dừng: {x.stopped}</div>}
                  </td>
                  <td className={td}>
                    <Score v={x.overall.mean} pass={rep.passThreshold} />
                    <div className={muted}>
                      n={x.overall.n}
                      {x.overall.stdev !== null ? ` · σ ${fmt(x.overall.stdev)}` : ""}
                    </div>
                  </td>
                  <td className={`${td} tabular-nums`}>{x.overall.passRate === null ? "—" : `${fmt(x.overall.passRate)}%`}</td>
                  <td className={`${td} tabular-nums`}>
                    {fmt(x.errorRate)}%
                    <div className={muted}>
                      {x.errors} lỗi · {x.missing} chưa chạy{x.judgeFailed ? ` · ${x.judgeFailed} chưa chấm được` : ""}
                    </div>
                  </td>
                  <td className={`${td} tabular-nums`}>
                    {x.latency ? (
                      <>
                        {secs(x.latency.median)} <span className={muted}>trung vị</span>
                        <div className={muted}>
                          TB {secs(x.latency.mean)} · P95 {secs(x.latency.p95)} · {secs(x.latency.perItem)}/câu
                        </div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={`${td} tabular-nums`}>
                    {x.tokens.input.toLocaleString("vi-VN")} / {x.tokens.output.toLocaleString("vi-VN")}
                    {x.tokens.estimated && <div className={muted}>ước lượng (dịch vụ không báo token)</div>}
                    <div className={muted}>
                      AI chấm: {x.tokens.judgeInput.toLocaleString("vi-VN")} / {x.tokens.judgeOutput.toLocaleString("vi-VN")}
                    </div>
                  </td>
                  <td className={`${td} tabular-nums`}>
                    {usd(x.cost.candidate)}
                    <div className={muted}>
                      + chấm {usd(x.cost.judge)}
                      {x.cost.perCase !== null ? ` · ${usd(x.cost.perCase)}/câu` : ""}
                    </div>
                  </td>
                  <td className={`${td} tabular-nums`}>
                    {x.consistency ? (
                      <>
                        σ {fmt(x.consistency.meanStdev)}
                        <div className={muted}>
                          {fmt(x.consistency.stableShare)}% ổn định · đạt mọi lần {fmt(x.consistency.passAllShare)}% · giống nhau {fmt(x.consistency.outputAgreement)}
                        </div>
                      </>
                    ) : (
                      <span className={muted}>cần ≥ 2 lần lặp</span>
                    )}
                  </td>
                  <td className={`${td} tabular-nums`}>
                    {x.needsReview}
                    {x.reviewed ? <div className={muted}>đã duyệt {x.reviewed}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-6 flex flex-col gap-6">
          <ByTable
            title="Điểm theo việc"
            cols={tasks.map((t) => ({ key: t, label: TASK_LABEL[t] }))}
            cands={rep.candidates}
            get={(x, k) => x.byTask[k as Task]}
            pass={rep.passThreshold}
          />
          <ByTable
            title="Điểm theo trình độ JLPT"
            cols={levels.map((l) => ({ key: l, label: l }))}
            cands={rep.candidates}
            get={(x, k) => x.byLevel[k as Level]}
            pass={rep.passThreshold}
          />
        </div>
      </details>

      {c && (
        <section className={`${card} eval-viz`}>
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-semibold">Điểm mạnh, điểm yếu của từng dịch vụ</h3>
            <select aria-label="Dịch vụ" className={field} value={cand} onChange={(e) => setCand(Number(e.target.value))}>
              {rep.candidates.map((x) => (
                <option key={x.index} value={x.index}>
                  {x.label} · {x.model}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-4 grid gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className={`text-xs font-medium ${muted}`}>Điểm theo việc và trình độ (càng xanh đậm càng cao)</div>
              <div className="mt-2 max-w-xl">
                <HeatmapChart c={c} tasks={tasks} levels={levels} taskLabel={(t) => TASK_LABEL[t as Task]} pass={rep.passThreshold} />
              </div>
              <WeakSpots c={c} pass={rep.passThreshold} />
            </div>
            <div>
              <div className={`mb-2 text-xs font-medium ${muted}`}>Lỗi thường gặp (tỉ lệ trên số câu)</div>
              <ErrorChart c={c} tagLabel={(t) => TAG_LABEL[t] ?? t} />
            </div>
          </div>
        </section>
      )}

      <ResultsBrowser runId={runId} rep={rep} onChanged={load} />
    </div>
  );
}

/** Knowledge points of the dataset (`evaluation_focus`) in plain Vietnamese, with the pattern they test. */
const FOCUS_LABEL: Record<string, string> = {
  copula: "Câu “là” (～です)",
  polite_present: "Hiện tại lịch sự (～ます)",
  polite_negative: "Phủ định lịch sự (～ません)",
  polite_past: "Quá khứ lịch sự (～ました)",
  existence_inanimate: "Có — đồ vật (～があります)",
  existence_animate: "Có — người, con vật (～がいます)",
  request: "Nhờ, yêu cầu (～てください)",
  permission: "Được phép (～てもいいです)",
  prohibition: "Cấm (～てはいけません)",
  reason: "Lý do (～から)",
  opinion: "Nêu ý kiến (～と思います)",
  intention: "Dự định (～つもりです)",
  simultaneous: "Vừa… vừa (～ながら)",
  before: "Trước khi (～前に)",
  after: "Sau khi (～た後で)",
  obligation: "Phải làm (～なければなりません)",
  no_obligation: "Không cần phải (～なくてもいい)",
  ability: "Có thể làm (～ことができます)",
  experience: "Đã từng (～たことがある)",
  ease: "Dễ / khó làm (～やすい／にくい)",
  change: "Thay đổi, trở nên (～ようになる)",
  habit_effort: "Cố gắng làm (～ようにする)",
  partial_negation: "Không hẳn là (～わけではない)",
  rule: "Quy định (～ことになっている)",
  excessive: "Toàn là, chỉ toàn (～ばかり)",
  positive_cause: "Nhờ có (～おかげで)",
  negative_cause: "Tại vì (～せいで)",
  immediate: "Vừa… thì ngay (～たとたん)",
  contrast: "Đối lập (～に対して)",
  means_variation: "Tùy theo (～によって)",
  reject_inference: "Không thể chỉ vì… mà (～からといって)",
  not_necessarily: "Chưa chắc đã (～とは限らない)",
  strong_inference: "Chắc chắn là (～に違いない)",
  concession: "Tuy… nhưng (～ものの / ～とはいえ)",
  emphasis_cause: "Chính vì… nên càng (～だけに)",
  two_sides: "Một mặt… mặt khác (～一方で)",
  correspondence: "Tương ứng với (～に応じて)",
  as_soon_as: "Ngay khi (～次第)",
  social_constraint: "Không thể không / không được (～わけにはいかない)",
  emphasis_identity: "Không gì khác ngoài (～にほかならない)",
  compulsion: "Buộc phải (～を余儀なくされる)",
  regardless: "Bất kể (～いかんにかかわらず)",
  alignment: "Dựa theo, phù hợp với (～に即して)",
  combined_effect: "Cùng với, kết hợp (～と相まって)",
  emotion: "Không kìm được (～を禁じ得ない)",
  worthwhile: "Đáng để (～にたえる)",
  starting_point: "Bắt đầu từ (～を皮切りに)",
  uniqueness: "Chỉ có ở (～ならでは)",
  basis: "Dựa trên (～を踏まえて)",
  meaning_preservation: "Dịch giữ đúng nghĩa",
  particle_accuracy: "Dịch đúng trợ từ",
  tense_aspect: "Dịch đúng thì, thể",
  register: "Dịch đúng mức lịch sự",
};
/** A knowledge point counts as weak this far below the service's own average, or under the pass mark. */
const WEAK_GAP = 5;
/** Fewer cases than this: the mean is shown but flagged as unreliable. */
const FEW_CASES = 4;

/**
 * The knowledge points where one service does clearly worse than its own average, or fails
 * the pass mark — not simply the lowest ten. Nothing weak → says so in one line.
 */
function WeakSpots({ c, pass }: { c: CandReport; pass: number }) {
  const all = c.byFocus ?? [];
  if (all.length === 0 || c.overall.mean === null) return null;
  const avg = c.overall.mean;
  const weak = all.filter((f) => f.mean < pass || avg - f.mean >= WEAK_GAP).slice(0, 8);
  return (
    <div className="mt-5">
      <div className={`text-xs font-medium ${muted}`}>Kiến thức làm kém nhất</div>
      {weak.length === 0 ? (
        <p className="mt-1.5 text-sm">
          Không có kiến thức nào yếu rõ rệt: mọi mẫu ngữ pháp và kỹ năng dịch đều đạt ngưỡng {pass} và không thấp hơn điểm chung ({fmt(avg)}) quá {WEAK_GAP} điểm.
          {all[0] && (
            <span className={muted}>
              {" "}
              Thấp nhất là {FOCUS_LABEL[all[0].focus] ?? all[0].focus}: {fmt(all[0].mean)} điểm.
            </span>
          )}
        </p>
      ) : (
        <>
          <p className={`mt-1 text-[11px] ${muted}`}>
            Những mẫu / kỹ năng dưới ngưỡng {pass}, hoặc thấp hơn điểm chung của dịch vụ ({fmt(avg)}) từ {WEAK_GAP} điểm trở lên.
          </p>
          <ul className="mt-2 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] text-sm">
            {weak.map((f) => (
              <li key={f.focus} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-3 py-2">
                <span className="min-w-0">{FOCUS_LABEL[f.focus] ?? f.focus}</span>
                <span className="flex items-baseline gap-3 text-xs tabular-nums">
                  <b className={"text-sm " + (f.mean < pass ? "text-[#b91c1c] dark:text-[#fca5a5]" : "")}>{fmt(f.mean)} điểm</b>
                  <span className={muted}>thấp hơn TB {fmt(avg - f.mean)}</span>
                  <span className={muted}>
                    {f.n} câu{f.n < FEW_CASES ? ", ít câu nên chưa chắc" : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Plain-language conclusions from a report: who leads and by how much, who is fastest / cheapest, weak spots, what needs a human. */
function verdict(rep: Report): { tone: "good" | "warn" | "info"; text: string }[] {
  const out: { tone: "good" | "warn" | "info"; text: string }[] = [];
  const scored = rep.candidates.filter((c) => c.overall.mean !== null).sort((a, b) => b.overall.mean! - a.overall.mean!);
  const best = scored[0];
  if (!best) return [{ tone: "info", text: "Chưa có câu nào được chấm xong." }];
  const second = scored[1];
  out.push({
    tone: best.overall.mean! >= rep.passThreshold ? "good" : "warn",
    text:
      `${best.label} (${best.model}) đứng đầu với ${fmt(best.overall.mean)} điểm` +
      (second ? `, hơn ${second.label} ${fmt(best.overall.mean! - second.overall.mean!)} điểm` : "") +
      `; ${fmt(best.overall.passRate)}% câu đạt từ ${rep.passThreshold} điểm.`,
  });
  if (scored.length > 1) {
    const fast = scored.filter((c) => c.latency).sort((a, b) => a.latency!.median - b.latency!.median)[0];
    if (fast) out.push({ tone: "info", text: `Nhanh nhất: ${fast.label}, ${secs(fast.latency!.median)} mỗi lần gọi (${secs(fast.latency!.perItem)} mỗi câu).` });
    const priced = scored.filter((c) => c.cost.total !== null);
    if (priced.length > 1) {
      const cheap = [...priced].sort((a, b) => a.cost.total! - b.cost.total!)[0];
      out.push({ tone: "info", text: `Rẻ nhất: ${cheap.label}, ${usd(cheap.cost.total)} cho cả lần chạy (gồm AI chấm).` });
    }
  }
  const weakTask = (Object.entries(best.byTask) as [Task, Stat][]).filter(([, s]) => s.mean !== null).sort((a, b) => a[1].mean! - b[1].mean!)[0];
  const weakLevel = (Object.entries(best.byLevel) as [Level, Stat][]).filter(([, s]) => s.mean !== null).sort((a, b) => a[1].mean! - b[1].mean!)[0];
  if (weakTask && Object.keys(best.byTask).length > 1)
    out.push({
      tone: weakTask[1].mean! < rep.passThreshold ? "warn" : "info",
      text: `Điểm yếu của ${best.label}: ${TASK_LABEL[weakTask[0]].toLowerCase()} (${fmt(weakTask[1].mean)} điểm)${weakLevel && Object.keys(best.byLevel).length > 1 ? `, và trình độ ${weakLevel[0]} (${fmt(weakLevel[1].mean)} điểm)` : ""}.`,
    });
  for (const c of rep.candidates) {
    if (c.stopped) out.push({ tone: "warn", text: `${c.label} bị dừng giữa chừng: ${c.stopped}.` });
    else if (c.errorRate >= 10) out.push({ tone: "warn", text: `${c.label} lỗi ${fmt(c.errorRate)}% số câu — xem “Lỗi thường gặp” bên dưới.` });
  }
  const review = rep.candidates.reduce((a, c) => a + c.needsReview, 0);
  if (review > 0) out.push({ tone: "warn", text: `${review} câu cần người duyệt (2 AI chấm lệch nhau hoặc không chắc chắn) — lọc “Cần người duyệt” ở cuối trang.` });
  return out;
}

const TONE_MARK: Record<"good" | "warn" | "info", { icon: string; cls: string; label: string }> = {
  good: { icon: "✓", cls: "bg-[#0ca30c] text-white", label: "Tốt" },
  warn: { icon: "!", cls: "bg-[#fab219] text-[#0b0b0b]", label: "Lưu ý" },
  info: { icon: "i", cls: "bg-[var(--layer)] text-[var(--foreground)] border border-[var(--border)]", label: "Thông tin" },
};

/**
 * One row per service (colour swatch, name and model, so services sharing a label stay apart),
 * one column per task or level: few columns, no sideways scrolling. A cell shows the score —
 * red under the pass mark — and below it the share of passing cases and how many there were.
 */
function ByTable({
  title,
  cols,
  cands,
  get,
  pass,
}: {
  title: string;
  cols: { key: string; label: string }[];
  cands: CandReport[];
  get: (c: CandReport, k: string) => Stat | undefined;
  pass: number;
}) {
  return (
    <div>
      <h4 className="text-sm font-semibold">{title}</h4>
      <div className="mt-2 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--layer)]">
              <th className={`${th} w-[14rem] px-3 py-2`}>Dịch vụ</th>
              {cols.map((c) => (
                <th key={c.key} className={`${th} px-3 py-2 text-right`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cands.map((c) => (
              <tr key={c.index} className="border-b border-[var(--border)] last:border-0">
                <td className="px-3 py-2.5 align-top">
                  <div className="flex items-start gap-2">
                    <span className="mt-1.5 inline-block size-2.5 shrink-0 rounded-sm" style={{ background: seriesColor(c.index) }} aria-hidden />
                    <div className="min-w-0">
                      <div className="truncate font-medium" title={c.label}>
                        {c.label}
                      </div>
                      <div className={`truncate text-xs ${muted}`} title={c.model}>
                        {c.model}
                      </div>
                    </div>
                  </div>
                </td>
                {cols.map((col) => {
                  const s = get(c, col.key);
                  const v = s?.mean ?? null;
                  return (
                    <td key={col.key} className="px-3 py-2.5 text-right align-top tabular-nums">
                      {v === null ? (
                        <span className={`text-xs ${muted}`}>chưa chạy</span>
                      ) : (
                        <>
                          <div className={"font-semibold " + (v < pass ? "text-[#b91c1c] dark:text-[#fca5a5]" : "")}>{fmt(v)}</div>
                          <div className={`text-xs ${muted}`}>
                            {fmt(s!.passRate, 0)}% đạt, {s!.n} câu
                          </div>
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ResultsBrowser({ runId, rep, onChanged }: { runId: string; rep: Report; onChanged: () => Promise<void> }) {
  const [q, setQ] = useState({ candidate: "", task: "", level: "", status: "", review: "1", maxScore: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: ResultRow[]; total: number; pageSize: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(async () => {
    const p = new URLSearchParams(Object.entries({ ...q, page: String(page) }).filter(([, v]) => v !== ""));
    const r = await api<{ items: ResultRow[]; total: number; pageSize: number }>(`${API}/runs/${runId}/results?${p}`);
    if (r.ok) setData(r.data);
  }, [runId, q, page]);
  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);
  const set = (k: keyof typeof q) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    setPage(1);
    setQ({ ...q, [k]: e.target.value });
  };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section className={card}>
      <h3 className="text-sm font-semibold">Kết quả từng câu & người duyệt</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        <select aria-label="Dịch vụ" className={field} value={q.candidate} onChange={set("candidate")}>
          <option value="">Mọi dịch vụ</option>
          {rep.candidates.map((c) => (
            <option key={c.index} value={c.index}>
              {c.label}
            </option>
          ))}
        </select>
        <select aria-label="Việc" className={field} value={q.task} onChange={set("task")}>
          <option value="">Mọi việc</option>
          {TASKS.map((t) => (
            <option key={t} value={t}>
              {TASK_LABEL[t]}
            </option>
          ))}
        </select>
        <select aria-label="Trình độ" className={field} value={q.level} onChange={set("level")}>
          <option value="">Mọi trình độ</option>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select aria-label="Trạng thái" className={field} value={q.status} onChange={set("status")}>
          <option value="">Mọi trạng thái</option>
          <option value="scored">Đã chấm</option>
          <option value="error">Lỗi</option>
          <option value="judge_failed">AI chấm lỗi</option>
        </select>
        <select aria-label="Duyệt" className={field} value={q.review} onChange={set("review")}>
          <option value="">Tất cả</option>
          <option value="1">Cần người duyệt</option>
          <option value="done">Đã duyệt</option>
        </select>
        <input aria-label="Điểm tối đa" className={`${field} w-28`} inputMode="numeric" placeholder="điểm ≤ …" value={q.maxScore} onChange={set("maxScore")} />
      </div>
      {data && (
        <>
          <div className={`mt-3 text-xs ${muted}`}>{data.total} kết quả</div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[760px] text-xs">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className={th}>Câu</th>
                  <th className={th}>Dịch vụ</th>
                  <th className={th}>Trả lời</th>
                  <th className={th}>Điểm</th>
                  <th className={th}>Lỗi / lý do duyệt</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <Fragment key={r.id}>
                    <tr
                      className="cursor-pointer border-b border-[var(--border)] hover:bg-[var(--layer-hover)]"
                      onClick={() => setOpen(open === r.id ? null : r.id)}
                      aria-expanded={open === r.id}
                    >
                      <td className={td}>
                        <div className="font-medium">{r.caseId}</div>
                        <div className={muted}>
                          {TASK_LABEL[r.task]} · {r.level}
                          {rep.repeats > 1 ? ` · lần ${r.repeat}` : ""}
                        </div>
                      </td>
                      <td className={td}>{rep.candidates[r.candidate]?.label}</td>
                      <td className={`${td} max-w-[22rem]`}>{r.outputText || <span className={muted}>{r.error ?? "—"}</span>}</td>
                      <td className={td}>
                        {typeof r.humanTotal === "number" ? (
                          <>
                            <Score v={r.humanTotal} pass={rep.passThreshold} />
                            <div className={muted}>người duyệt (AI: {fmt(r.total)})</div>
                          </>
                        ) : (
                          <Score v={r.total} pass={rep.passThreshold} />
                        )}
                      </td>
                      <td className={td}>
                        <div>{r.errorTags.map((t) => TAG_LABEL[t] ?? t).join(", ")}</div>
                        {r.needsReview && <div className="text-[#b45309]">{r.reviewReason ?? "cần duyệt"}</div>}
                      </td>
                    </tr>
                    {open === r.id && (
                      <tr className="bg-[var(--layer)]">
                        <td colSpan={5} className="p-3">
                          <ResultDetailView id={r.id} pass={rep.passThreshold} onReviewed={async () => {
                            await load();
                            await onChanged();
                          }} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="mt-3 flex items-center gap-2 text-xs">
              <button type="button" className={btn} disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Trước
              </button>
              <span>
                Trang {page}/{pages}
              </span>
              <button type="button" className={btn} disabled={page >= pages} onClick={() => setPage(page + 1)}>
                Sau
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Json({ v }: { v: unknown }) {
  return <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--background)] p-2 text-[11px]">{typeof v === "string" ? v : JSON.stringify(v, null, 2)}</pre>;
}

function ResultDetailView({ id, pass, onReviewed }: { id: string; pass: number; onReviewed: () => Promise<void> }) {
  const [d, setD] = useState<ResultDetail | null>(null);
  const [score, setScore] = useState("");
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  useEffect(() => {
    void api<ResultDetail>(`${API}/results/${id}`).then((r) => r.ok && setD(r.data));
  }, [id]);
  if (!d) return <p className={`text-xs ${muted}`}>Đang tải…</p>;

  async function review(action: "confirm" | "override") {
    const r = await api<ResultDetail>(`${API}/results/${id}/review`, { method: "POST", body: JSON.stringify({ action, score: Number(score), notes }) });
    if (!r.ok) {
      setMsg({ ok: false, text: r.error });
      return;
    }
    setD(r.data);
    setMsg({ ok: true, text: "Đã lưu." });
    setNotes("");
    await onReviewed();
  }

  const crit = Object.keys(d.parts ?? {});
  return (
    <div className="grid gap-4 text-xs lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <div>
          <div className={`mb-1 font-medium ${muted}`}>Đề và đáp án tham chiếu (một đáp án đúng, không phải duy nhất)</div>
          <Json v={d.case} />
        </div>
        <div>
          <div className={`mb-1 font-medium ${muted}`}>Câu trả lời (đã đọc)</div>
          <Json v={d.parsed ?? d.error ?? "—"} />
        </div>
        {d.call && (
          <div>
            <button type="button" className={btn} onClick={() => setShowRaw(!showRaw)}>
              {showRaw ? "Ẩn" : "Xem"} câu trả lời gốc của lần gọi ({secs(d.call.ms)}
              {d.call.modelVersion ? ` · ${d.call.modelVersion}` : ""})
            </button>
            {showRaw && (
              <div className="mt-2">
                <Json v={d.call.raw ?? d.call.error ?? ""} />
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-3">
        {crit.length > 0 && (
          <div>
            <div className={`mb-1 font-medium ${muted}`}>Điểm từng tiêu chí</div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className={th}>Tiêu chí</th>
                  <th className={th}>Kết quả</th>
                  {(d.verdicts ?? []).map((v, i) => (
                    <th key={i} className={th} title={v.judge}>
                      AI chấm {i + 1}
                    </th>
                  ))}
                  <th className={th}>Code</th>
                </tr>
              </thead>
              <tbody>
                {crit.map((k) => (
                  <tr key={k} className="border-b border-[var(--border)] last:border-0">
                    <td className={td}>{k}</td>
                    <td className={`${td} tabular-nums font-medium`}>{fmt(d.parts![k])}</td>
                    {(d.verdicts ?? []).map((v, i) => (
                      <td key={i} className={`${td} tabular-nums`}>
                        {v.scores[k] ?? "—"}
                      </td>
                    ))}
                    <td className={`${td} tabular-nums`}>
                      {d.deterministic?.points[k] !== undefined ? d.deterministic.points[k] : ""}
                      {d.deterministic?.caps?.[k] !== undefined ? ` (trần ${d.deterministic.caps[k]})` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-1 flex items-center gap-2">
              Tổng <Score v={d.total} pass={pass} />
            </div>
          </div>
        )}
        {d.deterministic && (
          <div>
            <div className={`mb-1 font-medium ${muted}`}>Kiểm tra bằng code</div>
            <Json v={{ ...d.deterministic.checks, flags: d.deterministic.flags }} />
          </div>
        )}
        {(d.verdicts ?? []).map((v, i) => (
          <div key={i}>
            <span className="font-medium">{v.judge}</span> <span className={muted}>· tự tin {fmt(v.confidence * 100, 0)}%</span>
            {v.note && <div>{v.note}</div>}
            {v.errorTags.length > 0 && <div className={muted}>{v.errorTags.map((t) => TAG_LABEL[t] ?? t).join(", ")}</div>}
          </div>
        ))}
        <div className="rounded-lg border border-[var(--border)] p-3">
          <div className="font-medium">Người duyệt</div>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <button type="button" className={btn} disabled={d.total === null && typeof d.humanTotal !== "number"} onClick={() => void review("confirm")}>
              Xác nhận điểm
            </button>
            <input aria-label="Điểm mới" className={`${field} w-24`} inputMode="decimal" placeholder="điểm 0–100" value={score} onChange={(e) => setScore(e.target.value)} />
            <button type="button" className={btn} disabled={score === ""} onClick={() => void review("override")}>
              Sửa điểm
            </button>
          </div>
          <textarea aria-label="Ghi chú" className={`${field} mt-2 h-16 w-full py-1`} placeholder="Ghi chú (lý do)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <Msg m={msg} />
          {d.reviews.length > 0 && (
            <ul className={`mt-2 flex flex-col gap-1 ${muted}`}>
              {d.reviews.map((r, i) => (
                <li key={i}>
                  {when(r.createdAt)} · {r.reviewer}: {r.verdict === "override" ? "sửa" : "xác nhận"} {fmt(r.previousTotal)} → {fmt(r.correctedTotal)}
                  {r.notes ? ` — ${r.notes}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Compare ──────────────────────────────────────────────────────────────

function CompareTab({ runs }: { runs: Run[] }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [data, setData] = useState<{ a: Report; b: Report } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!a || !b) return;
    void api<{ a: Report; b: Report }>(`${API}/compare?a=${a}&b=${b}`).then((r) => (r.ok ? (setData(r.data), setErr(null)) : setErr(r.error)));
  }, [a, b]);
  if (runs.length < 2) return <p className={`text-sm ${muted}`}>Cần ít nhất 2 lần chạy đã hoàn tất.</p>;
  const keyOf = (c: CandReport) => `${c.provider}:${c.model}`;
  const rows = data
    ? [...new Set([...data.a.candidates.map(keyOf), ...data.b.candidates.map(keyOf)])].map((k) => ({
        k,
        x: data.a.candidates.find((c) => keyOf(c) === k),
        y: data.b.candidates.find((c) => keyOf(c) === k),
      }))
    : [];
  const delta = (x?: number | null, y?: number | null) => {
    if (x === null || x === undefined || y === null || y === undefined) return <span className={muted}>—</span>;
    const d = y - x;
    return <span className={"tabular-nums font-medium " + (d > 0.5 ? "text-[#15803d] dark:text-[#86efac]" : d < -0.5 ? "text-[#b91c1c] dark:text-[#fca5a5]" : "")}>{d > 0 ? "+" : ""}{d.toFixed(1)}</span>;
  };
  const opt = runs.map((r) => (
    <option key={r.id} value={r.id}>
      {r.label} — {when(r.createdAt)} · prompt {r.promptVersion}
    </option>
  ));
  return (
    <div className={card}>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className={muted}>Lần chạy A (trước)</span>
          <select className={field} value={a} onChange={(e) => setA(e.target.value)}>
            <option value="">—</option>
            {opt}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className={muted}>Lần chạy B (sau)</span>
          <select className={field} value={b} onChange={(e) => setB(e.target.value)}>
            <option value="">—</option>
            {opt}
          </select>
        </label>
      </div>
      {err && <Msg m={{ ok: false, text: err }} />}
      {data && (
        <>
          {data.a.datasetKey !== data.b.datasetKey && <p className="mt-3 text-xs text-[#b45309]">Hai lần chạy dùng bộ dữ liệu khác nhau — điểm không so sánh trực tiếp được.</p>}
          <p className={`mt-3 text-xs ${muted}`}>
            A: prompt {data.a.promptVersion}, t={data.a.temperature}, {data.a.caseCount} câu · B: prompt {data.b.promptVersion}, t={data.b.temperature}, {data.b.caseCount} câu. Ghép theo
            nhà cung cấp + model.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-xs">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className={th}>Model</th>
                  <th className={th}>Tổng A → B</th>
                  {TASKS.map((t) => (
                    <th key={t} className={th}>
                      {TASK_LABEL[t]} Δ
                    </th>
                  ))}
                  <th className={th}>Lỗi A → B</th>
                  <th className={th}>Thời gian A → B</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ k, x, y }) => (
                  <tr key={k} className="border-b border-[var(--border)] last:border-0">
                    <td className={td}>{k}</td>
                    <td className={`${td} tabular-nums`}>
                      {fmt(x?.overall.mean)} → {fmt(y?.overall.mean)} ({delta(x?.overall.mean, y?.overall.mean)})
                    </td>
                    {TASKS.map((t) => (
                      <td key={t} className={td}>
                        {delta(x?.byTask[t]?.mean, y?.byTask[t]?.mean)}
                      </td>
                    ))}
                    <td className={`${td} tabular-nums`}>
                      {fmt(x?.errorRate)}% → {fmt(y?.errorRate)}%
                    </td>
                    <td className={`${td} tabular-nums`}>
                      {secs(x?.latency?.median)} → {secs(y?.latency?.median)}
                    </td>
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

// ── Datasets ─────────────────────────────────────────────────────────────

function DatasetsTab({ datasets, reload }: { datasets: Dataset[]; reload: () => Promise<void> }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string; problems?: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [picked, setSel] = useState<string>("");
  const sel = picked || datasets[0]?.key || "";
  const [stats, setStats] = useState<{ cells: { task: Task; level: Level; split: string; n: number }[] } | null>(null);
  const [fallback, setFallback] = useState({ name: "", version: "" });
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!sel) return;
    void api<{ cells: { task: Task; level: Level; split: string; n: number }[] }>(`${API}/datasets/${encodeURIComponent(sel)}/stats`).then((r) => setStats(r.ok ? r.data : null));
  }, [sel]);

  async function importBundled() {
    setBusy(true);
    const r = await api<{ key: string; imported: boolean; caseCount: number }>(`${API}/datasets/import-bundled`, { method: "POST" });
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: r.data.imported ? `Đã nhập ${r.data.key} (${r.data.caseCount} câu).` : `${r.data.key} đã có sẵn.` } : { ok: false, text: r.error });
    await reload();
  }
  async function upload() {
    const f = fileRef.current?.files?.[0];
    if (!f) return;
    setBusy(true);
    const text = await f.text();
    const format = f.name.endsWith(".jsonl") ? "jsonl" : "json";
    const p = new URLSearchParams({ format, ...(fallback.name ? { name: fallback.name } : {}), ...(fallback.version ? { version: fallback.version } : {}) });
    const r = await api<{ key: string; imported: boolean; caseCount: number; warnings: number }>(`${API}/datasets/upload?${p}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-eval-dataset" },
      body: text,
    });
    setBusy(false);
    setMsg(
      r.ok
        ? { ok: true, text: `${r.data.imported ? "Đã nhập" : "Đã có sẵn"} ${r.data.key} (${r.data.caseCount} câu${r.data.warnings ? `, ${r.data.warnings} câu trùng nội dung` : ""}).` }
        : { ok: false, text: r.error, problems: r.problems },
    );
    await reload();
  }

  const ds = datasets.find((d) => d.key === sel);
  const count = (t: Task, l: Level, split?: string) => (stats?.cells ?? []).filter((c) => c.task === t && c.level === l && (!split || c.split === split)).reduce((a, c) => a + c.n, 0);

  return (
    <div className="flex flex-col gap-5">
      <section className={card}>
        <h2 className="text-sm font-semibold">Nhập bộ dữ liệu</h2>
        <p className={`mt-1 text-xs ${muted}`}>
          Mỗi phiên bản là bất biến: nhập lại cùng tên + version mà nội dung khác sẽ bị từ chối — sửa đáp án tham chiếu thì tăng version, bản cũ vẫn giữ để chạy lại được. Hỗ trợ JSON (
          {"{dataset_name, version, cases: [...]}"}) và JSONL (mỗi dòng một câu).
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <button type="button" className={btn} disabled={busy} onClick={() => void importBundled()}>
            Nhập bộ kèm theo ứng dụng (v2, 1000 câu)
          </button>
          <input ref={fileRef} type="file" accept=".json,.jsonl,application/json" className="text-xs" aria-label="Tệp bộ dữ liệu" />
          <input className={`${field} w-40`} placeholder="tên (nếu JSONL không có)" value={fallback.name} onChange={(e) => setFallback({ ...fallback, name: e.target.value })} />
          <input className={`${field} w-28`} placeholder="version" value={fallback.version} onChange={(e) => setFallback({ ...fallback, version: e.target.value })} />
          <button type="button" className={btn} disabled={busy} onClick={() => void upload()}>
            Tải lên
          </button>
        </div>
        <Msg m={msg} />
      </section>

      {datasets.length > 0 && (
        <section className={card}>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold">Bộ dữ liệu đã nhập</h2>
            <select aria-label="Bộ dữ liệu" className={field} value={sel} onChange={(e) => setSel(e.target.value)}>
              {datasets.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.key}
                </option>
              ))}
            </select>
          </div>
          {ds && (
            <>
              <p className={`mt-2 text-xs ${muted}`}>
                {ds.caseCount} câu · trạng thái {ds.status} · nhập {when(ds.importedAt)} ({ds.source}) · checksum {ds.checksum.slice(0, 12)}…
                {ds.duplicateCount ? ` · ${ds.duplicateCount} câu trùng hệt nội dung câu khác` : ""}
              </p>
              {ds.qualityNotice && <p className="mt-2 rounded-lg border border-[#f59e0b55] bg-[#f59e0b14] p-2 text-xs">{ds.qualityNotice}</p>}
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className={th} />
                      {LEVELS.map((l) => (
                        <th key={l} className={th}>
                          {l}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {TASKS.map((t) => (
                      <tr key={t} className="border-b border-[var(--border)] last:border-0">
                        <td className={`${td} font-medium`}>{TASK_LABEL[t]}</td>
                        {LEVELS.map((l) => (
                          <td key={l} className={`${td} tabular-nums`}>
                            {count(t, l)}{" "}
                            <span className={muted}>
                              ({SPLITS.map((s) => count(t, l, s)).join("/")})
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className={`mt-1 text-[11px] ${muted}`}>Trong ngoặc: dev / val / test (chia theo câu gốc để các biến thể của một câu không lọt sang tập test).</p>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

// ── Prices ───────────────────────────────────────────────────────────────

function PricesTab({ services }: { services: Service[] }) {
  const [rows, setRows] = useState<{ key: string; input: string; output: string }[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    void api<Record<string, { input: number; output: number }>>(`${API}/prices`).then((r) => {
      const have = r.ok ? r.data : {};
      const keys = new Set([...Object.keys(have), ...services.map((s) => `${s.provider}:${s.model}`)]);
      setRows([...keys].map((k) => ({ key: k, input: have[k] ? String(have[k].input) : "", output: have[k] ? String(have[k].output) : "" })));
    });
  }, [services]);
  async function save() {
    const prices = Object.fromEntries(rows.filter((r) => r.key && r.input !== "" && r.output !== "").map((r) => [r.key.trim(), { input: Number(r.input), output: Number(r.output) }]));
    const r = await api(`${API}/prices`, { method: "PUT", body: JSON.stringify({ prices }) });
    setMsg(r.ok ? { ok: true, text: "Đã lưu giá. Báo cáo tính chi phí theo giá hiện tại khi mở." } : { ok: false, text: r.error });
  }
  return (
    <div className={card}>
      <h2 className="text-sm font-semibold">Giá token (USD / 1 triệu token)</h2>
      <p className={`mt-1 text-xs ${muted}`}>
        Dùng để ước tính chi phí trong báo cáo. Khoá dạng <code>provider:model</code>, hoặc <code>provider:*</code> cho mọi model của nhà cung cấp. Bỏ trống = chưa có giá (báo cáo ghi “chưa có
        giá”); gói miễn phí nhập 0.
      </p>
      <table className="mt-3 w-full text-xs">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className={th}>provider:model</th>
            <th className={th}>Vào</th>
            <th className={th}>Ra</th>
            <th className={th} />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-[var(--border)] last:border-0">
              <td className={td}>
                <input aria-label="provider:model" className={`${field} w-full`} value={r.key} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} />
              </td>
              <td className={td}>
                <input aria-label="Giá vào" className={`${field} w-24`} inputMode="decimal" value={r.input} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, input: e.target.value } : x)))} />
              </td>
              <td className={td}>
                <input aria-label="Giá ra" className={`${field} w-24`} inputMode="decimal" value={r.output} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, output: e.target.value } : x)))} />
              </td>
              <td className={td}>
                <button type="button" className={btn} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                  Bỏ
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex gap-2">
        <button type="button" className={btn} onClick={() => setRows([...rows, { key: "", input: "", output: "" }])}>
          + Thêm dòng
        </button>
        <button type="button" className={btn} onClick={() => void save()}>
          Lưu
        </button>
      </div>
      <Msg m={msg} />
    </div>
  );
}
