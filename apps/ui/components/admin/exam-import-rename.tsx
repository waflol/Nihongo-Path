"use client";

import { useState } from "react";
import { deskButton, errorOf } from "./exam-import-draft-model";

/**
 * One name an exam is told apart by — the import's collection or one sitting.
 * Editable only while nothing of the import is published (the API enforces it).
 */
export function RenameField({
  jobId,
  label,
  value,
  bodyOf,
  disabled,
  onSaved,
}: {
  jobId: string;
  label: string;
  value: string;
  bodyOf: (next: string) => object;
  disabled: boolean;
  onSaved: (next: string) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/exam-import?rename=${jobId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyOf(next)),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError(res ? await errorOf(res) : "Không kết nối được máy chủ");
      return;
    }
    setDraft(null);
    await onSaved(next);
  }

  if (draft === null) {
    if (disabled) return null;
    return (
      <button
        type="button"
        onClick={() => setDraft(value === "unknown" ? "" : value)}
        className="shrink-0 text-xs font-medium text-[var(--primary)] underline-offset-2 hover:underline"
      >
        {label}
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.trim()) void save(draft.trim());
      }}
      className="w-full space-y-1.5"
    >
      <input
        autoFocus
        aria-label={label}
        value={draft}
        maxLength={150}
        onChange={(e) => setDraft(e.target.value)}
        className="w-full rounded-lg border border-[var(--sheet-rule)] bg-[var(--sheet)] px-2 py-1.5 text-sm"
      />
      <div className="flex gap-1.5">
        <button type="submit" className={deskButton} disabled={busy || !draft.trim()}>
          Lưu
        </button>
        <button type="button" className={deskButton} disabled={busy} onClick={() => setDraft(null)}>
          Huỷ
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-[var(--bad)]">
          {error}
        </p>
      )}
    </form>
  );
}
