"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { rubyOverKanji } from "@/lib/furigana";
import { deskButton as btn, deskButtonPrimary as btnPrimary } from "./exam-import-draft-model";
import type { FuriganaPick } from "./rich-input";

const KANJI = /[㐀-䶿一-鿿々]/;
const GAP = 10;
const EDGE = 12;

/**
 * Edits the furigana of the picked words, next to them (at the top of the screen
 * on a phone, clear of the keyboard). The reading is suggested by the analyser,
 * so most of the time Enter is all it takes; kanji and kana mixed words get the
 * reading over the kanji only. `pick: null` = nothing was selected.
 */
export function FuriganaPopover({ pick, onClose }: { pick: FuriganaPick | null; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const typed = useRef(false);
  const [reading, setReading] = useState(pick?.reading ?? "");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const askable = !!pick && KANJI.test(pick.base) && pick.base.length <= 200;
  const [loading, setLoading] = useState(askable);
  const [perKanji, setPerKanji] = useState(true);

  useEffect(() => {
    if (!pick || !askable) return;
    const ctl = new AbortController();
    void (async () => {
      const res = await fetch("/api/flashcards/reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pick.base }),
        signal: ctl.signal,
      }).catch(() => null);
      const data = res?.ok ? ((await res.json().catch(() => null)) as { reading?: string; readings?: string[] } | null) : null;
      if (ctl.signal.aborted) return;
      const found = [...new Set([data?.reading, ...(data?.readings ?? [])].filter((r): r is string => !!r))];
      setSuggestions(found);
      setLoading(false);
      // Fill the box in only while nobody has typed and the words had no reading.
      if (!typed.current && !pick.annotated && found[0]) {
        setReading(found[0]);
        requestAnimationFrame(() => input.current?.select());
      }
    })();
    return () => ctl.abort();
  }, [pick, askable]);

  useEffect(() => {
    input.current?.focus({ preventScroll: true });
    input.current?.select();
  }, []);

  // Sit under the words (above when there is no room) and follow them on scroll.
  useLayoutEffect(() => {
    const place = () => {
      const el = box.current;
      if (!el) return;
      if (!pick || window.innerWidth < 640) {
        Object.assign(el.style, { left: `${Math.max(EDGE, (window.innerWidth - el.offsetWidth) / 2)}px`, top: `${EDGE}px` });
        return;
      }
      const r = pick.rect();
      const below = r.bottom + GAP;
      const fitsBelow = below + el.offsetHeight <= window.innerHeight - EDGE;
      const top = fitsBelow ? below : r.top - GAP - el.offsetHeight;
      const left = r.left + r.width / 2 - el.offsetWidth / 2;
      Object.assign(el.style, {
        left: `${Math.min(Math.max(EDGE, left), window.innerWidth - el.offsetWidth - EDGE)}px`,
        top: `${Math.min(Math.max(EDGE, top), window.innerHeight - el.offsetHeight - EDGE)}px`,
      });
    };
    place();
    const watch = new ResizeObserver(place);
    if (box.current) watch.observe(box.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      watch.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [pick]);

  function cancel() {
    pick?.restore();
    onClose();
  }

  // A press anywhere else closes it (and keeps the focus where the press put it).
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [onClose]);

  const clean = reading.replace(/[<>\n]/g, "").trim();
  const split = pick && clean ? rubyOverKanji(pick.base, clean) : [];
  const canSplit = split.length > 1;
  const pieces = canSplit && perKanji ? split : pick ? [{ text: pick.base, rt: clean }] : [];

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!pick || !clean) return;
    pick.apply(pieces);
    onClose();
  }

  return (
    <div
      ref={box}
      role="dialog"
      aria-label="Furigana"
      onKeyDown={(e) => {
        if (e.key !== "Escape" || e.nativeEvent.isComposing) return;
        e.stopPropagation();
        cancel();
      }}
      className="fixed z-50 !m-0 w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-[var(--sheet-rule)] bg-[var(--sheet)] p-3 text-[var(--sheet-ink)] shadow-[0_2px_6px_rgba(0,0,0,0.2),0_24px_48px_-16px_rgba(0,0,0,0.55)]"
    >
      {!pick ? (
        <div className="space-y-2 text-sm">
          <p>Bôi đen chữ cần phiên âm (trên một dòng) rồi bấm Furigana.</p>
          <div className="flex justify-end">
            <button ref={(el) => el?.focus({ preventScroll: true })} type="button" className={btn} onClick={onClose}>
              Đã hiểu
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p lang="ja" aria-label="Xem trước" className="exam-ja max-h-32 overflow-auto rounded-lg bg-[var(--desk)] px-3 py-2 text-center text-2xl leading-[2.2]">
            {pieces.map((p, i) =>
              p.rt ? (
                <ruby key={i}>
                  {p.text}
                  <rt className="text-[0.5em] text-[var(--primary)]">{p.rt}</rt>
                </ruby>
              ) : (
                <span key={i}>{p.text}</span>
              ),
            )}
          </p>
          <label className="block text-xs font-semibold text-[var(--muted-foreground)]">
            Cách đọc
            <input
              ref={input}
              lang="ja"
              value={reading}
              maxLength={200}
              autoComplete="off"
              spellCheck={false}
              placeholder={loading ? "Đang tìm cách đọc…" : "Gõ hiragana…"}
              onChange={(e) => {
                typed.current = true;
                setReading(e.target.value);
              }}
              // Enter that only confirms the Japanese keyboard's conversion must not save.
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.nativeEvent.isComposing) e.preventDefault();
              }}
              className="exam-ja mt-1 block w-full rounded-lg border border-[var(--sheet-rule)] bg-transparent px-3 py-2 text-base font-normal text-[var(--sheet-ink)] outline-none focus:border-[var(--primary)]"
            />
          </label>
          <div aria-live="polite" className="flex min-h-7 flex-wrap items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
            {loading ? (
              "Đang tìm cách đọc…"
            ) : suggestions.length > 0 ? (
              <>
                Gợi ý
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    lang="ja"
                    aria-pressed={s === clean}
                    onClick={() => {
                      typed.current = true;
                      setReading(s);
                      input.current?.focus();
                    }}
                    className="exam-ja rounded-full border border-[var(--sheet-rule)] px-2.5 py-1 text-sm text-[var(--sheet-ink)] hover:border-[var(--primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] aria-pressed:border-[var(--primary)] aria-pressed:bg-[var(--primary)]/15"
                  >
                    {s}
                  </button>
                ))}
              </>
            ) : askable ? (
              "Không có gợi ý, hãy gõ cách đọc."
            ) : (
              "Không có chữ Hán để gợi ý."
            )}
          </div>
          {canSplit && (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={perKanji} onChange={(e) => setPerKanji(e.target.checked)} />
              Chỉ đặt cách đọc trên chữ Hán
            </label>
          )}
          <div className="flex items-center gap-2">
            {pick.annotated && (
              <button
                type="button"
                className={`${btn} text-[var(--bad)]`}
                onClick={() => {
                  pick.apply([{ text: pick.base }]);
                  onClose();
                }}
              >
                Bỏ furigana
              </button>
            )}
            <button type="button" className={`${btn} ml-auto`} onClick={cancel}>
              Huỷ
            </button>
            <button type="submit" className={btnPrimary} disabled={!clean}>
              Lưu
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
