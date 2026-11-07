"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { seededShuffle } from "./quiz-utils";
import { PosChip } from "@/components/learn/reading-fields";
import { ConfirmDialog } from "@/components/learn/confirm-dialog";
import { CardReportDialog } from "@/components/learn/card-report-dialog";
import { StudyComplete } from "@/components/learn/study-complete";
import { hanViet } from "@/lib/han-viet";
import { useHanVietPref } from "@/lib/use-han-viet-pref";

/**
 * Flashcard study screen (P3-UI-01) — Quizlet-style "Learn" flow.
 *
 * **One way to learn a card here: flip it.** The term side is dark, the
 * definition side is light; pressing Space (or the card) swaps them. The
 * multiple-choice and type-in drills live in the exercises area
 * (`/learn/exercises`) — this screen stays a focused flashcard review.
 *
 * **Grading is always available.** The four grade buttons (Quên / Khó / Tốt /
 * Thuộc) are enabled even before the card is flipped — you can rate your own
 * recall without revealing the answer, which is how Quizlet's "Still learning
 * / Got it" works. The SM-2 mirror (`advanceSm2` below) is a copy of
 * `apps/api/src/srs/srs.algorithm.ts`; grades buffer in `pendingReviews` and
 * flush to `POST /api/srs/reviews/batch` (one request for the whole sitting),
 * on a debounce, on tab-hide, and on unmount (keepalive).
 *
 * The server remains the source of truth: after each successful flush the
 * local states are replaced by the server's, so two devices never fork
 * (P3-SRS-06 last-write-wins).
 *
 * **Navigation.** Next/Prev buttons (and ←/→ keys) move through the sitting
 * without grading — reviewing is optional, only an explicit grade writes SRS
 * progress.
 *
 * `useSearchParams` (the `?deck=` target) forces this client component to
 * stream its first render — under Next 16 `cacheComponents` a direct
 * `useSearchParams` call in a statically-rendered tree fails the build, so
 * the real component is wrapped in its own `<Suspense>` boundary.
 */

// ── SM-2 state (mirror of the API's `SrsState`) ──────────────────────

interface SrsState {
  schemaVersion: 1;
  algorithm: "sm2";
  ease: number;
  repetitions: number;
  intervalDays: number;
  lapses: number;
}

const SRS_DEFAULT_STATE: SrsState = {
  schemaVersion: 1,
  algorithm: "sm2",
  ease: 2.5,
  repetitions: 0,
  intervalDays: 0,
  lapses: 0,
};

type Grade = "AGAIN" | "HARD" | "GOOD" | "EASY";

const GRADE_QUALITY: Record<Grade, number> = {
  AGAIN: 0,
  HARD: 2,
  GOOD: 3,
  EASY: 5,
};

/**
 * Client mirror of the API's SM-2 (`srs.algorithm.ts`). MUST stay in lockstep
 * — the server re-derives and overwrites the local state after each flush,
 * so a divergence only costs a moment of inaccuracy within a sitting.
 */
function advanceSm2(prev: SrsState, grade: Grade): SrsState {
  const q = GRADE_QUALITY[grade];
  const clampedEase = Math.max(1.3, prev.ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  let repetitions: number;
  let intervalDays: number;
  let lapses = prev.lapses;

  if (q === 0) {
    repetitions = 0;
    intervalDays = prev.intervalDays;
    lapses = prev.lapses + 1;
  } else {
    repetitions = prev.repetitions + 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 6;
    else intervalDays = Math.max(1, Math.round(prev.intervalDays * clampedEase));
  }

  return {
    ...prev,
    ease: Math.round(clampedEase * 1000) / 1000,
    repetitions,
    intervalDays,
    lapses,
  };
}

// ── API shapes ────────────────────────────────────────────────────────

interface QueueItem {
  id: string;
  front: string;
  back: string;
  reading?: string;
  image?: string;
  imageCredit?: string;
  partOfSpeech?: string;
  hanViet?: string;
  examples?: { sentence: string; translation?: string }[];
  bucket: "new" | "due";
  label?: "hard" | "mastered" | "normal";
  dueDay?: string;
  state: SrsState;
  /** Only on re-queued (lapsed) cards: the review just happened here. */
  relearn?: boolean;
}

interface Queue {
  deckId: string;
  today: string;
  newCards: QueueItem[];
  dueCards: QueueItem[];
  counts: { new: number; due: number; hard: number; mastered: number };
  total?: number;
  grades?: { AGAIN: number; HARD: number; GOOD: number; EASY: number };
  reviewAhead?: QueueItem[];
  nextDueDay?: string;
}

interface DeckRef {
  _id: string;
  title: string;
  shared: boolean;
}

/** Cross-deck review: every card already learned, whichever deck it is in. */
const ALL_DECKS: DeckRef = { _id: "all", title: "Tất cả thẻ đã học", shared: false };

interface BatchResult {
  cardId: string;
  state: SrsState;
  dueDay: string;
  relearn: boolean;
}

const GRADES: { key: string; grade: Grade; label: string; hint: string }[] = [
  { key: "0", grade: "AGAIN", label: "Quên", hint: "Chưa thuộc — học lại sau 10 phút" },
  { key: "1", grade: "HARD", label: "Khó", hint: "Nhớ được, nhưng còn lâu" },
  { key: "2", grade: "GOOD", label: "Tốt", hint: "Nhớ bình thường" },
  { key: "3", grade: "EASY", label: "Thuộc", hint: "Nhớ chắc, khoảng cách dài hơn" },
];

/** Toolbar pill: soft primary tint when active, quiet outline otherwise. */
function toolbarBtn(active: boolean): string {
  return (
    "inline-flex size-9 items-center justify-center rounded-full border text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary-focus)] " +
    (active
      ? "border-[color-mix(in_srgb,var(--primary)_45%,transparent)] bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-[var(--primary)]"
      : "border-[var(--border)] bg-transparent text-[var(--muted-foreground)] hover:bg-[var(--layer-hover)] hover:text-[var(--foreground)]")
  );
}

/** Flush the review buffer this long after the last grade. */
const FLUSH_DEBOUNCE_MS = 1500;

/**
 * `useSearchParams` (the `?deck=` target) forces this client component to
 * stream its first render — under Next 16 `cacheComponents` a direct
 * `useSearchParams` call in a statically-rendered tree fails the build, so
 * the real component is wrapped in its own `<Suspense>` boundary here.
 */
export function StudySession() {
  return (
    <Suspense
      fallback={
        <p className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-[var(--muted-foreground)] sm:px-6">
          Đang tải…
        </p>
      }
    >
      <StudySessionInner />
    </Suspense>
  );
}

function StudySessionInner() {
  const searchParams = useSearchParams();
  const deckParam = searchParams.get("deck");

  const [deck, setDeck] = useState<DeckRef | null>(null);
  const [decks, setDecks] = useState<DeckRef[]>([]);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);

  // Session state: index over the merged queue, flipped, done count.
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  // Cards re-queued after a lapse (shown after the original sitting list).
  const [requeue, setRequeue] = useState<QueueItem[]>([]);

  // Cards already graded this sitting, with the bucket they came from and
  // how well — the counters below are derived from it so the numbers move
  // as you learn.
  const [graded, setGraded] = useState<
    Record<string, { bucket: "new" | "due"; grade: Grade }>
  >({});

  // Shuffle: randomize the order of the cards in this sitting.
  // Hiragana (reading) toggle, remembered across sessions.
  const [showReading, setShowReading] = useState<boolean>(() => {
    try {
      return localStorage.getItem("np.showReading") !== "0";
    } catch {
      return true;
    }
  });
  function toggleReading() {
    setShowReading((v) => {
      try {
        localStorage.setItem("np.showReading", v ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !v;
    });
  }
  // Which side to show first: "front" (term) or "back" (meaning).
  const [startSide, setStartSide] = useState<"front" | "back">(() => {
    try {
      return localStorage.getItem("np.startSide") === "back" ? "back" : "front";
    } catch {
      return "front";
    }
  });
  function chooseStartSide(side: "front" | "back") {
    setStartSide(side);
    setFlipped(false);
    try {
      localStorage.setItem("np.startSide", side);
    } catch {
      /* ignore */
    }
  }
  // Example sentences on the meaning face: show / hide, remembered.
  const [showExamples, setShowExamples] = useState<boolean>(() => {
    try {
      return localStorage.getItem("np.showExamples") !== "0";
    } catch {
      return true;
    }
  });
  function toggleExamples() {
    setShowExamples((v) => {
      try {
        localStorage.setItem("np.showExamples", v ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !v;
    });
  }
  const [showHanViet, toggleHanViet] = useHanVietPref();
  const [shuffle, setShuffle] = useState(false);
  // The shuffle seed — bumped on every shuffle so each click gives a new order.
  const [shuffleSeed, setShuffleSeed] = useState(0);
  // Explicit card order produced by a shuffle (ids). It is a SNAPSHOT taken
  // when the button is pressed: later grades never reorder the list, and the
  // cards already classified stay exactly where they are.
  const [order, setOrder] = useState<string[] | null>(null);

  // Reset-in-progress state (a deck reset reloads the queue).
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // ── Sync layer: local SM-2 mirror + buffered batch flush ─────────────
  const statesRef = useRef<Map<string, SrsState>>(new Map());
  const pendingRef = useRef<{ cardId: string; grade: Grade }[]>([]);
  const flushTimer = useRef<number | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "queued">("idle");

  const merged = useMemo<QueueItem[]>(() => {
    if (!queue) return [];
    // Due first (that's the point of the session), then new cards.
    const ordered = [...queue.dueCards, ...queue.newCards];
    if (!order) return ordered;
    const pos = new Map(order.map((id, i) => [id, i]));
    // Cards missing from the snapshot (none normally) keep their place at the end.
    return [...ordered].sort(
      (a, b) => (pos.get(a.id) ?? Infinity) - (pos.get(b.id) ?? Infinity),
    );
  }, [queue, order]);

  /**
   * Shuffle ONLY the cards not classified yet. Cards already graded in this
   * sitting stay first, in their current order; the rest are randomised and
   * the learner lands on the first of them. Pressing again while shuffled
   * restores the original order of the unclassified cards.
   */
  function toggleShuffle() {
    if (!queue) return;
    const base = [...queue.dueCards, ...queue.newCards];
    const done = merged.filter((c) => graded[c.id]);
    const rest = merged.filter((c) => !graded[c.id]);
    let nextRest: QueueItem[];
    if (shuffle) {
      const original = new Map(base.map((c, i) => [c.id, i]));
      nextRest = [...rest].sort((a, b) => (original.get(a.id) ?? 0) - (original.get(b.id) ?? 0));
    } else {
      const seed = shuffleSeed + 1;
      setShuffleSeed(seed);
      nextRest = seededShuffle(rest, seed);
    }
    setOrder([...done, ...nextRest].map((c) => c.id));
    setShuffle(!shuffle);
    setIndex(done.length); // first unclassified card
    setFlipped(false);
  }

  const current = merged[index] ?? requeue[index - merged.length];

  /** Load the deck list + the queue for the target deck. */
  const loadQueue = useCallback(
    async (target: DeckRef) => {
      const qRes = await fetch(`/api/srs/queue/${target._id}?limit=100`, {
        cache: "no-store",
      }).catch(() => null);
      if (!qRes || !qRes.ok) {
        setError("Không tải được danh sách ôn tập");
        setQueue(null);
        return;
      }
      const q = (await qRes.json().catch(() => null)) as Queue;
      // Seed the local state mirror from the queue's SRS snapshots.
      statesRef.current = new Map(
        [...(q?.newCards ?? []), ...(q?.dueCards ?? [])].map((c) => [
          c.id,
          c.state,
        ]),
      );
      setQueue(q);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const res = await fetch("/api/flashcards/decks", { cache: "no-store" }).catch(
        () => null,
      );
      if (!res) {
        setError("Không kết nối được API");
        setLoading(false);
        return;
      }
      if (res.status === 401) {
        setError("Cần đăng nhập để ôn tập");
        setLoading(false);
        return;
      }
      const list = (await res.json().catch(() => [])) as DeckRef[];
      if (cancelled) return;
      setDecks(list);

      const target = deckParam
        ? list.find((d) => d._id === deckParam) ?? ALL_DECKS
        : ALL_DECKS;
      if (!target) {
        setQueue(null);
        setLoading(false);
        return;
      }
      setDeck(target);
      await loadQueue(target);
      if (cancelled) return;
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [deckParam, loadQueue]);

  /** Flush the buffered reviews in one batched request. */
  const flushingRef = useRef(false);
  const flushRef = useRef<() => Promise<void>>(async () => undefined);
  const flush = useCallback(async () => {
    if (pendingRef.current.length === 0 || flushingRef.current) return;
    flushingRef.current = true;
    setSyncState("syncing");
    // Snapshot: reviews graded while the request is in flight must NOT be
    // dropped when it resolves — only the snapshot's items are removed.
    const batch = pendingRef.current.slice();
    try {
      const res = await fetch("/api/srs/reviews/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviews: batch }),
        keepalive: true,
      }).catch(() => null);
      if (res && res.ok) {
        const data = (await res.json().catch(() => [])) as BatchResult[];
        // Server state is authoritative — overwrite the local mirror.
        for (const r of data) statesRef.current.set(r.cardId, r.state);
        pendingRef.current = pendingRef.current.slice(batch.length);
        setPendingCount(pendingRef.current.length);
        setSyncState(pendingRef.current.length > 0 ? "queued" : "idle");
      } else {
        // Keep the buffer, mark it visible, and retry on the next trigger.
        setSyncState("queued");
      }
    } finally {
      flushingRef.current = false;
    }
    // Reviews that arrived mid-flight: send them right away.
    if (pendingRef.current.length > 0 && !flushTimer.current) {
      flushTimer.current = window.setTimeout(() => {
        flushTimer.current = null;
        void flushRef.current();
      }, FLUSH_DEBOUNCE_MS);
    }
  }, []);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  /**
   * Grade one card: instant locally, buffer + schedule the flush.
   *
   * A lapse (Quên / AGAIN) re-queues the card at the end of the sitting
   * (Anki-style relearn); the 10-minute due date is composed server-side.
   */
  const grade = useCallback(
    (choice: Grade, advance = true) => {
      if (!current) return;
      const prev = statesRef.current.get(current.id) ?? { ...SRS_DEFAULT_STATE };
      const next = advanceSm2(prev, choice);
      statesRef.current.set(current.id, next);

      pendingRef.current.push({ cardId: current.id, grade: choice });
      setPendingCount(pendingRef.current.length);
      setSyncState("queued");

      setDone((d) => d + 1);
      setGraded((g) => ({
        ...g,
        [current.id]: { bucket: current.bucket, grade: choice },
      }));
      setFlipped(false);

      if (advance) {
        // No cap here — `current` simply becomes `undefined` once the whole
        // sitting (merged + re-queued) is exhausted, which triggers the
        // done screen.
        setIndex((i) => i + 1);
      }

      if (flushTimer.current) window.clearTimeout(flushTimer.current);
      flushTimer.current = window.setTimeout(() => {
        flushTimer.current = null;
        void flush();
      }, FLUSH_DEBOUNCE_MS);
    },
    [current, flush],
  );

  /** Move through the sitting without grading. */
  const go = useCallback(
    (delta: number) => {
      const total = merged.length + requeue.length;
      if (total === 0) return;
      setIndex((i) => Math.min(Math.max(0, i + delta), total - 1));
      setFlipped(false); // a new card always starts unflipped
    },
    [merged.length, requeue.length],
  );

  // Flush when the tab hides or the page unloads (keepalive survives the
  // navigation for a short while).
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "hidden") void flush();
    }
    function onBeforeUnload() {
      void flush();
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (flushTimer.current) window.clearTimeout(flushTimer.current);
      void flush(); // unmount (SPA navigation): land buffered reviews (keepalive)
    };
  }, [flush]);

  // Keyboard shortcuts: Space/Enter flip · 0–3 grade · ←/→ prev/next.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!current || reportOpen) return;
      const target = event.target as HTMLElement | null;
      if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
      if (target?.closest("[data-speak]")) return; // speaker buttons keep their own Space/Enter
      if (event.key === "ArrowRight") {
        event.preventDefault();
        go(1);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(-1);
        return;
      }
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        setFlipped((f) => !f);
        return;
      }
      const g = GRADES.find((x) => x.key === event.key);
      if (g) {
        event.preventDefault();
        grade(g.grade);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, grade, go, reportOpen]);

  async function switchDeck(next: DeckRef) {
    await flush(); // don't leave reviews behind on the old deck
    setDeck(next);
    setIndex(0);
    setDone(0);
    setFlipped(false);
    setRequeue([]);
    setGraded({});
    setOrder(null);
    setShuffle(false);
    setQueue(null);
    setLoading(true);
    await loadQueue(next);
    setLoading(false);
  }

  /**
   * Reset the deck's progress: every card becomes new again. The cards
   * themselves are kept — only the caller's learning schedule is cleared.
   */
  async function resetDeckProgress() {
    if (!deck) return;
    setResetting(true);
    setError(null);
    await flush(); // land the pending reviews before wiping the progress
    const res = await fetch(`/api/srs/decks/${deck._id}/reset`, {
      method: "POST",
    }).catch(() => null);
    setResetting(false);
    if (!res || !res.ok) {
      setError("Không đặt lại được bộ thẻ");
      return;
    }
    setIndex(0);
    setDone(0);
    setFlipped(false);
    setRequeue([]);
    setGraded({});
    setOrder(null);
    setShuffle(false);
    setQueue(null);
    setLoading(true);
    await loadQueue(deck);
    setLoading(false);
  }

  const sessionList = [...merged, ...requeue];
  const noMoreCards = current === undefined;

  /**
   * Quizlet-style counters, derived from the queue totals minus what was
   * graded in this sitting. "Đã thuộc" counts the cards the learner rated
   * GOOD or EASY — a card rated "Quên" is not mastered.
   */
  const counters = useMemo(() => {
    const base = queue?.counts ?? { new: 0, due: 0, hard: 0, mastered: 0 };
    let leftNew = base.new;
    let leftDue = base.due;
    let known = base.mastered;
    for (const { bucket, grade } of Object.values(graded)) {
      if (bucket === "new") leftNew = Math.max(0, leftNew - 1);
      else leftDue = Math.max(0, leftDue - 1);
      if (grade === "GOOD" || grade === "EASY") known += 1;
    }
    return { new: leftNew, due: leftDue, known };
  }, [queue, graded]);

  // Final grade of every card in this sitting (for the completion screen).
  const gradeCounts = useMemo(() => {
    const c = { AGAIN: 0, HARD: 0, GOOD: 0, EASY: 0 };
    for (const { grade } of Object.values(graded)) c[grade] += 1;
    return c;
  }, [graded]);

  /**
   * Cards still not "thuộc": in a finished sitting, every card not graded
   * Thuộc (EASY); on a deck opened already-finished, the server's list of
   * learned-but-weak cards.
   */
  const weakCards = useMemo<QueueItem[]>(() => {
    if (!queue) return [];
    if (merged.length === 0) return queue.reviewAhead ?? [];
    return merged.filter((c) => graded[c.id]?.grade !== "EASY");
  }, [queue, merged, graded]);

  /** "Học lại phiên này": drill the weak cards; all mastered → reset. */
  function restartWeak() {
    if (!queue) return;
    if (weakCards.length === 0) {
      setConfirmReset(true);
      return;
    }
    const picked = weakCards.map((c) => ({
      ...c,
      bucket: "due" as const,
      state: statesRef.current.get(c.id) ?? c.state,
    }));
    statesRef.current = new Map(picked.map((c) => [c.id, c.state]));
    setQueue({
      ...queue,
      newCards: [],
      dueCards: picked,
      counts: { new: 0, due: picked.length, hard: 0, mastered: 0 },
    });
    setIndex(0);
    setDone(0);
    setFlipped(false);
    setRequeue([]);
    setGraded({});
    setOrder(null);
    setShuffle(false);
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <ConfirmDialog
        open={confirmReset}
        title="Đặt lại tiến độ?"
        message="Mọi thẻ trong bộ này sẽ trở thành thẻ mới và lịch ôn tập của bạn bị xoá. Thẻ vẫn được giữ nguyên."
        confirmLabel="Đặt lại"
        busy={resetting}
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          void resetDeckProgress().finally(() => setConfirmReset(false));
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
        <h1 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
          Ôn tập
        </h1>
        <div className="flex items-center gap-3">
          {/* Always rendered (just hidden when idle) so the header height —
              and therefore the card position — never shifts while grading. */}
          <span
            aria-hidden={syncState === "idle"}
            className={
              "inline-block w-40 rounded-full px-2.5 py-0.5 text-center text-xs font-medium " +
              (syncState === "idle"
                ? "invisible"
                : syncState === "syncing"
                  ? "bg-[var(--layer)] text-[var(--muted-foreground)]"
                  : "bg-[#fef9c3] text-[#a16207] dark:bg-[#3a3210] dark:text-[#fde047]")
            }
          >
            {syncState === "syncing" ? "Đang đồng bộ…" : `Chờ đồng bộ ${pendingCount} phản hồi`}
          </span>
          {decks.length > 0 && (
            <label className="text-sm text-[var(--muted-foreground)]">
              Bộ thẻ:{" "}
              <select
                value={deck?._id ?? ""}
                onChange={(e) => {
                  const next =
                    e.target.value === ALL_DECKS._id
                      ? ALL_DECKS
                      : decks.find((d) => d._id === e.target.value);
                  if (next) void switchDeck(next);
                }}
                className="ml-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm text-[var(--foreground)]"
              >
                <option value={ALL_DECKS._id}>{ALL_DECKS.title}</option>
                {decks.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.title}
                    {d.shared ? " (chung)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">
          {error}
        </p>
      )}

      {loading && (
        <p className="mt-8 text-center text-sm text-[var(--muted-foreground)]">
          Đang tải danh sách ôn tập…
        </p>
      )}

      {!loading && queue && noMoreCards && merged.length > 0 && (
        <StudyComplete
          total={merged.length}
          reviews={done}
          grades={gradeCounts}
          resetting={resetting}
          onBack={() => {
            setIndex(Math.max(0, sessionList.length - 1));
            setFlipped(false);
          }}
          onReset={deck?._id === ALL_DECKS._id ? undefined : () => setConfirmReset(true)}
          onRestart={restartWeak}
          restartLabel={weakCards.length === 0 ? "Đặt lại" : "Học lại phiên này"}
        />
      )}

      {!loading && queue && !merged.length && queue.total === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
          {deck?._id === ALL_DECKS._id
            ? "Bạn chưa học thẻ nào để ôn tập. Hãy học thẻ mới từ một bộ thẻ tại"
            : "Chưa có thẻ nào trong bộ này. Tạo thẻ tại"}{" "}
          <Link href="/learn/decks" className="font-medium text-[var(--primary)] hover:underline">
            danh sách bộ thẻ
          </Link>{" "}
          hoặc nhập hàng loạt tại khu quản trị.
        </div>
      )}

      {/* Every card is already learned and scheduled for later: nothing to
          review today, so show the completion stage, not an empty state. */}
      {!loading && queue && !merged.length && queue.total !== 0 && (
        <StudyComplete
          total={queue.total ?? 0}
          reviews={0}
          grades={queue.grades ?? { AGAIN: 0, HARD: 0, GOOD: 0, EASY: 0 }}
          resetting={resetting}
          onReset={deck?._id === ALL_DECKS._id ? undefined : () => setConfirmReset(true)}
          onRestart={restartWeak}
          restartLabel={weakCards.length === 0 ? "Đặt lại" : "Học lại phiên này"}
        />
      )}

      {!loading && current && (
        <div className="mt-6">
          {/* Quizlet-style counter row: New / Learning / Known */}
          <div className="flex items-center justify-center gap-2 text-xs font-semibold">
            <span className="rounded-full bg-[#ef4444]/10 px-3 py-1 text-[#ef4444]">{counters.new} mới</span>
            <span className="rounded-full bg-[#f59e0b]/10 px-3 py-1 text-[#d97706]">{counters.due} đến hạn</span>
            <span className="rounded-full bg-[#16a34a]/10 px-3 py-1 text-[#16a34a]">{counters.known} đã thuộc</span>
          </div>

          {/* Progress strip */}
          <div
            className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[var(--layer)]"
            role="progressbar"
            aria-valuenow={done}
            aria-valuemin={0}
            aria-valuemax={Math.max(1, sessionList.length)}
            aria-label={`Đã đánh giá ${done} lượt`}
          >
            <div
              className="h-full rounded-full bg-[var(--primary)] transition-all"
              style={{
                width: `${Math.min(100, (done / Math.max(1, sessionList.length)) * 100)}%`,
              }}
            />
          </div>

          {/* Toolbar: shuffle + reset + card position */}
          <div className="mt-4">
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <div
                role="group"
                aria-label="Hiển thị mặt thẻ trước"
                className="inline-flex overflow-hidden rounded-full border border-[var(--border)] text-sm font-medium"
              >
                {(
                  [
                    ["front", "Mặt trước"],
                    ["back", "Mặt sau"],
                  ] as const
                ).map(([side, label]) => (
                  <button
                    key={side}
                    type="button"
                    onClick={() => chooseStartSide(side)}
                    aria-pressed={startSide === side}
                    title={
                      side === "front"
                        ? "Hiện thuật ngữ trước, lật để xem nghĩa"
                        : "Hiện nghĩa + ví dụ trước, lật để xem thuật ngữ"
                    }
                    className={
                      "px-4 py-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary-focus)] " +
                      (startSide === side
                        ? "bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-[var(--primary)]"
                        : "text-[var(--muted-foreground)] hover:bg-[var(--layer-hover)] hover:text-[var(--foreground)]")
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={toggleShuffle}
                aria-pressed={shuffle}
                title={shuffle ? "Đang xáo trộn — bấm để tắt" : "Xáo trộn các thẻ chưa phân loại (thẻ đã phân loại giữ nguyên)"}
                aria-label="Xáo trộn"
                className={toolbarBtn(shuffle)}
              >
                <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                disabled={resetting}
                title="Đặt lại tiến độ học của bộ thẻ này (thẻ vẫn giữ nguyên)"
                aria-label="Đặt lại"
                className={`${toolbarBtn(false)} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />
                </svg>
              </button>
              <button
                type="button"
                onClick={toggleReading}
                aria-pressed={showReading}
                title="Bật/tắt cách đọc hiragana trên mặt thuật ngữ"
                aria-label="Hiragana"
                className={toolbarBtn(showReading)}
              >
                <span aria-hidden="true" className="text-base leading-none">あ</span>
              </button>
              <button
                type="button"
                onClick={toggleExamples}
                aria-pressed={showExamples}
                title="Bật/tắt câu ví dụ trên thẻ"
                aria-label="Ví dụ"
                className={toolbarBtn(showExamples)}
              >
                <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 6h16M4 12h16M4 18h10" />
                </svg>
              </button>
              <button
                type="button"
                onClick={toggleHanViet}
                aria-pressed={showHanViet}
                title="Hiện/ẩn âm Hán Việt dưới chữ kanji"
                aria-label="Hán Việt"
                className={toolbarBtn(showHanViet)}
              >
                <span aria-hidden="true" className="text-base leading-none">漢</span>
              </button>
            </div>
            <p className="mt-3 h-4 truncate text-center text-xs text-[var(--muted-foreground)]" title={current.relearn ? "Học lại — thẻ vừa quên, quay lại sau ~10 phút" : undefined}>
              {current.relearn
                ? "Học lại (quên, ~10 phút)"
                : current.bucket === "due"
                  ? current.label === "hard"
                    ? "Đến hạn (khó nhớ)"
                    : current.label === "mastered"
                      ? "Đến hạn (đã thuộc)"
                      : "Đến hạn"
                  : "Thẻ mới"}{" "}
              · lượt {Math.min(index + 1, sessionList.length)}/{sessionList.length}
            </p>
          </div>

          {/* ── The card ────────────────────────────────────────────── */}
          <div className="mt-2">
            {/* key: a new card mounts un-flipped (no flip-back reveal of the
                next card's answer) and plays the short entrance. */}
            <LearnCard
              key={`${current.id}-${current.relearn ? "r" : "n"}`}
              front={current.front}
              back={current.back}
              reading={current.reading}
              image={current.image}
              imageCredit={current.imageCredit}
              partOfSpeech={current.partOfSpeech}
              hanVietText={current.hanViet}
              examples={current.examples}
              showReading={showReading}
              showExamples={showExamples}
              showHanViet={showHanViet}
              startSide={startSide}
              flipped={flipped}
              onFlip={() => setFlipped((f) => !f)}
              onReport={deck?.shared ? () => setReportOpen(true) : undefined}
            />
            {deck?.shared && (
              <CardReportDialog
                open={reportOpen}
                cardId={current.id}
                term={current.front}
                onClose={() => setReportOpen(false)}
              />
            )}
          </div>

          {/* ── Grading (always available — even before flipping) ────── */}
          <div className="mt-5">
            <p className="text-center text-xs text-[var(--muted-foreground)]">
              Đánh giá mức độ thuộc — có thể chấm ngay cả khi chưa lật thẻ ·
              phím 0–3
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {GRADES.map((g, i) => (
                <button
                  key={g.grade}
                  type="button"
                  title={g.hint}
                  onClick={() => grade(g.grade)}
                  className={
                    "rounded-lg border px-3 py-2.5 text-base font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary-focus)] " +
                    [
                      "border-[#fca5a5] bg-[#fef2f2] text-[#b91c1c] hover:bg-[#fee2e2] dark:border-[#7f1d1d] dark:bg-[#2a1215] dark:text-[#fca5a5] dark:hover:bg-[#3a171b]",
                      "border-[#fdba74] bg-[#fff7ed] text-[#c2410c] hover:bg-[#ffedd5] dark:border-[#7c2d12] dark:bg-[#2a1a0e] dark:text-[#fdba74] dark:hover:bg-[#3a2412]",
                      "border-[#86efac] bg-[#f0fdf4] text-[#15803d] hover:bg-[#dcfce7] dark:border-[#14532d] dark:bg-[#0f2418] dark:text-[#86efac] dark:hover:bg-[#143120]",
                      "border-[#7dd3fc] bg-[#f0f9ff] text-[#0369a1] hover:bg-[#e0f2fe] dark:border-[#0c4a6e] dark:bg-[#0c1d2a] dark:text-[#7dd3fc] dark:hover:bg-[#10283a]",
                    ][i]
                  }
                >
                  <span className="mr-1 text-xs opacity-70">{g.key}</span>
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Navigation: Prev / Next ─────────────────────────────── */}
          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={index === 0}
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Thẻ trước
            </button>
            <p className="hidden text-xs text-[var(--muted-foreground)] sm:block">
              Dùng ← / → để chuyển thẻ
            </p>
            <button
              type="button"
              onClick={() => go(1)}
              disabled={index >= sessionList.length - 1}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Thẻ sau →
            </button>
          </div>

          <p
            aria-hidden={syncState !== "queued"}
            className={
              "mt-3 min-h-8 text-center text-xs text-[#a16207] " +
              (syncState === "queued" ? "" : "invisible")
            }
          >
            {pendingCount} phản hồi đang chờ đồng bộ — tiến độ vẫn được giữ dù
            bạn thoát trang.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Speech ───────────────────────────────────────────────────────────

/**
 * Text to actually speak. For "猫 (ねこ)" the kana reading inside the
 * brackets is spoken instead of the kanji — synthesisers misread kanji far
 * more often than kana.
 */
function speechText(text: string): string {
  const m = text.match(/[（(]\s*([ぁ-ゟ゠-ヿー・\s]+?)\s*[）)]/);
  return m ? m[1] : text.replace(/[（(][^）)]*[）)]/g, "").trim() || text;
}

/** "猫 (ねこ)" → { term: "猫", reading: "ねこ" }; no reading → reading null. */
function splitReading(text: string): { term: string; reading: string | null } {
  const m = text.match(/^(.*?)\s*[（(]\s*([ぁ-ゟ゠-ヿー・\s]+?)\s*[）)]\s*$/);
  return m && m[1] ? { term: m[1], reading: m[2] } : { term: text, reading: null };
}

/** Rank an installed voice for Japanese; higher = more natural-sounding. */
function voiceScore(v: SpeechSynthesisVoice): number {
  if (!v.lang.toLowerCase().replace("_", "-").startsWith("ja")) return -1;
  const n = v.name.toLowerCase();
  let score = 1;
  if (/natural|neural/.test(n)) score += 10; // Edge: Microsoft Nanami/Keita Online (Natural)
  if (/online/.test(n)) score += 6;
  if (/google/.test(n)) score += 5;
  if (/premium|enhanced/.test(n)) score += 5; // macOS/iOS
  if (/kyoko|o-ren|nanami|keita|haruka|ayumi|sayaka/.test(n)) score += 2;
  if (!v.localService) score += 1; // network voices are usually higher quality
  return score;
}

function pickJapaneseVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return voices
    .map((v) => ({ v, score: voiceScore(v) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score)[0]?.v;
}

/**
 * Japanese speech via the browser's speechSynthesis, using the best installed
 * ja voice (voices load asynchronously, so we re-pick on `voiceschanged`).
 * `speakingId` identifies which button is currently playing.
 */
function useJapaneseSpeech() {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    synth.getVoices(); // kick off async voice loading (Chrome)
    return () => synth.cancel();
  }, [supported]);

  const speak = useCallback(
    (id: string, text: string) => {
      if (!supported) return;
      const synth = window.speechSynthesis;
      if (synth.speaking && speakingId === id) {
        synth.cancel(); // tap again = stop
        setSpeakingId(null);
        return;
      }
      synth.cancel();
      const utter = new SpeechSynthesisUtterance(speechText(text));
      utter.lang = "ja-JP";
      const voice = pickJapaneseVoice();
      if (voice) utter.voice = voice;
      utter.rate = 0.85; // a touch slower — clearer for learners
      utter.pitch = 1;
      utter.onstart = () => setSpeakingId(id);
      utter.onend = () => setSpeakingId((cur) => (cur === id ? null : cur));
      utter.onerror = () => setSpeakingId((cur) => (cur === id ? null : cur));
      synth.speak(utter);
    },
    [supported, speakingId],
  );

  return { supported, speak, speakingId };
}

function SpeakerIcon() {
  return (
    <svg aria-hidden="true" className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

// ── Card face ────────────────────────────────────────────────────────

/**
 * The flip card: a dark "term" face and a light "definition" face that turn
 * around the Y axis. `data-speak` buttons are excluded from the Space/Enter
 * flip shortcut and never flip the card when clicked.
 */
function LearnCard({
  front,
  back,
  reading: cardReading,
  image,
  imageCredit,
  partOfSpeech,
  hanVietText,
  examples,
  showReading,
  showExamples,
  showHanViet,
  startSide,
  flipped,
  onFlip,
  onReport,
}: {
  front: string;
  back: string;
  reading?: string;
  image?: string;
  imageCredit?: string;
  partOfSpeech?: string;
  hanVietText?: string;
  examples?: { sentence: string; translation?: string }[];
  showReading: boolean;
  showExamples: boolean;
  showHanViet: boolean;
  /** Which side faces the learner first: the term (front) or the meaning (back). */
  startSide: "front" | "back";
  flipped: boolean;
  onFlip: () => void;
  /** Present only on shared-deck cards: opens the error-report dialog. */
  onReport?: () => void;
}) {
  const { supported, speak, speakingId } = useJapaneseSpeech();
  const face =
    "absolute inset-0 overflow-y-auto rounded-2xl border p-5 sm:p-7 text-center shadow-[0_8px_24px_-12px_rgba(30,27,75,0.35)] ring-1 ring-black/5 [backface-visibility:hidden] [-webkit-backface-visibility:hidden]";

  // Prefer the stored hiragana field; fall back to a legacy "猫 (ねこ)" front.
  const parsed = splitReading(front);
  const term = parsed.term;
  const reading = cardReading || parsed.reading;
  const hint = (tone: string, text: string) => (
    <p className={`mt-5 text-xs ${tone}`}>{text}</p>
  );
  const termContent = (
    <div className="flex min-h-full flex-col items-center justify-center">
      <div className="text-center">
        {reading && showReading && (
          <p lang="ja" className="mb-2 text-base text-white/80 sm:text-lg">
            {reading}
          </p>
        )}
        <p lang="ja" className="break-words text-4xl font-semibold text-white drop-shadow-sm sm:text-5xl">
          {term}
        </p>
        {showHanViet && (hanVietText || hanViet(term)) ? (
          <p className="mt-2 text-xs font-semibold tracking-[0.2em] text-white/75 sm:text-sm">
            {hanVietText || hanViet(term)}
          </p>
        ) : null}
      </div>
      {partOfSpeech && (
        <div className="mt-3">
          <PosChip pos={partOfSpeech} />
        </div>
      )}
      {hint("text-white/70", "Nhấn Space / bấm vào thẻ để lật")}
    </div>
  );
  const meaningContent = (
    <div className="flex min-h-full flex-col items-center justify-center">
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          title={imageCredit || undefined}
          className="mb-3 max-h-32 w-auto max-w-full rounded-xl object-contain sm:max-h-36"
        />
      )}
      {partOfSpeech && (
        <div className="mb-2">
          <PosChip pos={partOfSpeech} />
        </div>
      )}
      <p className="break-words text-2xl font-semibold text-[var(--foreground)] sm:text-3xl">
        {back}
      </p>
      {showExamples && examples && examples.length > 0 && (
              <div className="mt-4 w-full max-w-md space-y-1.5 text-left">
                {examples.map((ex, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                        Ví dụ{examples.length > 1 ? ` ${i + 1}` : ""}
                      </p>
                      <p lang="ja" className="mt-0.5 break-words text-base text-[var(--foreground)]">
                        {ex.sentence}
                      </p>
                      {ex.translation && (
                        <p className="mt-0.5 break-words text-sm text-[var(--muted-foreground)]">
                          {ex.translation}
                        </p>
                      )}
                    </div>
                    {supported && (
                      <button
                        type="button"
                        data-speak
                        tabIndex={flipped ? 0 : -1}
                        onClick={(e) => {
                          e.stopPropagation();
                          speak(`example-${i}`, ex.sentence);
                        }}
                        aria-label={`Phát âm câu ví dụ ${i + 1}`}
                        title="Phát âm câu ví dụ"
                        className={
                          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--background-1)] text-[var(--primary)] transition hover:bg-[var(--layer-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary-focus)] " +
                          (speakingId === `example-${i}` ? "animate-pulse" : "")
                        }
                      >
                        <SpeakerIcon />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
      {hint("text-[var(--muted-foreground)]", "Nhấn Space / bấm vào thẻ để lật")}
    </div>
  );
  const termPlate = {
    tone: "border-transparent bg-gradient-to-br from-[var(--primary-500)] via-[var(--primary-600)] to-[var(--primary-800)] dark:from-[var(--primary-700)] dark:via-[var(--primary-800)] dark:to-[var(--primary-950)]",
    content: termContent,
  };
  const meaningPlate = {
    tone: "border-[color-mix(in_srgb,var(--primary)_22%,var(--border))] bg-gradient-to-b from-[var(--background)] to-[color-mix(in_srgb,var(--primary-100)_45%,var(--background))] dark:to-[color-mix(in_srgb,var(--primary-900)_35%,var(--background))]",
    content: meaningContent,
  };
  const plates =
    startSide === "front" ? [termPlate, meaningPlate] : [meaningPlate, termPlate];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onFlip}
      aria-pressed={flipped}
      aria-label={flipped ? "Hiện mặt câu hỏi" : "Hiện mặt đáp án"}
      className="animate-card-in relative block h-64 w-full cursor-pointer rounded-2xl text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary-focus)] sm:h-72"
      style={{ perspective: "1400px" }}
    >
      <div
        className="relative h-full w-full transition-transform duration-[700ms] ease-[cubic-bezier(0.34,1.2,0.4,1)] motion-reduce:duration-0"
        style={{
          transformStyle: "preserve-3d",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* Plate 1 faces forward at rest; plate 2 is pre-rotated and shows after the flip. */}
        <div
          aria-hidden={flipped}
          className={`${face} ${plates[0].tone}`}
        >
          {plates[0].content}
        </div>
        <div
          aria-hidden={!flipped}
          className={`${face} ${plates[1].tone}`}
          style={{ transform: "rotateY(180deg)" }}
        >
          {plates[1].content}
        </div>
      </div>

      {onReport && (
        <button
          type="button"
          data-speak
          onClick={(e) => {
            e.stopPropagation();
            onReport();
          }}
          aria-label="Báo lỗi thẻ"
          title="Báo lỗi / góp ý sửa thẻ này"
          className="absolute left-3 top-3 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/40 bg-white/80 text-[var(--muted-foreground)] shadow-sm transition hover:bg-white hover:text-[var(--foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary-focus)]"
        >
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 22V4M4 4h13l-2 4 2 4H4" />
          </svg>
        </button>
      )}

      {/* Term audio: always on top, doesn't rotate with the card. */}
      {supported && (
        <button
          type="button"
          data-speak
          onClick={(e) => {
            e.stopPropagation();
            speak("term", reading || front);
          }}
          aria-label="Phát âm thanh"
          title="Phát âm (tiếng Nhật)"
          className={
            "absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/40 bg-white/90 text-[var(--primary)] shadow-sm transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary-focus)] " +
            (speakingId === "term" ? "animate-pulse" : "")
          }
        >
          <SpeakerIcon />
        </button>
      )}
    </div>
  );
}
