"use client";

import { useEffect, useRef, useState } from "react";
import { deskButton as btn } from "./exam-import-draft-model";

/** A region of the page, as fractions of its width and height. */
export interface PageRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Cutting a picture: what it is for, and what to do with the region the reviewer drags out. */
export interface CropRequest {
  label: string;
  onCrop: (page: number, rect: PageRect) => void;
  onCancel: () => void;
}

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
  crop,
}: {
  jobId: string;
  from: number;
  to: number;
  /** Narrow screens only: the picture takes the whole work area instead of half of it. */
  expanded: boolean;
  onToggleExpand: () => void;
  /** Set while the reviewer cuts a picture out of the page: drag a box on it. */
  crop?: CropRequest | null;
}) {
  const [page, setPage] = useState(from);
  const [zoom, setZoom] = useState(0);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");
  const img = useRef<HTMLImageElement>(null);
  /** The box being dragged, in page fractions. */
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const at = (e: React.PointerEvent) => {
    const r = img.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const box = drag && {
    x: Math.min(drag.x0, drag.x1),
    y: Math.min(drag.y0, drag.y1),
    w: Math.abs(drag.x1 - drag.x0),
    h: Math.abs(drag.y1 - drag.y0),
  };
  useEffect(() => {
    if (!crop) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && crop.onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [crop]);
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
      {crop && (
        <div role="status" className="flex flex-wrap items-center gap-2 border-b border-[var(--sheet-rule)] bg-[var(--primary)]/10 px-3 py-1.5 text-sm text-[var(--sheet-ink)]">
          <span className="min-w-0 flex-1">
            Kéo chọn vùng hình cho <b>{crop.label}</b> trên ảnh trang (đổi trang bằng ‹ › nếu cần).
          </span>
          <button type="button" className={small} onClick={crop.onCancel}>
            Huỷ
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-2">
        {state === "missing" ? (
          <p className="p-3 text-sm text-[var(--muted-foreground)]">
            Không có ảnh trang: file PDF của lần nhập này không còn trên máy chủ (nhập từ trước khi có tính năng này). Nhập lại PDF để xem ảnh.
          </p>
        ) : (
          <>
            {state === "loading" && <p className="p-3 text-sm text-[var(--muted-foreground)]">Đang dựng ảnh trang… (lần đầu mất vài giây)</p>}
            <div
              className={`relative ${state === "ok" ? "" : "hidden"} ${crop ? "cursor-crosshair touch-none select-none" : ""}`}
              style={{ width: `${ZOOM[zoom]}%` }}
              onPointerDown={(e) => {
                if (!crop || !img.current) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                const p = at(e);
                setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
              }}
              onPointerMove={(e) => {
                if (!crop || !drag) return;
                const p = at(e);
                setDrag({ ...drag, x1: p.x, y1: p.y });
              }}
              onPointerUp={() => {
                if (!crop || !box) return;
                setDrag(null);
                if (box.w > 0.02 && box.h > 0.02) crop.onCrop(page, box);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a same-origin API image, not a static asset */}
              <img
                ref={img}
                key={src}
                src={src}
                alt={`Trang ${page} của PDF`}
                draggable={false}
                onLoad={() => setState("ok")}
                onError={() => setState("missing")}
                className="h-auto w-full max-w-none bg-white"
              />
              {box && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute border-2 border-[var(--primary)] bg-[var(--primary)]/15"
                  style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
