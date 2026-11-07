"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Status = "OPEN" | "RESOLVED" | "REJECTED";

interface Report {
  id: string;
  cardId: string;
  deckId: string;
  deckTitle: string;
  kind: string;
  message: string;
  suggestion: string;
  cardFront: string;
  cardBack: string;
  cardHanViet: string;
  status: Status;
  reporter: string;
  createdAt?: string;
}

/**
 * Feedback sources. Today only flashcards report errors; grammar / explanation
 * reports plug in here later (add an entry + its kinds), the page stays the same.
 */
const SOURCES = [{ v: "card", l: "Thẻ từ vựng" }] as const;

/** Error kinds per source, with a tint used for the chip and the card's accent bar. */
const KINDS: Record<string, { label: string; tone: string }> = {
  translation: { label: "Dịch / nghĩa sai", tone: "#e11d48" },
  hanviet: { label: "Hán Việt sai", tone: "#d97706" },
  example: { label: "Ví dụ sai", tone: "#7c3aed" },
  reading: { label: "Cách đọc sai", tone: "#0891b2" },
  other: { label: "Lỗi khác", tone: "#64748b" },
};

const STATUSES: { v: Status; l: string }[] = [
  { v: "OPEN", l: "Chưa xử lý" },
  { v: "RESOLVED", l: "Đã sửa" },
  { v: "REJECTED", l: "Bỏ qua" },
];

function ago(iso?: string): string {
  if (!iso) return "";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  if (m < 1440) return `${Math.round(m / 60)} giờ trước`;
  return `${Math.round(m / 1440)} ngày trước`;
}

/** Admin inbox for learner feedback (currently: errors reported on shared-deck cards). */
export function CardReportsConsole() {
  const [all, setAll] = useState<Report[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("OPEN");
  const [kind, setKind] = useState<string>("all");
  const [source, setSource] = useState<string>(SOURCES[0].v);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/flashcards/admin/card-reports", { cache: "no-store" }).catch(
      () => null,
    );
    if (!res || !res.ok) {
      setError("Không tải được danh sách góp ý.");
      return;
    }
    setAll((await res.json()) as Report[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<Status, number> = { OPEN: 0, RESOLVED: 0, REJECTED: 0 };
    for (const r of all ?? []) c[r.status] += 1;
    return c;
  }, [all]);

  const inStatus = useMemo(() => (all ?? []).filter((r) => r.status === status), [all, status]);
  const kindCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of inStatus) c[r.kind] = (c[r.kind] ?? 0) + 1;
    return c;
  }, [inStatus]);
  const shown = kind === "all" ? inStatus : inStatus.filter((r) => r.kind === kind);

  async function setReportStatus(id: string, next: Status) {
    const prev = all;
    setAll((cur) => cur?.map((r) => (r.id === id ? { ...r, status: next } : r)) ?? null);
    const res = await fetch(`/api/flashcards/admin/card-reports/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    }).catch(() => null);
    if (!res?.ok) {
      setAll(prev);
      setError("Không cập nhật được trạng thái.");
    }
  }

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
    "rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--layer-hover)]";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
        Góp ý &amp; báo lỗi
      </h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Người học báo lỗi và đề xuất bản sửa. Xử lý xong thì đánh dấu để danh sách gọn lại.
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        {/* Source: grammar / explanation reports will join here. */}
        <div role="tablist" aria-label="Nguồn góp ý" className="inline-flex rounded-full border border-[var(--border)] p-0.5">
          {SOURCES.map((s) => (
            <button key={s.v} type="button" role="tab" aria-selected={source === s.v} onClick={() => setSource(s.v)} className={seg(source === s.v)}>
              {s.l}
            </button>
          ))}
        </div>
        <div role="tablist" aria-label="Trạng thái" className="inline-flex rounded-full border border-[var(--border)] p-0.5">
          {STATUSES.map((s) => (
            <button
              key={s.v}
              type="button"
              role="tab"
              aria-selected={status === s.v}
              onClick={() => {
                setStatus(s.v);
                setKind("all");
              }}
              className={seg(status === s.v)}
            >
              {s.l}
              {all ? <span className="ml-1.5 text-xs opacity-80">{counts[s.v]}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {inStatus.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setKind("all")} className={chip(kind === "all")}>
            Tất cả {inStatus.length}
          </button>
          {Object.entries(KINDS).map(([k, meta]) =>
            kindCounts[k] ? (
              <button key={k} type="button" onClick={() => setKind(k)} className={chip(kind === k)}>
                {meta.label} {kindCounts[k]}
              </button>
            ) : null,
          )}
        </div>
      )}

      <div className="mt-6 space-y-3">
        {all === null && !error && (
          <p className="text-sm text-[var(--muted-foreground)]">Đang tải…</p>
        )}
        {all && shown.length === 0 && (
          <p className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
            {status === "OPEN" ? "Không có góp ý nào đang chờ xử lý." : "Chưa có mục nào ở đây."}
          </p>
        )}

        {shown.map((r) => {
          const meta = KINDS[r.kind] ?? KINDS.other;
          return (
            <article key={r.id} className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold text-[var(--foreground)]">
                    <span lang="ja">{r.cardFront}</span>
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ color: meta.tone, background: `color-mix(in srgb, ${meta.tone} 14%, transparent)` }}
                    >
                      {meta.label}
                    </span>
                  </h3>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    {r.cardBack}
                    {r.cardHanViet ? ` · ${r.cardHanViet}` : ""}
                  </p>
                </div>
                <div className="text-right text-xs text-[var(--muted-foreground)]">
                  <p>
                    {r.reporter} ·{" "}
                    <span title={r.createdAt ? new Date(r.createdAt).toLocaleString("vi-VN") : ""}>{ago(r.createdAt)}</span>
                  </p>
                  <p className="mt-0.5">{r.deckTitle}</p>
                </div>
              </div>

              {r.message && (
                <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--foreground)]">{r.message}</p>
              )}
              {r.suggestion && (
                <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2">
                  <p className="text-xs font-semibold text-[var(--muted-foreground)]">Đề xuất sửa</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-[var(--foreground)]">{r.suggestion}</p>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/admin/decks/${r.deckId}?card=${r.cardId}`}
                  className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]"
                >
                  Sửa thẻ ↗
                </Link>
                {r.status !== "RESOLVED" && (
                  <button
                    type="button"
                    onClick={() => setReportStatus(r.id, "RESOLVED")}
                    className={btn}
                  >
                    Đã sửa
                  </button>
                )}
                {r.status !== "REJECTED" && (
                  <button type="button" onClick={() => setReportStatus(r.id, "REJECTED")} className={btn}>
                    Bỏ qua
                  </button>
                )}
                {r.status !== "OPEN" && (
                  <button type="button" onClick={() => setReportStatus(r.id, "OPEN")} className={btn}>
                    Mở lại
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
