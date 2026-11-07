"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ComposeDrill } from "./compose-drill";
import {
  answerMatches,
  buildChoiceQuestions,
  hashSeed,
  seededShuffle,
  type ChoiceMode,
  type ChoiceQuestion,
  type ExerciseCard,
  buildKanjiQuestions,
  isKanjiReadingCard,
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

type DeckCard = ExerciseCard;

type Mode = ChoiceMode | "type" | "synonym" | "compose";

const MODES: { key: Mode; label: string; hint: string }[] = [
  { key: "test", label: "Trắc nghiệm", hint: "Chọn 1 trong 4 đáp án" },
  { key: "type", label: "Gõ đáp án", hint: "Tự gõ đáp án vào ô trống" },
  { key: "reading", label: "問題1 Cách đọc kanji", hint: "Chọn cách đọc hiragana đúng của từ" },
  { key: "kanji", label: "問題2 Cách đọc Hiragana", hint: "Hiragana là cách đọc của chữ kanji nào (đáp án sai là kanji gần giống, AI tạo)" },
  { key: "formation", label: "問題3 Cấu tạo từ", hint: "Chọn chữ kanji còn thiếu để tạo thành từ" },
  { key: "synonym", label: "問題4 Đồng nghĩa", hint: "Chọn từ đồng nghĩa (AI tạo đáp án)" },
  { key: "context", label: "問題5 Biểu hiện từ", hint: "Chọn từ điền vào chỗ trống của câu" },
  { key: "sentence", label: "問題6 Cách dùng từ", hint: "Chọn câu dùng đúng từ vựng" },
  { key: "compose", label: "Đặt câu (AI chấm)", hint: "Tự đặt câu với từ đã học, AI chấm điểm và giải thích" },
];

const AI_BATCH = 10;

const inputClass =
  "block w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-base text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-focus)]";

/** The question stem; the part the question is about (`mark`) is underlined. */
function Stem({ q }: { q?: ChoiceQuestion }) {
  if (!q) return null;
  const at = q.mark ? q.prompt.indexOf(q.mark) : -1;
  if (!q.mark || at < 0) return <>{q.prompt}</>;
  return (
    <span className="text-xl font-medium leading-relaxed" lang="ja">
      {q.prompt.slice(0, at)}
      <u className="underline decoration-2 underline-offset-4">{q.mark}</u>
      {q.prompt.slice(at + q.mark.length)}
    </span>
  );
}

const EXAM_KEYS: Mode[] = ["reading", "kanji", "formation", "synonym", "context", "sentence"];

/**
 * `exercises` = trắc nghiệm / gõ đáp án / đặt câu; `exam` = luyện thi, the six
 * JLPT-style 問題 types.
 */
export function ExercisesConsole({ variant = "exercises" }: { variant?: "exercises" | "exam" }) {
  const exam = variant === "exam";
  const modes = MODES.filter((m) => EXAM_KEYS.includes(m.key) === exam);
  const [decks, setDecks] = useState<DeckRef[]>([]);
  const [deck, setDeck] = useState<DeckRef | null>(null);
  const [cards, setCards] = useState<DeckCard[]>([]);
  const [mode, setMode] = useState<Mode>(exam ? "reading" : "test");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per-sitting drill state.
  const [order, setOrder] = useState<DeckCard[]>([]);
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState({ right: 0, wrong: 0 });
  const [round, setRound] = useState(0);

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
      // Shared (published) decks are readable by every learner, so they can be drilled too.
      const usable = (Array.isArray(list) ? list : []).filter((d) => !!d._id);
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

  // AI-backed modes (synonym, look-alike kanji): questions come from the AI in
  // batches of AI_BATCH. State is tagged with the mode+deck+round it belongs to,
  // so a new deck/round/mode starts empty without resetting state in an effect.
  const aiMode = mode === "synonym" || mode === "kanji";
  const aiKey = `${mode}:${deck?._id ?? ""}:${round}`;
  const [aiState, setAiState] = useState<{
    key: string;
    qs: ChoiceQuestion[];
    cursor: number;
    failed: boolean;
    loading: boolean;
  }>({ key: "", qs: [], cursor: 0, failed: false, loading: false });
  const ai = useMemo(
    () =>
      aiState.key === aiKey
        ? aiState
        : { key: aiKey, qs: [] as ChoiceQuestion[], cursor: 0, failed: false, loading: false },
    [aiState, aiKey],
  );

  /** Questions of the local choice modes (rebuilt when the deck, mode or round changes). */
  const localQs = useMemo<ChoiceQuestion[]>(() => {
    if (mode === "type" || mode === "compose" || aiMode) return [];
    return buildChoiceQuestions(mode, cards, hashSeed(deck?._id ?? "") + round);
  }, [mode, aiMode, cards, deck, round]);

  /** Cards an AI mode can ask about, in a stable shuffled order. */
  const aiOrder = useMemo(() => {
    const usable = mode === "kanji" ? cards.filter(isKanjiReadingCard) : cards.filter((c) => c.front && c.back);
    return seededShuffle(usable, hashSeed(deck?._id ?? "") + round);
  }, [mode, cards, deck, round]);

  const questions = aiMode ? ai.qs : localQs;
  const total = mode === "type" ? order.length : questions.length;
  const question: ChoiceQuestion | undefined = questions[step];
  const answerCard = question ? cards.find((c) => c._id === question.id) : undefined;
  // Kanji-style answers (問題2/3/4) are shown large so look-alike strokes are readable.
  const bigOptions =
    question?.kind === "kanji-pick" || question?.kind === "formation-pick" || question?.kind === "synonym-pick";

  const aiExhausted = ai.failed || ai.cursor >= aiOrder.length;
  const aiDone = aiExhausted && ai.qs.length - step <= 0;

  // Fetch the next batch of AI questions when the learner is running low.
  useEffect(() => {
    if (!aiMode || !deck || ai.loading || aiExhausted) return;
    if (ai.qs.length - step > 3) return;
    const batch = aiOrder.slice(ai.cursor, ai.cursor + AI_BATCH);
    const base = ai;
    const kanji = mode === "kanji";
    (async () => {
      setAiState({ ...base, loading: true });
      const res = await fetch(
        `/api/flashcards/decks/${deck._id}/${kanji ? "kanji-lookalikes" : "synonym-quiz"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardIds: batch.map((c) => c._id) }),
        },
      ).catch(() => null);
      const data =
        res && res.ok
          ? ((await res.json().catch(() => null)) as {
              items?: { cardId: string; synonym?: string; wrong?: string[]; chars?: Record<string, string[]> }[];
            } | null)
          : null;
      const byId = new Map(batch.map((c) => [c._id, c]));
      const aiItems = new Map((data?.items ?? []).map((it) => [it.cardId, it]));
      const fresh: ChoiceQuestion[] = kanji
        ? // Look-alike kanji: the AI's near-miss spellings; a card the AI skipped
          // (or all cards if the AI failed) falls back to the local ranking.
          buildKanjiQuestions(
            batch,
            cards,
            hashSeed(deck._id) + round,
            new Map([...aiItems].flatMap(([id, it]) => (it.chars ? [[id, it.chars] as const] : []))),
          )
        : (data?.items ?? []).flatMap((it) => {
            const c = byId.get(it.cardId);
            if (!c || !it.synonym || (it.wrong?.length ?? 0) < 3) return [];
            return [
              {
                id: c._id,
                kind: "synonym-pick" as const,
                source: "ai" as const,
                label: "Chọn từ đồng nghĩa",
                prompt: c.front,
                sub: c.back,
                options: seededShuffle([it.synonym, ...(it.wrong ?? [])], hashSeed(c._id) + round),
                answer: it.synonym,
              },
            ];
          });
      if (!data) {
        setError(
          kanji
            ? "AI chưa tạo được kanji gần giống — dùng đáp án sai từ bộ thẻ."
            : "AI chưa tạo được câu hỏi đồng nghĩa — thử lại sau",
        );
      }
      // Ignore the answer if the learner has moved to another deck/round/mode meanwhile.
      setAiState((cur) =>
        cur.key !== base.key
          ? cur
          : {
              key: base.key,
              qs: [...base.qs, ...fresh],
              cursor: base.cursor + batch.length,
              // Synonyms have no local fallback, so an AI failure ends that queue;
              // the kanji mode keeps going on its local fallback.
              failed: !data && !kanji,
              loading: false,
            },
      );
    })();
  }, [mode, aiMode, deck, cards, ai, aiExhausted, aiOrder, step, round]);

  // Keep every question that is put in front of the learner in the question
  // bank (reused by the JLPT / Nattest practice later). Fire-and-forget: the
  // server de-duplicates, and a failed save never interrupts the drill.
  useEffect(() => {
    if (!question || !deck) return;
    void fetch(`/api/flashcards/decks/${deck._id}/exercise-questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            cardId: question.id,
            kind: question.kind,
            prompt: question.prompt,
            sub: question.sub,
            options: question.options,
            answer: question.answer,
            explain: question.explain,
            source: question.source,
          },
        ],
      }),
    }).catch(() => null);
  }, [question, deck]);

  const typeCorrect = checked && mode === "type" && answerMatches(typed, current?.back ?? "");

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

  const waitingSyn = aiMode && !question && !aiExhausted;
  const finished = total > 0 && step >= total && !waitingSyn;
  const compose = mode === "compose";
  const empty =
    compose
      ? false
      : aiMode
      ? aiDone && ai.qs.length === 0
      : mode === "type"
        ? order.length === 0
        : localQs.length === 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
          {exam ? "Luyện thi" : "Bài tập"}
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
      <div className="mt-5 inline-flex flex-wrap rounded-xl border border-[var(--border)] bg-[var(--background-1)] p-0.5">
        {modes.map((m) => (
          <button
            key={m.key}
            type="button"
            aria-pressed={mode === m.key}
            title={m.hint}
            onClick={() => {
              setMode(m.key);
              setError(null);
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

      {!loading && deck && compose && (
        <ComposeDrill
          deckId={deck._id}
          cards={cards}
          round={round}
          onRestart={() => setRound((n) => n + 1)}
        />
      )}

      {!loading && empty && (
        <p className="mt-8 rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
          {mode === "type" || mode === "test"
            ? "Bộ thẻ này chưa có thẻ nào để làm bài."
            : mode === "sentence" || mode === "context"
              ? "Bộ thẻ này chưa đủ câu ví dụ chứa từ vựng (cần ít nhất 4 thẻ có ví dụ)."
              : mode === "formation"
                ? "Bộ thẻ này chưa đủ từ ghép từ 2 chữ kanji trở lên."
              : mode === "synonym"
                ? "Chưa tạo được câu hỏi đồng nghĩa (cần dịch vụ AI đang hoạt động)."
                : "Bộ thẻ này chưa đủ từ có kanji và cách đọc hiragana (cần ít nhất 4 thẻ)."}{" "}
          Tạo thẻ tại{" "}
          <Link href="/learn/decks" className="font-medium text-[var(--primary)] hover:underline">
            danh sách bộ thẻ
          </Link>
          .
        </p>
      )}

      {!loading && !compose && !empty && finished && (
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
              setRound((n) => n + 1);
              setStep(0);
              setPicked(null);
              setScore({ right: 0, wrong: 0 });
            }}
            className="mt-4 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]"
          >
            Làm lại
          </button>
        </div>
      )}

      {!loading && !compose && waitingSyn && !empty && (
        <p className="mt-8 text-center text-sm text-[var(--muted-foreground)]">
          AI đang tạo câu hỏi…
        </p>
      )}

      {!loading && !compose && (mode === "type" ? current : question) && !finished && (
        <div className="mt-6">
          {/* Score + progress */}
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-[#16a34a]">{score.right} đúng</span>
            <span className="text-[#ef4444]">{score.wrong} sai</span>
            <span className="text-[var(--muted-foreground)]">
              {step + 1}/{total}
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--layer)]">
            <div
              className="h-full rounded-full bg-[var(--primary)] transition-all"
              style={{ width: `${(step / Math.max(1, total)) * 100}%` }}
            />
          </div>

          <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-6">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              {mode === "type" ? "Gõ đáp án" : question?.label}
            </p>
            <p className="mt-3 break-words text-2xl font-semibold text-[var(--foreground)]">
              {mode === "type" ? current?.front : <Stem q={question} />}
            </p>
            {mode !== "type" && question?.sub && (
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">{question.sub}</p>
            )}

            {mode !== "type" && question ? (
              <>
                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                  {question.options.map((opt) => {
                    const isRight = opt === question.answer;
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
                          "rounded-xl border px-4 text-left font-medium text-[var(--foreground)] transition-colors disabled:cursor-default " +
                          (bigOptions ? "py-5 text-3xl " : "py-3 text-sm ") +
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
                  <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--layer)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                      Giải thích đáp án
                    </p>
                    <p
                      className={
                        "mt-1 text-sm font-semibold " +
                        (picked === question.answer ? "text-[#15803d]" : "text-[#b91c1c]")
                      }
                    >
                      {picked === question.answer ? "Chính xác!" : "Chưa đúng."} Đáp án:{" "}
                      <span className={bigOptions ? "text-xl" : ""}>{question.answer}</span>
                    </p>
                    {answerCard && (
                      <p className="mt-2 text-sm text-[var(--foreground)]">
                        <span className="text-lg font-semibold">{answerCard.front}</span>
                        {answerCard.reading ? `（${answerCard.reading}）` : ""} — {answerCard.back}
                      </p>
                    )}
                    {question.explain && (
                      <p className="mt-2 text-sm text-[var(--muted-foreground)]">{question.explain}</p>
                    )}
                    {answerCard?.examples?.[0] && !question.explain?.includes(answerCard.examples[0].sentence) && (
                      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                        Ví dụ: {answerCard.examples[0].sentence}
                        {answerCard.examples[0].translation ? ` — ${answerCard.examples[0].translation}` : ""}
                      </p>
                    )}
                  </div>
                )}
                {picked !== null && (
                  <button
                    type="button"
                    onClick={() => advance(picked === question.answer)}
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
                        : `✕ Chưa đúng — đáp án là: ${current?.back}`}
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

          <p className={"mt-3 text-center text-xs text-[var(--muted-foreground)] " + (mode === "type" ? "" : "hidden")}>
            So khớp bỏ qua dấu và dấu câu — ví dụ “mèo” khớp với “Mèo!”.
          </p>
        </div>
      )}
    </div>
  );
}
