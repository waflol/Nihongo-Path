"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FeedbackDetail,
  Initials,
  SOURCES,
  STATUSES,
  STATUS_META,
  ago,
  focusRing,
  sourceLabel,
  type FeedbackItem,
  type Status,
} from "./feedback-detail";

interface FeedbackPage {
  page: number;
  limit: number;
  total: number;
  counts?: Partial<Record<Status, number>>;
  items: FeedbackItem[];
}

const PAGE_SIZE = 30;

/**
 * Admin inbox for general learner feedback (P5-FEEDBACK-02). Two panes on
 * desktop: the list (status tabs with counts, source filter, search within the
 * loaded page) and the selected item (message, suggestion, status change with
 * a note, processing timeline). On phones the detail replaces the list.
 */
export function FeedbackConsole() {
  const [status, setStatus] = useState<Status>("OPEN");
  const [source, setSource] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<FeedbackPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<FeedbackItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (page: number): Promise<FeedbackPage | null> => {
      const qs = new URLSearchParams({ status, page: String(page), limit: String(PAGE_SIZE) });
      if (source !== "all") qs.set("source", source);
      const res = await fetch(`/api/admin/feedback?${qs.toString()}`, { cache: "no-store" }).catch(() => null);
      if (!res?.ok) return null;
      return (await res.json()) as FeedbackPage;
    },
    [status, source],
  );

  const load = useCallback(async () => {
    setLoading(true);
    const page = await fetchPage(1);
    setLoading(false);
    if (!page) {
      setError("Không tải được hộp thư phản hồi.");
      return;
    }
    setError(null);
    setData(page);
  }, [fetchPage]);

  useEffect(() => {
    // Refetch when a filter changes; state is set after the request settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  async function loadMore() {
    if (!data) return;
    setLoading(true);
    const next = await fetchPage(data.page + 1);
    setLoading(false);
    if (next) setData({ ...next, items: data.items.concat(next.items.filter((n) => !data.items.some((o) => o.id === n.id))) });
  }

  async function setItemStatus(id: string, next: Status, note?: string): Promise<boolean> {
    const res = await fetch(`/api/admin/feedback/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next, note }),
    }).catch(() => null);
    if (!res?.ok) {
      setError("Không cập nhật được trạng thái.");
      return false;
    }
    setError(null);
    // Keep the open item on screen with its new status; the list drops it
    // from the current tab on reload.
    setSelected((cur) => (cur && cur.id === id ? { ...cur, status: next, historyCount: cur.historyCount + 1 } : cur));
    setToast(`Đã chuyển sang “${STATUS_META[next].label}”`);
    void load();
    return true;
  }

  const items = data?.items ?? [];
  const q = query.trim().toLowerCase();
  const shown = q
    ? items.filter((f) => [f.message, f.suggestion, f.context, f.reporter, f.targetId].some((v) => v?.toLowerCase().includes(q)))
    : items;
  const count = (s: Status) => data?.counts?.[s];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">Quản trị · Góp ý người học</p>
          <h1 className="mt-1.5 text-[28px] font-semibold leading-tight tracking-tight text-[var(--foreground)]">Hộp thư phản hồi</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
            Góp ý về từ vựng, ngữ pháp, phiên âm, bản dịch và đề thi. Mọi lần đổi trạng thái kèm ghi chú đều được lưu vào lịch sử xử lý.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--foreground)]/[0.05] disabled:opacity-50 ${focusRing}`}
        >
          <svg aria-hidden viewBox="0 0 24 24" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-2.64-6.36M21 4v5h-5" />
          </svg>
          Làm mới
        </button>
      </header>

      <div role="tablist" aria-label="Trạng thái" className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STATUSES.map((s) => {
          const on = status === s;
          const meta = STATUS_META[s];
          return (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => {
                setStatus(s);
                setSelected(null);
              }}
              className={`flex items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left transition-all ${focusRing} ${
                on
                  ? "border-[var(--foreground)]/80 bg-[var(--background-1)] shadow-[0_10px_24px_-18px_rgba(10,14,30,0.6)]"
                  : "border-[var(--border)] bg-[var(--background-1)]/60 hover:border-[var(--foreground)]/30"
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
                <span aria-hidden className={`h-2 w-2 rounded-full ${meta.dot}`} />
                {meta.label}
              </span>
              <span className={`text-xl font-semibold tabular-nums ${on ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)]"}`}>
                {count(s) ?? "—"}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <div role="alert" className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/[0.06] px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
          <button type="button" onClick={() => void load()} className={`rounded-lg px-3 py-1.5 font-semibold hover:bg-red-500/10 ${focusRing}`}>
            Thử lại
          </button>
        </div>
      )}

      <div className="mt-4 grid min-h-[min(72vh,760px)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background-1)] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_18px_40px_-28px_rgba(10,14,30,0.45)] lg:h-[min(72vh,760px)] lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
        {/* List pane */}
        <section aria-label="Danh sách góp ý" className={`flex min-h-0 flex-col border-[var(--border)] lg:border-r ${selected ? "hidden lg:flex" : "flex"}`}>
          <div className="space-y-2.5 border-b border-[var(--border)] p-3">
            <div className="relative">
              <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                type="search"
                aria-label="Tìm trong danh sách"
                placeholder="Tìm nội dung, người gửi…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className={`h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--background-1)] pl-9 pr-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] ${focusRing}`}
              />
            </div>
            <div role="radiogroup" aria-label="Nguồn góp ý" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
              {[{ v: "all", l: "Tất cả" }, ...SOURCES].map((s) => {
                const on = source === s.v;
                return (
                  <button
                    key={s.v}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      setSource(s.v);
                      setSelected(null);
                    }}
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${focusRing} ${
                      on
                        ? "bg-[var(--foreground)] text-[var(--background-1)]"
                        : "bg-[var(--foreground)]/[0.05] text-[var(--muted-foreground)] hover:bg-[var(--foreground)]/10 hover:text-[var(--foreground)]"
                    }`}
                  >
                    {s.l}
                  </button>
                );
              })}
            </div>
          </div>

          <ul className="min-h-0 flex-1 divide-y divide-[var(--border)] overflow-y-auto">
            {data === null &&
              !error &&
              [0, 1, 2, 3].map((i) => (
                <li key={i} aria-hidden className="space-y-2 px-4 py-4">
                  <div className="h-3 w-1/3 animate-pulse rounded bg-[var(--foreground)]/[0.07]" />
                  <div className="h-3 w-full animate-pulse rounded bg-[var(--foreground)]/[0.05]" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--foreground)]/[0.05]" />
                </li>
              ))}

            {data && shown.length === 0 && (
              <li className="px-6 py-16 text-center">
                <p className="text-[15px] font-semibold text-[var(--foreground)]">{q ? "Không có kết quả" : "Hộp thư trống"}</p>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  {q ? `Không có góp ý nào khớp “${query}”.` : `Không có góp ý nào ở mục “${STATUS_META[status].label}”.`}
                </p>
              </li>
            )}

            {shown.map((f) => {
              const on = selected?.id === f.id;
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(f)}
                    aria-current={on ? "true" : undefined}
                    className={`relative block w-full px-4 py-3.5 text-left transition-colors focus-visible:bg-[var(--foreground)]/[0.05] focus-visible:outline-none ${
                      on ? "bg-[var(--primary)]/[0.07]" : "hover:bg-[var(--foreground)]/[0.03]"
                    }`}
                  >
                    {on && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-[var(--primary)]" />}
                    <div className="flex items-center gap-2.5">
                      <Initials name={f.reporter} size="h-7 w-7 text-[11px]" />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--foreground)]">{f.reporter}</span>
                      <span className="shrink-0 text-[11px] tabular-nums text-[var(--muted-foreground)]">{ago(f.createdAt)}</span>
                    </div>
                    <p className="mt-2 line-clamp-2 break-words text-sm leading-5 text-[var(--foreground)]">{f.message}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="rounded-full bg-[var(--primary)]/10 px-2 py-0.5 font-semibold text-[var(--primary)]">{sourceLabel(f.source)}</span>
                      {f.target && (
                        <span className="max-w-[12rem] truncate rounded-full bg-[var(--foreground)]/[0.06] px-2 py-0.5 text-[var(--muted-foreground)]">
                          Thẻ <span lang="ja">{f.target.front}</span> · {f.target.deckTitle}
                        </span>
                      )}
                      {f.suggestion && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-300">Có đề xuất</span>}
                      {f.historyCount > 0 && <span className="text-[var(--muted-foreground)]">· {f.historyCount} lần xử lý</span>}
                    </div>
                  </button>
                </li>
              );
            })}

            {data && data.total > items.length && !q && (
              <li className="p-3">
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loading}
                  className={`w-full rounded-lg border border-dashed border-[var(--border)] py-2 text-sm font-medium text-[var(--muted-foreground)] hover:border-[var(--foreground)]/30 hover:text-[var(--foreground)] disabled:opacity-50 ${focusRing}`}
                >
                  {loading ? "Đang tải…" : `Tải thêm (${items.length}/${data.total})`}
                </button>
              </li>
            )}
          </ul>
        </section>

        {/* Detail pane */}
        <section aria-label="Chi tiết góp ý" className={`min-h-0 ${selected ? "block" : "hidden lg:block"}`}>
          {selected ? (
            <FeedbackDetail key={selected.id} item={selected} onBack={() => setSelected(null)} onStatus={setItemStatus} />
          ) : (
            <div className="grid h-full place-items-center p-10 text-center">
              <div>
                <span aria-hidden className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--foreground)]/[0.05] text-[var(--muted-foreground)]">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 13h4l1.5 3h5L16 13h4M5 5h14l1 8v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5z" />
                  </svg>
                </span>
                <p className="mt-4 text-[15px] font-semibold text-[var(--foreground)]">Chọn một góp ý</p>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">Nội dung, đề xuất và lịch sử xử lý sẽ hiện ở đây.</p>
              </div>
            </div>
          )}
        </section>
      </div>

      {toast && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2.5 rounded-xl bg-[#14161f] px-4 py-3 text-sm font-medium text-white shadow-[0_18px_40px_-14px_rgba(0,0,0,0.5)]"
        >
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
          {toast}
        </div>
      )}
    </div>
  );
}
