"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/components/learn/use-confirm";
import { EntitlementCard, FEATURE_LABEL, type FeatureConfig } from "./entitlement-card";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background-1)]";

type Toast = { tone: "ok" | "err"; text: string } | null;

async function errorText(res: Response | null, fallback: string): Promise<string> {
  const msg = (await res?.json().catch(() => null)) as { message?: unknown } | null;
  if (typeof msg?.message === "string") return msg.message;
  if (Array.isArray(msg?.message)) return msg.message.join(", ");
  return fallback;
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--background-1)] px-4 py-3">
      <p className="text-xs font-medium text-[var(--muted-foreground)]">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${tone ?? "text-[var(--foreground)]"}`}>{value}</p>
    </div>
  );
}

/**
 * Admin entitlements console (P5-ADMIN-04 / P5-QUOTA-01): per-feature limits
 * by plan, reset period + timezone, BLOCK-vs-ALLOW policy, kill-switch and
 * delete. Edits take effect on the next request (no deploy); the API audits
 * every change with before/after snapshots.
 */
export function EntitlementsConsole() {
  const [features, setFeatures] = useState<FeatureConfig[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [query, setQuery] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/entitlements/features", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) {
      setLoadError(true);
      return;
    }
    setLoadError(false);
    setFeatures(((await res.json()) as FeatureConfig[]) ?? []);
  }, []);

  useEffect(() => {
    // Initial fetch; `load` only sets state once the request settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.tone === "ok" ? 2600 : 6000);
    return () => clearTimeout(t);
  }, [toast]);

  async function save(f: FeatureConfig): Promise<boolean> {
    setBusyKey(f.featureKey);
    const res = await fetch(`/api/admin/entitlements/features/${encodeURIComponent(f.featureKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: f.enabled, limits: f.limits, period: f.period, tz: f.tz, overLimit: f.overLimit }),
    }).catch(() => null);
    const ok = !!res?.ok;
    if (ok) {
      const saved = (await res.json()) as FeatureConfig;
      setFeatures((cur) => (cur ?? []).map((x) => (x.featureKey === saved.featureKey ? saved : x)));
      setToast({ tone: "ok", text: `Đã lưu ${FEATURE_LABEL[f.featureKey] ?? f.featureKey}` });
    } else {
      setToast({ tone: "err", text: await errorText(res, "Không lưu được cấu hình.") });
    }
    setBusyKey(null);
    return ok;
  }

  async function remove(f: FeatureConfig) {
    const name = FEATURE_LABEL[f.featureKey] ?? f.featureKey;
    const ok = await confirm({
      title: "Xoá cấu hình hạn mức?",
      message: `"${name}" sẽ không còn bị giới hạn: mọi gói dùng không giới hạn cho tới khi tạo lại cấu hình. Lịch sử lượt dùng vẫn được giữ.`,
      confirmLabel: "Xoá cấu hình",
      tone: "danger",
    });
    if (!ok) return;
    setBusyKey(f.featureKey);
    const res = await fetch(`/api/admin/entitlements/features/${encodeURIComponent(f.featureKey)}`, {
      method: "DELETE",
    }).catch(() => null);
    if (res?.ok) {
      setFeatures((cur) => (cur ?? []).filter((x) => x.featureKey !== f.featureKey));
      setToast({ tone: "ok", text: `Đã xoá ${name}` });
    } else {
      setToast({ tone: "err", text: await errorText(res, "Không xoá được cấu hình.") });
    }
    setBusyKey(null);
  }

  async function addFeature(raw: string) {
    const key = raw.trim();
    if (!key) return;
    if (features?.some((f) => f.featureKey === key)) {
      setToast({ tone: "err", text: `"${key}" đã có cấu hình.` });
      return;
    }
    setBusyKey("__new__");
    const res = await fetch(`/api/admin/entitlements/features/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true, limits: [], period: "MONTH", overLimit: "BLOCK" }),
    }).catch(() => null);
    if (res?.ok) {
      setNewKey("");
      setToast({ tone: "ok", text: `Đã tạo ${FEATURE_LABEL[key] ?? key} — đặt hạn mức cho từng gói bên dưới.` });
      await load();
    } else {
      setToast({ tone: "err", text: await errorText(res, "Không tạo được cấu hình.") });
    }
    setBusyKey(null);
  }

  const stats = useMemo(() => {
    const rows = features ?? [];
    return { total: rows.length, on: rows.filter((f) => f.enabled).length, off: rows.filter((f) => !f.enabled).length };
  }, [features]);

  const suggestions = Object.keys(FEATURE_LABEL).filter((k) => !features?.some((f) => f.featureKey === k));
  const q = query.trim().toLowerCase();
  const shown = (features ?? []).filter(
    (f) => !q || f.featureKey.toLowerCase().includes(q) || (FEATURE_LABEL[f.featureKey] ?? "").toLowerCase().includes(q),
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">Quản trị · Gói người học</p>
        <h1 className="mt-1.5 text-[28px] font-semibold leading-tight tracking-tight text-[var(--foreground)]">Hạn mức & gói</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
          Số lượt dùng mỗi tính năng theo gói Miễn phí / Pro / VIP, chu kỳ làm mới và cách xử lý khi hết lượt. Thay đổi có hiệu lực
          ngay ở lần gọi kế tiếp và được ghi vào nhật ký quản trị.
        </p>
      </header>

      <section aria-label="Tổng quan" className="mt-6 grid grid-cols-3 gap-3">
        <Stat label="Tính năng có cấu hình" value={features ? stats.total : "—"} />
        <Stat label="Đang bật" value={features ? stats.on : "—"} tone="text-emerald-600 dark:text-emerald-400" />
        <Stat label="Đang tắt" value={features ? stats.off : "—"} tone={stats.off ? "text-amber-600 dark:text-amber-400" : undefined} />
      </section>

      <section className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4 sm:p-5">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void addFeature(newKey);
          }}
        >
          <label className="sr-only" htmlFor="np-new-feature">
            Mã tính năng mới
          </label>
          <input
            id="np-new-feature"
            className={`h-10 min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--background-1)] px-3.5 font-mono text-sm text-[var(--foreground)] placeholder:font-sans placeholder:text-[var(--muted-foreground)] ${focusRing}`}
            placeholder="Mã tính năng mới, ví dụ ai-sentence-grade"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
          />
          <button
            type="submit"
            disabled={busyKey !== null || !newKey.trim()}
            className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-foreground,#fff)] shadow-[0_8px_18px_-10px_var(--primary)] transition-opacity hover:opacity-90 disabled:opacity-45 ${focusRing}`}
          >
            <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {busyKey === "__new__" ? "Đang tạo…" : "Thêm tính năng"}
          </button>
        </form>
        {suggestions.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <span>Gợi ý:</span>
            {suggestions.map((k) => (
              <button
                key={k}
                type="button"
                disabled={busyKey !== null}
                onClick={() => void addFeature(k)}
                className={`rounded-full border border-dashed border-[var(--border)] px-2.5 py-1 font-medium text-[var(--foreground)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-45 ${focusRing}`}
              >
                + {FEATURE_LABEL[k]} <code className="ml-1 font-mono text-[var(--muted-foreground)]">{k}</code>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-[var(--foreground)]">Tính năng</h2>
        {(features?.length ?? 0) > 3 && (
          <input
            type="search"
            aria-label="Tìm tính năng"
            placeholder="Tìm tính năng…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`h-9 w-56 rounded-xl border border-[var(--border)] bg-[var(--background-1)] px-3 text-sm text-[var(--foreground)] ${focusRing}`}
          />
        )}
      </div>

      <div className="mt-3 space-y-4">
        {loadError && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-red-500/30 bg-red-500/[0.06] px-4 py-3 text-sm text-red-700 dark:text-red-300">
            Không tải được cấu hình hạn mức.
            <button type="button" onClick={() => void load()} className={`rounded-lg px-3 py-1.5 font-semibold hover:bg-red-500/10 ${focusRing}`}>
              Thử lại
            </button>
          </div>
        )}

        {features === null && !loadError &&
          [0, 1].map((i) => <div key={i} aria-hidden className="h-64 animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--foreground)]/[0.04]" />)}

        {features && features.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[var(--border)] px-6 py-12 text-center">
            <p className="text-[15px] font-semibold text-[var(--foreground)]">Chưa có tính năng nào bị giới hạn</p>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-[var(--muted-foreground)]">
              Tính năng chưa có cấu hình thì mọi gói đều dùng không giới hạn. Thêm một tính năng ở trên để bắt đầu đặt hạn mức.
            </p>
          </div>
        )}

        {features && features.length > 0 && shown.length === 0 && (
          <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">Không có tính năng nào khớp “{query}”.</p>
        )}

        {shown.map((f) => (
          <EntitlementCard key={f.featureKey} feature={f} busy={busyKey === f.featureKey} onSave={save} onDelete={(x) => void remove(x)} />
        ))}
      </div>

      <aside className="mt-8 grid gap-3 rounded-2xl bg-[var(--foreground)]/[0.04] p-5 text-[13px] leading-5 text-[var(--muted-foreground)] sm:grid-cols-3">
        <p>
          <b className="text-[var(--foreground)]">Số lượt</b> — giới hạn mỗi chu kỳ; 0 nghĩa là có quyền nhưng hết lượt ngay.
        </p>
        <p>
          <b className="text-[var(--foreground)]">Vô hạn</b> — gói dùng không giới hạn số lượt.
        </p>
        <p>
          <b className="text-[var(--foreground)]">Không cấp</b> — gói không được dùng tính năng (trả 403).
        </p>
      </aside>

      {toast && (
        <div
          role={toast.tone === "err" ? "alert" : "status"}
          className={`fixed bottom-5 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-[0_18px_40px_-14px_rgba(0,0,0,0.5)] ${
            toast.tone === "ok" ? "bg-[#14161f]" : "bg-red-600"
          }`}
        >
          <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${toast.tone === "ok" ? "bg-emerald-400" : "bg-white"}`} />
          {toast.text}
        </div>
      )}
      {dialog}
    </div>
  );
}
