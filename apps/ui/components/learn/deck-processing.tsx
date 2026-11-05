"use client";

import { useEffect } from "react";

/** Progress of the example sentences being generated for a deck. */
export interface DeckExamples {
  total: number;
  done: number;
}

/**
 * "Bản nháp · đang tạo ví dụ N/M" strip shown on a deck while the server
 * fills in example sentences after an import. A new deck stays a draft until
 * this finishes, then publishes itself.
 */
export function DeckProcessing({
  examples,
  draft,
}: {
  examples: DeckExamples;
  draft: boolean;
}) {
  const pct = examples.total > 0 ? Math.min(100, Math.round((examples.done / examples.total) * 100)) : 0;
  return (
    <div
      role="status"
      className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--foreground)]">
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent"
        />
        <span className="font-medium">
          Đang tạo câu ví dụ: {examples.done}/{examples.total} thẻ ({pct}%)
        </span>
        {draft && (
          <span className="rounded-full bg-[#fef9c3] px-2 py-0.5 text-xs font-medium text-[#a16207] dark:bg-[#3a3210] dark:text-[#fde047]">
            Bản nháp
          </span>
        )}
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--layer)]">
        <div
          className="h-full rounded-full bg-[var(--primary)] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-[var(--muted-foreground)]">
        Chạy nền — bạn có thể rời trang.{" "}
        {draft ? "Bộ thẻ tự công khai khi xong." : "Thẻ không tìm được câu phù hợp sẽ để trống."}
      </p>
    </div>
  );
}

/**
 * While any deck is still generating examples, re-read the list every 5 s
 * (silently — no loading flash) until they are all done.
 */
export function useDeckProgressPolling<T extends { examples?: DeckExamples | null }>(
  decks: T[],
  url: string,
  setDecks: (next: T[]) => void,
) {
  const active = decks.some((d) => d.examples);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(async () => {
      const res = await fetch(url, { cache: "no-store" }).catch(() => null);
      if (!res?.ok) return;
      const list = (await res.json().catch(() => null)) as T[] | null;
      if (Array.isArray(list)) setDecks(list);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [active, url, setDecks]);
}
