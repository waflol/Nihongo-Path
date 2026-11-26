"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export const FEEDBACK_SOURCE_LABEL: Record<string, string> = {
  vocabulary: "Từ vựng",
  grammar: "Ngữ pháp",
  transcript: "Phiên âm / transcript",
  translation: "Bản dịch",
  exam: "Đề thi",
  general: "Khác",
};

const STATUS: Record<string, { label: string; tone: string }> = {
  OPEN: { label: "Chờ xử lý", tone: "bg-[#fef3c7] text-[#92400e]" },
  IN_PROGRESS: { label: "Đang xử lý", tone: "bg-[#dbeafe] text-[#1e40af]" },
  RESOLVED: { label: "Đã giải quyết", tone: "bg-[#dcfce7] text-[#166534]" },
  REJECTED: { label: "Không xử lý", tone: "bg-[#f1f5f9] text-[#475569]" },
};
const FILTERS = ["ALL", "OPEN", "IN_PROGRESS", "RESOLVED", "REJECTED"] as const;

interface HistoryEntry {
  from: string | null;
  to: string;
  note: string | null;
  at: string;
}
interface MyFeedback {
  id: string;
  source: string;
  context: string | null;
  message: string;
  suggestion: string | null;
  status: string;
  history: HistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

const fmt = (d: string) =>
  new Date(d).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "bg-[var(--layer-hover)] text-[var(--muted-foreground)]" };
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${s.tone}`}>{s.label}</span>;
}

/**
 * The learner's own feedback / card reports with their processing state and
 * timeline (P5-FEEDBACK-01). `limit` shows only the newest N with a link to
 * the full page; `reloadKey` refetches after a new submission.
 */
export function MyFeedbackList({ limit, reloadKey = 0 }: { limit?: number; reloadKey?: number }) {
  const [rows, setRows] = useState<MyFeedback[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("ALL");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/feedback/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: MyFeedback[]) => {
        if (!alive) return;
        setRows(Array.isArray(data) ? data : []);
        setFailed(false);
      })
      .catch(() => {
        if (!alive) return;
        setRows([]);
        setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  if (rows === null) return <p className="mt-2 text-sm text-[var(--muted-foreground)]">Đang tải…</p>;
  if (failed) return <p className="mt-2 text-sm text-[#b91c1c]">Không tải được danh sách. Thử tải lại trang.</p>;
  if (rows.length === 0) return <p className="mt-2 text-sm text-[var(--muted-foreground)]">Bạn chưa gửi báo lỗi hay góp ý nào.</p>;

  const counts = rows.reduce<Record<string, number>>((acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc), {});
  const filtered = limit ? rows : rows.filter((r) => filter === "ALL" || r.status === filter);
  const shown = limit ? filtered.slice(0, limit) : filtered;

  return (
    <div className="mt-3">
      {!limit && (
        <div role="tablist" aria-label="Lọc theo trạng thái" className="mb-3 flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const n = f === "ALL" ? rows.length : (counts[f] ?? 0);
            const active = filter === f;
            return (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                    : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--layer-hover)]"
                }`}
              >
                {f === "ALL" ? "Tất cả" : STATUS[f].label} · {n}
              </button>
            );
          })}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">Không có mục nào ở trạng thái này.</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((f) => {
            const open = openId === f.id;
            const lastNote = [...f.history].reverse().find((h) => h.note)?.note;
            return (
              <li key={f.id} className="rounded-xl border border-[var(--border)] bg-[var(--background)]">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : f.id)}
                  className="w-full px-4 py-3 text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className={`text-sm text-[var(--foreground)] ${open ? "" : "line-clamp-2"}`}>{f.message}</span>
                    <StatusPill status={f.status} />
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    {FEEDBACK_SOURCE_LABEL[f.source] ?? f.source} · gửi {fmt(f.createdAt)}
                    {f.history.length > 0 && ` · cập nhật ${fmt(f.history[f.history.length - 1].at)}`}
                  </p>
                  {!open && lastNote && (
                    <p className="mt-1.5 line-clamp-1 text-xs text-[var(--foreground)]">
                      <span className="font-medium">Phản hồi:</span> {lastNote}
                    </p>
                  )}
                </button>

                {open && (
                  <div className="border-t border-[var(--border)] px-4 py-3 text-sm">
                    {f.context && (
                      <p className="text-[var(--muted-foreground)]">
                        <span className="font-medium text-[var(--foreground)]">Ngữ cảnh:</span> {f.context}
                      </p>
                    )}
                    {f.suggestion && (
                      <p className="mt-1 text-[var(--muted-foreground)]">
                        <span className="font-medium text-[var(--foreground)]">Đề xuất của bạn:</span> {f.suggestion}
                      </p>
                    )}
                    <h4 className="mt-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Tiến trình</h4>
                    <ol className="mt-2 space-y-2 border-l border-[var(--border)] pl-4">
                      <li className="relative">
                        <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-[var(--muted-foreground)]" aria-hidden="true" />
                        <p className="text-[var(--foreground)]">Đã gửi</p>
                        <p className="text-xs text-[var(--muted-foreground)]">{fmt(f.createdAt)}</p>
                      </li>
                      {f.history.map((h, i) => (
                        <li key={i} className="relative">
                          <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-[var(--primary)]" aria-hidden="true" />
                          <p className="text-[var(--foreground)]">
                            {h.from && h.from !== h.to ? "Chuyển sang " : "Ghi chú ở "}
                            <b className="font-semibold">{STATUS[h.to]?.label ?? h.to}</b>
                          </p>
                          <p className="text-xs text-[var(--muted-foreground)]">{fmt(h.at)}</p>
                          {h.note && (
                            <p className="mt-1 rounded-lg bg-[var(--layer-hover)] px-3 py-2 text-sm text-[var(--foreground)]">{h.note}</p>
                          )}
                        </li>
                      ))}
                    </ol>
                    {f.history.length === 0 && (
                      <p className="mt-2 text-xs text-[var(--muted-foreground)]">Đội ngũ chưa xử lý — bạn sẽ thấy cập nhật ở đây.</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {limit && rows.length > 0 && (
        <Link href="/account/feedback" className="mt-3 inline-block text-sm font-medium text-[var(--primary)] hover:underline">
          Xem tất cả ({rows.length}) và tiến trình xử lý →
        </Link>
      )}
    </div>
  );
}
