"use client";

import { useEffect, useState } from "react";
import { PdfPageReview } from "@/components/admin/pdf-page-review";
import type { PdfJob } from "@/components/admin/import-job-tracker";

/**
 * The page-by-page check saved with a deck imported from a scanned PDF: the
 * original page next to what was read, so cards can be compared with the book.
 * Renders nothing for decks that were not imported that way.
 */
export function DeckPageReview({ deckId }: { deckId: string }) {
  const [job, setJob] = useState<PdfJob | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await fetch(`/api/import?deck=${encodeURIComponent(deckId)}`, { cache: "no-store" }).catch(() => null);
      const j = r?.ok ? ((await r.json().catch(() => null)) as PdfJob | null) : null;
      if (!cancelled) setJob(j?.id && (j.pages?.length ?? 0) > 0 ? j : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [deckId]);

  if (!job) return null;
  return (
    <div className="mx-auto max-w-5xl px-4 pb-10 sm:px-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
      >
        {open ? "Ẩn" : "Hiện"} kiểm tra từng trang — so sánh với file “{job.fileName}”
      </button>
      {open && <PdfPageReview job={job} onChanged={setJob} />}
    </div>
  );
}
