"use client";

import { useState } from "react";

const btn =
  "rounded-lg border border-[var(--border)] px-2.5 py-1 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--background-1)] disabled:cursor-not-allowed disabled:opacity-60";

/**
 * The source page(s) of a draft block, rendered from the uploaded PDF, to check the text against
 * the printed paper while editing. A block can run over several pages: step through them.
 */
export function PagePreview({ jobId, from, to }: { jobId: string; from: number; to: number }) {
  const [page, setPage] = useState(from);
  const [zoom, setZoom] = useState(false);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");
  const src = `/api/exam-import?page=${encodeURIComponent(jobId)}&n=${page}`;
  const go = (p: number) => {
    setState("loading");
    setPage(p);
  };

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--background)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-3 py-2 text-sm">
        <span className="font-medium text-[var(--foreground)]">Trang PDF {page}</span>
        {to > from && (
          <>
            <button type="button" className={btn} disabled={page <= from} onClick={() => go(page - 1)} aria-label="Trang trước">
              ←
            </button>
            <button type="button" className={btn} disabled={page >= to} onClick={() => go(page + 1)} aria-label="Trang sau">
              →
            </button>
            <span className="text-xs text-[var(--muted-foreground)]">
              khối nằm ở trang {from}–{to}
            </span>
          </>
        )}
        <button type="button" className={`${btn} ml-auto`} onClick={() => setZoom(!zoom)}>
          {zoom ? "Vừa khung" : "Phóng to"}
        </button>
      </div>
      <div className="max-h-[80vh] overflow-auto p-2">
        {state === "missing" ? (
          <p className="p-3 text-sm text-[var(--muted-foreground)]">
            Không có ảnh trang: file PDF của lần nhập này không còn trên máy chủ (nhập từ trước khi có tính năng này). Nhập lại PDF để xem ảnh.
          </p>
        ) : (
          <>
            {state === "loading" && <p className="p-3 text-sm text-[var(--muted-foreground)]">Đang dựng ảnh trang… (lần đầu mất vài giây)</p>}
            {/* eslint-disable-next-line @next/next/no-img-element -- a same-origin API image, not a static asset */}
            <img
              key={src}
              src={src}
              alt={`Trang ${page} của PDF`}
              onLoad={() => setState("ok")}
              onError={() => setState("missing")}
              className={`${state === "ok" ? "" : "hidden"} h-auto max-w-none bg-white ${zoom ? "w-[160%]" : "w-full"}`}
            />
          </>
        )}
      </div>
    </div>
  );
}
