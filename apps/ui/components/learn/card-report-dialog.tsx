"use client";

import { useEffect, useRef, useState } from "react";

const KINDS = [
  { value: "translation", label: "Dịch / nghĩa sai" },
  { value: "hanviet", label: "Âm Hán Việt sai" },
  { value: "example", label: "Ví dụ sai" },
  { value: "reading", label: "Cách đọc sai" },
  { value: "other", label: "Lỗi khác" },
] as const;

/** Modal to report an error on a shared-deck card and suggest the correct text. */
export function CardReportDialog({
  open,
  cardId,
  term,
  onClose,
}: {
  open: boolean;
  cardId: string;
  term: string;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<string>("translation");
  const [message, setMessage] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const firstRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!open) return;
    setKind("translation");
    setMessage("");
    setSuggestion("");
    setError(null);
    setDone(false);
    firstRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, cardId, onClose]);

  if (!open) return null;

  async function submit() {
    if (!message.trim() && !suggestion.trim()) {
      setError("Hãy mô tả lỗi hoặc nhập bản sửa đề xuất.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/flashcards/cards/${cardId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, message, suggestion }),
    }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) {
      const body = res ? await res.json().catch(() => null) : null;
      setError(
        (typeof body?.message === "string" && body.message) ||
          "Không gửi được báo lỗi. Thử lại sau.",
      );
      return;
    }
    setDone(true);
  }

  const field =
    "mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary-focus)]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--background)] p-6 shadow-xl"
      >
        <h2 id="report-title" className="text-lg font-semibold text-[var(--foreground)]">
          Báo lỗi thẻ{" "}
          <span lang="ja" className="text-[var(--primary)]">
            {term}
          </span>
        </h2>
        {done ? (
          <>
            <p className="mt-3 text-sm text-[var(--muted-foreground)]">
              Cảm ơn bạn! Góp ý đã được gửi tới quản trị viên để xem xét.
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white"
              >
                Đóng
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="mt-4 block text-sm font-medium text-[var(--foreground)]">
              Loại lỗi
              <select
                ref={firstRef}
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className={field}
              >
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-sm font-medium text-[var(--foreground)]">
              Mô tả lỗi
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Ví dụ: nghĩa phải là…, câu ví dụ không tự nhiên…"
                className={field}
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-[var(--foreground)]">
              Đề xuất bản dịch / sửa đúng (tuỳ chọn)
              <textarea
                value={suggestion}
                onChange={(e) => setSuggestion(e.target.value)}
                maxLength={1000}
                rows={2}
                className={field}
              />
            </label>
            {error && (
              <p role="alert" className="mt-3 text-sm text-red-600">
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
              >
                Huỷ
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={submit}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {busy ? "Đang gửi…" : "Gửi báo lỗi"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
