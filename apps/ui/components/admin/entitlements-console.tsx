"use client";

import { useCallback, useEffect, useState } from "react";

type Plan = "FREE" | "PRO" | "VIP";
type Period = "DAY" | "MONTH";
type OverLimit = "BLOCK" | "ALLOW";

interface PlanLimit {
  plan: Plan;
  limit: number | null;
}

interface FeatureConfig {
  featureKey: string;
  enabled: boolean;
  limits: PlanLimit[];
  period: Period;
  tz: string;
  overLimit: OverLimit;
}

const field =
  "rounded-lg border border-[var(--border)] bg-[var(--background-1)] px-3 py-2 text-sm text-[var(--foreground)]";
const actBtn =
  "rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-medium transition-colors hover:bg-[var(--background-2,var(--border))] disabled:cursor-not-allowed disabled:opacity-40";
const primaryBtn =
  "rounded-lg bg-[var(--primary)] px-3.5 py-2 text-sm font-semibold text-[var(--primary-foreground,#fff)] transition-opacity hover:opacity-90 disabled:opacity-50";

const PLAN_LABEL: Record<Plan, string> = { FREE: "Miễn phí", PRO: "Pro", VIP: "VIP" };
const PERIOD_LABEL: Record<Period, string> = { DAY: "Theo ngày", MONTH: "Theo tháng" };

function limitLabel(l: PlanLimit | undefined): string {
  if (!l) return "—";
  if (l.limit === null) return "Không giới hạn";
  return `${l.limit} lượt`;
}

/**
 * Admin entitlements console (P5-ADMIN-04 / P5-QUOTA-01): per-feature
 * limits, reset period + timezone, and the BLOCK-vs-ALLOW over-limit policy.
 * Editing takes effect live on the next request — no deploy. Every change is
 * snapshotted into the audit trail by the API.
 */
export function EntitlementsConsole() {
  const [features, setFeatures] = useState<FeatureConfig[] | null>(null);
  const [newKey, setNewKey] = useState("ai-sentence-grade");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/admin/entitlements/features", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) {
      setError("Không tải được cấu hình hạn mức.");
      return;
    }
    const rows = (await res.json()) as FeatureConfig[];
    setFeatures(rows ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(f: FeatureConfig) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/admin/entitlements/features/${encodeURIComponent(f.featureKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: f.enabled,
        limits: f.limits,
        period: f.period,
        tz: f.tz,
        overLimit: f.overLimit,
      }),
    }).catch(() => null);
    if (!res?.ok) {
      const msg = (await res?.json().catch(() => null)) as { message?: string } | null;
      setError(typeof msg?.message === "string" ? msg.message : "Không lưu được cấu hình.");
    } else {
      setNotice(`Đã lưu: ${f.featureKey}`);
      await load();
    }
    setBusy(false);
  }

  async function addFeature() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fetch(
      `/api/admin/entitlements/features/${encodeURIComponent(newKey.trim())}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true, limits: [], period: "MONTH", overLimit: "BLOCK" }),
      },
    ).catch(() => null);
    if (!res?.ok) {
      const msg = (await res?.json().catch(() => null)) as { message?: string } | null;
      setError(typeof msg?.message === "string" ? msg.message : "Không tạo được cấu hình.");
    } else {
      setNotice(`Đã tạo: ${newKey.trim()}`);
      await load();
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">Hạn mức & gói</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Giới hạn từng tính năng theo gói (Miễn phí / Pro / VIP), chu kỳ & múi giờ tính hạn mức, và
            chính sách khi vượt hạn mức. Sửa xong có hiệu lực ngay, không cần triển khai lại.
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-4 rounded-lg bg-[#f0fdf4] px-4 py-3 text-sm text-[#15803d]">
          {notice}
        </p>
      )}

      <form
        className="mt-6 flex flex-wrap items-end gap-2 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void addFeature();
        }}
      >
        <label className="block text-xs font-medium text-[var(--muted-foreground)]">
          Tính năng mới (featureKey)
          <input
            className={field + " mt-1 w-full max-w-sm font-mono"}
            list="np-feature-keys"
            placeholder="ví dụ: ai-sentence-grade"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            required
          />
        </label>
        <datalist id="np-feature-keys">
          <option value="ai-sentence-grade" />
          <option value="exam-ai-essay" />
          <option value="pdf-import" />
        </datalist>
        <button type="submit" className={primaryBtn} disabled={busy}>
          {busy ? "Đang tạo…" : "Tạo / mở cấu hình"}
        </button>
      </form>

      <div className="mt-6 space-y-3">
        {features === null && !error && (
          <p className="text-sm text-[var(--muted-foreground)]">Đang tải…</p>
        )}
        {features && features.length === 0 && (
          <p className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
            Chưa có cấu hình nào. Tạo tính năng đầu tiên phía trên — các tính năng chưa có cấu hình
            vẫn hoạt động, không bị chặn.
          </p>
        )}

        {features?.map((f) => (
          <article key={f.featureKey} className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-mono text-base font-semibold text-[var(--foreground)]">{f.featureKey}</h3>
              <label className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                <input
                  type="checkbox"
                  checked={f.enabled}
                  onChange={(e) => {
                    const next = { ...f, enabled: e.target.checked };
                    setFeatures((cur) => (cur ?? []).map((x) => (x.featureKey === f.featureKey ? next : x)));
                    void save(next);
                  }}
                  className="size-4"
                />
                {f.enabled ? "Đang bật" : "Đã tắt (kill-switch)"}
              </label>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {(["FREE", "PRO", "VIP"] as Plan[]).map((p) => {
                const row = f.limits.find((l) => l.plan === p);
                return (
                  <label key={p} className="block text-xs font-medium text-[var(--muted-foreground)]">
                    Gói {PLAN_LABEL[p]}
                    <input
                      className={field + " mt-1 w-full"}
                      placeholder="rỗng = không giới hạn, 0 = khoá, hoặc số"
                      value={row?.limit === null || row?.limit === undefined ? "" : row?.limit}
                      inputMode="numeric"
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        const next: PlanLimit = {
                          plan: p,
                          limit: raw === "" ? null : Math.max(0, Number.parseInt(raw, 10) || 0),
                        };
                        const limits = f.limits.filter((l) => l.plan !== p).concat(next);
                        const nf = { ...f, limits };
                        setFeatures((cur) => (cur ?? []).map((x) => (x.featureKey === f.featureKey ? nf : x)));
                      }}
                      onBlur={(ev) => {
                        const raw = ev.target.value.trim();
                        void save({
                          ...f,
                          limits: f.limits.map((l) =>
                            l.plan === p
                              ? { plan: p, limit: raw === "" ? null : Math.max(0, Number.parseInt(raw, 10) || 0) }
                              : l,
                          ),
                        });
                      }}
                    />
                    <span className="mt-1 block text-[11px]">Hiện: {limitLabel(row)}</span>
                  </label>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-4">
              <label className="block text-xs font-medium text-[var(--muted-foreground)]">
                Chu kỳ
                <select
                  className={field + " mt-1"}
                  value={f.period}
                  onChange={(e) => {
                    const nf = { ...f, period: e.target.value as Period };
                    setFeatures((cur) => (cur ?? []).map((x) => (x.featureKey === f.featureKey ? nf : x)));
                  }}
                  onBlur={() => {
                    void save(f);
                  }}
                >
                  <option value="MONTH">Theo tháng</option>
                  <option value="DAY">Theo ngày</option>
                </select>
              </label>
              <label className="block text-xs font-medium text-[var(--muted-foreground)]">
                Múi giờ (IANA)
                <input
                  className={field + " mt-1 w-52 font-mono"}
                  value={f.tz}
                  onChange={(e) => {
                    const nf = { ...f, tz: e.target.value };
                    setFeatures((cur) => (cur ?? []).map((x) => (x.featureKey === f.featureKey ? nf : x)));
                  }}
                  onBlur={() => {
                    void save(f);
                  }}
                />
              </label>
              <label className="block text-xs font-medium text-[var(--muted-foreground)]">
                Vượt hạn mức
                <select
                  className={field + " mt-1"}
                  value={f.overLimit}
                  onChange={(e) => {
                    const nf = { ...f, overLimit: e.target.value as OverLimit };
                    setFeatures((cur) => (cur ?? []).map((x) => (x.featureKey === f.featureKey ? nf : x)));
                  }}
                  onBlur={() => {
                    void save(f);
                  }}
                >
                  <option value="BLOCK">Chặn (trả 429)</option>
                  <option value="ALLOW">Cho vượt (ghi nhận để tính phí sau)</option>
                </select>
              </label>
              <span className="text-xs text-[var(--muted-foreground)]">
                Chu kỳ: {PERIOD_LABEL[f.period]} · {f.tz}
              </span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
