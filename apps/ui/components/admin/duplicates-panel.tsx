"use client";

import { useState } from "react";

export interface DuplicateInfo {
  rowNumber: number;
  no?: number;
  front: string;
  reading: string;
  back: string;
  of: {
    source: "deck" | "file";
    front: string;
    reading: string;
    back: string;
    no?: number;
    rowNumber?: number;
  };
}

const SHOWN = 200;

/**
 * Side-by-side list of the rows skipped as duplicates: the file's row on the
 * left, the card it matches on the right (a card already in the deck, or an
 * earlier row of the same file). A duplicate = same kanji + reading + meaning,
 * so the learner can eyeball that each one really is the same card.
 */
export function DuplicatesPanel({
  duplicates,
  total,
}: {
  duplicates: DuplicateInfo[];
  total: number;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  if (total === 0) return null;

  const q = filter.trim().toLowerCase();
  const list = q
    ? duplicates.filter((d) =>
        [d.front, d.reading, d.back, d.of.front, d.of.back].some((v) => v.toLowerCase().includes(q)),
      )
    : duplicates;

  return (
    <section className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--background)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-[var(--foreground)]"
      >
        <span>
          {open ? "▾" : "▸"} Xem {total} thẻ trùng (bị bỏ qua)
        </span>
        <span className="text-xs font-normal text-[var(--muted-foreground)]">
          trùng = giống cả kanji, hiragana và nghĩa
        </span>
      </button>
      {open && (
        <div className="border-t border-[var(--border)] p-3">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Lọc theo từ / nghĩa…"
            className="mb-3 block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] sm:max-w-xs"
          />
          <div className="max-h-[28rem] overflow-auto rounded-lg border border-[var(--border)]">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-[var(--layer)] text-left text-xs text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-3 py-2 font-medium">STT</th>
                  <th className="px-3 py-2 font-medium">Dòng bị bỏ qua</th>
                  <th className="px-3 py-2 font-medium">Trùng với</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {list.slice(0, SHOWN).map((d) => (
                  <tr key={d.rowNumber}>
                    <td className="px-3 py-2 tabular-nums text-[var(--muted-foreground)]">
                      {d.no ?? d.rowNumber}
                    </td>
                    <td className="px-3 py-2">
                      <span lang="ja" className="font-medium text-[var(--foreground)]">{d.front}</span>
                      {d.reading && <span lang="ja" className="ml-2 text-[var(--muted-foreground)]">{d.reading}</span>}
                      <div className="text-[var(--foreground)]">{d.back}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span lang="ja" className="font-medium text-[var(--foreground)]">{d.of.front}</span>
                      {d.of.reading && <span lang="ja" className="ml-2 text-[var(--muted-foreground)]">{d.of.reading}</span>}
                      <div className="text-[var(--foreground)]">{d.of.back}</div>
                      <div className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                        {d.of.source === "deck"
                          ? "thẻ đã có trong bộ"
                          : `dòng ${d.of.no ?? d.of.rowNumber} trước đó trong file`}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            Hiển thị {Math.min(SHOWN, list.length)}/{list.length}
            {total > duplicates.length && ` (danh sách tối đa ${duplicates.length} trên ${total})`}
            {list.length > SHOWN && " — dùng ô lọc để thu hẹp"}.
          </p>
        </div>
      )}
    </section>
  );
}
