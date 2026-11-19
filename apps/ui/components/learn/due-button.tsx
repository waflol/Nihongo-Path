"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchShared } from "@/lib/inflight-fetch";

/** Primary action on /learn: review the words due today. Hidden until the count is known. */
export function DueButton() {
  const [due, setDue] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetchShared("/api/srs/due-count", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && typeof d?.due === "number" && setDue(d.due))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (due === null) return null;
  return due > 0 ? (
    <Link
      href="/learn/review"
      className="group inline-flex h-11 items-center justify-between gap-3 rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-foreground)] shadow-sm transition-colors hover:bg-[var(--primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] sm:h-auto sm:justify-center sm:rounded-full sm:py-1.5"
    >
      <span className="inline-flex items-center gap-2">
        Ôn <span className="rounded-md bg-black/15 px-1.5 py-0.5 text-xs tabular-nums sm:hidden">{due}</span>
        <span className="hidden sm:inline">{due}</span> từ hôm nay
      </span>
      <span aria-hidden="true" className="text-base transition-transform group-hover:translate-x-0.5 sm:hidden">→</span>
    </Link>
  ) : (
    <span className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border)] px-3 text-sm text-[var(--muted-foreground)] sm:h-auto sm:rounded-full sm:py-1.5">
      Đã ôn xong hôm nay
    </span>
  );
}
