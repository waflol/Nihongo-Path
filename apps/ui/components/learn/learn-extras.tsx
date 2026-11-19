"use client";

import { useEffect, useState, type ReactNode } from "react";

/** Button that opens a modal (own scroll) so the /learn page itself never scrolls. */
export function ExtraDialog({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border)] px-4 text-sm font-medium sm:h-auto sm:rounded-full sm:py-1.5 text-[var(--foreground)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
      >
        {label}
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-full w-full max-w-3xl overflow-y-auto rounded-2xl bg-[var(--background)] p-4 shadow-xl [&_section]:mt-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-[var(--foreground)]">{title}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-1 text-sm text-[var(--muted-foreground)] hover:bg-[var(--layer-hover)]"
              >
                Đóng ✕
              </button>
            </div>
            <div className="grid gap-4">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
