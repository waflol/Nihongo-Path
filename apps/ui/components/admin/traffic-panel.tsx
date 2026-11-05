"use client";

import { ProtectionPanel } from "@/components/admin/protection-panel";
import { useCallback, useEffect, useState } from "react";

interface Traffic {
  uniqueIps: number;
  topIps: { ip: string; requests: number; errors: number; lastSeen: string }[];
  hourly: { hour: string; requests: number; errors: number }[];
}
interface Allowed {
  ip: string;
  note: string | null;
  source: "env" | "admin";
  createdAt: string | null;
}
interface Blocked {
  ip: string;
  reason: string | null;
  auto: boolean;
  createdBy: string | null;
  createdAt: string;
  expiresAt: string | null;
}

const field =
  "rounded-lg border border-[var(--border)] bg-[var(--background-1)] px-3 py-2 text-sm text-[var(--foreground)]";

/** Traffic stats (last 24 h) and the IP deny-list. */
export function TrafficPanel({ range, date }: { range: "day" | "week" | "month"; date: string }) {
  const byHour = Boolean(date) || range === "day";
  const spanLabel = date || (range === "day" ? "24 giờ" : range === "week" ? "7 ngày" : "30 ngày");
  const [traffic, setTraffic] = useState<Traffic | null>(null);
  const [blocked, setBlocked] = useState<Blocked[]>([]);
  const [allowed, setAllowed] = useState<Allowed[]>([]);
  const [allowIp, setAllowIp] = useState("");
  const [allowNote, setAllowNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ip, setIp] = useState("");
  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState("");

  const load = useCallback(async () => {
    const [t, b, a] = await Promise.all([
      fetch(`/api/admin/logs?view=traffic&${date ? `date=${date}` : `range=${range}`}`, { cache: "no-store" }).catch(() => null),
      fetch("/api/admin/logs?view=blocked", { cache: "no-store" }).catch(() => null),
      fetch("/api/admin/logs?view=allowed", { cache: "no-store" }).catch(() => null),
    ]);
    if (a?.ok) setAllowed((await a.json()) as Allowed[]);
    if (t?.ok) setTraffic((await t.json()) as Traffic);
    else setError("Không tải được thống kê truy cập.");
    if (b?.ok) setBlocked((await b.json()) as Blocked[]);
  }, [range, date]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function block(target: string, why?: string, mins?: number) {
    setError(null);
    const res = await fetch("/api/admin/logs?view=blocked", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip: target, reason: why || undefined, minutes: mins }),
    }).catch(() => null);
    if (!res?.ok) {
      setError("Không chặn được IP (kiểm tra định dạng).");
      return;
    }
    await load();
  }

  async function allow(target: string, note?: string) {
    setError(null);
    const res = await fetch("/api/admin/logs?view=allowed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip: target, note: note || undefined }),
    }).catch(() => null);
    if (!res?.ok) {
      setError("Không thêm được IP vào danh sách cho phép.");
      return;
    }
    await load();
  }

  async function disallow(target: string) {
    await fetch(`/api/admin/logs?view=allowed&ip=${encodeURIComponent(target)}`, { method: "DELETE" }).catch(() => null);
    await load();
  }

  async function unblock(target: string) {
    await fetch(`/api/admin/logs?view=blocked&ip=${encodeURIComponent(target)}`, { method: "DELETE" }).catch(() => null);
    await load();
  }

  const isBlocked = (v: string) => blocked.some((b) => b.ip === v);
  const peak = Math.max(1, ...(traffic?.hourly.map((h) => h.requests) ?? [1]));
  const total = traffic?.hourly.reduce((n, h) => n + h.requests, 0);

  return (
    <div className="mt-4 space-y-8">
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

      <ProtectionPanel />

      <section>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            [`Request ${spanLabel}`, total],
            ["IP khác nhau", traffic?.uniqueIps],
            ["IP đang bị chặn", blocked.length],
          ].map(([label, v]) => (
            <div key={String(label)} className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">{label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{v ?? "—"}</p>
            </div>
          ))}
        </div>

        <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Lượt truy cập theo {byHour ? "giờ" : "ngày"}</h2>
        <div className="mt-2 flex h-32 items-end gap-1 rounded-2xl border border-[var(--border)] p-3" role="img" aria-label="Biểu đồ lượt truy cập">
          {traffic?.hourly.map((h) => (
            <div
              key={h.hour}
              className="flex-1 rounded-t bg-[var(--primary)]"
              style={{ height: `${Math.max(3, (h.requests / peak) * 100)}%` }}
              title={`${new Date(h.hour).toLocaleString("vi-VN")} — ${h.requests} request, ${h.errors} lỗi`}
            />
          ))}
          {traffic && traffic.hourly.length === 0 && (
            <p className="m-auto text-sm text-[var(--muted-foreground)]">Chưa có dữ liệu.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">IP truy cập nhiều nhất ({spanLabel})</h2>
        <div className="mt-2 overflow-x-auto rounded-2xl border border-[var(--border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--background-1)] text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2">IP</th>
                <th className="px-3 py-2">Request</th>
                <th className="px-3 py-2">Lỗi</th>
                <th className="px-3 py-2">Lần cuối</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {traffic?.topIps.map((r) => (
                <tr key={r.ip}>
                  <td className="px-3 py-2 font-mono text-xs">{r.ip}</td>
                  <td className="px-3 py-2 tabular-nums">{r.requests}</td>
                  <td className="px-3 py-2 tabular-nums">{r.errors}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-[var(--muted-foreground)]">{new Date(r.lastSeen).toLocaleString("vi-VN")}</td>
                  <td className="px-3 py-2 text-right">
                    {allowed.some((a) => a.ip === r.ip) ? (
                      <span className="text-xs text-emerald-500">Cho phép</span>
                    ) : isBlocked(r.ip) ? (
                      <span className="text-xs text-[var(--muted-foreground)]">Đã chặn</span>
                    ) : (
                      <button
                        className="text-xs font-semibold text-red-500 hover:underline"
                        onClick={() => { if (confirm(`Chặn ${r.ip}?`)) void block(r.ip, "Chặn thủ công từ thống kê"); }}
                      >
                        Chặn
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {traffic && traffic.topIps.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-[var(--muted-foreground)]">Chưa có dữ liệu.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          Nếu mọi request cùng một IP nội bộ (127.0.0.1…), hãy đặt <code>TRUST_PROXY</code> cho API để lấy IP thật của người dùng.
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Danh sách IP bị chặn</h2>
        <form
          className="mt-2 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ip.trim()) return;
            void block(ip.trim(), reason.trim(), minutes ? Number(minutes) : undefined).then(() => {
              setIp(""); setReason(""); setMinutes("");
            });
          }}
        >
          <input className={field + " w-44"} placeholder="Địa chỉ IP" aria-label="Địa chỉ IP" value={ip} onChange={(e) => setIp(e.target.value)} />
          <input className={field + " min-w-40 flex-1"} placeholder="Lý do (tuỳ chọn)" aria-label="Lý do" value={reason} onChange={(e) => setReason(e.target.value)} />
          <input className={field + " w-36"} type="number" min={1} placeholder="Số phút (trống = vĩnh viễn)" aria-label="Số phút" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          <button className={field + " font-semibold hover:bg-[var(--layer-hover)]"} type="submit">Chặn</button>
        </form>

        <ul className="mt-3 divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)]">
          {blocked.map((b) => (
            <li key={b.ip} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-sm">
              <span className="font-mono text-xs">{b.ip}</span>
              <span className="rounded-full border border-[var(--border)] px-2 text-xs">{b.auto ? "Tự động" : "Thủ công"}</span>
              <span className="min-w-0 flex-1 truncate text-[var(--muted-foreground)]" title={b.reason ?? undefined}>{b.reason ?? ""}</span>
              <span className="text-xs text-[var(--muted-foreground)]">
                {b.expiresAt ? `đến ${new Date(b.expiresAt).toLocaleString("vi-VN")}` : "vĩnh viễn"}
              </span>
              <button className="text-xs font-semibold text-[var(--primary)] hover:underline" onClick={() => void unblock(b.ip)}>Bỏ chặn</button>
            </li>
          ))}
          {blocked.length === 0 && (
            <li className="px-3 py-6 text-center text-[var(--muted-foreground)]">Chưa chặn IP nào.</li>
          )}
        </ul>
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          Tự động chặn IP gửi quá 300 request / 10 giây trong 15 phút (đổi bằng <code>RATE_BLOCK_MAX</code>, <code>RATE_BLOCK_WINDOW_SEC</code>, <code>RATE_BLOCK_MINUTES</code>). IP nội bộ không bị tự động chặn.
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">IP được cho phép (không bao giờ bị chặn)</h2>
        <form
          className="mt-2 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!allowIp.trim()) return;
            void allow(allowIp.trim(), allowNote.trim()).then(() => { setAllowIp(""); setAllowNote(""); });
          }}
        >
          <input className={field + " w-44"} placeholder="Địa chỉ IP" aria-label="IP cho phép" value={allowIp} onChange={(e) => setAllowIp(e.target.value)} />
          <input className={field + " min-w-40 flex-1"} placeholder="Ghi chú (vd: văn phòng, monitor)" aria-label="Ghi chú" value={allowNote} onChange={(e) => setAllowNote(e.target.value)} />
          <button className={field + " font-semibold hover:bg-[var(--layer-hover)]"} type="submit">Cho phép</button>
        </form>
        <ul className="mt-3 divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)]">
          {allowed.map((a) => (
            <li key={a.ip} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-sm">
              <span className="font-mono text-xs">{a.ip}</span>
              <span className="rounded-full border border-[var(--border)] px-2 text-xs">{a.source === "env" ? "Env" : "Admin"}</span>
              <span className="min-w-0 flex-1 truncate text-[var(--muted-foreground)]">{a.note ?? ""}</span>
              {a.source === "admin" && (
                <button className="text-xs font-semibold text-[var(--primary)] hover:underline" onClick={() => void disallow(a.ip)}>Gỡ</button>
              )}
            </li>
          ))}
          {allowed.length === 0 && (
            <li className="px-3 py-6 text-center text-[var(--muted-foreground)]">Chưa có IP nào trong danh sách cho phép.</li>
          )}
        </ul>
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          Thêm một IP vào đây sẽ đồng thời gỡ chặn nó. Có thể đặt sẵn qua biến môi trường <code>IP_ALLOWLIST</code> (phân tách bằng dấu phẩy).
        </p>
      </section>
    </div>
  );
}
