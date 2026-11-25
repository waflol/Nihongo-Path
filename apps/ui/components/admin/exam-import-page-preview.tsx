"use client";

import { useState } from "react";
import { deskButton as btn } from "./exam-import-draft-model";

/** Image width, as a percentage of the pane. */
const ZOOM = [100, 150, 200, 300];
const small = `${btn} min-w-9 whitespace-nowrap !px-2.5`;

/**
 * The source page(s) of a draft block, rendered from the uploaded PDF, to check the text against
 * the printed paper while editing. A block can run over several pages: step through them.
 */
export function PagePreview({
  jobId,
  from,
  to,
  expanded,
  onToggleExpand,
}: {
  jobId: string;
  from: number;
  to: number;
  /** Narrow screens only: the picture takes the whole work area instead of half of it. */
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const [page, setPage] = useState(from);
  const [zoom, setZoom] = useState(0);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");
  const src = `/api/exam-import?page=${encodeURIComponent(jobId)}&n=${page}`;
  const go = (p: number) => {
    setState("loading");
    setPage(p);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--sheet-rule)] bg-[var(--sheet)]">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--sheet-rule)] px-2 py-1.5 text-sm sm:gap-2 sm:px-3 sm:py-2">
        <span className="font-medium text-[var(--foreground)]">Trang {page}</span>
        {to > from && (
          <>
            <button type="button" className={small} disabled={page <= from} onClick={() => go(page - 1)} aria-label="Trang trước">
              ‹
            </button>
            <button type="button" className={small} disabled={page >= to} onClick={() => go(page + 1)} aria-label="Trang sau">
              ›
            </button>
            <span className="hidden text-xs text-[var(--muted-foreground)] sm:inline">
              khối nằm ở trang {from}–{to}
            </span>
          </>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" className={small} disabled={zoom === 0} onClick={() => setZoom(zoom - 1)} aria-label="Thu nhỏ ảnh">
            −
          </button>
          <button type="button" className={small} disabled={zoom === ZOOM.length - 1} onClick={() => setZoom(zoom + 1)} aria-label="Phóng to ảnh">
            +
          </button>
          <button type="button" className={`${small} xl:hidden`} aria-pressed={expanded} onClick={onToggleExpand}>
            {expanded ? "Chia đôi" : "Mở rộng"}
          </button>
        </div>
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
              className={`${state === "ok" ? "" : "hidden"} h-auto max-w-none bg-white`}
              style={{ width: `${ZOOM[zoom]}%` }}
            />
          </>
        )}
      </div>
    </div>
  );
}
