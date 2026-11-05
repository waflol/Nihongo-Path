"use client";

import { useEffect, useState } from "react";

type State = "running" | "ready" | "cooldown" | "error" | "disabled";

interface Row {
  id: string;
  label: string;
  providerName: string;
  model: string;
  keyHint: string;
  state: State;
  lastError: string;
  cooldownUntil: string | null;
  lastOkAt: string | null;
  ok: number;
  failed: number;
  cards: number;
  lastCallAt: string | null;
  lastCallError: string | null;
}

interface Activity {
  queued: number;
  reused: number;
  services: Row[];
}

const BADGE: Record<State, { text: string; cls: string }> = {
  running: { text: "● Đang chạy", cls: "bg-[#eff6ff] text-[#1d4ed8] dark:bg-[#12233f] dark:text-[#93c5fd]" },
  ready: { text: "✓ Sẵn sàng", cls: "bg-[#f0fdf4] text-[#15803d] dark:bg-[#10281a] dark:text-[#86efac]" },
  cooldown: { text: "⏸ Đang nghỉ", cls: "bg-[#fef9c3] text-[#a16207] dark:bg-[#3a3210] dark:text-[#fde047]" },
  error: { text: "✕ Lỗi", cls: "bg-[#fef2f2] text-[#b91c1c] dark:bg-[#2a1215] dark:text-[#fca5a5]" },
  disabled: { text: "Tắt", cls: "bg-[var(--layer)] text-[var(--muted-foreground)]" },
};

function ago(iso: string | null, now: number) {
  if (!iso) return "—";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} giây trước`;
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  return `${Math.floor(s / 86400)} ngày trước`;
}

function left(iso: string | null, now: number) {
  if (!iso) return "";
  const s = Math.round((new Date(iso).getTime() - now) / 1000);
  if (s <= 0) return "";
  return s < 60 ? `${s} giây` : s < 3600 ? `${Math.ceil(s / 60)} phút` : `${(s / 3600).toFixed(1)} giờ`;
}

/**
 * Live view of every AI key: running now, ready, resting after a limit,
 * failing — plus what it finished in the last 24 h. Refreshes every 3 s
 * while the tab is visible.
 */
export function AiActivityPanel() {
  const [data, setData] = useState<Activity | null>(null);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let off = false;
    async function load() {
      if (document.hidden) return;
      const res = await fetch("/api/flashcards/admin/ai/activity", { cache: "no-store" }).catch(() => null);
      if (off) return;
      if (!res?.ok) {
        setError(true);
        return;
      }
      setError(false);
      setData((await res.json().catch(() => null)) as Activity | null);
      setNow(Date.now());
    }
    void load();
    const t = window.setInterval(() => void load(), 3000);
    return () => {
      off = true;
      window.clearInterval(t);
    };
  }, []);

  const running = data?.services.filter((s) => s.state === "running").length ?? 0;
  const failing = data?.services.filter((s) => s.state === "error" || s.state === "cooldown").length ?? 0;

  return (
    <section className="px-4 pb-8 sm:px-6" aria-labelledby="ai-activity-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="ai-activity-title" className="text-lg font-semibold text-[var(--foreground)]">
          Theo dõi hoạt động
        </h2>
        <p className="text-sm text-[var(--muted-foreground)]" role="status">
          {data
            ? `${running} đang chạy · ${failing} lỗi/nghỉ · ${data.queued} thẻ đang chờ · ${data.reused} lượt dùng lại kết quả đã lưu`
            : error
              ? "Không tải được"
              : "Đang tải…"}
        </p>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data?.services.map((s) => {
          const b = BADGE[s.state];
          const wait = s.state === "cooldown" ? left(s.cooldownUntil, now) : "";
          return (
            <div key={s.id} className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-[var(--foreground)]">{s.label}</p>
                  <p className="truncate text-xs text-[var(--muted-foreground)]">
                    {s.providerName} · {s.model}
                    {s.keyHint ? ` · …${s.keyHint}` : ""}
                  </p>
                </div>
                <span className={"inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium " + b.cls}>
                  {s.state === "running" && (
                    <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-current" />
                  )}
                  {b.text}
                </span>
              </div>

              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-[var(--layer)] py-1.5">
                  <dt className="text-[11px] text-[var(--muted-foreground)]">Hoàn thành</dt>
                  <dd className="text-base font-semibold tabular-nums text-[#15803d] dark:text-[#86efac]">{s.ok}</dd>
                </div>
                <div className="rounded-lg bg-[var(--layer)] py-1.5">
                  <dt className="text-[11px] text-[var(--muted-foreground)]">Lỗi</dt>
                  <dd className={"text-base font-semibold tabular-nums " + (s.failed > 0 ? "text-[#b91c1c] dark:text-[#fca5a5]" : "text-[var(--foreground)]")}>
                    {s.failed}
                  </dd>
                </div>
                <div className="rounded-lg bg-[var(--layer)] py-1.5">
                  <dt className="text-[11px] text-[var(--muted-foreground)]">Thẻ xử lý</dt>
                  <dd className="text-base font-semibold tabular-nums text-[var(--foreground)]">{s.cards}</dd>
                </div>
              </dl>
              <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">24 giờ qua · gọi gần nhất: {ago(s.lastCallAt, now)}</p>

              {wait && <p className="mt-2 text-xs text-[#a16207] dark:text-[#fde047]">Nghỉ thêm {wait}</p>}
              {(s.state === "error" || s.state === "cooldown") && (s.lastError || s.lastCallError) && (
                <p className="mt-2 line-clamp-3 break-words rounded-lg bg-[#fef2f2] px-2.5 py-1.5 text-xs text-[#b91c1c] dark:bg-[#2a1215] dark:text-[#fca5a5]">
                  {s.lastError || s.lastCallError}
                </p>
              )}
            </div>
          );
        })}
        {data && data.services.length === 0 && (
          <p className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted-foreground)] sm:col-span-2 xl:col-span-3">
            Chưa có dịch vụ AI nào.
          </p>
        )}
      </div>
    </section>
  );
}
