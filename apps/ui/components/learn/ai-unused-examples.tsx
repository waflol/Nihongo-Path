"use client";

import { useState } from "react";

interface Item {
  cardId: string;
  front: string;
  reading: string;
  back: string;
  kind: string;
  ja: string;
  vi: string;
  matches?: boolean;
  reason: string;
  usable: boolean;
  service: string;
  model: string;
  createdAt: string;
}

interface Result {
  total: number;
  items: Item[];
}

/**
 * Admin only: words whose card is still empty although the AI already
 * answered for them. The answer was saved but not accepted onto the card
 * (usually the "sentence really uses this word" check failed), so the admin
 * can read it here and add it by hand if it is good.
 */
export function AiUnusedExamples({ deckId, missing }: { deckId: string; missing: number }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/flashcards/decks/${deckId}/ai-unused`, { cache: "no-store" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError("Không tải được danh sách");
      return;
    }
    setResult((await res.json().catch(() => null)) as Result | null);
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !result) void load();
  }

  if (missing <= 0) return null;

  return (
    <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left text-sm font-semibold text-[var(--foreground)]"
      >
        <span>
          Từ AI đã tạo ví dụ nhưng chưa hiện trong thẻ
          {result ? ` (${result.total})` : ""}
        </span>
        <span aria-hidden className="text-[var(--muted-foreground)]">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="mt-3">
          <p className="text-xs text-[var(--muted-foreground)]">
            AI đã trả lời cho các từ này nhưng câu chưa được nhận vào thẻ. Mỗi dòng ghi rõ lý do; dòng có dấu ✓ là câu
            hợp lệ, chỉ cần bấm “Tạo ví dụ” để áp dụng. Câu bị loại có thể thêm tay vào thẻ nếu bạn thấy đúng.
          </p>
          {busy && <p className="mt-3 text-sm text-[var(--muted-foreground)]">Đang tải…</p>}
          {error && <p className="mt-3 text-sm text-[var(--destructive,#dc2626)]">{error}</p>}
          {result && result.items.length === 0 && !busy && (
            <p className="mt-3 text-sm text-[var(--muted-foreground)]">
              Không có từ nào: các thẻ còn trống chưa có kết quả AI nào được lưu.
            </p>
          )}
          {result && result.items.length > 0 && (
            <ul className="mt-3 max-h-96 divide-y divide-[var(--border)] overflow-y-auto rounded-lg border border-[var(--border)]">
              {result.items.map((it, i) => (
                <li key={`${it.cardId}-${it.kind}-${i}`} className="px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold text-[var(--foreground)]">{it.front}</span>
                    {it.reading && <span className="text-xs text-[var(--muted-foreground)]">{it.reading}</span>}
                    <span className="text-[var(--muted-foreground)]">— {it.back}</span>
                  </div>
                  {it.ja && <div className="mt-1 text-[var(--foreground)]">{it.ja}</div>}
                  <div className="text-[var(--muted-foreground)]">{it.vi}</div>
                  <p
                    className={`mt-1 text-xs font-medium ${it.usable ? "text-[#15803d] dark:text-[#86efac]" : "text-[#b91c1c] dark:text-[#fca5a5]"}`}
                  >
                    {it.usable ? "✓ " : "✕ Lý do không hiện: "}
                    {it.reason}
                  </p>
                  <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                    {it.kind === "write" ? "AI tạo câu" : "AI dịch câu Tatoeba"}
                    {it.matches === false ? " · AI báo sai nghĩa" : ""}
                    {it.service ? ` · ${it.service}` : ""}
                    {it.model ? ` · ${it.model}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
