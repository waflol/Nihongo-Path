"use client";

import { useState } from "react";
import { deskButton as btn } from "./exam-import-draft-model";

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
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--sheet-rule)] bg-[var(--sheet)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--sheet-rule)] px-3 py-2 text-sm">
        <span className="font-medium text-[var(--foreground)]">Trang PDF {page}</span>
        {to > from && (
          <>
            <button type="button" className={btn} disabled={page <= from} onClick={() => go(page - 1)} aria-label="Trang trước">
              Trước
            </button>
            <button type="button" className={btn} disabled={page >= to} onClick={() => go(page + 1)} aria-label="Trang sau">
              Sau
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
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-2">
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
