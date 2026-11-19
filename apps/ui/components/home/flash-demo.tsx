"use client";

import { useState, type CSSProperties } from "react";

const SERIF = '"Yu Mincho","Hiragino Mincho ProN","Noto Serif JP",serif';

const WORDS = [
  { kanji: "言葉", reading: "ことば", meaning: "từ ngữ, lời nói", example: "新しい言葉を覚える。" },
  { kanji: "道", reading: "みち", meaning: "con đường", example: "道を歩く。" },
  { kanji: "毎日", reading: "まいにち", meaning: "mỗi ngày", example: "毎日少しずつ学ぶ。" },
  { kanji: "続ける", reading: "つづける", meaning: "tiếp tục, duy trì", example: "勉強を続ける。" },
];

/** Manuscript-paper (genkō yōshi) grid behind the card. */
const GRID = "color-mix(in srgb, var(--primary) 13%, transparent)";
const STAGE: CSSProperties = {
  backgroundImage: `linear-gradient(${GRID} 1px, transparent 1px), linear-gradient(90deg, ${GRID} 1px, transparent 1px)`,
  backgroundSize: "2.25rem 2.25rem",
  backgroundPosition: "-1px -1px",
};

const GRADES = [
  { key: "again", label: "Quên", next: "10 phút" },
  { key: "good", label: "Nhớ", next: "3 ngày" },
  { key: "easy", label: "Dễ", next: "9 ngày" },
] as const;

/**
 * Hero demo: a real flashcard loop (flip, grade, next) so visitors feel the
 * product before signing in. Nothing here is saved.
 */
export function FlashDemo() {
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState(0);
  const word = WORDS[i % WORDS.length];

  function grade() {
    setDone((d) => d + 1);
    setShown(false);
    setI((n) => n + 1);
  }

  return (
    <div
      style={STAGE}
      className="relative isolate flex min-h-0 flex-col overflow-hidden rounded-[1.75rem] max-lg:flex-none bg-[color-mix(in_srgb,var(--background-1)_58%,transparent)] backdrop-blur-md sm:bg-[color-mix(in_srgb,var(--primary)_4%,var(--background-1))] sm:backdrop-blur-none border border-[var(--border)] px-4 py-4 [@media(max-height:700px)]:max-sm:py-3 sm:px-8 sm:py-8"
    >
      <div className="flex shrink-0 items-center justify-between text-xs text-[var(--muted-foreground)] [@media(max-height:700px)]:max-lg:hidden">
        <span>Thử một thẻ</span>
        <span className="tabular-nums" aria-live="polite">
          Đã ôn {done}
        </span>
      </div>

      <div className="relative mx-auto mt-2 min-h-[5.5rem] max-lg:h-[clamp(5.5rem,19dvh,13rem)] max-lg:flex-none w-full max-w-[14rem] flex-1 sm:mt-4 sm:max-w-[19rem] lg:h-64 lg:flex-none [@media(min-height:880px)]:lg:h-72 [@media(min-height:1000px)]:lg:h-80 [@media(min-height:1000px)]:lg:max-w-[22rem]">
        <div aria-hidden="true" className="absolute inset-0 rotate-[6deg] rounded-2xl border border-[var(--border)] bg-[var(--background)] opacity-60" />
        <div aria-hidden="true" className="absolute inset-0 -rotate-[4deg] rounded-2xl border border-[var(--border)] bg-[var(--background)] opacity-80" />
        <button
          key={i}
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? "Ẩn nghĩa" : "Lật thẻ để xem nghĩa"}
          aria-pressed={shown}
          className="animate-card-in absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-5 text-center shadow-[0_24px_50px_-28px_color-mix(in_srgb,var(--primary)_55%,transparent)] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--primary)]"
        >
          <span style={{ fontFamily: SERIF }} className={(shown ? "text-4xl sm:text-5xl" : "text-6xl sm:text-7xl") + " leading-none text-[var(--foreground)] transition-all duration-300"}>
            {word.kanji}
          </span>
          {shown ? (
            <>
              <span className="text-lg font-medium text-[var(--primary)]">{word.reading}</span>
              <span className="text-base text-[var(--foreground)]">{word.meaning}</span>
              <span style={{ fontFamily: SERIF }} className="mt-2 text-sm text-[var(--muted-foreground)]">
                {word.example}
              </span>
            </>
          ) : (
            <span className="mt-3 text-xs text-[var(--muted-foreground)]">Chạm để lật thẻ</span>
          )}
        </button>
      </div>

      <div className="mt-3 grid shrink-0 grid-cols-3 gap-2 sm:mt-6 sm:gap-3" aria-hidden={!shown}>
        {GRADES.map((g) => (
          <button
            key={g.key}
            type="button"
            disabled={!shown}
            onClick={grade}
            className="flex flex-col items-center rounded-xl border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm sm:py-2 font-medium text-[var(--foreground)] transition enabled:hover:border-[var(--primary)] enabled:hover:text-[var(--primary)] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
          >
            {g.label}
            <span className="text-[11px] font-normal text-[var(--muted-foreground)] [@media(max-height:600px)]:max-sm:hidden">{g.next}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
