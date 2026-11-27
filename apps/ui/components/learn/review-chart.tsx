"use client";

import { useEffect, useState } from "react";
import { capitalize, PILLAR_NOUN, type PillarId } from "@/components/learn/pillar-nav";

interface Bucket {
  key: string;
  reviews: number;
  newCards: number;
}
interface Stats {
  series: Bucket[];
  reviewsInRange: number;
  newInRange: number;
  newToday: number;
  newPerDay: number;
  total: number;
  unseen: number;
  overview?: { streak: number };
}

type Range = "week" | "month";
const RANGES: { key: Range; label: string }[] = [
  { key: "week", label: "Tuần" },
  { key: "month", label: "Tháng" },
];

function label(key: string, range: Range): string {
  return range === "week" ? `${key.slice(8)}/${key.slice(5, 7)}` : String(Number(key.slice(8)));
}

/** Bar chart of reviews (and new cards) per day, shown under the Flashcard tile on /learn. */
export function ReviewChart({
  className = "",
  embedded = false,
  bare = false,
  range: fixedRange,
  pillar,
}: {
  className?: string;
  embedded?: boolean;
  /** No title row: the caller's own range tabs drive `range`. */
  bare?: boolean;
  range?: Range;
  /** Only this pillar's activity; omitted → every pillar together. */
  pillar?: PillarId;
}) {
  const [ownRange, setRange] = useState<Range>("week");
  const range = fixedRange ?? ownRange;
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setError(false);
    fetch(`/api/srs/stats?range=${range}&offset=0${pillar ? `&pillar=${pillar}` : ""}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("bad");
        const data = (await res.json()) as Stats;
        if (alive) setStats(data);
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [range, pillar]);

  const series = stats?.series ?? [];
  const max = Math.max(1, ...series.map((b) => Math.max(b.reviews, b.newCards)));
  const dense = series.length > 14;
  const noun = PILLAR_NOUN[pillar ?? "vocab"];

  return (
    <section
      className={
        (embedded
          ? "flex min-h-0 flex-col border-t border-[var(--border)] " + (bare ? "pt-2 " : "pt-3 ")
          : "flex min-h-0 flex-col rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4 ") + className
      }
      aria-label="Hoạt động học"
    >
      <div className={"flex flex-wrap items-center justify-between gap-2" + (bare ? " hidden" : "")}>
        <div>
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Hoạt động học</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-3 text-[11px] text-[var(--muted-foreground)] sm:flex">
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-sm bg-[var(--primary)]" />
              Lượt ôn
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-sm bg-[#10b981]" />
              {capitalize(noun)} mới
            </span>
          </span>
          <div role="tablist" className="flex rounded-lg border border-[var(--border)] p-0.5 text-xs">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                role="tab"
                aria-selected={range === r.key}
                onClick={() => setRange(r.key)}
                className={
                  "rounded-md px-2.5 py-0.5 " +
                  (range === r.key
                    ? "bg-[var(--foreground)] text-[var(--background)]"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]")
                }
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={"flex min-h-0 flex-1 gap-4" + (bare ? "" : " mt-3")}>
      <div className="flex min-h-12 min-w-0 flex-1 gap-2 lg:min-h-24">
        <div className="flex w-7 shrink-0 flex-col justify-between pb-5 text-right text-[10px] tabular-nums text-[var(--muted-foreground)]">
          <span>{max}</span>
          <span>{Math.round(max / 2)}</span>
          <span>0</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          {error ? (
            <p className="m-auto text-xs text-[var(--muted-foreground)]">Không tải được dữ liệu.</p>
          ) : (
            <>
              <div className={"relative flex min-h-0 flex-1 items-end border-b border-[var(--border)] " + (dense ? "gap-px" : "gap-2")}>
                <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-[var(--border)]" />
                <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-[var(--border)]" />
                {series.map((b) => (
                  <div
                    key={b.key}
                    className="flex h-full min-w-0 flex-1 items-end justify-center gap-0.5"
                    title={`${b.key}: ${b.reviews} lượt ôn, ${b.newCards} ${noun} mới`}
                  >
                    <div
                      className="relative w-full max-w-5 rounded-t-sm bg-[var(--primary)]"
                      style={{ height: b.reviews > 0 ? `${Math.max(4, (b.reviews / max) * 100)}%` : "2px", opacity: b.reviews > 0 ? 1 : 0.25 }}
                    />
                    <div
                      className="relative w-full max-w-5 rounded-t-sm bg-[#10b981]"
                      style={{ height: b.newCards > 0 ? `${Math.max(4, (b.newCards / max) * 100)}%` : "2px", opacity: b.newCards > 0 ? 1 : 0.25 }}
                    />
                  </div>
                ))}
              </div>
              <div className={"mt-1 flex h-4 text-[10px] text-[var(--muted-foreground)] " + (dense ? "gap-px" : "gap-2")}>
                {series.map((b, i) => (
                  <span key={b.key} className="min-w-0 flex-1 truncate text-center">
                    {dense && i % 3 !== 0 ? "" : label(b.key, range)}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      </div>
    </section>
  );
}
