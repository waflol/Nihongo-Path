"use client";

import { useCallback, useEffect, useState } from "react";

const SOURCES: { value: string; label: string }[] = [
  { value: "vocabulary", label: "Từ vựng" },
  { value: "grammar", label: "Ngữ pháp" },
  { value: "transcript", label: "Phiên âm / transcript" },
  { value: "translation", label: "Bản dịch" },
  { value: "exam", label: "Đề thi" },
  { value: "general", label: "Khác" },
];

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Chờ xử lý",
  IN_PROGRESS: "Đang xử lý",
  RESOLVED: "Đã giải quyết",
  REJECTED: "Bỏ qua",
};

interface MyFeedback {
  id: string;
  source: string;
  message: string;
  status: string;
  historyCount: number;
  createdAt: string;
}

/**
 * Learner feedback panel (P5-FEEDBACK-01): file a general feedback and follow
 * its processing state. Reads/writes `/api/feedback` (+ `/me`).
 */
export function FeedbackPanel() {
  const [source, setSource] = useState("vocabulary");
  const [context, setContext] = useState("");
  const [message, setMessage] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<MyFeedback[] | null>(null);

  const loadMine = useCallback(() => {
    fetch("/api/feedback/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((rows: MyFeedback[] | null) => setMine(rows ?? []))
      .catch(() => setMine([]));
  }, []);

  useEffect(loadMine, [loadMine]);

  async function submit() {
    if (!message.trim()) {
      setError("Hãy nhập nội dung góp ý.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, context, message, suggestion }),
    }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) {
      const body = res ? await res.json().catch(() => null) : null;
      setError(typeof body?.message === "string" && body.message ? body.message : "Không gửi được góp ý. Thử lại sau.");
      return;
    }
    setDone(true);
    setMessage("");
    setContext("");
    setSuggestion("");
    loadMine();
  }

  const field =
    "mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary-focus)]";

  return (
    <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
      <h2 className="text-base font-semibold text-[var(--foreground)]">Góp ý với đội ngũ</h2>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Báo lỗi cách đọc, bản dịch, transcript hay góp ý tính năng — đội ngũ xử lý và cập nhật trạng thái ở đây.
      </p>

      {done ? (
        <p className="mt-4 rounded-lg bg-[var(--layer-hover)] px-4 py-3 text-sm text-[var(--foreground)]">
          Cảm ơn bạn! Góp ý đã được gửi, bạn theo dõi trạng thái ở dưới nhé.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-[var(--foreground)]">
              Loại
              <select value={source} onChange={(e) => setSource(e.target.value)} className={field}>
                {SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-[var(--foreground)]">
              Ngữ cảnh (tuỳ chọn)
              <input
                value={context}
                onChange={(e) => setContext(e.target.value)}
                maxLength={500}
                placeholder="Ví dụ: thẻ 猫 trong bộ JLPT N5, trang học bài đọc…"
                className={field}
              />
            </label>
          </div>
          <label className="mt-3 block text-sm text-[var(--foreground)]">
            Nội dung
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={4000}
              rows={3}
              placeholder="Mô tả vấn đề hoặc đề xuất của bạn…"
              className={field}
            />
          </label>
          <label className="mt-3 block text-sm text-[var(--foreground)]">
            Đề xuất (tuỳ chọn)
            <textarea
              value={suggestion}
              onChange={(e) => setSuggestion(e.target.value)}
              maxLength={4000}
              rows={2}
              placeholder="Nếu bạn biết cách sửa đúng thì ghi ở đây."
              className={field}
            />
          </label>
          {error && (
            <p role="alert" className="mt-3 rounded-lg bg-[#fef2f2] px-3 py-2 text-sm text-[#b91c1c]">
              {error}
            </p>
          )}
          <div className="mt-4">
            <button
              type="button"
              disabled={busy}
              onClick={submit}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Đang gửi…" : "Gửi góp ý"}
            </button>
          </div>
        </>
      )}

      <h3 className="mt-6 text-sm font-semibold text-[var(--foreground)]">Góp ý của bạn</h3>
      {mine === null ? (
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">Đang tải…</p>
      ) : mine.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">Chưa có góp ý nào.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {mine.map((f) => (
            <li key={f.id} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[var(--foreground)]">{f.message}</span>
                <span className="shrink-0 rounded-full bg-[var(--layer-hover)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">
                  {STATUS_LABEL[f.status] ?? f.status}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                {SOURCES.find((s) => s.value === f.source)?.label ?? f.source} ·{" "}
                {f.historyCount > 0 ? `đã xử lý ${f.historyCount} lần` : "chưa được xử lý"} ·{" "}
                {new Date(f.createdAt).toLocaleDateString("vi-VN")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
