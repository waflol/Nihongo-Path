import Link from "next/link";

export type LogField = "hanViet" | "readingBack" | "examples";

const TABS: { field: LogField; label: string }[] = [
  { field: "hanViet", label: "Hán tự" },
  { field: "readingBack", label: "Từ vựng" },
  { field: "examples", label: "Ví dụ" },
];

/** Switch between the logs of the three runs (Hán tự / từ vựng / tạo ví dụ) of a deck. */
export function logHref(root: string, deckId: string, field: LogField): string {
  return `${root}/${deckId}/log${field === "hanViet" ? "" : `?field=${field}`}`;
}

export function LogTabs({ root, deckId, active }: { root: string; deckId: string; active: LogField }) {
  return (
    <nav aria-label="Loại log" className="mt-4 flex flex-wrap gap-2">
      {TABS.map((t) => (
        <Link
          key={t.field}
          href={logHref(root, deckId, t.field)}
          aria-current={t.field === active ? "page" : undefined}
          className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            t.field === active
              ? "border-[var(--primary)] bg-[var(--primary)] text-white"
              : "border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
