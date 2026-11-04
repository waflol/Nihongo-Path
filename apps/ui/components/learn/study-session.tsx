"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

/**
 * Flashcard study screen (P3-UI-01, spec §4.4 "thẻ mới, đến hạn, khó nhớ,
 * đã thuộc").
 *
 * Loads the SRS queue for the deck in `?deck=` (falls back to the caller's
 * first deck), shows one card at a time with a flip + 4 grade buttons
 * (Lặp lại / Khó / Tốt / Thuộc), and keyboard shortcuts (Space = lật,
 * 0–3 = đánh giá) for a fast sitting. Grading POSTs to `/api/srs/reviews`;
 * a lapse ("Lặp lại") comes back `relearn: true` and the card reappears in
 * the queue within ~10 minutes (SM-2, ADR-srs).
 *
 * The `tz` param is NOT sent — the API uses the profile timezone, which is
 * the correct default (P3-SRS-05).
 */

interface QueueItem {
  id: string;
  front: string;
  back: string;
  bucket: "new" | "due";
  label?: "hard" | "mastered" | "normal";
  dueDay?: string;
}

interface Queue {
  deckId: string;
  today: string;
  newCards: QueueItem[];
  dueCards: QueueItem[];
  counts: { new: number; due: number; hard: number; mastered: number };
}

interface DeckRef {
  _id: string;
  title: string;
  shared: boolean;
}

const GRADES: { key: string; grade: "AGAIN" | "HARD" | "GOOD" | "EASY"; label: string; hint: string }[] = [
  { key: "0", grade: "AGAIN", label: "Lặp lại", hint: "Quên rồi — học lại sau 10 phút" },
  { key: "1", grade: "HARD", label: "Khó", hint: "Đến hạn sớm hơn" },
  { key: "2", grade: "GOOD", label: "Tốt", hint: "Đúng lịch" },
  { key: "3", grade: "EASY", label: "Thuộc", hint: "Khoảng cách dài hơn" },
];

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

  // Study state: index over the merged queue, flipped, in-session done count.
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const merged = useMemo<QueueItem[]>(() => {
    if (!queue) return [];
    // Due first (that's the point of the session), then new cards.
    return [...queue.dueCards, ...queue.newCards];
  }, [queue]);

  const current = merged[index];

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
        ? list.find((d) => d._id === deckParam) ?? list[0]
        : list[0];
      if (!target) {
        setQueue(null);
        setLoading(false);
        return;
      }
      setDeck(target);
      setLoading(true);
      const qRes = await fetch(
        `/api/srs/queue/${target._id}?limit=50`,
        { cache: "no-store" },
      ).catch(() => null);
      if (cancelled) return;
      if (qRes && qRes.ok) {
        setQueue((await qRes.json().catch(() => null)) as Queue);
      } else {
        setError("Không tải được danh sách ôn tập");
      }
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [deckParam]);

  const grade = useCallback(
    async (choice: "AGAIN" | "HARD" | "GOOD" | "EASY") => {
      if (!current || busy) return;
      setBusy(true);
      setLastResult(null);
      const res = await fetch("/api/srs/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: current.id, grade: choice }),
      }).catch(() => null);
      setBusy(false);

      if (!res || !res.ok) {
        setError("Không gửi được phản hồi — thử lại");
        return;
      }
      const data = (await res.json().catch(() => null)) as {
        dueDay?: string;
        relearn?: boolean;
      } | null;
      setDone((d) => d + 1);
      setFlipped(false);
      setIndex((i) => Math.min(i + 1, merged.length - 1));
      if (data?.relearn) {
        setLastResult('Đã đánh dấu "quên" — thẻ này quay lại sau ~10 phút.');
      } else if (data?.dueDay) {
        setLastResult(`Thẻ ôn tiếp vào ngày ${data.dueDay}.`);
      }
    },
    [current, busy, merged.length],
  );

  // Keyboard shortcuts: Space/Enter flip; 0–3 grade (only when flipped).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (busy || !current) return;
      const target = event.target as HTMLElement | null;
      if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        setFlipped((f) => !f);
        return;
      }
      if (!flipped) return;
      const g = GRADES.find((x) => x.key === event.key);
      if (g) {
        event.preventDefault();
        void grade(g.grade);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // `grade` is a stable `useCallback` — re-bound only when its deps (the
    // current card + busy state) change, so the listener never grades a
    // stale card.
  }, [busy, current, flipped, grade]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
          Ôn tập
        </h1>
        {decks.length > 0 && (
          <label className="text-sm text-[var(--muted-foreground)]">
            Bộ thẻ:{" "}
            <select
              value={deck?._id ?? ""}
              onChange={(e) => {
                const next = decks.find((d) => d._id === e.target.value);
                if (next) {
                  setDeck(next);
                  // Reload the queue for the chosen deck.
                  void (async () => {
                    setLoading(true);
                    const qRes = await fetch(
                      `/api/srs/queue/${next._id}?limit=50`,
                      { cache: "no-store" },
                    ).catch(() => null);
                    setQueue(qRes ? ((await qRes.json().catch(() => null)) as Queue) : null);
                    setIndex(0);
                    setDone(0);
                    setFlipped(false);
                    setLoading(false);
                  })();
                }
              }}
              className="ml-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm text-[var(--foreground)]"
            >
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

      {!loading && queue && !current && merged.length > 0 && (
        <div className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-8 text-center">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">
            Đã hoàn tất {done} thẻ trong phiên này
          </h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Không còn thẻ mới hay đến hạn trong{" "}
            <strong>
              {queue.dueCards.length + queue.newCards.length}
            </strong>{" "}
            thẻ đã chọn.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIndex(0);
                setDone(0);
                setFlipped(false);
              }}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]"
            >
              Học lại phiên
            </button>
            <Link
              href="/learn/decks"
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
            >
              Về danh sách bộ
            </Link>
          </div>
        </div>
      )}

      {!loading && queue && !merged.length && (
        <div className="mt-8 rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
          Chưa có thẻ nào trong bộ này. Tạo thẻ tại{" "}
          <Link href="/learn/decks" className="font-medium text-[var(--primary)] hover:underline">
            danh sách bộ thẻ
          </Link>{" "}
          hoặc nhập hàng loạt tại khu quản trị.
        </div>
      )}

      {!loading && current && (
        <div className="mt-8">
          {/* Progress strip */}
          <div
            className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--layer)]"
            role="progressbar"
            aria-valuenow={index + 1}
            aria-valuemin={0}
            aria-valuemax={merged.length}
            aria-label={`Thẻ ${index + 1} trong ${merged.length}`}
          >
            <div
              className="h-full rounded-full bg-[var(--primary)] transition-all"
              style={{
                width: `${Math.min(100, (done / Math.max(1, merged.length)) * 100)}%`,
              }}
            />
          </div>

          <p className="mb-2 text-xs text-[var(--muted-foreground)]">
            Thẻ {index + 1}/{merged.length} ·{" "}
            {current.bucket === "due"
              ? current.label === "hard"
                ? "Đến hạn (khó nhớ)"
                : current.label === "mastered"
                  ? "Đến hạn (đã thuộc)"
                  : "Đến hạn"
              : "Thẻ mới"}
          </p>

          {/* The card */}
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            aria-pressed={flipped}
            aria-label={flipped ? "Hiện mặt câu hỏi" : "Hiện mặt đáp án"}
            className="block w-full rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-8 text-left transition-colors hover:bg-[var(--layer-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary-focus)]"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              {flipped ? "Đáp án" : "Câu hỏi"}
            </p>
            <p className="mt-3 break-words text-2xl font-semibold text-[var(--foreground)]">
              {flipped ? current.back : current.front}
            </p>
            {!flipped && (
              <p className="mt-4 text-xs text-[var(--muted-foreground)]">
                Nhấn Space / bấm vào thẻ để lật · 0–3 để đánh giá sau khi lật
              </p>
            )}
          </button>

          {/* Grade buttons */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {GRADES.map((g) => (
              <button
                key={g.grade}
                type="button"
                disabled={!flipped || busy}
                title={g.hint}
                onClick={() => void grade(g.grade)}
                className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--layer-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary-focus)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="mr-1 text-xs text-[var(--muted-foreground)]">{g.key}</span>
                {g.label}
              </button>
            ))}
          </div>

          {busy && (
            <p className="mt-3 text-center text-xs text-[var(--muted-foreground)]">
              Đang ghi lịch ôn…
            </p>
          )}
          {lastResult && (
            <p className="mt-3 text-center text-xs text-[var(--muted-foreground)]">
              {lastResult}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
