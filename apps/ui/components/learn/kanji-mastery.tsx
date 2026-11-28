"use client";

import { useEffect, useState } from "react";
import { MASTERY_LEVELS } from "@/lib/mastery";

/** Character → mastery level of every kanji the learner has studied. */
export type KanjiMastery = Record<string, string>;

/** Empty while loading, signed out or on error: the kanji then keep their normal frame. */
export function useKanjiMastery(): KanjiMastery {
  const [mastery, setMastery] = useState<KanjiMastery>({});
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/srs/kanji-mastery", { cache: "no-store", signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<KanjiMastery>) : {}))
      .then(setMastery)
      .catch(() => {});
    return () => ctrl.abort();
  }, []);
  return mastery;
}

/** Frame (border + tinted background) of a studied kanji; `undefined` for one not studied yet. */
export function masteryStyle(mastery: KanjiMastery | undefined, char: string) {
  const color = MASTERY_LEVELS[mastery?.[char] ?? ""]?.color;
  // "33" = 20% alpha: the text stays readable in the light and the dark theme.
  return color ? { borderColor: color, backgroundColor: `${color}33` } : undefined;
}

export function masteryLabel(mastery: KanjiMastery | undefined, char: string): string | undefined {
  return MASTERY_LEVELS[mastery?.[char] ?? ""]?.label;
}

/** What the colours mean. */
export function MasteryLegend({ className = "mt-3" }: { className?: string }) {
  return (
    <ul className={`${className} flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--muted-foreground)]`}>
      {Object.entries(MASTERY_LEVELS).map(([key, l]) => (
        <li key={key} title={l.hint} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-3 rounded border-2" style={{ borderColor: l.color, backgroundColor: `${l.color}33` }} />
          {l.label}
        </li>
      ))}
    </ul>
  );
}
