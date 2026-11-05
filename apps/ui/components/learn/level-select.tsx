"use client";

import type { CSSProperties } from "react";

export const JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;

/** One accent per JLPT level, easy → hard: green, blue, violet, orange, red. */
const LEVEL_COLOR: Record<string, string> = {
  N5: "#10b981",
  N4: "#3b82f6",
  N3: "#8b5cf6",
  N2: "#f59e0b",
  N1: "#ef4444",
};
const FALLBACK_COLOR = "#6b7280";

/** True for a tag/level string that is exactly a JLPT level (N1–N5). */
export function isJlptLevel(value: string | undefined | null): boolean {
  return !!value && value.trim().toUpperCase() in LEVEL_COLOR;
}

function levelStyle(level: string): CSSProperties {
  return { "--lv": LEVEL_COLOR[level.trim().toUpperCase()] ?? FALLBACK_COLOR } as CSSProperties;
}

/** Colored pill for a JLPT level (works in light and dark themes). */
export function LevelBadge({ level, className = "" }: { level: string; className?: string }) {
  return (
    <span
      style={levelStyle(level)}
      className={
        "inline-flex items-center gap-1 rounded-md border border-[color-mix(in_srgb,var(--lv)_35%,transparent)] " +
        "bg-[color-mix(in_srgb,var(--lv)_14%,transparent)] px-2 py-0.5 text-xs font-bold tracking-wide " +
        "text-[color-mix(in_srgb,var(--lv)_80%,var(--foreground))] " +
        className
      }
    >
      <span aria-hidden className="size-1.5 rounded-full bg-[var(--lv)]" />
      {level.trim().toUpperCase()}
    </span>
  );
}

/**
 * JLPT level picker: colored segmented buttons (click the active one again to
 * clear). A pre-existing free-text level that is not N1–N5 is kept as an extra
 * option.
 */
export function LevelSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const extra = value && !(JLPT_LEVELS as readonly string[]).includes(value) ? [value] : [];
  const options = [...JLPT_LEVELS, ...extra];
  return (
    <div role="radiogroup" aria-label="Cấp độ" className="mt-1 flex flex-wrap gap-2">
      {options.map((lv) => {
        const active = value === lv;
        return (
          <button
            key={lv}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(active ? "" : lv)}
            style={levelStyle(lv)}
            className={
              "inline-flex h-9 min-w-12 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-bold " +
              "transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--lv)] " +
              (active
                ? "border-[var(--lv)] bg-[var(--lv)] text-white shadow-sm"
                : "border-[color-mix(in_srgb,var(--lv)_40%,var(--border))] bg-[color-mix(in_srgb,var(--lv)_8%,transparent)] " +
                  "text-[color-mix(in_srgb,var(--lv)_80%,var(--foreground))] hover:bg-[color-mix(in_srgb,var(--lv)_18%,transparent)]")
            }
          >
            {!active && <span aria-hidden className="size-1.5 rounded-full bg-[var(--lv)]" />}
            {lv}
          </button>
        );
      })}
    </div>
  );
}
