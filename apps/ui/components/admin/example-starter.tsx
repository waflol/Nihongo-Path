"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Progress {
  total: number;
  done: number;
  paused?: boolean;
}

/**
 * After an import: examples are generated only when the admin presses the
 * button. Generation runs on the server, so leaving this page does not stop
 * it; the progress bar here (and the strip on the deck list) shows how far it is.
 */
export function ExampleStarter({
  deckId,
  count,
  learner,
  decksHref,
}: {
  deckId: string;
  /** Cards imported without an example. */
  count: number;
  learner: boolean;
  decksHref: string;
}) {
  const [started, setStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/flashcards/import/examples/${deckId}/retry`, { method: "POST" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError("Không bắt đầu tạo ví dụ được — thử lại sau");
      return;
    }
    const body = (await res.json().catch(() => null)) as { remaining?: number } | null;
    if (body?.remaining === 0) setFinished(true);
    else setStarted(true);
  }

  useEffect(() => {
    if (!started || finished) return;
    let cancelled = false;
    const tick = async () => {
      const urls = learner
        ? ["/api/flashcards/decks"]
        : ["/api/flashcards/admin/decks", "/api/flashcards/decks"];
      for (const url of urls) {
        const r = await fetch(url, { cache: "no-store" }).catch(() => null);
        if (!r?.ok) continue;
        const list = (await r.json().catch(() => [])) as { _id: string; examples?: Progress | null }[];
        const deck = list.find((d) => d._id === deckId);
        if (cancelled || !deck) return;
        if (deck.examples && deck.examples.total > 0) setProgress(deck.examples);
        else setFinished(true); // the server clears the counters when it is done
        return;
      }
    };
    void tick();
    const t = setInterval(() => void tick(), 4000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [started, finished, deckId, learner]);

  const pct = progress && progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0;

  return (
    <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--background-1)] p-4 text-sm">
      <p className="font-medium text-[var(--foreground)]">Câu ví dụ</p>
      {!started && !finished && (
        <>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            {count} thẻ chưa có ví dụ. Kiểm tra thẻ xong, bấm nút bên dưới để bắt đầu — hệ thống chỉ tạo ví dụ khi bạn bấm.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void start()}
            className="mt-3 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:opacity-60"
          >
            {busy ? "Đang bắt đầu…" : "✨ Tạo ví dụ"}
          </button>
        </>
      )}
      {started && !finished && (
        <div aria-live="polite">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="mt-2 h-2.5 overflow-hidden rounded-full bg-[var(--layer)]"
          >
            <div className="h-full bg-[var(--primary)] transition-all" style={{ width: `${Math.max(pct, 3)}%` }} />
          </div>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            {progress ? `Đang tạo ví dụ ${progress.done}/${progress.total} (${pct}%)` : "Đang chuẩn bị…"} — chạy nền, bạn có thể sang trang khác;
            tiến độ cũng hiện ở{" "}
            <Link href={decksHref} className="font-medium text-[var(--primary)] hover:underline">
              danh sách bộ thẻ
            </Link>
            .
          </p>
        </div>
      )}
      {finished && <p className="mt-1 text-xs text-[#15803d] dark:text-[#86efac]">Đã tạo xong ví dụ cho bộ thẻ.</p>}
      {error && (
        <p role="alert" className="mt-2 text-xs text-[#b91c1c]">
          {error}
        </p>
      )}
    </div>
  );
}
