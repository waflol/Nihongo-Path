/** The two faces of a kanji flashcard: the character alone, then Hán Việt + on / kun. */

/** A kanji card stores its readings in one string ("イチ · ひと-"): katakana = on, the rest = kun. */
export function splitKanjiReadings(reading = ""): { on: string[]; kun: string[] } {
  const all = reading.split(/[·、,]/).map((r) => r.trim()).filter(Boolean);
  const isOn = (r: string) => /[ァ-ヺ]/.test(r);
  return { on: all.filter(isOn), kun: all.filter((r) => !isOn(r)) };
}

/** What to pronounce: every reading without the okurigana dot and affix dashes. */
export function kanjiSpeechText(reading: string | undefined, front: string): string {
  const { on, kun } = splitKanjiReadings(reading);
  return [...on, ...kun].map((r) => r.replace(/[.\-－]/g, "")).join("、") || front;
}

const HINT = "Nhấn Space / bấm vào thẻ để lật";

export function KanjiFront({ char }: { char: string }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center">
      <p lang="ja" className="text-7xl font-semibold text-white drop-shadow-sm sm:text-8xl">
        {char}
      </p>
      <p className="mt-5 text-xs text-white/70">{HINT}</p>
    </div>
  );
}

export function KanjiBack({ hanViet, reading }: { hanViet: string; reading?: string }) {
  const { on, kun } = splitKanjiReadings(reading);
  const rows = [
    { label: "Âm On", values: on },
    { label: "Âm Kun", values: kun },
  ];
  return (
    <div className="flex min-h-full flex-col items-center justify-center">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Âm Hán Việt</p>
      <p className="mt-1 break-words text-2xl font-semibold uppercase tracking-[0.12em] text-[var(--foreground)] sm:text-3xl">
        {hanViet || "—"}
      </p>
      <dl className="mt-4 grid w-full max-w-xs grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2 text-left">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-xs text-[var(--muted-foreground)]">{row.label}</dt>
            <dd lang="ja" className="break-words text-lg text-[var(--foreground)] sm:text-xl">
              {row.values.join("、") || "—"}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-5 text-xs text-[var(--muted-foreground)]">{HINT}</p>
    </div>
  );
}
