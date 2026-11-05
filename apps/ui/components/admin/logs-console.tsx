"use client";

import { TrafficPanel } from "@/components/admin/traffic-panel";
import { useCallback, useEffect, useState } from "react";

interface LogItem {
  id: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  user: string | null;
  role: string | null;
  ip: string | null;
  userAgent: string | null;
  error: string | null;
  createdAt: string;
}
interface LogPage {
  page: number;
  limit: number;
  total: number;
  items: LogItem[];
}
interface AppLogItem {
  id: string;
  level: "log" | "warn" | "error";
  context: string | null;
  message: string;
  stack: string | null;
  exception: string | null;
  status: number | null;
  request: string | null;
  user: string | null;
  ip: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}
interface AppLogPage {
  page: number;
  limit: number;
  total: number;
  items: AppLogItem[];
}
interface AuditItem {
  id: string;
  actor: string | null;
  role: string | null;
  method: string;
  path: string;
  ok: boolean;
  status: number | null;
  ip: string | null;
  body: Record<string, unknown> | null;
  createdAt: string;
}
interface AuditPage {
  page: number;
  limit: number;
  total: number;
  items: AuditItem[];
}
interface Summary {
  total: number;
  ok: number;
  clientErrors: number;
  serverErrors: number;
  avgMs: number;
}

const LIMIT = 50;
type Range = "day" | "week" | "month";
const RANGES: { key: Range; label: string; cardLabel: string }[] = [
  { key: "day", label: "Ngày", cardLabel: "24 giờ" },
  { key: "week", label: "Tuần", cardLabel: "7 ngày" },
  { key: "month", label: "Tháng", cardLabel: "30 ngày" },
];
const field =
  "rounded-lg border border-[var(--border)] bg-[var(--background-1)] px-3 py-2 text-sm text-[var(--foreground)]";

function statusColor(s: number) {
  if (s >= 500) return "text-red-500";
  if (s >= 400) return "text-amber-500";
  return "text-emerald-500";
}

/** Admin request-log viewer: 24 h summary + filterable, paginated table. */
export function LogsConsole() {
  const [q, setQ] = useState("");
  const [method, setMethod] = useState("");
  const [statusClass, setStatusClass] = useState("");
  const [range, setRange] = useState<Range>("day");
  const [date, setDate] = useState("");
  // Current time must not be read during prerender (Next 16): set after mount.
  const [today, setToday] = useState("");
  useEffect(() => {
    const t = setTimeout(
      () => setToday(new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" })),
      0,
    );
    return () => clearTimeout(t);
  }, []);
  const [tab, setTab] = useState<"requests" | "app" | "audit" | "traffic">("requests");
  const [level, setLevel] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LogPage | null>(null);
  const [appData, setAppData] = useState<AppLogPage | null>(null);
  const [auditData, setAuditData] = useState<AuditPage | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (tab === "traffic") return;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (date) params.set("date", date);
    else params.set("range", range);
    if (q.trim()) params.set("q", q.trim());
    if (tab === "app") {
      params.set("view", "app");
      if (level) params.set("level", level);
    } else if (tab === "audit") {
      params.set("view", "audit");
      if (method) params.set("method", method);
    } else {
      if (method) params.set("method", method);
      if (statusClass) params.set("statusClass", statusClass);
    }
    const [res, sum] = await Promise.all([
      fetch(`/api/admin/logs?${params}`, { cache: "no-store" }).catch(() => null),
      fetch(`/api/admin/logs?view=summary&${date ? `date=${date}` : `range=${range}`}`, { cache: "no-store" }).catch(() => null),
    ]);
    if (res?.ok) {
      if (tab === "app") setAppData((await res.json()) as AppLogPage);
      else if (tab === "audit") setAuditData((await res.json()) as AuditPage);
      else setData((await res.json()) as LogPage);
      setError(null);
    } else {
      setError(res?.status === 403 ? "Không đủ quyền xem nhật ký." : "Không tải được nhật ký.");
    }
    if (sum?.ok) setSummary((await sum.json()) as Summary);
    setLoading(false);
  }, [page, q, method, statusClass, tab, level, range, date]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  async function exportCsv() {
    setError(null);
    const params = new URLSearchParams({ view: "export", type: tab === "audit" ? "audit" : tab === "app" ? "app" : "requests" });
    if (date) params.set("date", date);
    else params.set("range", range);
    if (q.trim()) params.set("q", q.trim());
    if (tab === "app" && level) params.set("level", level);
    if (tab === "requests") {
      if (method) params.set("method", method);
      if (statusClass) params.set("statusClass", statusClass);
    }
    if (tab === "audit" && method) params.set("method", method);
    const res = await fetch(`/api/admin/logs?${params}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) {
      setError("Không xuất được CSV.");
      return;
    }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `${params.get("type")}-logs-${date || range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const total = (tab === "app" ? appData : tab === "audit" ? auditData : data)?.total;
  const pages = total ? Math.max(1, Math.ceil(total / LIMIT)) : 1;
  const cards = [
    { label: `Request ${date ? date : RANGES.find((r) => r.key === range)?.cardLabel}`, value: summary?.total },
    { label: "Thành công", value: summary?.ok },
    { label: "Lỗi client (4xx)", value: summary?.clientErrors },
    { label: "Lỗi server (5xx)", value: summary?.serverErrors },
    { label: "TB (ms)", value: summary?.avgMs },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">Nhật ký hệ thống</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Request, log ứng dụng & lỗi, thao tác admin và truy cập tới backend (log lưu 30 ngày, thao tác admin lưu 1 năm).
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">{c.label}</dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums text-[var(--foreground)]">{c.value ?? "—"}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
      <div role="tablist" className="flex flex-wrap gap-2">
        {([["requests", "Request"], ["app", "Log ứng dụng & lỗi"], ["audit", "Thao tác admin"], ["traffic", "Truy cập & chặn IP"]] as const).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => { setTab(k); setPage(1); setError(null); }}
            className={
              "rounded-full border px-4 py-1.5 text-sm font-medium " +
              (tab === k
                ? "border-[color-mix(in_srgb,var(--primary)_45%,transparent)] bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-[var(--primary)]"
                : "border-[var(--border)] text-[var(--muted-foreground)]")
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div role="group" aria-label="Khoảng thời gian" className="inline-flex rounded-full border border-[var(--border)] p-0.5">
        {RANGES.map((r) => (
          <button
            key={r.key}
            aria-pressed={!date && range === r.key}
            onClick={() => { setRange(r.key); setDate(""); setPage(1); }}
            className={
              "rounded-full px-3.5 py-1 text-sm font-medium " +
              (!date && range === r.key
                ? "bg-[var(--primary)] text-[var(--primary-foreground,#fff)]"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]")
            }
          >
            {r.label}
          </button>
        ))}
      </div>
      <label className="inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
        Ngày cụ thể
        <input
          type="date"
          className={field}
          value={date}
          max={today || undefined}
          onChange={(e) => { setDate(e.target.value); setPage(1); }}
        />
        {date && (
          <button className="text-xs font-semibold text-[var(--primary)] hover:underline" onClick={() => { setDate(""); setPage(1); }}>
            Bỏ chọn
          </button>
        )}
      </label>
      </div>

      {tab === "traffic" ? (
        <TrafficPanel range={range} date={date} />
      ) : (
      <>
      <div className="mt-4 flex flex-wrap gap-2">
        <input
          className={field + " min-w-48 flex-1"}
          placeholder={tab === "app" ? "Tìm trong nội dung / context…" : "Lọc theo đường dẫn…"}
          aria-label="Tìm kiếm"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
        />
        {tab === "app" ? (
          <select className={field} aria-label="Mức độ" value={level} onChange={(e) => { setLevel(e.target.value); setPage(1); }}>
            <option value="">Mọi mức</option>
            {["error", "warn", "log"].map((l) => <option key={l}>{l}</option>)}
          </select>
        ) : (<>
        <select className={field} aria-label="Method" value={method} onChange={(e) => { setMethod(e.target.value); setPage(1); }}>
          <option value="">Mọi method</option>
          {(tab === "audit" ? ["POST", "PUT", "PATCH", "DELETE"] : ["GET", "POST", "PUT", "PATCH", "DELETE"]).map((m) => <option key={m}>{m}</option>)}
        </select>
        {tab !== "audit" && <select className={field} aria-label="Trạng thái" value={statusClass} onChange={(e) => { setStatusClass(e.target.value); setPage(1); }}>
          <option value="">Mọi trạng thái</option>
          {["2xx", "3xx", "4xx", "5xx"].map((s) => <option key={s}>{s}</option>)}
        </select>}
        </>)}
        <button
          className={field + " hover:bg-[var(--layer-hover)]"}
          onClick={() => void exportCsv()}
          title="Xuất CSV theo bộ lọc hiện tại (tối đa 10.000 dòng)"
        >
          Xuất CSV
        </button>
        <button
          className={field + " hover:bg-[var(--layer-hover)]"}
          onClick={() => void load()}
          disabled={loading}
          aria-label="Làm mới"
          title="Làm mới"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={"size-4 " + (loading ? "animate-spin" : "")}
          >
            <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" />
          </svg>
        </button>
      </div>

      {error && <p role="alert" className="mt-4 text-sm text-red-500">{error}</p>}

      {tab === "audit" ? (
        <ul className="mt-4 divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)]">
          {auditData?.items.map((r) => (
            <li key={r.id} className="px-3 py-2.5 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className={"text-xs font-semibold " + (r.ok ? "text-emerald-500" : "text-red-500")}>
                  {r.ok ? "Thành công" : `Thất bại${r.status ? ` (${r.status})` : ""}`}
                </span>
                <span className="text-xs tabular-nums text-[var(--muted-foreground)]">{new Date(r.createdAt).toLocaleString("vi-VN")}</span>
                <span className="font-mono text-xs">{r.method} {r.path}</span>
              </div>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                {[r.actor ?? "?", r.role, r.ip && `ip: ${r.ip}`].filter(Boolean).join(" · ")}
              </p>
              {r.body && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-[var(--primary)]">Dữ liệu gửi lên</summary>
                  <pre className="mt-1 overflow-x-auto rounded-lg bg-[var(--background-1)] p-3 text-xs leading-relaxed">{JSON.stringify(r.body, null, 2)}</pre>
                </details>
              )}
            </li>
          ))}
          {auditData && auditData.items.length === 0 && (
            <li className="px-3 py-8 text-center text-[var(--muted-foreground)]">Chưa có thao tác nào.</li>
          )}
        </ul>
      ) : tab === "app" ? (
        <ul className="mt-4 divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)]">
          {appData?.items.map((r) => (
            <li key={r.id} className="px-3 py-2.5 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className={"font-mono text-xs font-semibold uppercase " + (r.level === "error" ? "text-red-500" : r.level === "warn" ? "text-amber-500" : "text-emerald-500")}>{r.level}</span>
                <span className="text-xs tabular-nums text-[var(--muted-foreground)]">{new Date(r.createdAt).toLocaleString("vi-VN")}</span>
                {r.context && <span className="font-mono text-xs text-[var(--muted-foreground)]">[{r.context}]</span>}
              </div>
              <p className="mt-1 break-words">{r.message}</p>
              {(r.exception || r.user || r.ip) && (
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  {[r.exception, r.user && `user: ${r.user}`, r.ip && `ip: ${r.ip}`].filter(Boolean).join(" · ")}
                </p>
              )}
              {r.details && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-[var(--primary)]">Chi tiết lỗi</summary>
                  <pre className="mt-1 overflow-x-auto rounded-lg bg-[var(--background-1)] p-3 text-xs leading-relaxed">{JSON.stringify(r.details, null, 2)}</pre>
                </details>
              )}
              {r.stack && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-[var(--primary)]">Stack trace</summary>
                  <pre className="mt-1 overflow-x-auto rounded-lg bg-[var(--background-1)] p-3 text-xs leading-relaxed">{r.stack}</pre>
                </details>
              )}
            </li>
          ))}
          {appData && appData.items.length === 0 && (
            <li className="px-3 py-8 text-center text-[var(--muted-foreground)]">Chưa có bản ghi.</li>
          )}
        </ul>
      ) : (
      <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--border)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--background-1)] text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
            <tr>
              <th className="px-3 py-2">Thời gian</th>
              <th className="px-3 py-2">Method</th>
              <th className="px-3 py-2">Đường dẫn</th>
              <th className="px-3 py-2">Mã</th>
              <th className="px-3 py-2">ms</th>
              <th className="px-3 py-2">Người dùng</th>
              <th className="px-3 py-2">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {data?.items.map((r) => (
              <tr key={r.id} title={r.userAgent ?? undefined}>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[var(--muted-foreground)]">
                  {new Date(r.createdAt).toLocaleString("vi-VN")}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{r.method}</td>
                <td className="max-w-xs px-3 py-2 font-mono text-xs" title={r.path}>
                  <div className="truncate">{r.path}</div>
                  {r.error && <div className="truncate text-red-500" title={r.error}>{r.error}</div>}
                </td>
                <td className={"px-3 py-2 font-semibold tabular-nums " + statusColor(r.status)}>{r.status}</td>
                <td className="px-3 py-2 tabular-nums">{r.durationMs}</td>
                <td className="max-w-40 truncate px-3 py-2">{r.user ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.ip ?? "—"}</td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-[var(--muted-foreground)]">Chưa có bản ghi.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      <div className="mt-4 flex items-center justify-between text-sm text-[var(--muted-foreground)]">
        <span>{total !== undefined ? `${total} bản ghi` : ""}</span>
        <div className="flex items-center gap-2">
          <button className={field} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>←</button>
          <span className="tabular-nums">{page} / {pages}</span>
          <button className={field} disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>→</button>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
