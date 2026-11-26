"use client";

import { useState } from "react";
import { FEEDBACK_SOURCE_LABEL, MyFeedbackList } from "@/components/account/my-feedback-list";

const SOURCES = Object.entries(FEEDBACK_SOURCE_LABEL).map(([value, label]) => ({ value, label }));

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
  const [reloadKey, setReloadKey] = useState(0);

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
    setReloadKey((k) => k + 1);
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

      <h3 className="mt-6 text-sm font-semibold text-[var(--foreground)]">Báo lỗi &amp; góp ý gần đây</h3>
      <MyFeedbackList limit={3} reloadKey={reloadKey} />
    </section>
  );
}
