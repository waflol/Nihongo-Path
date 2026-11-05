"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  answerMatches,
  hashSeed,
  seededShuffle,
} from "./quiz-utils";

/**
 * Exercises (P3-UI-07) — the drill modes that are NOT plain flashcard review.
 *
 * The study screen (`/learn/study`) stays a focused "flip the card" review;
 * this area holds the two Quizlet-style drills:
 * - **Trắc nghiệm** — pick the right answer among four (one right + three
 *   distractors drawn from the deck's other cards).
 * - **Gõ đáp án** — type the answer; the comparison ignores diacritics and
 *   punctuation so Vietnamese and Japanese both type naturally.
 *
 * Both modes draw their cards from the deck's full card list (not the SRS
 * queue) — an exercise is practice, not a scheduled review, so it must not
 * write SRS progress. Progress counters are per-sitting only.
 *
 * Answers are graded locally: no API call, no server state. The deck's cards
 * come from `/api/flashcards/decks/:id/cards`.
 */

interface DeckRef {
  _id: string;
  title: string;
  shared: boolean;
}

interface DeckCard {
  _id: string;
  front: string;
  back: string;
}

type Mode = "test" | "type";

const MODES: { key: Mode; label: string; hint: string }[] = [
  { key: "test", label: "Trắc nghiệm", hint: "Chọn 1 trong 4 đáp án" },
  { key: "type", label: "Gõ đáp án", hint: "Tự gõ đáp án vào ô trống" },
];

const inputClass =
  "block w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-base text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-focus)]";

export function ExercisesConsole() {
  const [decks, setDecks] = useState<DeckRef[]>([]);
  const [deck, setDeck] = useState<DeckRef | null>(null);
  const [cards, setCards] = useState<DeckCard[]>([]);
  const [mode, setMode] = useState<Mode>("test");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per-sitting drill state.
  const [order, setOrder] = useState<DeckCard[]>([]);
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState({ right: 0, wrong: 0 });

  // Load the deck list.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/flashcards/decks", { cache: "no-store" }).catch(
        () => null,
      );
      if (cancelled) return;
      if (!res) {
        setError("Không kết nối được API");
        setLoading(false);
        return;
      }
      const list = (await res.json().catch(() => [])) as DeckRef[];
      if (cancelled) return;
      const usable = (Array.isArray(list) ? list : []).filter((d) => !d.shared);
      setDecks(usable);
      if (usable[0]) setDeck(usable[0]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the chosen deck's cards and start a fresh drill.
  useEffect(() => {
    if (!deck) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await fetch(`/api/flashcards/decks/${deck._id}/cards?limit=500`, {
        cache: "no-store",
      }).catch(() => null);
      if (cancelled) return;
      if (!res || !res.ok) {
        setError("Không tải được thẻ của bộ này");
        setCards([]);
        setLoading(false);
        return;
      }
      const list = (await res.json().catch(() => [])) as DeckCard[];
      if (cancelled) return;
      const usable = (Array.isArray(list) ? list : []).filter(
        (c) => c.front && c.back,
      );
      setCards(usable);
      // Shuffle the drill order — exercises are random by nature.
      setOrder(seededShuffle(usable, hashSeed(deck._id)));
      setStep(0);
      setPicked(null);
      setTyped("");
      setChecked(false);
      setScore({ right: 0, wrong: 0 });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [deck]);

  const current = order[step];

  /** The 4 choices: the right answer + 3 distractors from the other cards. */
  const options = useMemo<string[]>(() => {
    if (!current) return [];
    const others = cards
      .filter((c) => c._id !== current._id && c.back !== current.back)
      .map((c) => c.back);
    const distractors = seededShuffle(
      others,
      hashSeed(current._id) + step * 7919,
    ).slice(0, 3);
    while (distractors.length < 3) {
      distractors.push(`Lựa chọn ${distractors.length + 1}`);
    }
    return seededShuffle(
      [current.back, ...distractors],
      hashSeed(current._id) + step * 104729 + 1,
    );
  }, [current, cards, step]);

  const typeCorrect = checked && answerMatches(typed, current?.back ?? "");

  /** Move to the next card, recording the answer. */
  function advance(correct: boolean) {
    setScore((s) => ({
      right: s.right + (correct ? 1 : 0),
      wrong: s.wrong + (correct ? 0 : 1),
    }));
    setStep((n) => n + 1);
    setPicked(null);
    setTyped("");
    setChecked(false);
  }

  const finished = order.length > 0 && step >= order.length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
          Bài tập
        </h1>
        <div className="flex items-center gap-3">
          {decks.length > 0 && (
            <label className="text-sm text-[var(--muted-foreground)]">
              Bộ thẻ:{" "}
              <select
                value={deck?._id ?? ""}
                onChange={(e) => {
                  const next = decks.find((d) => d._id === e.target.value);
                  if (next) setDeck(next);
                }}
                className="ml-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm text-[var(--foreground)]"
              >
                {decks.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Link
            href="/learn/study"
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
          >
            Ôn tập thẻ
          </Link>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">
          {error}
        </p>
      )}

      {/* Mode switcher */}
      <div className="mt-5 inline-flex rounded-xl border border-[var(--border)] bg-[var(--background-1)] p-0.5">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            aria-pressed={mode === m.key}
            title={m.hint}
            onClick={() => {
              setMode(m.key);
              setStep(0);
              setPicked(null);
              setTyped("");
              setChecked(false);
              setScore({ right: 0, wrong: 0 });
            }}
            className={
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors " +
              (mode === m.key
                ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]")
            }
          >
            {m.label}
          </button>
        ))}
      </div>

      {loading && (
        <p className="mt-8 text-center text-sm text-[var(--muted-foreground)]">
          Đang tải…
        </p>
      )}

      {!loading && order.length === 0 && (
        <p className="mt-8 rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
          Bộ thẻ này chưa có thẻ nào để làm bài. Tạo thẻ tại{" "}
          <Link href="/learn/decks" className="font-medium text-[var(--primary)] hover:underline">
            danh sách bộ thẻ
          </Link>
          .
        </p>
      )}

      {!loading && finished && (
        <div className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-8 text-center">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">
            Xong! {score.right}/{score.right + score.wrong} câu đúng
          </h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Bài tập không ảnh hưởng lịch ôn tập — hãy quay lại{" "}
            <Link href="/learn/study" className="font-medium text-[var(--primary)] hover:underline">
              ôn tập thẻ
            </Link>{" "}
            để ghi nhận tiến độ SRS.
          </p>
          <button
            type="button"
            onClick={() => {
              setOrder(seededShuffle(cards, hashSeed(deck?._id ?? "") + step + 1));
              setStep(0);
              setScore({ right: 0, wrong: 0 });
            }}
            className="mt-4 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]"
          >
            Làm lại
          </button>
        </div>
      )}

      {!loading && current && !finished && (
        <div className="mt-6">
          {/* Score + progress */}
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-[#16a34a]">{score.right} đúng</span>
            <span className="text-[#ef4444]">{score.wrong} sai</span>
            <span className="text-[var(--muted-foreground)]">
              {step + 1}/{order.length}
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--layer)]">
            <div
              className="h-full rounded-full bg-[var(--primary)] transition-all"
              style={{ width: `${(step / Math.max(1, order.length)) * 100}%` }}
            />
          </div>

          <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-6">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              {mode === "test" ? "Chọn đáp án đúng" : "Gõ đáp án"}
            </p>
            <p className="mt-3 break-words text-2xl font-semibold text-[var(--foreground)]">
              {current.front}
            </p>

            {mode === "test" ? (
              <>
                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                  {options.map((opt) => {
                    const isRight = opt === current.back;
                    const isPicked = picked === opt;
                    const reveal = picked !== null;
                    const tone = !reveal
                      ? "border-[var(--border)] bg-[var(--background)] hover:bg-[var(--layer-hover)]"
                      : isRight
                        ? "border-[#16a34a] bg-[#f0fdf4] text-[#15803d]"
                        : isPicked
                          ? "border-[#ef4444] bg-[#fef2f2] text-[#b91c1c]"
                          : "border-[var(--border)] bg-[var(--background)] opacity-60";
                    return (
                      <button
                        key={opt}
                        type="button"
                        disabled={reveal}
                        onClick={() => setPicked(opt)}
                        className={
                          "rounded-xl border px-4 py-3 text-left text-sm font-medium text-[var(--foreground)] transition-colors disabled:cursor-default " +
                          tone
                        }
                      >
                        {opt}
                        {reveal && isRight && (
                          <span className="ml-2 text-xs font-semibold text-[#16a34a]">
                            ✓ đúng
                          </span>
                        )}
                        {reveal && isPicked && !isRight && (
                          <span className="ml-2 text-xs font-semibold text-[#ef4444]">
                            ✕ sai
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {picked !== null && (
                  <button
                    type="button"
                    onClick={() => advance(picked === current.back)}
                    className="mt-3 w-full rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]"
                  >
                    Tiếp tục
                  </button>
                )}
              </>
            ) : (
              <>
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    if (!checked) setChecked(true);
                    else advance(typeCorrect);
                  }}
                  placeholder="Nhập đáp án của bạn…"
                  className={`mt-5 ${inputClass}`}
                />
                {checked && (
                  <div className="animate-card-in mt-4">
                    <p
                      className={
                        "rounded-xl px-4 py-3 text-sm font-medium " +
                        (typeCorrect
                          ? "bg-[#f0fdf4] text-[#15803d]"
                          : "bg-[#fef2f2] text-[#b91c1c]")
                      }
                    >
                      {typeCorrect
                        ? "✓ Chính xác!"
                        : `✕ Chưa đúng — đáp án là: ${current.back}`}
                    </p>
                    <button
                      type="button"
                      onClick={() => advance(typeCorrect)}
                      className="mt-3 w-full rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]"
                    >
                      Tiếp tục
                    </button>
                  </div>
                )}
                {!checked && (
                  <button
                    type="button"
                    onClick={() => setChecked(true)}
                    disabled={typed.trim() === ""}
                    className="mt-3 w-full rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Kiểm tra
                  </button>
                )}
              </>
            )}
          </div>

          <p className="mt-3 text-center text-xs text-[var(--muted-foreground)]">
            So khớp bỏ qua dấu và dấu câu — ví dụ “mèo” khớp với “Mèo!”.
          </p>
        </div>
      )}
    </div>
  );
}
