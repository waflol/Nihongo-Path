"use client";

import { useCallback, useEffect, useState } from "react";
import type { PdfJob } from "@/components/admin/import-job-tracker";

interface PageRow {
  no: string;
  word: string;
  reading: string;
  hanViet?: string;
  meaning: string;
  /** The word is only the reading although the entry has a Hán Việt reading → the kanji were probably lost. */
  lostKanji?: boolean;
}

/**
 * Page-by-page check of an OCR'd PDF: the original page on the left, what was
 * read from it on the right. Problem pages (unreadable, or empty) are flagged
 * and can be read again — one by one or all at once.
 */
export function PdfPageReview({
  job,
  onChanged,
}: {
  job: PdfJob;
  /** Called after a page was read again (the import rows changed). */
  onChanged: (job: PdfJob) => void;
}) {
  const pages = job.pages ?? [];
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<PageRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const problems = pages.filter((p) => !p.ok || p.rows === 0 || (p.lostKanji ?? 0) > 0);
  const lostTotal = pages.reduce((a, p) => a + (p.lostKanji ?? 0), 0);
  const current = pages[page - 1];

  const loadRows = useCallback(async () => {
    const r = await fetch(`/api/import?job=${job.id}&page=${page}&kind=rows`, { cache: "no-store" }).catch(() => null);
    const data = r?.ok ? ((await r.json().catch(() => null)) as { rows: PageRow[] } | null) : null;
    setRows(data?.rows ?? []);
  }, [job.id, page]);

  useEffect(() => {
    const t = setTimeout(() => void loadRows(), 0);
    return () => clearTimeout(t);
  }, [loadRows, current?.rows, current?.ok]);

  async function retry(list: number[]) {
    setBusy(true);
    setMsg(null);
    let last: PdfJob | null = null;
    for (const n of list) {
      setMsg(`Đang đọc lại trang ${n}…`);
      const r = await fetch(`/api/import?action=retry&job=${job.id}&page=${n}`, { method: "POST" }).catch(() => null);
      if (!r?.ok) {
        const d = (await r?.json().catch(() => null)) as { message?: string } | null;
        setMsg(d?.message ?? `Không đọc lại được trang ${n}`);
        break;
      }
      last = (await r.json()) as PdfJob;
    }
    setBusy(false);
    if (last) {
      setMsg("Đã đọc lại xong.");
      onChanged(last);
    }
  }

  if (pages.length === 0) return null;
  const total = pages.reduce((a, p) => a + p.rows, 0);

  return (
    <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-5">
      <h2 className="text-base font-semibold text-[var(--foreground)]">Kiểm tra từng trang</h2>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
        Đọc được {total} dòng từ {pages.length} trang.{" "}
        {problems.length > 0 ? (
          <>
            <strong className="text-[#b91c1c]">{problems.length} trang cần xem lại</strong> (lỗi, không có dòng nào, hoặc có chữ Hán bị mất):{" "}
            {problems.slice(0, 20).map((p, i) => (
              <button key={p.n} type="button" onClick={() => setPage(p.n)} className="text-[var(--primary)] hover:underline">
                {i > 0 && ", "}
                {p.n}
              </button>
            ))}
            {problems.length > 20 && "…"}
          </>
        ) : (
          "Mọi trang đều có dữ liệu."
        )}
      </p>
      {lostTotal > 0 && (
        <p role="alert" className="mt-2 rounded-lg bg-[#fef2f2] px-3 py-2 text-xs text-[#b91c1c]">
          {lostTotal} dòng có thể đã mất chữ Hán: cột “Từ” chỉ có cách đọc kana (ví dụ こうどう thay vì 行動) dù dòng có
          âm Hán Việt. Bấm “Đọc lại” ở các trang được đánh dấu — hệ thống sẽ đọc lại bằng dịch vụ AI khác, hoặc sửa tay
          trước khi nhập.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
          className="rounded-lg border border-[var(--border)] px-3 py-1 disabled:opacity-50"
        >
          ←
        </button>
        <label className="flex items-center gap-1">
          Trang
          <select
            value={page}
            onChange={(e) => setPage(Number(e.target.value))}
            className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1"
          >
            {pages.map((p) => (
              <option key={p.n} value={p.n}>
                {p.n} ({p.ok ? `${p.rows} dòng` : "lỗi"}{(p.lostKanji ?? 0) > 0 ? ` · ⚠ ${p.lostKanji} mất kanji` : ""})
              </option>
            ))}
          </select>
          / {pages.length}
        </label>
        <button
          type="button"
          disabled={page >= pages.length}
          onClick={() => setPage((p) => p + 1)}
          className="rounded-lg border border-[var(--border)] px-3 py-1 disabled:opacity-50"
        >
          →
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void retry([page])}
          className="rounded-lg border border-[var(--border)] px-3 py-1 font-medium text-[var(--primary)] hover:bg-[var(--layer-hover)] disabled:opacity-60"
        >
          Đọc lại trang này
        </button>
        {problems.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void retry(problems.map((p) => p.n))}
            className="rounded-lg bg-[var(--primary)] px-3 py-1 font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:opacity-60"
          >
            Đọc lại {problems.length} trang cần xem
          </button>
        )}
        {msg && <span className="text-xs text-[var(--muted-foreground)]">{msg}</span>}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="overflow-auto rounded-lg border border-[var(--border)] bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={`${job.id}-${page}`}
            src={`/api/import?job=${job.id}&page=${page}&kind=image`}
            alt={`Trang ${page} của file PDF`}
            className="h-auto w-full"
            loading="lazy"
          />
        </div>
        <div className="max-h-[80vh] overflow-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-[var(--layer)] text-xs text-[var(--muted-foreground)]">
              <tr>
                <th className="px-2 py-1.5">STT</th>
                <th className="px-2 py-1.5">Từ</th>
                <th className="px-2 py-1.5">Đọc</th>
                <th className="px-2 py-1.5">Hán Việt</th>
                <th className="px-2 py-1.5">Nghĩa</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r, i) => (
                <tr key={i} className={`border-t border-[var(--border)] ${r.lostKanji ? "bg-[#fef2f2] dark:bg-[#2a1215]" : ""}`}>
                  <td className="px-2 py-1.5">{r.no}</td>
                  <td className="px-2 py-1.5 font-medium">
                    {r.word}
                    {r.lostKanji && (
                      <span
                        title="Dòng có âm Hán Việt nên từ này có chữ Hán, nhưng cột Từ chỉ có cách đọc"
                        className="ml-1.5 rounded bg-[#b91c1c] px-1 py-0.5 align-middle text-[10px] font-semibold text-white"
                      >
                        mất kanji?
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">{r.reading}</td>
                  <td className="px-2 py-1.5">{r.hanViet}</td>
                  <td className="px-2 py-1.5">{r.meaning}</td>
                </tr>
              ))}
              {rows !== null && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-6 text-center text-[var(--muted-foreground)]">
                    {current && !current.ok ? "Trang này đọc lỗi — bấm “Đọc lại trang này”." : "Không có dòng nào trên trang này."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
