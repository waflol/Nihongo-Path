"use client";

import { useSyncExternalStore } from "react";

/** Shared minimize / expand for the floating progress popups (bottom-right of every page). */

const KEY = "progress-popups-minimized";
const CHANGED = "progress-popups-minimized-changed";
/** Used when storage is unavailable, so the buttons still work until a reload. */
let memory = "[]";

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

function parse(raw: string): string[] {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange); // another tab
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function setMinimized(id: string, minimized: boolean) {
  const rest = parse(read()).filter((x) => x !== id);
  memory = JSON.stringify((minimized ? [...rest, id] : rest).slice(-30));
  try {
    localStorage.setItem(KEY, memory);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(CHANGED));
}

/** Which popups are minimized; remembered across page moves and reloads. */
export function useMinimizedPopups() {
  const ids = parse(useSyncExternalStore(subscribe, read, () => "[]"));
  return { isMinimized: (id: string) => ids.includes(id), setMinimized };
}

export function MinimizeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Thu nhỏ"
      aria-label="Thu nhỏ"
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--layer)] hover:text-[var(--foreground)]"
    >
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
        <path d="M3.5 12h9" />
      </svg>
    </button>
  );
}

/** A minimized popup: a small pill with its badge and progress; click to expand. */
export function MiniPopup({
  title,
  glyph,
  badge = "bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] text-[var(--primary)]",
  value,
  pct,
  onExpand,
}: {
  title: string;
  glyph: string;
  badge?: string;
  /** Short text beside the badge, e.g. "58%". */
  value: string;
  /** Fills the line along the bottom; omit when there is no progress to show. */
  pct?: number;
  onExpand: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onExpand}
      title={`${title} — phóng to`}
      aria-label={`Phóng to: ${title}, ${value}`}
      className="pointer-events-auto relative flex items-center gap-2 self-end overflow-hidden rounded-full border border-[var(--border)] bg-[var(--background-1)] py-1.5 pl-1.5 pr-3 shadow-xl hover:bg-[var(--layer)]"
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${badge}`} aria-hidden="true">
        {glyph}
      </span>
      <span className="text-sm font-semibold tabular-nums text-[var(--foreground)]">{value}</span>
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-[var(--muted-foreground)]" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9.5 3H13v3.5M13 3 9 7M6.5 13H3V9.5M3 13l4-4" />
      </svg>
      {pct !== undefined && <span className="absolute bottom-0 left-0 h-0.5 bg-[var(--primary)] transition-all duration-500" style={{ width: `${pct}%` }} aria-hidden="true" />}
    </button>
  );
}
