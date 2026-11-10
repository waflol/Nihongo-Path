"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ComposeDrill } from "./compose-drill";
import {
  answerMatches,
  asksReading,
  buildChoiceQuestions,
  hashSeed,
  seededShuffle,
  type ChoiceMode,
  type ChoiceQuestion,
  type TestKind,
  type ExerciseCard,
  buildKanjiQuestions,
  isKanjiReadingCard,
  readingMatches,
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
type TypeItem = DeckCard & { drill: "reading" | "meaning" };

/** Pseudo-deck: every deck at once (cards are routed to their own deck for server calls). */
const ALL_DECKS: DeckRef = { _id: "all", title: "Tất cả bộ thẻ", shared: false };

/**
 * POST `{cardIds}` to a per-deck endpoint, grouping the ids by the deck that owns
 * each card (one request per deck), and merge the `items` of the answers.
 * Null when every request failed.
 */
async function postByDeck<T>(
  endpoint: string,
  ids: string[],
  deckOf: (id: string) => string,
): Promise<{ items: T[] } | null> {
  const groups = new Map<string, string[]>();
  for (const id of ids) groups.set(deckOf(id), [...(groups.get(deckOf(id)) ?? []), id]);
  const results = await Promise.all(
    [...groups].map(async ([deckId, cardIds]) => {
      const res = await fetch(`/api/flashcards/decks/${deckId}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardIds }),
      }).catch(() => null);
      if (!res?.ok) return null;
      const data = (await res.json().catch(() => null)) as { items?: T[] } | null;
      return data?.items ?? null;
    }),
  );
  const ok = results.filter((r): r is T[] => r !== null);
  return ok.length ? { items: ok.flat() } : null;
}

type Mode = ChoiceMode | "type" | "synonym" | "compose";

const MODES: { key: Mode; label: string; hint: string }[] = [
  { key: "test", label: "Trắc nghiệm", hint: "Chọn nghĩa tiếng Việt hoặc chọn chữ kanji tương ứng" },
  { key: "type", label: "Gõ đáp án", hint: "Gõ cách phát âm (hiragana) hoặc nghĩa tiếng Việt" },
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
  // Per deck: ids learned today, then ids due today — these are drilled first.
  const [priority, setPriority] = useState<Record<string, { today: string[]; due: string[] }>>({});
  const prio = useMemo(() => {
    if (!deck) return undefined;
    if (deck._id !== ALL_DECKS._id) return priority[deck._id];
    const all = Object.values(priority);
    return { today: all.flatMap((p) => p.today), due: all.flatMap((p) => p.due) };
  }, [deck, priority]);
  /** 0 = learned today, 1 = due today, 2 = the rest. */
  const tierMap = useMemo(() => {
    const p = prio;
    const m = new Map<string, number>();
    for (const id of p?.due ?? []) m.set(id, 1);
    for (const id of p?.today ?? []) m.set(id, 0);
    return m;
  }, [prio]);
  const tierOf = (id: string) => tierMap.get(id) ?? 2;
  // The drill is always just the words learned today + the words due for SRS review
  // (the rest of the deck only serves as wrong answers).
  const focused = true;
  const nothingDue = tierMap.size === 0;
  const inFocus = <T,>(list: T[], idOf: (x: T) => string): T[] =>
    focused ? list.filter((x) => tierOf(idOf(x)) < 2) : list;
  /** Stable: learned-today first, then due, then the rest (the shuffle within each stays). */
  function byPriority<T>(list: T[], idOf: (x: T) => string): T[] {
    return [...list].sort((a, b) => tierOf(idOf(a)) - tierOf(idOf(b)));
  }

  // Per-sitting drill state.
  const [testKind, setTestKind] = useState<TestKind>("meaning");
  const [typeKind, setTypeKind] = useState<"reading" | "meaning" | "mixed">("reading");
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState({ right: 0, wrong: 0 });
  const [round, setRound] = useState(0);

  // Remember the learner's chosen sub-modes across visits.
  useEffect(() => {
    try {
      const t = localStorage.getItem("exercises.testKind");
      const y = localStorage.getItem("exercises.typeKind");
      if (t === "meaning" || t === "kanji" || t === "mixed") setTestKind(t);
      if (y === "reading" || y === "meaning" || y === "mixed") setTypeKind(y);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("exercises.testKind", testKind);
      localStorage.setItem("exercises.typeKind", typeKind);
    } catch {}
  }, [testKind, typeKind]);

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
      type Prio = Record<string, { today: string[]; due: string[] }>;
      const pr: Prio = await fetch("/api/srs/exercise-priority", { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<Prio>) : ({} as Prio)))
        .catch(() => ({}) as Prio);
      if (cancelled) return;
      setPriority(pr);
      // Words learned today / due can sit in several decks: start on "all decks" so the drill
      // matches the totals on /learn; else the first deck.
      const hasWords = Object.values(pr).some((p) => p.today.length + p.due.length > 0);
      const start = usable.length > 1 && hasWords ? ALL_DECKS : usable[0];
      if (start) setDeck(start);
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
      const sources = deck._id === ALL_DECKS._id ? decks : [deck];
      const responses = await Promise.all(
        sources.map((d) =>
          fetch(`/api/flashcards/decks/${d._id}/cards?limit=5000`, { cache: "no-store" }).catch(() => null),
        ),
      );
      if (cancelled) return;
      const res = responses.length > 0 && responses.every((r) => r?.ok) ? responses : null;
      if (!res) {
        setError("Không tải được thẻ của bộ này");
        setCards([]);
        setLoading(false);
        return;
      }
      const lists = await Promise.all(
        res.map(async (r, i) => {
          const l = (await r!.json().catch(() => [])) as DeckCard[];
          return (Array.isArray(l) ? l : []).map((c) => ({ ...c, deck: String(c.deck ?? sources[i]._id) }));
        }),
      );
      if (cancelled) return;
      const seen = new Set<string>();
      const usable = lists.flat().filter((c) => c.front && c.back && !seen.has(c._id) && seen.add(c._id));
      setCards(usable);
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
  }, [deck, decks]);

  // "Gõ đáp án": reading mode only drills kanji cards (with a hiragana reading to type);
  // meaning mode drills every card. Shuffled, then re-ordered by priority.
  const order = useMemo<TypeItem[]>(() => {
    const seed = hashSeed(deck?._id ?? "") + round;
    const readings = seededShuffle(cards.filter(asksReading), seed).map((c) => ({ ...c, drill: "reading" as const }));
    const meanings = seededShuffle(cards, seed + 7).map((c) => ({ ...c, drill: "meaning" as const }));
    // One exercise per word: a word without kanji/reading to type is asked for its meaning instead.
    if (typeKind === "reading")
      return seededShuffle(cards, seed).map((c) => ({ ...c, drill: asksReading(c) ? ("reading" as const) : ("meaning" as const) }));
    if (typeKind === "meaning") return meanings;
    // Both: every card is asked each way, the two kinds alternating.
    const out: TypeItem[] = [];
    for (let i = 0; i < Math.max(readings.length, meanings.length); i++) {
      if (readings[i]) out.push(readings[i]);
      if (meanings[i]) out.push(meanings[i]);
    }
    return out;
  }, [cards, typeKind, deck, round]);
  /** The deck a card belongs to (cards of "all decks" are routed to their own deck). */
  const deckOf = useCallback(
    (cardId: string) => cards.find((c) => c._id === cardId)?.deck ?? deck?._id ?? "",
    [cards, deck],
  );

  const orderP = useMemo(() => inFocus(byPriority(order, (c) => c._id), (c) => c._id), [order, tierMap, focused]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = orderP[step];

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
    return inFocus(byPriority(buildChoiceQuestions(mode, cards, hashSeed(deck?._id ?? "") + round, testKind, new Set(tierMap.keys())), (q) => q.id), (q) => q.id);
  }, [mode, aiMode, cards, deck, round, testKind, tierMap, focused]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trắc nghiệm, hiragana → kanji questions: the AI composes 3 look-alike wrong
  // spellings from the N5–N1 kanji already created (nonsense words are fine). They
  // arrive in the background; the local look-alikes are used until they do.
  const distractorKey = `${deck?._id ?? ""}:${round}`;
  const [distractors, setDistractors] = useState<{ key: string; map: Record<string, string[]> }>({
    key: "",
    map: {},
  });
  const [decided, setDecided] = useState<{ key: string; opts: Record<string, string[]> }>({
    key: "",
    opts: {},
  });
  useEffect(() => {
    if (mode !== "test" || !deck) return;
    const ids = localQs.filter((q) => q.kind === "kanji-pick").map((q) => q.id);
    if (ids.length === 0) return;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < ids.length && !cancelled; i += AI_BATCH) {
        const data = await postByDeck<{ cardId: string; wrong: string[] }>(
          "kanji-distractors",
          ids.slice(i, i + AI_BATCH),
          deckOf,
        );
        if (cancelled || !data?.items) return; // no AI: keep the local look-alikes
        setDistractors((prev) => ({
          key: distractorKey,
          map: {
            ...(prev.key === distractorKey ? prev.map : {}),
            ...Object.fromEntries(data.items!.map((x) => [x.cardId, x.wrong])),
          },
        }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, deck, localQs, distractorKey, deckOf]);

  /** Cards an AI mode can ask about, in a stable shuffled order. */
  const aiOrder = useMemo(() => {
    const usable = mode === "kanji" ? cards.filter(isKanjiReadingCard) : cards.filter((c) => c.front && c.back);
    return inFocus(byPriority(seededShuffle(usable, hashSeed(deck?._id ?? "") + round), (c) => c._id), (c) => c._id);
  }, [mode, cards, deck, round, tierMap, focused]); // eslint-disable-line react-hooks/exhaustive-deps

  const questions = aiMode ? ai.qs : localQs;
  const total = mode === "type" ? orderP.length : questions.length;
  const baseQuestion: ChoiceQuestion | undefined = questions[step];
  const aiWrong = distractors.key === distractorKey ? distractors.map : {};
  const frozen = decided.key === distractorKey ? decided.opts : {};
  const question: ChoiceQuestion | undefined = (() => {
    if (!baseQuestion || mode !== "test" || baseQuestion.kind !== "kanji-pick") return baseQuestion;
    // Once a question has been shown its options never change under the learner.
    if (frozen[baseQuestion.id]) return { ...baseQuestion, options: frozen[baseQuestion.id] };
    const ai = aiWrong[baseQuestion.id];
    if (!ai?.length) return baseQuestion;
    const local = baseQuestion.options.filter((o) => o !== baseQuestion.answer);
    const wrong = [...new Set([...ai, ...local])].filter((o) => o !== baseQuestion.answer).slice(0, 3);
    if (wrong.length < 3) return baseQuestion;
    return {
      ...baseQuestion,
      source: "ai",
      options: seededShuffle([baseQuestion.answer, ...wrong], hashSeed(baseQuestion.id) + round + 1),
    };
  })();
  const shownId = question?.kind === "kanji-pick" && mode === "test" ? question.id : null;
  const shownOptions = question?.options;
  useEffect(() => {
    if (!shownId || !shownOptions) return;
    const t = setTimeout(
      () =>
        setDecided((d) => {
          const base = d.key === distractorKey ? d.opts : {};
          return base[shownId] ? d : { key: distractorKey, opts: { ...base, [shownId]: shownOptions } };
        }),
      0,
    );
    return () => clearTimeout(t);
  }, [shownId, shownOptions, distractorKey]);
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
      const data = await postByDeck<{
        cardId: string;
        synonym?: string;
        wrong?: string[];
        chars?: Record<string, string[]>;
      }>(kanji ? "kanji-lookalikes" : "synonym-quiz", batch.map((c) => c._id), deckOf);
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
  }, [mode, aiMode, deck, cards, ai, aiExhausted, aiOrder, step, round, deckOf]);

  // Keep every question that is put in front of the learner in the question
  // bank (reused by the JLPT / Nattest practice later). Fire-and-forget: the
  // server de-duplicates, and a failed save never interrupts the drill.
  useEffect(() => {
    if (!question || !deck) return;
    void fetch(`/api/flashcards/decks/${deckOf(question.id)}/exercise-questions`, {
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
  }, [question, deck, deckOf]);

  // Kanji front + known reading → the answer is the hiragana reading; otherwise the back (meaning).
  const typeReading = mode === "type" && !!current && current.drill === "reading";
  const typeCorrect =
    checked &&
    mode === "type" &&
    (typeReading
      ? readingMatches(typed, current?.reading ?? "")
      : answerMatches(typed, current?.back ?? ""));

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
  const compose = mode === "compose" && !nothingDue;
  const empty =
    nothingDue
      ? true
      : compose
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
                  const next =
                    e.target.value === ALL_DECKS._id ? ALL_DECKS : decks.find((d) => d._id === e.target.value);
                  if (next) setDeck(next);
                }}
                className="ml-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm text-[var(--foreground)]"
              >
                {decks.length > 1 && <option value={ALL_DECKS._id}>{ALL_DECKS.title}</option>}
                {decks.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Link
            href="/learn/review"
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
          >
            Ôn tập thẻ
          </Link>
        </div>
      </div>

      {deck && (prio?.today.length || prio?.due.length) ? (
        <p className="mt-3 rounded-lg bg-[var(--layer)] px-4 py-2.5 text-sm text-[var(--foreground)]">
          Bài tập hôm nay: <strong>{prio?.today.length ?? 0} từ mới học hôm nay</strong> trước, sau đó{" "}
          <strong>{prio?.due.length ?? 0} từ đến hạn ôn tập</strong>.
        </p>
      ) : null}

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

      {(mode === "test" || mode === "type") && (
        <div className="mt-3 inline-flex flex-wrap rounded-xl border border-[var(--border)] bg-[var(--background-1)] p-0.5 sm:ml-3">
          {(mode === "test"
            ? ([["meaning", "Chọn nghĩa tiếng Việt"], ["kanji", "Chọn chữ kanji"], ["mixed", "Xen kẽ cả hai"]] as const)
            : ([["reading", "Nhập cách phát âm"], ["meaning", "Nhập nghĩa tiếng Việt"], ["mixed", "Xen kẽ cả hai"]] as const)
          ).map(([k, label]) => {
            const active = mode === "test" ? testKind === k : typeKind === k;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  if (mode === "test") setTestKind(k as TestKind);
                  else setTypeKind(k as "reading" | "meaning" | "mixed");
                  setError(null);
                  setStep(0);
                  setPicked(null);
                  setTyped("");
                  setChecked(false);
                  setScore({ right: 0, wrong: 0 });
                }}
                className={
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors " +
                  (active
                    ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]")
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {loading && (
        <p className="mt-8 text-center text-sm text-[var(--muted-foreground)]">
          Đang tải…
        </p>
      )}

      {!loading && deck && compose && (
        <ComposeDrill
          deckId={deck._id}
          cards={inFocus(cards, (c) => c._id)}
          tierOf={tierOf}
          round={round}
          onRestart={() => setRound((n) => n + 1)}
        />
      )}

      {!loading && empty && (
        <p className="mt-8 rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
          {nothingDue
            ? "Chưa có từ nào mới học hôm nay hoặc đến hạn ôn tập theo SRS trong bộ này — bài tập sẽ có khi bạn học từ mới hoặc có từ đến hạn."
            : mode === "type"
            ? typeKind === "reading"
              ? "Bộ thẻ này chưa có thẻ kanji nào có cách đọc hiragana để gõ."
              : "Bộ thẻ này chưa có thẻ nào để làm bài."
            : mode === "test"
            ? testKind === "kanji"
              ? "Bộ thẻ này chưa đủ từ có kanji và cách đọc hiragana (cần ít nhất 4 thẻ)."
              : "Bộ thẻ này chưa có đủ thẻ để làm bài (cần ít nhất 4 thẻ)."
            : mode === "sentence" || mode === "context"
              ? "Bộ thẻ này chưa đủ câu ví dụ chứa từ vựng (cần ít nhất 4 thẻ có ví dụ)."
              : mode === "formation"
                ? "Bộ thẻ này chưa đủ từ ghép từ 2 chữ kanji trở lên."
              : mode === "synonym"
                ? "Chưa tạo được câu hỏi đồng nghĩa (cần dịch vụ AI đang hoạt động)."
                : "Bộ thẻ này chưa đủ từ có kanji và cách đọc hiragana (cần ít nhất 4 thẻ)."}{" "}
          {nothingDue ? "Học từ mới tại " : "Tạo thẻ tại "}
          <Link href={nothingDue ? "/learn/study" : "/learn/decks"} className="font-medium text-[var(--primary)] hover:underline">
            {nothingDue ? "trang học từ mới" : "danh sách bộ thẻ"}
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
            <Link href="/learn/review" className="font-medium text-[var(--primary)] hover:underline">
              ôn tập thẻ
            </Link>{" "}
            để ghi nhận tiến độ SRS.
          </p>
          <button
            type="button"
            onClick={() => {
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
              {mode === "type" ? (typeReading ? "Gõ cách đọc bằng hiragana" : "Gõ đáp án") : question?.label}
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
                  {question.options.map((opt, idx) => {
                    const isRight = opt === question.answer;
                    const isPicked = picked === opt;
                    const reveal = picked !== null;
                    const tone = !reveal
                      ? "border-[var(--border)] bg-[var(--background)] hover:bg-[var(--layer-hover)]"
                      : isRight
                        ? "border-[#16a34a] bg-[var(--background)] ring-1 ring-[#16a34a]"
                        : isPicked
                          ? "border-[#ef4444] bg-[var(--background)] ring-1 ring-[#ef4444]"
                          : "border-[var(--border)] bg-[var(--background)] opacity-60";
                    return (
                      <button
                        key={opt}
                        type="button"
                        disabled={reveal}
                        onClick={() => setPicked(opt)}
                        className={
                          "flex min-h-[4.5rem] items-center rounded-xl border px-4 py-3 text-left font-medium leading-snug text-[var(--foreground)] transition-colors disabled:cursor-default " +
                          "text-[1.4rem] " + // one size for every kind of option
                          tone
                        }
                      >
                        <span className="flex w-full items-center gap-3">
                          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-xs font-semibold text-[var(--muted-foreground)]">
                            {"ABCD"[idx] ?? idx + 1}
                          </span>
                          <span className="min-w-0 flex-1 break-words" lang={bigOptions ? "ja" : "vi"}>{opt}</span>
                          {reveal && isRight && (
                            <span aria-label="đúng" className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[#16a34a] text-sm font-bold text-white">
                              ✓
                            </span>
                          )}
                          {reveal && isPicked && !isRight && (
                            <span aria-label="sai" className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[#ef4444] text-sm font-bold text-white">
                              ✕
                            </span>
                          )}
                        </span>
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
                  placeholder={typeReading ? "Nhập cách đọc bằng hiragana…" : "Nhập đáp án của bạn…"}
                  lang={typeReading ? "ja" : undefined}
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
                        : typeReading
                          ? `✕ Chưa đúng — cách đọc là: ${current?.reading}${current?.back ? ` (${current.back})` : ""}`
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
            So khớp bỏ qua dấu và dấu câu — ví dụ “mèo” khớp với “Mèo!”. {typeReading ? " Hãy gõ cách đọc hiragana (gõ katakana cũng được)." : ""}
          </p>
        </div>
      )}
    </div>
  );
}
