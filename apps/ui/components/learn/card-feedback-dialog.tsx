"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/** Error kinds a learner can flag on a card; `source` routes it in the admin feedback inbox. */
const KINDS = [
  { value: "translation", label: "Dịch / nghĩa sai", source: "translation" },
  { value: "reading", label: "Cách đọc sai", source: "vocabulary" },
  { value: "hanviet", label: "Âm Hán Việt sai", source: "vocabulary" },
  { value: "example", label: "Ví dụ sai", source: "vocabulary" },
  { value: "other", label: "Lỗi khác", source: "vocabulary" },
] as const;

/**
 * Report a problem on one flashcard. Files a general feedback row
 * (`POST /api/feedback`, P5-FEEDBACK-01) with the card as `targetId`, so it
 * lands in the admin "Hộp thư phản hồi" and in the learner's own thread list.
 */
export function CardFeedbackDialog({
  cardId,
  front,
  back,
  onClose,
}: {
  cardId: string;
  front: string;
  back: string;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<string>("translation");
  const [message, setMessage] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const firstRef = useRef<HTMLSelectElement>(null);

  // Mounted only while open (fresh state per card); just focus + Esc here.
  useEffect(() => {
    firstRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  async function submit() {
    if (!message.trim() && !suggestion.trim()) {
      setError("Hãy mô tả lỗi hoặc nhập bản sửa đề xuất.");
      return;
    }
    const k = KINDS.find((x) => x.value === kind) ?? KINDS[0];
    setBusy(true);
    setError(null);
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: k.source,
        targetId: cardId,
        context: `Thẻ: ${front} — ${back}`.slice(0, 500),
        message: `[${k.label}] ${message.trim() || "(xem đề xuất sửa)"}`,
        suggestion: suggestion.trim() || undefined,
      }),
    }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) {
      const body = res ? await res.json().catch(() => null) : null;
      setError((typeof body?.message === "string" && body.message) || "Không gửi được báo lỗi. Thử lại sau.");
      return;
    }
    setDone(true);
  }

  const field =
    "mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary-focus)]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-feedback-title"
        className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--background)] p-6 shadow-xl"
      >
        <h2 id="card-feedback-title" className="text-lg font-semibold text-[var(--foreground)]">
          Báo lỗi thẻ{" "}
          <span lang="ja" className="text-[var(--primary)]">
            {front}
          </span>
        </h2>
        {done ? (
          <>
            <p className="mt-3 text-sm text-[var(--muted-foreground)]">
              Cảm ơn bạn! Báo lỗi đã được gửi tới đội ngũ. Bạn theo dõi trạng thái ở{" "}
              <Link href="/account/feedback" className="font-medium text-[var(--primary)] hover:underline">
                Báo lỗi &amp; góp ý của tôi
              </Link>
              .
            </p>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={onClose} className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white">
                Đóng
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="mt-4 block text-sm font-medium text-[var(--foreground)]">
              Loại lỗi
              <select ref={firstRef} value={kind} onChange={(e) => setKind(e.target.value)} className={field}>
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
              Đề xuất sửa (tuỳ chọn)
              <textarea value={suggestion} onChange={(e) => setSuggestion(e.target.value)} maxLength={1000} rows={2} className={field} />
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
