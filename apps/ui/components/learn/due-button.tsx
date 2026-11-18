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
      className="inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-4 py-1.5 text-sm font-semibold text-[var(--primary-foreground)] shadow-sm transition-colors hover:bg-[var(--primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
    >
      Ôn {due} từ hôm nay
    </Link>
  ) : (
    <span className="rounded-full border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted-foreground)]">
      Đã ôn xong hôm nay
    </span>
  );
}
