"use client";

import { useCallback, useEffect, useState } from "react";

interface Live {
  maxRequests: number;
  windowSec: number;
  blockMinutes: number;
  blockedCount: number;
  counters: { ip: string; count: number; windowEndsInSec: number }[];
}
interface WhoAmI {
  ip: string;
  forwardedFor: string | null;
  trustProxy: boolean;
  internal: boolean;
  blocked: boolean;
}
interface SimResult {
  requests: number;
  intervalMs: number;
  blockedAtRequest: number | null;
  maxRequests: number;
  windowSec: number;
  blockMinutes: number;
}

const field =
  "rounded-lg border border-[var(--border)] bg-[var(--background-1)] px-3 py-2 text-sm text-[var(--foreground)]";

/** Live flood-protection monitor + self-checks (IP seen by the API, dry-run). */
export function ProtectionPanel() {
  const [live, setLive] = useState<Live | null>(null);
  const [me, setMe] = useState<WhoAmI | null>(null);
  const [auto, setAuto] = useState(true);
  const [requests, setRequests] = useState("500");
  const [interval, setIntervalMs] = useState("10");
  const [sim, setSim] = useState<SimResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    const res = await fetch("/api/admin/logs?view=protection", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setLive((await res.json()) as Live);
  }, []);

  const checkMe = useCallback(async () => {
    const res = await fetch("/api/admin/logs?view=whoami", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setMe((await res.json()) as WhoAmI);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { void poll(); void checkMe(); }, 0);
    return () => clearTimeout(t);
  }, [poll, checkMe]);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => void poll(), 3000);
    return () => clearInterval(id);
  }, [auto, poll]);

  async function runSim(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/admin/logs?view=simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests: Number(requests), intervalMs: Number(interval) }),
    }).catch(() => null);
    if (res?.ok) setSim((await res.json()) as SimResult);
    else setError("Giá trị không hợp lệ.");
  }

  const rate = sim && sim.intervalMs > 0 ? (1000 / sim.intervalMs).toFixed(1) : null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Giám sát & kiểm thử chống flood</h2>
        <label className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          Tự cập nhật (3s)
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4 text-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">Ngưỡng hiện tại</p>
          <p className="mt-1">
            Chặn khi &gt; <b>{live?.maxRequests ?? "—"}</b> request / <b>{live?.windowSec ?? "—"}s</b> → khoá <b>{live?.blockMinutes ?? "—"}</b> phút
          </p>
          <p className="mt-1 text-[var(--muted-foreground)]">Đang chặn: {live?.blockedCount ?? "—"} IP</p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4 text-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">API nhìn thấy IP của bạn</p>
          {me ? (
            <>
              <p className="mt-1 font-mono">{me.ip}</p>
              <ul className="mt-1 space-y-0.5 text-xs text-[var(--muted-foreground)]">
                <li>TRUST_PROXY: {me.trustProxy ? "bật" : "tắt"}</li>
                <li>X-Forwarded-For: {me.forwardedFor ?? "không có"}</li>
                <li>{me.internal ? "IP nội bộ — không bị tự động chặn" : "IP công khai — có thể bị tự động chặn"}</li>
              </ul>
              {me.internal && (
                <p className="mt-2 text-xs text-amber-500">
                  Đây là IP nội bộ: nếu bạn đang ở ngoài mạng nội bộ, hãy bật <code>TRUST_PROXY</code> để thấy IP thật.
                </p>
              )}
            </>
          ) : (
            <p className="mt-1 text-[var(--muted-foreground)]">…</p>
          )}
          <button className={field + " mt-2 text-xs hover:bg-[var(--layer-hover)]"} onClick={() => void checkMe()}>Kiểm tra lại</button>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">Bộ đếm theo IP trong cửa sổ hiện tại</p>
        <div className="mt-2 overflow-x-auto rounded-2xl border border-[var(--border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--background-1)] text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
              <tr><th className="px-3 py-2">IP</th><th className="px-3 py-2">Request</th><th className="px-3 py-2">Mức ngưỡng</th><th className="px-3 py-2">Reset sau</th></tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {live?.counters.map((c) => {
                const pct = Math.min(100, Math.round((c.count / live.maxRequests) * 100));
                return (
                  <tr key={c.ip}>
                    <td className="px-3 py-2 font-mono text-xs">{c.ip}</td>
                    <td className="px-3 py-2 tabular-nums">{c.count}</td>
                    <td className="w-48 px-3 py-2">
                      <div className="h-2 rounded bg-[var(--border)]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                        <div className={"h-2 rounded " + (pct >= 80 ? "bg-red-500" : pct >= 50 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{c.windowEndsInSec}s</td>
                  </tr>
                );
              })}
              {live && live.counters.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-5 text-center text-[var(--muted-foreground)]">Không có IP công khai nào đang truy cập.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <form onSubmit={runSim} className="rounded-2xl border border-[var(--border)] p-4">
        <p className="text-sm font-semibold">Chạy thử bộ giới hạn (mô phỏng, không chặn ai)</p>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Giả lập một client lạ gửi N request, mỗi request cách nhau X ms, để xem ngưỡng có kích hoạt không.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs text-[var(--muted-foreground)]">Số request
            <input className={field + " mt-1 block w-28"} type="number" min={1} value={requests} onChange={(e) => setRequests(e.target.value)} />
          </label>
          <label className="text-xs text-[var(--muted-foreground)]">Cách nhau (ms)
            <input className={field + " mt-1 block w-28"} type="number" min={0} value={interval} onChange={(e) => setIntervalMs(e.target.value)} />
          </label>
          <button className={field + " font-semibold hover:bg-[var(--layer-hover)]"} type="submit">Chạy thử</button>
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-red-500">{error}</p>}
        {sim && (
          <p className="mt-3 text-sm" role="status">
            {sim.blockedAtRequest ? (
              <>🛑 Sẽ <b>bị chặn</b> ở request thứ <b>{sim.blockedAtRequest}</b> (khoá {sim.blockMinutes} phút).</>
            ) : (
              <>✅ <b>Không bị chặn</b> sau {sim.requests} request{rate ? ` (~${rate} req/s)` : ""}.</>
            )}
          </p>
        )}
      </form>
    </section>
  );
}
