"use client";

import { useEffect, useState } from "react";

export type Status = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "REJECTED";
export const STATUSES: Status[] = ["OPEN", "IN_PROGRESS", "RESOLVED", "REJECTED"];

export interface HistoryEntry {
  from: string | null;
  to: string;
  by: string | null;
  note: string | null;
  at: string;
}

/** What `targetId` resolves to (API `FeedbackTarget`); `null` when it isn't a known card. */
export interface FeedbackTarget {
  kind: "card";
  cardId: string;
  front: string;
  deckId: string;
  deckTitle: string;
  shared: boolean;
}

/** Admin page that opens the reported card in edit mode. */
export const targetHref = (t: FeedbackTarget) => `/admin/decks/${t.deckId}?card=${t.cardId}`;

export interface FeedbackItem {
  id: string;
  target?: FeedbackTarget | null;
  source: string;
  targetId: string | null;
  context: string | null;
  message: string;
  suggestion: string | null;
  status: Status;
  reporter: string;
  historyCount: number;
  createdAt: string;
}

export const SOURCES = [
  { v: "vocabulary", l: "Từ vựng" },
  { v: "grammar", l: "Ngữ pháp" },
  { v: "transcript", l: "Phiên âm" },
  { v: "translation", l: "Bản dịch" },
  { v: "exam", l: "Đề thi" },
  { v: "general", l: "Khác" },
] as const;

export const sourceLabel = (v: string) => SOURCES.find((s) => s.v === v)?.l ?? v;

export const STATUS_META: Record<Status, { label: string; dot: string; pill: string }> = {
  OPEN: { label: "Chưa xử lý", dot: "bg-sky-500", pill: "bg-sky-500/12 text-sky-700 dark:text-sky-300" },
  IN_PROGRESS: { label: "Đang xử lý", dot: "bg-amber-500", pill: "bg-amber-500/14 text-amber-700 dark:text-amber-300" },
  RESOLVED: { label: "Đã giải quyết", dot: "bg-emerald-500", pill: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" },
  REJECTED: { label: "Bỏ qua", dot: "bg-slate-400", pill: "bg-[var(--foreground)]/10 text-[var(--muted-foreground)]" },
};

export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background-1)]";

export function ago(iso?: string): string {
  if (!iso) return "";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  if (m < 1440) return `${Math.round(m / 60)} giờ trước`;
  if (m < 43200) return `${Math.round(m / 1440)} ngày trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
}

const statusName = (s: string | null) => (s && s in STATUS_META ? STATUS_META[s as Status].label : s ?? "");

export function Initials({ name, size = "h-9 w-9 text-[13px]" }: { name: string; size?: string }) {
  const letters = name
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-full bg-[var(--primary)]/12 font-semibold text-[var(--primary)] ${size}`}>
      {letters || "?"}
    </span>
  );
}

/**
 * Detail pane for one feedback: full message, suggestion, status change with
 * an optional note, and the processing history as a timeline.
 */
export function FeedbackDetail({
  item,
  onBack,
  onStatus,
}: {
  item: FeedbackItem;
  onBack: () => void;
  onStatus: (id: string, next: Status, note?: string) => Promise<boolean>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<Status | null>(null);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  // A different item or a new status change → refetch its history.
  const historyKey = `${item.id}:${item.historyCount}`;
  if (historyFor !== historyKey) {
    setHistoryFor(historyKey);
    setHistory(null);
  }
  useEffect(() => {
    let live = true;
    void fetch(`/api/admin/feedback/${item.id}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ history: HistoryEntry[] }>) : null))
      .catch(() => null)
      .then((full) => {
        if (live) setHistory(full?.history ?? []);
      });
    return () => {
      live = false;
    };
  }, [item.id, item.historyCount]);

  async function change(next: Status) {
    setBusy(next);
    const ok = await onStatus(item.id, next, note.trim() || undefined);
    if (ok) setNote("");
    setBusy(null);
  }

  const meta = STATUS_META[item.status];
  const actions: { to: Status; label: string; primary?: boolean }[] = (
    [
      { to: "IN_PROGRESS", label: "Nhận xử lý" },
      { to: "RESOLVED", label: "Đã giải quyết", primary: true },
      { to: "REJECTED", label: "Bỏ qua" },
      { to: "OPEN", label: "Mở lại" },
    ] as { to: Status; label: string; primary?: boolean }[]
  ).filter((a) => a.to !== item.status);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={onBack}
          className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-[var(--muted-foreground)] hover:bg-[var(--foreground)]/[0.06] hover:text-[var(--foreground)] ${focusRing}`}
        >
          <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Hộp thư
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${meta.pill}`}>
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
          <span className="rounded-full bg-[var(--primary)]/10 px-2.5 py-1 font-semibold text-[var(--primary)]">{sourceLabel(item.source)}</span>
          {item.targetId && !item.target && (
            <code className="rounded-md bg-[var(--foreground)]/[0.06] px-2 py-0.5 font-mono text-[var(--muted-foreground)]">#{item.targetId}</code>
          )}
        </div>

        {item.target && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/[0.06] px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">Thẻ bị báo lỗi</p>
              <p className="mt-0.5 truncate text-sm text-[var(--foreground)]">
                <span lang="ja" className="font-semibold">{item.target.front}</span>
                <span className="text-[var(--muted-foreground)]">
                  {" "}· {item.target.deckTitle}
                  {item.target.shared ? "" : " (bộ cá nhân của người học)"}
                </span>
              </p>
            </div>
            <a
              href={targetHref(item.target)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white hover:opacity-90 ${focusRing}`}
            >
              Mở thẻ để sửa
              <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <Initials name={item.reporter} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--foreground)]">{item.reporter}</p>
            <p className="text-xs text-[var(--muted-foreground)]" title={new Date(item.createdAt).toLocaleString("vi-VN")}>
              Gửi {ago(item.createdAt)}
            </p>
          </div>
        </div>

        {item.context && (
          <p className="mt-5 border-l-2 border-[var(--border)] pl-3 text-sm leading-6 text-[var(--muted-foreground)]">{item.context}</p>
        )}
        <p className="mt-4 whitespace-pre-wrap break-words text-[15px] leading-7 text-[var(--foreground)]">{item.message}</p>

        {item.suggestion && (
          <div className="mt-5 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Người học đề xuất sửa thành</p>
            <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--foreground)]">{item.suggestion}</p>
          </div>
        )}

        <section className="mt-8" aria-labelledby="fb-history">
          <h3 id="fb-history" className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Lịch sử xử lý
          </h3>
          <ol className="relative mt-3 space-y-4 border-l border-[var(--border)] pl-5">
            <li className="relative">
              <span aria-hidden className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full border-2 border-[var(--background-1)] bg-sky-500" />
              <p className="text-sm text-[var(--foreground)]">
                <b className="font-semibold">{item.reporter}</b> gửi góp ý
              </p>
              <p className="text-xs text-[var(--muted-foreground)]">{new Date(item.createdAt).toLocaleString("vi-VN")}</p>
            </li>
            {history === null && item.historyCount > 0 && (
              <li className="h-10 animate-pulse rounded-lg bg-[var(--foreground)]/[0.05]" aria-hidden />
            )}
            {history?.map((h, i) => {
              const dot = h.to in STATUS_META ? STATUS_META[h.to as Status].dot : "bg-slate-400";
              return (
                <li key={i} className="relative">
                  <span aria-hidden className={`absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full border-2 border-[var(--background-1)] ${dot}`} />
                  <p className="text-sm text-[var(--foreground)]">
                    <b className="font-semibold">{h.by ?? "Admin"}</b>{" "}
                    {h.from ? (
                      <>
                        chuyển <span className="text-[var(--muted-foreground)]">{statusName(h.from)}</span> → <b className="font-semibold">{statusName(h.to)}</b>
                      </>
                    ) : (
                      <>
                        ghi chú ở <b className="font-semibold">{statusName(h.to)}</b>
                      </>
                    )}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">{new Date(h.at).toLocaleString("vi-VN")}</p>
                  {h.note && (
                    <p className="mt-1.5 rounded-lg bg-[var(--foreground)]/[0.05] px-3 py-2 text-sm leading-6 text-[var(--foreground)]">{h.note}</p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      <div className="border-t border-[var(--border)] bg-[var(--background-1)] px-5 py-4 sm:px-7">
        <label htmlFor="fb-note" className="sr-only">
          Ghi chú xử lý
        </label>
        <textarea
          id="fb-note"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          placeholder="Ghi chú xử lý (tuỳ chọn) — lưu vào lịch sử và người gửi sẽ thấy"
          className={`w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--background-1)] px-3.5 py-2.5 text-sm leading-6 text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] ${focusRing}`}
        />
        <div className="mt-2.5 flex flex-wrap justify-end gap-2">
          {actions.map((a) => (
            <button
              key={a.to}
              type="button"
              disabled={busy !== null}
              onClick={() => void change(a.to)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold transition-colors disabled:opacity-50 ${focusRing} ${
                a.primary
                  ? "bg-emerald-600 text-white shadow-[0_8px_18px_-10px_#059669] hover:bg-emerald-700"
                  : "border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--foreground)]/[0.05]"
              }`}
            >
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${a.primary ? "bg-white" : STATUS_META[a.to].dot}`} />
              {busy === a.to ? "Đang lưu…" : a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
