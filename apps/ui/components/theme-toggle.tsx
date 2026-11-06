"use client";

import { useState, useSyncExternalStore } from "react";

const STORAGE_KEY = "np.theme";
const ACCENT_KEY = "np.accent";

export const ACCENTS = [
  { id: "indigo", label: "Chàm", color: "#4f46e5" },
  { id: "sakura", label: "Sakura", color: "#e11d5f" },
  { id: "matcha", label: "Matcha", color: "#15803d" },
  { id: "ukiyo", label: "Ukiyo", color: "#0e7490" },
  { id: "kitsune", label: "Kitsune", color: "#ea580c" },
  { id: "fuji", label: "Fuji", color: "#9333ea" },
] as const;

/** Inline, pre-paint script: apply the saved (or system) theme with no flash. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");if(!t){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t;var a=localStorage.getItem("${ACCENT_KEY}");if(a&&a!=="indigo")document.documentElement.dataset.accent=a}catch(e){}})();`;

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

const getSnapshot = () => document.documentElement.dataset.theme === "dark";
const getServerSnapshot = () => false;

/** Light / dark switch. Persists the choice in localStorage. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const dark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage blocked — the choice just won't persist */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"}
      title={dark ? "Chế độ sáng" : "Chế độ tối"}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--foreground)] transition-colors hover:bg-[var(--layer-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary-focus)] ${className}`}
    >
      {dark ? (
        <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}

function subscribeAccent(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-accent"],
  });
  return () => observer.disconnect();
}
const getAccent = () => document.documentElement.dataset.accent || "indigo";
const getServerAccent = () => "indigo";

/** Accent-colour picker: re-tones the whole app. Persists in localStorage. */
export function AccentPicker({ className = "" }: { className?: string }) {
  const accent = useSyncExternalStore(subscribeAccent, getAccent, getServerAccent);
  const [open, setOpen] = useState(false);

  function pick(id: string) {
    if (id === "indigo") delete document.documentElement.dataset.accent;
    else document.documentElement.dataset.accent = id;
    try {
      localStorage.setItem(ACCENT_KEY, id);
    } catch {
      /* storage blocked — the choice just won't persist */
    }
    setOpen(false);
  }

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Đổi tông màu"
        title="Đổi tông màu"
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border)] transition-colors hover:bg-[var(--layer-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary-focus)]"
      >
        <span className="size-5 rounded-full bg-gradient-to-br from-[var(--primary-300)] to-[var(--primary-600)] ring-2 ring-[var(--background)]" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="menu"
            className="absolute right-0 z-50 mt-2 grid w-44 grid-cols-3 gap-2 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 shadow-lg"
          >
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                type="button"
                role="menuitemradio"
                aria-checked={accent === a.id}
                onClick={() => pick(a.id)}
                title={a.label}
                aria-label={a.label}
                className={
                  "mx-auto size-9 rounded-full transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary-focus)] " +
                  (accent === a.id ? "ring-2 ring-offset-2 ring-[var(--foreground)] ring-offset-[var(--background)]" : "")
                }
                style={{ backgroundColor: a.color }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
