"use client";

import type { ReactNode } from "react";
import { hanViet } from "@/lib/han-viet";
import { PosChip } from "@/components/learn/reading-fields";

export interface TileCard {
  _id: string;
  front: string;
  back: string;
  reading?: string;
  image?: string;
  imageCredit?: string;
  partOfSpeech?: string;
  examples?: { sentence: string; translation?: string }[];
  tags?: string[];
  origin?: string;
}

const ACCENT: Record<string, string> = {
  verb: "bg-[#3b82f6]",
  noun: "bg-[#22c55e]",
  adjective: "bg-[#f59e0b]",
};

/**
 * One flashcard in a deck list — a self-contained tile (own border, shadow and
 * a colour bar for its part of speech) so cards are easy to tell apart.
 * The term sits beside its reading, the Hán Việt reading goes right under the
 * kanji (when `showHanViet`), then the meaning, examples and tags.
 */
export function CardTile({
  card,
  index,
  showHanViet,
  actions,
}: {
  card: TileCard;
  index: number;
  showHanViet: boolean;
  actions?: ReactNode;
}) {
  const hv = showHanViet ? hanViet(card.front) : "";
  const accent = ACCENT[card.partOfSpeech ?? ""] ?? "bg-[var(--border-line-3)]";

  return (
    <li className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background)] shadow-sm transition-shadow hover:shadow-md">
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1.5 ${accent}`} />
      <div className="flex gap-4 p-4 pl-5">
        {/* number + picture */}
        <div className="flex shrink-0 flex-col items-center gap-2">
          <span className="grid size-6 place-items-center rounded-full bg-[var(--layer)] text-[11px] font-semibold tabular-nums text-[var(--muted-foreground)]">
            {index + 1}
          </span>
          {card.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.image}
              alt=""
              title={card.imageCredit || undefined}
              className="size-16 rounded-xl object-cover ring-1 ring-[var(--border)]"
            />
          ) : null}
        </div>

        {/* content */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
            <div className="min-w-0">
              {card.reading ? (
                <p lang="ja" className="text-xs leading-none text-[var(--muted-foreground)]">
                  {card.reading}
                </p>
              ) : null}
              <p lang="ja" className="mt-0.5 break-words text-2xl font-bold leading-tight text-[var(--foreground)]">
                {card.front}
              </p>
              {hv ? (
                <p className="mt-0.5 text-[11px] font-semibold tracking-[0.14em] text-[var(--primary)]">
                  {hv}
                </p>
              ) : null}
            </div>
            <PosChip pos={card.partOfSpeech} />
          </div>

          <p className="mt-2 text-base font-medium text-[var(--foreground)]">{card.back}</p>

          {card.examples && card.examples.length > 0 ? (
            <ul className="mt-3 space-y-1.5 rounded-xl bg-[var(--background-1)] px-3 py-2.5">
              {card.examples.map((ex, i) => (
                <li key={i} className="text-sm leading-snug">
                  <span lang="ja" className="text-[var(--foreground)]">{ex.sentence}</span>
                  {ex.translation ? (
                    <span className="block text-xs text-[var(--muted-foreground)]">{ex.translation}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {(card.tags && card.tags.length > 0) || card.origin ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {card.tags?.map((t) => (
                <span key={t} className="rounded-full bg-[var(--layer)] px-2 py-0.5 text-[11px] font-medium text-[var(--muted-foreground)]">
                  #{t}
                </span>
              ))}
              {card.origin && card.origin !== "manual" ? (
                <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">nguồn: {card.origin}</span>
              ) : null}
            </div>
          ) : null}
        </div>

        {actions ? <div className="flex shrink-0 items-start gap-1.5">{actions}</div> : null}
      </div>
    </li>
  );
}

/** Small pill switch used above card lists / in the study toolbar. */
export function HanVietToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      title="Hiện/ẩn âm Hán Việt dưới chữ kanji"
      className={
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary-focus)] " +
        (on
          ? "border-[color-mix(in_srgb,var(--primary)_45%,transparent)] bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-[var(--primary)]"
          : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--layer-hover)] hover:text-[var(--foreground)]")
      }
    >
      <span aria-hidden="true" className="text-base leading-none">漢</span>
      Hán Việt
    </button>
  );
}
