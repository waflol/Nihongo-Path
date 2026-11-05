"use client";

import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/learn/confirm-dialog";
import { Icon } from "@/components/learn/icons";

/** Progress of the example sentences being generated for a deck. */
export interface DeckExamples {
  total: number;
  done: number;
  paused?: boolean;
}

/**
 * "Bản nháp · đang tạo ví dụ N/M" strip shown on a deck while the server
 * fills in example sentences after an import. A new deck stays a draft until
 * this finishes, then publishes itself.
 */
export function DeckProcessing({
  examples,
  draft,
  deckId,
  onChanged,
}: {
  examples: DeckExamples;
  draft: boolean;
  deckId: string;
  /** Called after pause / resume / stop so the list can refresh. */
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paused = examples.paused === true;
  const pct = examples.total > 0 ? Math.min(100, Math.round((examples.done / examples.total) * 100)) : 0;

  async function control(action: "pause" | "resume" | "stop") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/flashcards/import/examples/${deckId}/${action}`, {
      method: "POST",
    }).catch(() => null);
    setBusy(false);
    setConfirmStop(false);
    if (!res?.ok) {
      setError("Không thực hiện được — thử lại sau");
      return;
    }
    onChanged();
  }

  const btn =
    "rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)] disabled:opacity-60";

  return (
    <div
      role="status"
      className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3"
    >
      <ConfirmDialog
        open={confirmStop}
        title="Dừng tạo ví dụ?"
        message="Các thẻ chưa có ví dụ sẽ để trống (thêm ví dụ thủ công sau). Ví dụ đã tạo vẫn được giữ."
        confirmLabel="Dừng"
        busyLabel="Đang dừng…"
        busy={busy}
        onCancel={() => setConfirmStop(false)}
        onConfirm={() => void control("stop")}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--foreground)]">
          {paused ? (
            <span aria-hidden="true">⏸</span>
          ) : (
            <span
              aria-hidden="true"
              className="size-4 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent"
            />
          )}
          <span className="font-medium">
            {paused ? "Đã tạm dừng" : "Đang tạo câu ví dụ"}: {examples.done}/{examples.total} thẻ ({pct}%)
          </span>
          {draft && (
            <span className="rounded-full bg-[#fef9c3] px-2 py-0.5 text-xs font-medium text-[#a16207] dark:bg-[#3a3210] dark:text-[#fde047]">
              Bản nháp
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {paused ? (
            <button type="button" disabled={busy} onClick={() => void control("resume")} className={btn}>
              ▶ Tiếp tục
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={() => void control("pause")} className={btn}>
              ⏸ Tạm dừng
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmStop(true)}
            className="rounded-lg border border-[var(--destructive)] px-3 py-1.5 text-xs font-medium text-[var(--destructive)] hover:bg-[#fef2f2] disabled:opacity-60 dark:hover:bg-[#2a1215]"
          >
            ■ Dừng
          </button>
        </div>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--layer)]">
        <div
          className={"h-full rounded-full transition-all " + (paused ? "bg-[var(--muted-foreground)]" : "bg-[var(--primary)]")}
          style={{ width: `${pct}%` }}
        />
      </div>
      {error && <p className="mt-2 text-xs text-[#b91c1c]">{error}</p>}
      <p className="mt-2 text-xs text-[var(--muted-foreground)]">
        {paused
          ? "Đang tạm dừng — bấm Tiếp tục để chạy tiếp, hoặc Dừng để bỏ phần còn lại."
          : "Chạy nền — bạn có thể rời trang. "}
        {!paused && (draft ? "Bộ thẻ tự công khai khi xong." : "Thẻ không tìm được câu phù hợp sẽ để trống.")}
      </p>
    </div>
  );
}

/**
 * "Tạo lại ví dụ" — re-run example generation for the cards of a deck that
 * still have no example (e.g. nothing was found the first time).
 */
export function RetryExamplesButton({
  deckId,
  className,
  iconOnly = false,
  onChanged,
}: {
  deckId: string;
  className: string;
  iconOnly?: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setNote(null);
    const res = await fetch(`/api/flashcards/import/examples/${deckId}/retry`, {
      method: "POST",
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setNote("Không chạy lại được — thử lại sau");
      return;
    }
    const body = (await res.json().catch(() => null)) as { remaining?: number } | null;
    setNote(body?.remaining === 0 ? "Mọi thẻ đều đã có ví dụ" : null);
    onChanged();
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run()}
        title="Tạo lại ví dụ cho những thẻ còn thiếu"
        aria-label="Tạo lại ví dụ"
        className={className}
      >
        {iconOnly ? (
          <Icon name="refresh" className={"size-4" + (busy ? " animate-spin" : "")} />
        ) : busy ? (
          "Đang chạy…"
        ) : (
          "↻ Tạo lại ví dụ"
        )}
      </button>
      {note && (
        <span role="status" className="basis-full text-right text-xs text-[var(--muted-foreground)]">
          {note}
        </span>
      )}
    </>
  );
}

/** Re-read the deck list without any loading flash. */
export async function reloadDecks<T>(url: string, setDecks: (next: T[]) => void) {
  const res = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return;
  const list = (await res.json().catch(() => null)) as T[] | null;
  if (Array.isArray(list)) setDecks(list);
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
  // A paused deck needs no polling; the controls refresh the list themselves.
  const active = decks.some((d) => d.examples && !d.examples.paused);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => void reloadDecks<T>(url, setDecks), 5000);
    return () => window.clearInterval(timer);
  }, [active, url, setDecks]);
}
