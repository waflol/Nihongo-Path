"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { KanjiItem } from "./kanji-types";

const GROUP_SIZE = 20;

const tileBase =
  "relative flex aspect-square items-center justify-center rounded-lg border text-xl font-medium leading-none transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]";

/**
 * Cards of 20 consecutive ranks (5 × 4 tiles), like the app's group picker.
 * Admin passes `onOpen` + `showDraft`; the learner page passes `href`.
 */
export function KanjiGroups({
  items,
  loading,
  selected,
  onOpen,
  href,
  showDraft = false,
}: {
  items: KanjiItem[];
  loading: boolean;
  selected?: Set<string>;
  onOpen?: (k: KanjiItem) => void;
  href?: (k: KanjiItem) => string;
  /** Mark drafts and kanji without Hán Việt (admin only). */
  showDraft?: boolean;
}) {
  const groups = useMemo(() => {
    const map = new Map<number, KanjiItem[]>();
    for (const k of items) {
      const key = k.rank && k.rank > 0 ? Math.floor((k.rank - 1) / GROUP_SIZE) : -1;
      const list = map.get(key);
      if (list) list.push(k);
      else map.set(key, [k]);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [items]);

  if (loading && items.length === 0) {
    return (
      <p className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">
        Đang tải danh sách Kanji…
      </p>
    );
  }
  if (groups.length === 0) {
    return (
      <p className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">
        Không có chữ Kanji nào khớp bộ lọc.
      </p>
    );
  }

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {groups.map(([key, list]) => {
        const start = key * GROUP_SIZE + 1;
        const published = list.filter((k) => k.status === "PUBLISHED").length;
        const slots =
          key < 0
            ? list.map((k) => ({ rank: 0, item: k as KanjiItem | undefined }))
            : Array.from({ length: GROUP_SIZE }, (_, i) => ({
                rank: start + i,
                item: list.find((k) => k.rank === start + i),
              }));
        return (
          <section
            key={key}
            className="rounded-2xl border border-[var(--primary)]/60 bg-[var(--background-1)] p-3 shadow-sm"
          >
            <header className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold tabular-nums text-[var(--foreground)]">
                {key < 0 ? "Chưa có STT" : `${start} ~ ${start + GROUP_SIZE - 1}`}
              </h3>
              {showDraft && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                    published === list.length
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  }`}
                  title="Số chữ đã xuất bản / tổng số chữ trong nhóm"
                >
                  {published}/{list.length}
                </span>
              )}
            </header>
            <div className="grid grid-cols-5 gap-1.5">
              {slots.map(({ rank, item }, i) => {
                if (!item) {
                  return (
                    <span
                      key={`empty-${rank || i}`}
                      title={rank ? `#${rank}: chưa có chữ` : undefined}
                      className="aspect-square rounded-lg border border-dashed border-[var(--border)]"
                    />
                  );
                }
                const draft = showDraft && item.status !== "PUBLISHED";
                const cls = `${tileBase} ${
                  draft
                    ? "border-dashed border-amber-500/60 bg-amber-500/10 text-[var(--foreground)]"
                    : "border-transparent bg-[var(--layer)] text-[var(--foreground)]"
                } ${selected?.has(item.char) ? "ring-2 ring-[var(--primary)]" : ""}`;
                const title = `#${item.rank || "—"} · ${item.hanViet || "chưa có Hán Việt"}${
                  draft ? " · bản nháp" : ""
                }`;
                const inner = (
                  <>
                    {item.char}
                    {showDraft && !item.hanViet && (
                      <span
                        aria-hidden="true"
                        className="absolute right-1 top-1 size-1.5 rounded-full bg-amber-500"
                      />
                    )}
                  </>
                );
                return href ? (
                  <Link key={item.char} href={href(item)} title={title} lang="ja" className={cls}>
                    {inner}
                  </Link>
                ) : (
                  <button
                    key={item.char}
                    type="button"
                    onClick={() => onOpen?.(item)}
                    title={title}
                    lang="ja"
                    className={cls}
                  >
                    {inner}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
