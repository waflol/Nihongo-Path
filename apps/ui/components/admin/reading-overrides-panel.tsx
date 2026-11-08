"use client";

import { useCallback, useEffect, useState } from "react";

interface Override {
  word: string;
  reading: string;
  updatedAt?: string;
}

/**
 * Words whose reading a person kept with "Bỏ qua" on an import warning: the
 * analyser now reads them that way. A wrong one can be taken back here.
 */
export function ReadingOverridesPanel() {
  const [rows, setRows] = useState<Override[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/flashcards/admin/reading-overrides", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) {
      setError("Không tải được danh sách");
      return;
    }
    setError(null);
    setRows((await res.json().catch(() => [])) as Override[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function forget(word: string) {
    if (!window.confirm(`Bỏ cách đọc đã học của “${word}”? Máy phân tích sẽ đọc từ này theo cách của nó.`)) return;
    const res = await fetch(`/api/flashcards/admin/reading-overrides/${encodeURIComponent(word)}`, { method: "DELETE" }).catch(() => null);
    if (!res || (!res.ok && res.status !== 404)) {
      setError("Không xóa được");
      return;
    }
    void load();
  }

  const shown = (rows ?? []).filter((r) => !q.trim() || r.word.includes(q.trim()) || r.reading.includes(q.trim()));

  return (
    <div>
      <h1 className="text-xl font-semibold text-[var(--foreground)]">Cách đọc đã học</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Khi bạn bấm “Bỏ qua” ở cảnh báo cách đọc, hệ thống ghi nhớ cách đọc trên thẻ là đúng và máy phân tích đọc từ đó như vậy
        từ nay. Nếu lỡ bấm nhầm, xóa dòng tương ứng ở đây.
      </p>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Tìm từ hoặc cách đọc…"
        className="mt-4 w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
      />
      {error && <p className="mt-3 text-sm text-[#b91c1c]">{error}</p>}
      {rows === null && !error && <p className="mt-4 text-sm text-[var(--muted-foreground)]">Đang tải…</p>}
      {rows && shown.length === 0 && (
        <p className="mt-4 text-sm text-[var(--muted-foreground)]">{rows.length === 0 ? "Chưa có từ nào được học." : "Không có từ khớp."}</p>
      )}
      {shown.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--layer)] text-left text-xs text-[var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2">Từ</th>
                <th className="px-3 py-2">Cách đọc</th>
                <th className="px-3 py-2">Học lúc</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.word} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 font-medium text-[var(--foreground)]">{r.word}</td>
                  <td className="px-3 py-2">{r.reading}</td>
                  <td className="px-3 py-2 text-[var(--muted-foreground)]">
                    {r.updatedAt ? new Date(r.updatedAt).toLocaleString("vi-VN") : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => void forget(r.word)}
                      className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs font-medium text-[#b91c1c] hover:bg-[var(--layer-hover)]"
                    >
                      Xóa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
