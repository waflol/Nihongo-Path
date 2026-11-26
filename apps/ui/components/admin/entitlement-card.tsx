"use client";

import { useState } from "react";

export type Plan = "FREE" | "PRO" | "VIP";
export type Period = "DAY" | "MONTH";
export type OverLimit = "BLOCK" | "ALLOW";

export interface PlanLimit {
  plan: Plan;
  limit: number | null;
}

export interface FeatureConfig {
  featureKey: string;
  enabled: boolean;
  limits: PlanLimit[];
  period: Period;
  tz: string;
  overLimit: OverLimit;
}

export const PLANS: Plan[] = ["FREE", "PRO", "VIP"];

/** Friendly names for the feature keys the API gates today. */
export const FEATURE_LABEL: Record<string, string> = {
  "ai-sentence-grade": "Chấm câu bằng AI",
  "exam-ai-essay": "Chấm bài viết trong đề thi",
  "pdf-import": "Nhập file PDF",
};

const PLAN_META: Record<Plan, { label: string; dot: string; ring: string }> = {
  FREE: { label: "Miễn phí", dot: "bg-slate-400", ring: "focus-within:ring-slate-400/40" },
  PRO: { label: "Pro", dot: "bg-sky-500", ring: "focus-within:ring-sky-500/40" },
  VIP: { label: "VIP", dot: "bg-amber-500", ring: "focus-within:ring-amber-500/40" },
};

const TZ_OPTIONS = ["Asia/Ho_Chi_Minh", "Asia/Tokyo", "UTC"];

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background-1)]";

/**
 * Limit kind as the admin thinks of it. API semantics: no row for a plan =
 * not entitled (403); `null` = unlimited; a number (0 included) = per-period cap.
 * `undefined` here means "no row".
 */
type LimitKind = "count" | "unlimited" | "none";
type DraftLimit = number | null | undefined;

function kindOf(limit: DraftLimit): LimitKind {
  if (limit === undefined) return "none";
  return limit === null ? "unlimited" : "count";
}

function sameConfig(a: FeatureConfig, b: FeatureConfig): boolean {
  const lim = (f: FeatureConfig) =>
    PLANS.map((p) => {
      const row = f.limits.find((l) => l.plan === p);
      return row ? String(row.limit) : "-";
    }).join(",");
  return a.period === b.period && a.tz === b.tz && a.overLimit === b.overLimit && lim(a) === lim(b);
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl bg-[var(--foreground)]/[0.06] p-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all ${focusRing} ${
              on
                ? "bg-[var(--background-1)] text-[var(--foreground)] shadow-[0_1px_2px_rgba(0,0,0,0.08),0_4px_10px_-6px_rgba(0,0,0,0.25)]"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${focusRing} ${
        checked ? "bg-emerald-500" : "bg-[var(--foreground)]/20"
      }`}
    >
      <span
        aria-hidden
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`}
      />
    </button>
  );
}

function PlanTile({ plan, limit, onChange }: { plan: Plan; limit: DraftLimit; onChange: (v: DraftLimit) => void }) {
  const meta = PLAN_META[plan];
  const kind = kindOf(limit);
  return (
    <div className={`rounded-xl border border-[var(--border)] bg-[var(--background-1)] p-3.5 ring-0 ring-offset-0 transition-shadow focus-within:ring-4 ${meta.ring}`}>
      <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--foreground)]">
        <span aria-hidden className={`h-2 w-2 rounded-full ${meta.dot}`} />
        Gói {meta.label}
      </div>

      <div className="mt-2.5 flex h-11 items-baseline gap-1.5">
        {kind === "count" ? (
          <>
            <input
              aria-label={`Số lượt gói ${meta.label}`}
              inputMode="numeric"
              value={limit ?? ""}
              onChange={(e) => {
                const n = Number.parseInt(e.target.value.replace(/\D/g, ""), 10);
                onChange(Number.isFinite(n) ? n : 0);
              }}
              className="w-full min-w-0 bg-transparent text-3xl font-semibold tabular-nums tracking-tight text-[var(--foreground)] outline-none"
            />
            <span className="shrink-0 text-sm text-[var(--muted-foreground)]">lượt</span>
          </>
        ) : kind === "unlimited" ? (
          <span className="text-3xl font-semibold leading-none text-[var(--foreground)]">∞</span>
        ) : (
          <span className="text-lg font-semibold leading-none text-red-600 dark:text-red-400">Không được dùng</span>
        )}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1 text-[11px] font-medium">
        {(
          [
            ["count", "Số lượt"],
            ["unlimited", "Vô hạn"],
            ["none", "Không cấp"],
          ] as [LimitKind, string][]
        ).map(([k, text]) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => onChange(k === "unlimited" ? null : k === "none" ? undefined : typeof limit === "number" ? limit : 10)}
            className={`rounded-md px-1.5 py-1 transition-colors ${focusRing} ${
              kind === k
                ? "bg-[var(--foreground)] text-[var(--background-1)]"
                : "bg-[var(--foreground)]/[0.05] text-[var(--muted-foreground)] hover:bg-[var(--foreground)]/10 hover:text-[var(--foreground)]"
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * One feature's quota config. Limit / period / timezone / policy edits are a
 * local draft saved with an explicit button; the kill-switch saves at once.
 */
export function EntitlementCard({
  feature,
  busy,
  onSave,
  onDelete,
}: {
  feature: FeatureConfig;
  busy: boolean;
  onSave: (f: FeatureConfig) => Promise<boolean>;
  onDelete: (f: FeatureConfig) => void;
}) {
  const [draft, setDraft] = useState<FeatureConfig>(feature);
  const [base, setBase] = useState<FeatureConfig>(feature);
  // Server copy changed (save / reload): drop the draft onto the fresh row.
  if (base !== feature) {
    setBase(feature);
    setDraft(feature);
  }
  const dirty = !sameConfig(draft, feature);
  const label = FEATURE_LABEL[feature.featureKey];
  const limitOf = (p: Plan): DraftLimit => draft.limits.find((l) => l.plan === p)?.limit;
  const setLimit = (p: Plan, v: DraftLimit) =>
    setDraft((d) => {
      const rest = d.limits.filter((l) => l.plan !== p);
      return { ...d, limits: v === undefined ? rest : rest.concat({ plan: p, limit: v }) };
    });

  return (
    <article
      className={`overflow-hidden rounded-2xl border bg-[var(--background-1)] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_28px_-20px_rgba(10,14,30,0.4)] transition-colors ${
        dirty ? "border-[var(--primary)]/60" : "border-[var(--border)]"
      }`}
    >
      <header className="flex items-start gap-3 p-5 pb-4">
        <div
          aria-hidden
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] ${
            feature.enabled ? "bg-gradient-to-br from-[var(--primary-500,#6366f1)] to-[var(--primary-700,#4338ca)]" : "bg-[var(--foreground)]/25"
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v3M12 18v3M4.2 7.5l2.6 1.5M17.2 15l2.6 1.5M4.2 16.5 6.8 15M17.2 9l2.6-1.5" />
            <circle cx="12" cy="12" r="3.5" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 break-words text-[15px] font-semibold leading-6 text-[var(--foreground)]">{label ?? feature.featureKey}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted-foreground)]">
            {label && <code className="font-mono">{feature.featureKey}</code>}
            <span
              className={`rounded-full px-2 py-0.5 font-semibold ${
                feature.enabled
                  ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                  : "bg-[var(--foreground)]/10 text-[var(--muted-foreground)]"
              }`}
            >
              {feature.enabled ? "Đang bật" : "Đã tắt"}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Switch
            checked={feature.enabled}
            disabled={busy}
            label={feature.enabled ? "Tắt tính năng" : "Bật tính năng"}
            onChange={(v) => void onSave({ ...feature, enabled: v })}
          />
          <button
            type="button"
            onClick={() => onDelete(feature)}
            disabled={busy}
            aria-label={`Xoá cấu hình ${feature.featureKey}`}
            title="Xoá cấu hình"
            className={`ml-1.5 grid h-9 w-9 place-items-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:opacity-40 dark:hover:text-red-400 ${focusRing}`}
          >
            <svg aria-hidden viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
            </svg>
          </button>
        </div>
      </header>

      <div className={`px-5 transition-opacity ${feature.enabled ? "" : "opacity-60"}`}>
        <div className="grid gap-3 sm:grid-cols-3">
          {PLANS.map((p) => (
            <PlanTile key={p} plan={p} limit={limitOf(p)} onChange={(v) => setLimit(p, v)} />
          ))}
        </div>

        <div className="mt-4 grid gap-4 border-t border-[var(--border)] py-4 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-end">
          <div>
            <p className="mb-1.5 text-xs font-medium text-[var(--muted-foreground)]">Làm mới hạn mức</p>
            <Segmented
              label="Chu kỳ"
              value={draft.period}
              onChange={(v) => setDraft((d) => ({ ...d, period: v }))}
              options={[
                { value: "DAY", label: "Mỗi ngày" },
                { value: "MONTH", label: "Mỗi tháng" },
              ]}
            />
          </div>
          <label className="block min-w-0">
            <span className="mb-1.5 block text-xs font-medium text-[var(--muted-foreground)]">Múi giờ (mốc 0 giờ)</span>
            <input
              list="np-tz-options"
              value={draft.tz}
              onChange={(e) => setDraft((d) => ({ ...d, tz: e.target.value }))}
              className={`h-[38px] w-full rounded-xl border border-[var(--border)] bg-[var(--background-1)] px-3 font-mono text-[13px] text-[var(--foreground)] ${focusRing}`}
            />
            <datalist id="np-tz-options">
              {TZ_OPTIONS.map((tz) => (
                <option key={tz} value={tz} />
              ))}
            </datalist>
          </label>
          <div>
            <p className="mb-1.5 text-xs font-medium text-[var(--muted-foreground)]">Khi hết lượt</p>
            <Segmented
              label="Khi hết lượt"
              value={draft.overLimit}
              onChange={(v) => setDraft((d) => ({ ...d, overLimit: v }))}
              options={[
                { value: "BLOCK", label: "Chặn (429)" },
                { value: "ALLOW", label: "Cho vượt" },
              ]}
            />
          </div>
        </div>
      </div>

      {dirty && (
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--primary)]/25 bg-[var(--primary)]/[0.06] px-5 py-3">
          <p className="flex items-center gap-2 text-[13px] font-medium text-[var(--foreground)]">
            <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-[var(--primary)]" />
            Có thay đổi chưa lưu
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDraft(feature)}
              disabled={busy}
              className={`rounded-lg px-3.5 py-2 text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--foreground)]/[0.06] hover:text-[var(--foreground)] ${focusRing}`}
            >
              Huỷ
            </button>
            <button
              type="button"
              onClick={() => void onSave({ ...draft, enabled: feature.enabled })}
              disabled={busy}
              className={`rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground,#fff)] shadow-[0_8px_18px_-10px_var(--primary)] transition-opacity hover:opacity-90 disabled:opacity-50 ${focusRing}`}
            >
              {busy ? "Đang lưu…" : "Lưu thay đổi"}
            </button>
          </div>
        </footer>
      )}
    </article>
  );
}
