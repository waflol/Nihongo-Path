"use client";

import { useMemo, useState } from "react";
import { hashSeed, seededShuffle, type ExerciseCard } from "./quiz-utils";

/**
 * "Đặt câu" drill: the learner writes a sentence with a studied word and the
 * AI grades it — score, each mistake explained, a corrected sentence and
 * model usage examples as evidence. Grading is a server call
 * (`POST /api/flashcards/decks/:id/grade-sentence`); nothing is saved, so it
 * does not touch SRS progress.
 */

interface Grade {
  score: number;
  usesWord: boolean;
  corrected: string;
  summary: string;
  mistakes: { part: string; problem: string; fix: string }[];
  usage: { ja: string; vi: string; note: string }[];
}

const MAX_LEN = 300;

export function ComposeDrill({
  deckId,
  cards,
  tierOf,
  round,
  onRestart,
}: {
  deckId: string;
  cards: ExerciseCard[];
  /** 0 = learned today, 1 = due, 2 = rest: drilled in that order. */
  tierOf?: (id: string) => number;
  round: number;
  onRestart: () => void;
}) {
  const order = useMemo(
    () => {
      const list = seededShuffle(cards.filter((c) => c.front && c.back), hashSeed(deckId) + round);
      return tierOf ? list.sort((a, b) => tierOf(a._id) - tierOf(b._id)) : list;
    },
    [cards, deckId, round, tierOf],
  );
  const [step, setStep] = useState(0);
  const [text, setText] = useState("");
  const [grade, setGrade] = useState<Grade | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scores, setScores] = useState<number[]>([]);

  const card = order[step];

  async function submit() {
    if (!card || busy || text.trim() === "") return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/flashcards/decks/${deckId}/grade-sentence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: card._id, sentence: text.trim() }),
    }).catch(() => null);
    const data = res && res.ok ? ((await res.json().catch(() => null)) as Grade | null) : null;
    setBusy(false);
    if (!data) {
      setError("AI chưa chấm được câu này — thử lại sau.");
      return;
    }
    setGrade(data);
    setScores((s) => [...s, data.score]);
  }

  function next() {
    setStep((n) => n + 1);
    setText("");
    setGrade(null);
    setError(null);
  }

  if (order.length === 0) {
    return (
      <p className="mt-8 rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
        Bộ thẻ này chưa có thẻ nào để đặt câu.
      </p>
    );
  }

  if (!card) {
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    return (
      <div className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-8 text-center">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">
          Xong! Điểm trung bình {avg.toFixed(1)}/10 ({scores.length} câu)
        </h2>
        <button
          type="button"
          onClick={() => {
            setStep(0);
            setScores([]);
            onRestart();
          }}
          className="mt-4 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]"
        >
          Làm lại
        </button>
      </div>
    );
  }

  const tone =
    grade && (grade.score >= 8 ? "text-[#15803d]" : grade.score >= 5 ? "text-[#b45309]" : "text-[#b91c1c]");

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between text-xs font-medium text-[var(--muted-foreground)]">
        <span>Đặt câu</span>
        <span>
          {step + 1}/{order.length}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--layer)]">
        <div
          className="h-full rounded-full bg-[var(--primary)] transition-all"
          style={{ width: `${(step / order.length) * 100}%` }}
        />
      </div>

      <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          Đặt một câu tiếng Nhật với từ này
        </p>
        <p className="mt-3 break-words text-2xl font-semibold text-[var(--foreground)]">
          {card.front}
          {card.reading && card.reading !== card.front && (
            <span className="ml-2 text-base font-normal text-[var(--muted-foreground)]">
              （{card.reading}）
            </span>
          )}
        </p>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">{card.back}</p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
          disabled={busy || grade !== null}
          rows={3}
          lang="ja"
          placeholder="Viết câu của bạn bằng tiếng Nhật…"
          className="mt-5 block w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-base text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-focus)] disabled:opacity-70"
        />

        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">
            {error}
          </p>
        )}

        {!grade && (
          <button
            type="button"
            onClick={submit}
            disabled={busy || text.trim() === ""}
            className="mt-3 w-full rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "AI đang chấm…" : "Chấm điểm"}
          </button>
        )}

        {grade && (
          <div className="animate-card-in mt-5 space-y-4">
            <div className="flex items-baseline gap-3">
              <span className={`text-3xl font-bold ${tone}`}>{grade.score}/10</span>
              <span className="text-sm text-[var(--foreground)]">{grade.summary}</span>
            </div>
            {!grade.usesWord && (
              <p className="rounded-lg bg-[#fef2f2] px-3 py-2 text-sm text-[#b91c1c]">
                Câu chưa dùng đúng từ “{card.front}”.
              </p>
            )}

            {grade.corrected && grade.corrected !== text.trim() && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Câu đã sửa
                </p>
                <p className="mt-1 rounded-lg bg-[#f0fdf4] px-3 py-2 text-base text-[#15803d]" lang="ja">
                  {grade.corrected}
                </p>
              </div>
            )}

            {grade.mistakes.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Chỗ sai
                </p>
                <ul className="mt-1 space-y-2">
                  {grade.mistakes.map((m, i) => (
                    <li key={i} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
                      {m.part && (
                        <span className="mr-2 font-semibold text-[#b91c1c]" lang="ja">
                          {m.part}
                        </span>
                      )}
                      <span className="text-[var(--foreground)]">{m.problem}</span>
                      {m.fix && (
                        <span className="mt-1 block text-[#15803d]">
                          → <span lang="ja">{m.fix}</span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {grade.usage.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Dẫn chứng cách dùng
                </p>
                <ul className="mt-1 space-y-2">
                  {grade.usage.map((u, i) => (
                    <li key={i} className="rounded-lg bg-[var(--layer)] px-3 py-2 text-sm">
                      <span className="block text-base text-[var(--foreground)]" lang="ja">
                        {u.ja}
                      </span>
                      {u.vi && <span className="block text-[var(--muted-foreground)]">{u.vi}</span>}
                      {u.note && <span className="mt-1 block text-[var(--foreground)]">{u.note}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              type="button"
              onClick={next}
              className="w-full rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]"
            >
              Tiếp tục
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
