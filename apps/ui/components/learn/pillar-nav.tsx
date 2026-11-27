"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type PillarId = "vocab" | "grammar" | "kanji";

/** What one "new card" is called in each pillar. */
export const PILLAR_NOUN: Record<PillarId, string> = { vocab: "từ", grammar: "mẫu", kanji: "chữ" };

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function deckPillar(d: {
  pillar?: string;
  systemKey?: string;
  category?: string;
  title?: string;
}): PillarId {
  if (d.pillar === "grammar" || d.pillar === "kanji" || d.pillar === "vocab") return d.pillar;
  if (d.systemKey?.startsWith("grammar:") || d.category === "Ngữ pháp" || d.title?.startsWith("Ngữ pháp ")) {
    return "grammar";
  }
  if (d.systemKey?.startsWith("kanji:") || d.category === "Kanji" || d.title?.startsWith("Kanji ")) {
    return "kanji";
  }
  return "vocab";
}

type TabDef = {
  label: string;
  href: string;
  exact?: boolean;
};

const TABS: Record<PillarId, TabDef[]> = {
  vocab: [
    { label: "Bộ thẻ", href: "/learn/vocab", exact: true },
    { label: "Học mới", href: "/learn/vocab/study" },
    { label: "Ôn tập", href: "/learn/vocab/review" },
    { label: "Bài tập", href: "/learn/vocab/exercises" },
  ],
  grammar: [
    { label: "Danh mục", href: "/learn/grammar", exact: true },
    { label: "Học mới", href: "/learn/grammar/study" },
    { label: "Ôn tập", href: "/learn/grammar/review" },
    { label: "Bài tập", href: "/learn/grammar/practice" },
  ],
  kanji: [
    { label: "Danh mục", href: "/learn/kanji", exact: true },
    { label: "Học mới", href: "/learn/kanji/study" },
    { label: "Ôn tập", href: "/learn/kanji/review" },
    { label: "Bài tập", href: "/learn/kanji/practice" },
  ],
};

export function PillarNav({ pillar }: { pillar: PillarId }) {
  const pathname = usePathname() || "";
  const tabs = TABS[pillar];

  return (
    <nav
      aria-label="Điều hướng trụ cột học"
      className="mx-auto flex w-full max-w-6xl items-center gap-1.5 overflow-x-auto border-b border-[var(--border)] px-4 py-2.5 sm:px-6"
    >
      <Link
        href="/learn"
        className="mr-1 shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--muted-foreground)] transition hover:bg-[var(--background-1)] hover:text-[var(--foreground)]"
      >
        ← Khu học tập
      </Link>
      <span aria-hidden="true" className="h-4 w-px shrink-0 bg-[var(--border)]" />
      <div className="flex items-center gap-1">
        {tabs.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={
                "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition " +
                (active
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--background-1)] hover:text-[var(--foreground)]")
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
