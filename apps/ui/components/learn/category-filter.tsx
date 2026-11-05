"use client";

/** Distinct, sorted categories of a deck list (with how many decks each has). */
export function deckCategories(decks: { category?: string }[]) {
  const map = new Map<string, number>();
  for (const d of decks) {
    const c = d.category?.trim();
    if (c) map.set(c, (map.get(c) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "vi"));
}

export function CategoryChip({ category }: { category?: string }) {
  if (!category) return null;
  return (
    <span className="rounded-full bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] px-2 py-0.5 text-xs font-medium text-[var(--primary)]">
      {category}
    </span>
  );
}

/** Filter row above a deck list. Hidden when no deck has a category. */
export function CategoryFilter({
  decks,
  value,
  onChange,
}: {
  decks: { category?: string }[];
  value: string;
  onChange: (next: string) => void;
}) {
  const cats = deckCategories(decks);
  if (cats.length === 0) return null;
  const chip = (active: boolean) =>
    "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
    (active
      ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-[var(--primary)]"
      : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--layer-hover)] hover:text-[var(--foreground)]");
  return (
    <div className="mt-5 flex flex-wrap items-center gap-1.5" role="group" aria-label="Lọc theo phân loại">
      <span className="mr-1 text-xs font-medium text-[var(--muted-foreground)]">Phân loại:</span>
      <button type="button" aria-pressed={value === ""} onClick={() => onChange("")} className={chip(value === "")}>
        Tất cả ({decks.length})
      </button>
      {cats.map(([c, n]) => (
        <button key={c} type="button" aria-pressed={value === c} onClick={() => onChange(value === c ? "" : c)} className={chip(value === c)}>
          {c} ({n})
        </button>
      ))}
    </div>
  );
}
