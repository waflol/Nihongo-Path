"use client";

import { useCallback, useEffect, useState } from "react";

interface Override {
  word: string;
  reading: string;
  readings?: string[];
  readingMeanings?: { reading: string; meaning: string }[];
  updatedAt?: string;
}

/**
 * The learned vocabulary: words a person fixed by hand on a card, or kept with
 * "Bỏ qua" on a warning. The analyser reads them that way and the AI check skips
 * them by default. A wrong one can be taken back here.
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
    if (!window.confirm(`Xóa “${word}” khỏi từ vựng đã học? Máy phân tích sẽ đọc từ này theo cách của nó và AI sẽ kiểm tra lại từ này.`)) return;
    const res = await fetch(`/api/flashcards/admin/reading-overrides/${encodeURIComponent(word)}`, { method: "DELETE" }).catch(() => null);
    if (!res || (!res.ok && res.status !== 404)) {
      setError("Không xóa được");
      return;
    }
    void load();
  }

  const term = q.trim().toLowerCase();
  const readingsOf = (r: Override) => (r.readings && r.readings.length > 0 ? r.readings : [r.reading]);
  const shown = (rows ?? []).filter(
    (r) =>
      !term ||
      r.word.includes(term) ||
      readingsOf(r).some((x) => x.includes(term)) ||
      (r.readingMeanings ?? []).some((x) => x.meaning.toLowerCase().includes(term)),
  );

  const meaningOf = (r: (typeof shown)[number]) =>
    (r.readingMeanings ?? []).length > 0
      ? (r.readingMeanings ?? []).map((x) => (readingsOf(r).length > 1 ? `${x.reading}: ${x.meaning}` : x.meaning)).join("; ")
      : "—";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">Từ vựng đã học</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--muted-foreground)]">
        Khi bạn sửa tay cách đọc hoặc nghĩa của một thẻ, hoặc bấm “Bỏ qua” ở cảnh báo cách đọc, từ đó được lưu vào đây. Máy phân
        tích đọc từ như vậy từ nay, và khi AI kiểm tra bộ thẻ, các từ đã học được bỏ qua (trừ khi chọn “Kiểm tra cả từ vựng đã
        học”). Nếu lưu nhầm, xóa dòng tương ứng ở đây.
      </p>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Tìm từ, cách đọc hoặc nghĩa…"
        className="mt-4 w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-base sm:rounded-lg sm:py-2 sm:text-sm"
      />
      {error && <p className="mt-3 text-sm text-[#b91c1c]">{error}</p>}
      {rows === null && !error && <p className="mt-4 text-sm text-[var(--muted-foreground)]">Đang tải…</p>}
      {rows && shown.length === 0 && (
        <p className="mt-4 text-sm text-[var(--muted-foreground)]">{rows.length === 0 ? "Chưa có từ nào được học." : "Không có từ khớp."}</p>
      )}
      {shown.length > 0 && (
        <ul className="mt-4 space-y-3 sm:hidden">
          {shown.map((r) => (
            <li key={r.word} className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words text-xl font-semibold leading-tight text-[var(--foreground)]" lang="ja">{r.word}</p>
                  <p className="mt-1 break-words text-sm text-[var(--primary)]" lang="ja">{readingsOf(r).join(" / ") || "—"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void forget(r.word)}
                  className="inline-flex min-h-10 shrink-0 items-center rounded-xl border border-[var(--border)] px-4 text-sm font-medium text-[#b91c1c] hover:bg-[var(--layer-hover)]"
                >
                  Xóa
                </button>
              </div>
              <p className="mt-2 text-sm text-[var(--foreground)]">{meaningOf(r)}</p>
              <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                Học lúc {r.updatedAt ? new Date(r.updatedAt).toLocaleString("vi-VN") : "—"}
              </p>
            </li>
          ))}
        </ul>
      )}
      {shown.length > 0 && (
        <div className="mt-4 hidden overflow-x-auto rounded-xl border border-[var(--border)] sm:block">
          <table className="w-full text-sm">
            <thead className="bg-[var(--layer)] text-left text-xs text-[var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2">Từ</th>
                <th className="px-3 py-2">Cách đọc</th>
                <th className="px-3 py-2">Nghĩa</th>
                <th className="px-3 py-2">Học lúc</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.word} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 font-medium text-[var(--foreground)]">{r.word}</td>
                  <td className="px-3 py-2">{readingsOf(r).join(" / ")}</td>
                  <td className="px-3 py-2 text-[var(--muted-foreground)]">
                    {(r.readingMeanings ?? []).length > 0
                      ? (r.readingMeanings ?? []).map((x) => (readingsOf(r).length > 1 ? `${x.reading}: ${x.meaning}` : x.meaning)).join("; ")
                      : "—"}
                  </td>
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
