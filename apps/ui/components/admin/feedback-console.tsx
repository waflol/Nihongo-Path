"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Status = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "REJECTED";

interface HistoryEntry {
  from: string | null;
  to: string;
  by: string | null;
  note: string | null;
  at: string;
}

interface FeedbackItem {
  id: string;
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

interface FeedbackPage {
  page: number;
  limit: number;
  total: number;
  items: FeedbackItem[];
}

const SOURCES = [
  { v: "vocabulary", l: "Từ vựng" },
  { v: "grammar", l: "Ngữ pháp" },
  { v: "transcript", l: "Phiên âm / transcript" },
  { v: "translation", l: "Bản dịch" },
  { v: "exam", l: "Đề thi" },
  { v: "general", l: "Khác" },
] as const;

const STATUS_LABEL: Record<Status, string> = {
  OPEN: "Chưa xử lý",
  IN_PROGRESS: "Đang xử lý",
  RESOLVED: "Đã giải quyết",
  REJECTED: "Bỏ qua",
};

function ago(iso?: string): string {
  if (!iso) return "";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  if (m < 1440) return `${Math.round(m / 60)} giờ trước`;
  return `${Math.round(m / 1440)} ngày trước`;
}

/**
 * Admin inbox for general learner feedback (P5-FEEDBACK-02): filter by
 * status / source, change a status (with an optional note) and expand the
 * full processing history — who moved it from → to, when, with what note.
 */
export function FeedbackConsole() {
  const [status, setStatus] = useState<Status>("OPEN");
  const [source, setSource] = useState<string>("all");
  const [data, setData] = useState<FeedbackPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const qs = new URLSearchParams();
    qs.set("status", status);
    if (source !== "all") qs.set("source", source);
    const res = await fetch(`/api/admin/feedback?${qs.toString()}`, { cache: "no-store" }).catch(
      () => null,
    );
    if (!res || !res.ok) {
      setError("Không tải được danh sách góp ý.");
      return;
    }
    setData((await res.json()) as FeedbackPage);
  }, [status, source]);

  useEffect(() => {
    void load();
  }, [load]);

  const [historyMap, setHistoryMap] = useState<Record<string, HistoryEntry[]>>({});

  async function setItemStatus(id: string, next: Status) {
    const prev = data;
    setData((cur) =>
      cur
        ? { ...cur, items: cur.items.map((f) => (f.id === id ? { ...f, status: next } : f)) }
        : null,
    );
    const res = await fetch(`/api/admin/feedback/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next, note: note[id]?.trim() || undefined }),
    }).catch(() => null);
    setNote((n) => {
      const c = { ...n };
      delete c[id];
      return c;
    });
    if (!res?.ok) {
      setData(prev);
      setError("Không cập nhật được trạng thái.");
    }
    void load();
  }

  async function loadHistory(id: string) {
    setExpanded(id);
    const res = await fetch(`/api/admin/feedback/${id}`, { cache: "no-store" }).catch(() => null);
    if (!res || !res.ok) return;
    const full = (await res.json()) as { history: HistoryEntry[] };
    setHistoryMap((m) => ({ ...m, [id]: full.history }));
  }

  const items = data?.items ?? [];
  const counts = useMemo(() => {
    const c: Record<Status, number> = { OPEN: 0, IN_PROGRESS: 0, RESOLVED: 0, REJECTED: 0 };
    for (const f of items) c[f.status] += 1;
    return c;
  }, [items]);

  const seg = (active: boolean) =>
    "whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium " +
    (active
      ? "bg-[var(--primary)] text-[var(--primary-foreground,#fff)]"
      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]");
  const chip = (active: boolean) =>
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium " +
    (active
      ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground,#fff)]"
      : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--layer-hover)]");
  const btn =
    "rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--layer-hover)]";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">Hộp thư phản hồi</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Góp ý chung từ người học (từ vựng, ngữ pháp, phiên âm, bản dịch, đề thi). Đổi trạng thái và
        xem lịch sử xử lý của từng mục.
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Nguồn góp ý" className="inline-flex flex-wrap rounded-full border border-[var(--border)] p-0.5">
          <button type="button" role="tab" aria-selected={source === "all"} onClick={() => setSource("all")} className={seg(source === "all")}>
            Tất cả
          </button>
          {SOURCES.map((s) => (
            <button key={s.v} type="button" role="tab" aria-selected={source === s.v} onClick={() => setSource(s.v)} className={seg(source === s.v)}>
              {s.l}
            </button>
          ))}
        </div>
        <div role="tablist" aria-label="Trạng thái" className="inline-flex flex-wrap rounded-full border border-[var(--border)] p-0.5">
          {(["OPEN", "IN_PROGRESS", "RESOLVED", "REJECTED"] as Status[]).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={status === s}
              onClick={() => setStatus(s)}
              className={seg(status === s)}
            >
              {STATUS_LABEL[s]}
              {data ? <span className="ml-1.5 text-xs opacity-80">{counts[s]}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {data === null && !error && <p className="text-sm text-[var(--muted-foreground)]">Đang tải…</p>}
        {data && items.length === 0 && (
          <p className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
            Không có góp ý nào ở đây.
          </p>
        )}

        {items.map((f) => {
          const srcMeta = SOURCES.find((s) => s.v === f.source);
          const history = historyMap[f.id];
          const isExpanded = expanded === f.id;
          return (
            <article key={f.id} className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold text-[var(--foreground)]">
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ color: "var(--primary)", background: "color-mix(in srgb, var(--primary) 14%, transparent)" }}
                    >
                      {srcMeta?.l ?? f.source}
                    </span>
                    <span className="truncate">{f.message}</span>
                  </h3>
                  {f.context && (
                    <p className="mt-1 truncate text-sm text-[var(--muted-foreground)]">
                      {f.context}
                      {f.targetId ? ` · #${f.targetId}` : ""}
                    </p>
                  )}
                </div>
                <div className="text-right text-xs text-[var(--muted-foreground)]">
                  <p>{f.reporter}</p>
                  <p className="mt-0.5">{ago(f.createdAt)}</p>
                </div>
              </div>

              {f.suggestion && (
                <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2">
                  <p className="text-xs font-semibold text-[var(--muted-foreground)]">Đề xuất</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-[var(--foreground)]">{f.suggestion}</p>
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {f.status !== "IN_PROGRESS" && (
                  <button type="button" onClick={() => setItemStatus(f.id, "IN_PROGRESS")} className={btn}>
                    Đang xử lý
                  </button>
                )}
                {f.status !== "RESOLVED" && (
                  <button type="button" onClick={() => setItemStatus(f.id, "RESOLVED")} className={btn}>
                    Đã giải quyết
                  </button>
                )}
                {f.status !== "REJECTED" && (
                  <button type="button" onClick={() => setItemStatus(f.id, "REJECTED")} className={btn}>
                    Bỏ qua
                  </button>
                )}
                {f.status !== "OPEN" && (
                  <button type="button" onClick={() => setItemStatus(f.id, "OPEN")} className={btn}>
                    Mở lại
                  </button>
                )}
                <span className="ml-auto flex items-center gap-2">
                  <input
                    value={note[f.id] ?? ""}
                    onChange={(e) => setNote((n) => ({ ...n, [f.id]: e.target.value }))}
                    placeholder="Ghi chú xử lý (tuỳ chọn)"
                    aria-label="Ghi chú xử lý"
                    className="w-56 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs text-[var(--foreground)]"
                  />
                  <button type="button" onClick={() => loadHistory(f.id)} className={btn}>
                    {isExpanded ? "Ẩn lịch sử" : "Lịch sử"}
                    {f.historyCount > 0 ? ` (${f.historyCount})` : ""}
                  </button>
                </span>
              </div>

              {isExpanded && (
                <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
                  <p className="text-xs font-semibold text-[var(--muted-foreground)]">Lịch sử xử lý</p>
                  {history && history.length > 0 ? (
                    <ol className="mt-2 space-y-1.5 text-xs text-[var(--foreground)]">
                      {history.map((h, i) => (
                        <li key={i} className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium">{h.from ? `${h.from} →` : "→"}</span>
                          <span className="font-semibold">{h.to}</span>
                          {h.by ? <span className="text-[var(--muted-foreground)]">· bởi admin {h.by}</span> : null}
                          <span className="text-[var(--muted-foreground)]">· {new Date(h.at).toLocaleString("vi-VN")}</span>
                          {h.note ? <span className="italic text-[var(--muted-foreground)]">“{h.note}”</span> : null}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                      Chưa có thay đổi trạng thái nào (mới tạo hoặc dùng bản ghi cũ trước khi có lịch sử).
                    </p>
                  )}
                </div>
              )}
            </article>
          );
        })}

        {data && data.total > items.length && (
          <p className="text-center text-xs text-[var(--muted-foreground)]">
            Hiện {items.length}/{data.total} mục — lọc nguồn / trạng thái để xem thêm.
          </p>
        )}
      </div>
    </div>
  );
}
