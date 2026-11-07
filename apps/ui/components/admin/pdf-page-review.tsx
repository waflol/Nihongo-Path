"use client";

import { ErrorsPanel } from "@/components/admin/errors-panel";
import { useCallback, useEffect, useRef, useState } from "react";
import { JOB_STARTED_EVENT, type PdfJob } from "@/components/admin/import-job-tracker";

interface PageRow {
  no: string;
  word: string;
  reading: string;
  hanViet?: string;
  meaning: string;
  /** The word is only the reading although the entry has a Hán Việt reading → the kanji were probably lost. */
  lostKanji?: boolean;
  /** `dupno`: shares its printed number with another entry; `nonum`: no number was read. */
  issue?: "dupno" | "nonum";
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
  const isTable = job.kind === "table";
  const byBlock = isTable && !job.byPage;
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const [imgW, setImgW] = useState<number | null>(null);
  // Block view: the picture and the table scroll together, row for row.
  const sync = (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (byBlock && from && to && to.scrollTop !== from.scrollTop) to.scrollTop = from.scrollTop;
  };
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<PageRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const problems = pages.filter((p) => !p.ok || p.rows === 0 || (p.lostKanji ?? 0) > 0);
  const numPages = pages.filter((p) => (p.numIssues ?? 0) > 0);
  const numTotal = pages.reduce((a, p) => a + (p.numIssues ?? 0), 0);
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

  // Pages are read again on the server: poll its progress, and the user is free to do other things.
  const retrying = !!job.retry;
  useEffect(() => {
    if (!retrying) return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/import?job=${encodeURIComponent(job.id)}`, { cache: "no-store" }).catch(() => null);
      if (r?.ok) {
        const j = (await r.json().catch(() => null)) as PdfJob | null;
        if (j) {
          if (!j.retry) setMsg("Đã đọc lại xong.");
          onChanged(j);
        }
      }
    }, 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retrying, job.id]);

  async function retry(list: number[]) {
    setBusy(true);
    setMsg(null);
    const r = await fetch(`/api/import?action=retry&job=${job.id}&pages=${list.join(",")}`, { method: "POST" }).catch(() => null);
    setBusy(false);
    if (!r?.ok) {
      const d = (await r?.json().catch(() => null)) as { message?: string } | null;
      setMsg(d?.message ?? "Không đọc lại được");
      return;
    }
    onChanged((await r.json()) as PdfJob);
    window.dispatchEvent(new Event(JOB_STARTED_EVENT));
  }

  if (pages.length === 0) return null;
  const total = pages.reduce((a, p) => a + p.rows, 0);

  return (
    <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-5">
      <h2 className="text-base font-semibold text-[var(--foreground)]">Kiểm tra từng trang</h2>
      <ErrorsPanel errors={job.importErrors ?? []} defaultOpen />
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
        {isTable ? byBlock ? `${total} dòng của file, chia thành ${pages.length} nhóm (30 dòng/nhóm).` : `${total} dòng từ ${pages.length} trang của file.` : `Đọc được ${total} dòng từ ${pages.length} trang.`}{" "}
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
      {numTotal > 0 && (
        <p className="mt-2 rounded-lg bg-[#fef9c3] px-3 py-2 text-xs text-[#a16207] dark:bg-[#3a3210] dark:text-[#fde047]">
          {numTotal} dòng dùng chung số thứ tự với dòng khác (các biến thể như 計る・測る・量る) hoặc không có số
          (dòng phụ của từ ghép); các dòng này giữ nguyên số và nghĩa của mục chung — đây là lý do số thẻ nhiều hơn số mục in trong sách. Được đánh dấu màu vàng ở bảng bên
          dưới. Trang:{" "}
          {numPages.slice(0, 30).map((p, i) => (
            <button key={p.n} type="button" onClick={() => setPage(p.n)} className="font-medium underline">
              {i > 0 && ", "}
              {p.n} ({p.numIssues})
            </button>
          ))}
          {numPages.length > 30 && "…"}
        </p>
      )}
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
          {byBlock ? "Nhóm" : "Trang"}
          <select
            value={page}
            onChange={(e) => setPage(Number(e.target.value))}
            className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1"
          >
            {pages.map((p) => (
              <option key={p.n} value={p.n}>
                {p.n} ({p.ok ? `${p.rows} dòng` : "lỗi"}{(p.lostKanji ?? 0) > 0 ? ` · ⚠ ${p.lostKanji} mất kanji` : ""}{(p.numIssues ?? 0) > 0 ? ` · ${p.numIssues} trùng/thiếu số` : ""})
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
        {job.mine !== false && !isTable && (<button
          type="button"
          disabled={busy || retrying}
          onClick={() => void retry([page])}
          className="rounded-lg border border-[var(--border)] px-3 py-1 font-medium text-[var(--primary)] hover:bg-[var(--layer-hover)] disabled:opacity-60"
        >
          Đọc lại trang này
        </button>)}
        {job.mine !== false && !isTable && problems.length > 0 && (
          <button
            type="button"
            disabled={busy || retrying}
            onClick={() => void retry(problems.map((p) => p.n))}
            className="rounded-lg bg-[var(--primary)] px-3 py-1 font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:opacity-60"
          >
            Đọc lại {problems.length} trang cần xem
          </button>
        )}
        {job.retry && (
          <span className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-[var(--muted-foreground)]">
            <span
              role="progressbar"
              aria-valuenow={Math.round((job.retry.done / job.retry.total) * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-2 overflow-hidden rounded-full bg-[var(--layer)]"
            >
              <span
                className="block h-full bg-[var(--primary)] transition-all"
                style={{ width: `${Math.max((job.retry.done / job.retry.total) * 100, 3)}%` }}
              />
            </span>
            Đang đọc lại trang {Math.min(job.retry.done + 1, job.retry.total)}/{job.retry.total} — bạn có thể làm việc khác
          </span>
        )}
        {msg && <span className="text-xs text-[var(--muted-foreground)]">{msg}</span>}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {(
        <div
          ref={leftRef}
          onScroll={() => sync(leftRef.current, rightRef.current)}
          className={`overflow-auto rounded-lg border border-[var(--border)] bg-white ${byBlock ? "max-h-[80vh]" : ""}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={`${job.id}-${page}`}
            onLoad={(e) => setImgW(e.currentTarget.naturalWidth / 2)}
            style={byBlock && imgW ? { width: imgW, maxWidth: "none" } : undefined}
            src={`/api/import?job=${job.id}&page=${page}&kind=image`}
            alt={byBlock ? `Các dòng gốc của nhóm ${page}` : `Trang ${page} của file`}
            className={byBlock ? "h-auto" : "h-auto w-full"}
            loading="lazy"
          />
        </div>
        )}
        <div ref={rightRef} onScroll={() => sync(rightRef.current, leftRef.current)} className="max-h-[80vh] overflow-auto rounded-lg border border-[var(--border)]">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-[var(--layer)] text-xs text-[var(--muted-foreground)]">
              <tr style={byBlock ? { height: 36 } : undefined}>
                <th className="px-2 py-1.5">STT</th>
                <th className="px-2 py-1.5">Từ</th>
                <th className="px-2 py-1.5">Đọc</th>
                <th className="px-2 py-1.5">Hán Việt</th>
                <th className="px-2 py-1.5">Nghĩa</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r, i) => (
                <tr key={i} style={byBlock ? { height: 36 } : undefined} className={`${byBlock ? "[&>td]:max-w-[16rem] [&>td]:truncate [&>td]:whitespace-nowrap [&>td]:shadow-[inset_0_1px_0_var(--border)] " : "border-t border-[var(--border)] "}${r.lostKanji ? "bg-[#fef2f2] dark:bg-[#2a1215]" : r.issue ? "bg-[#fef9c3] dark:bg-[#3a3210]" : ""}`}>
                  <td className="px-2 py-1.5">
                    {r.no}
                    {r.issue && (
                      <span
                        title={r.issue === "dupno" ? "Số này dùng cho nhiều dòng (biến thể của cùng một mục) — các dòng giữ nguyên số và nghĩa chung" : "OCR không đọc được số ở dòng này (dòng phụ) — đã lấy số và nghĩa của mục phía trên"}
                        className="ml-1 rounded bg-[#a16207] px-1 py-0.5 align-middle text-[10px] font-semibold text-white"
                      >
                        {r.issue === "dupno" ? "trùng số" : "không số"}
                      </span>
                    )}
                  </td>
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
