"use client";

import { useEffect, useState } from "react";
import { furiganaParts, squeezeJa, type KanjiReadings } from "@/lib/furigana";

const cache: KanjiReadings = {};
const asked = new Set<string>();
const listeners = new Set<() => void>();

/** Fetch (once per character) the readings of the kanji in `text`; re-renders when they arrive. */
function useKanjiReadings(text: string): KanjiReadings {
  const [, bump] = useState(0);
  useEffect(() => {
    const poke = () => bump((n) => n + 1);
    listeners.add(poke);
    return () => void listeners.delete(poke);
  }, []);
  useEffect(() => {
    const need = [...new Set([...text].filter((c) => /[\u4e00-\u9fff]/.test(c) && !asked.has(c)))];
    if (need.length === 0) return;
    need.forEach((c) => asked.add(c));
    (async () => {
      for (let i = 0; i < need.length; i += 60) {
        const chunk = need.slice(i, i + 60).join("");
        try {
          const res = await fetch(`/api/kanji/readings?chars=${encodeURIComponent(chunk)}`);
          if (res.ok) Object.assign(cache, (await res.json()) as KanjiReadings);
        } catch {
          /* no readings — the word keeps one furigana over the whole run */
        }
      }
      listeners.forEach((f) => f());
    })();
  }, [text]);
  return cache;
}

/** The word with each reading set above its own kanji. */
export function Furigana({ front, reading }: { front: string; reading?: string }) {
  const dict = useKanjiReadings(front);
  if (!reading) return <>{squeezeJa(front)}</>;
  return (
    <>
      {furiganaParts(front, reading, dict).map((p, i) =>
        p.rt ? (
          <ruby key={i} style={{ rubyAlign: "center", rubyPosition: "over", letterSpacing: 0 }}>
            {p.text}
            {/* The reading is drawn by CSS (not real text) so selecting / copying the word never picks it up. */}
            <rt
              data-rt={p.rt}
              aria-hidden="true"
              className="select-none text-[0.5em] font-medium tracking-normal text-[var(--muted-foreground)] before:content-[attr(data-rt)]"
              style={{ rubyAlign: "center", letterSpacing: 0 }}
            />
          </ruby>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

const sentenceCache = new Map<string, string>();
const sentenceAsked = new Set<string>();

/**
 * A whole example sentence with furigana over its kanji. The sentence's
 * hiragana comes from the reading analyser (once per sentence); until it
 * arrives — or when it cannot be lined up with the sentence — the plain
 * sentence is shown.
 */
export function SentenceFurigana({ text }: { text: string }) {
  const [, bump] = useState(0);
  const dict = useKanjiReadings(text);
  useEffect(() => {
    if (sentenceCache.has(text) || sentenceAsked.has(text) || !/[一-鿿]/.test(text)) return;
    sentenceAsked.add(text);
    let alive = true;
    (async () => {
      const res = await fetch("/api/flashcards/reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 200) }),
      }).catch(() => null);
      const data = res?.ok ? ((await res.json().catch(() => null)) as { reading?: string } | null) : null;
      sentenceCache.set(text, data?.reading ?? "");
      if (alive) bump((n) => n + 1);
    })();
    return () => {
      alive = false;
    };
  }, [text]);

  const reading = sentenceCache.get(text);
  if (!reading) return <>{text}</>;
  const parts = furiganaParts(text, reading, dict);
  // One ruby over the whole sentence means the reading did not line up: show it plain.
  if (parts.length === 1 && parts[0].rt) return <>{text}</>;
  return (
    <>
      {parts.map((p, i) =>
        p.rt ? (
          <ruby key={i} style={{ rubyAlign: "center", rubyPosition: "over", letterSpacing: 0 }}>
            {p.text}
            <rt
              data-rt={p.rt}
              aria-hidden="true"
              className="select-none text-[0.5em] font-medium tracking-normal text-[var(--muted-foreground)] before:content-[attr(data-rt)]"
              style={{ rubyAlign: "center", letterSpacing: 0 }}
            />
          </ruby>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}
