"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { emitSessionChanged } from "@/lib/session-events";
import { ConfirmDialog } from "@/components/learn/confirm-dialog";
import { Icon } from "@/components/learn/icons";
import { LevelBadge, LevelSelect } from "@/components/learn/level-select";
import { CategoryChip, CategoryFilter, deckCategories } from "@/components/learn/category-filter";
import { DeckProcessing, RetryExamplesButton, reloadDecks, useDeckProgressPolling, type DeckExamples } from "@/components/learn/deck-processing";

/**
 * Deck list + per-deck progress + **card management** (P3-UI-03, P3-UI-05).
 *
 * Talks to the `/api/flashcards/…` + `/api/srs/…` gateways (the access token
 * stays server-side, P2-UI-05). Per deck the console shows:
 * - the card count + the caller's `{ new, due }` SRS counts,
 * - an inline form to ADD a card (front / back / tags),
 * - the card list with a delete button.
 *
 * Shared decks are read-only for learners (admin-managed, T-P3-08), so the
 * add/delete affordances only appear on the caller's own decks.
 */

interface Deck {
  _id: string;
  title: string;
  summary?: string;
  shared: boolean;
  level?: string;
  category?: string;
  status: string;
  cardCount: number;
  examples?: DeckExamples | null;
  createdAt: string;
}


interface DeckProgress {
  [deckId: string]: { new: number; due: number };
}

const inputClass =
  "block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-focus)]";

export function DecksConsole() {
  const router = useRouter();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [progress, setProgress] = useState<DeckProgress>({});
  // A load has completed for the current `version` — "loading" is DERIVED
  // (`loadedFor !== version`), not a separate flag (P2 console pattern).
  const [loadedFor, setLoadedFor] = useState(-1);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newLevel, setNewLevel] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [confirmResetId, setConfirmResetId] = useState<string | null>(null);

  // Card management state, per open deck.

  const loading = loadedFor !== version;
  useDeckProgressPolling(decks, "/api/flashcards/decks", setDecks);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const res = await fetch("/api/flashcards/decks", { cache: "no-store" }).catch(
        () => null,
      );
      if (cancelled) return;
      if (!res) {
        setError("Không kết nối được API");
        setLoadedFor(version);
        return;
      }
      if (res.status === 401) {
        emitSessionChanged();
        setError("Cần đăng nhập để xem bộ thẻ của bạn");
        setLoadedFor(version);
        return;
      }
      const list = (await res.json().catch(() => [])) as Deck[];
      if (cancelled) return;
      setDecks(Array.isArray(list) ? list : []);

      // Progress is a second call scoped to the caller's OWN decks (P3-UI-03
      // "hiển thị số thẻ mới/đến hạn"). A failure here must not blank the
      // deck list — progress cells simply show "—".
      const ids = list.map((d) => d._id);
      if (ids.length > 0) {
        const progRes = await fetch(
          `/api/srs/decks-progress?deckIds=${encodeURIComponent(ids.join(","))}`,
          { cache: "no-store" },
        ).catch(() => null);
        if (progRes && progRes.ok && !cancelled) {
          setProgress((await progRes.json().catch(() => ({}))) as DeckProgress);
        }
      }
      if (cancelled) return;
      setLoadedFor(version);
      setError(null);
    })();

    return () => {
      cancelled = true;
    };
  }, [version]);

  /** Refetch the list + progress (after create/delete). */
  function refetch() {
    setVersion((v) => v + 1);
  }



  async function createDeck(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    const res = await fetch("/api/flashcards/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newTitle,
        level: newLevel || undefined,
        category: newCategory.trim() || undefined,
      }),
    }).catch(() => null);
    setCreating(false);
    if (!res) {
      setError("Không kết nối được API");
      return;
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as
        | { message?: string }
        | null;
      setError(data?.message ? `Lỗi: ${data.message}` : `Thất bại (${res.status})`);
      return;
    }
    setNewTitle("");
    setNewLevel("");
    setNewCategory("");
    refetch();
  }

  async function remove(deckId: string) {
    setDeletingId(deckId);
    setError(null);
    const res = await fetch(`/api/flashcards/decks/${deckId}`, {
      method: "DELETE",
    }).catch(() => null);
    setDeletingId(null);
    if (res?.ok) {
      refetch();
    } else if (res && res.status === 403) {
      setError("Chỉ chủ sở hữu xoá được bộ thẻ cá nhân");
    } else {
      setError("Xoá thất bại");
    }
  }

  /**
   * Reset a personal deck's SRS progress: every card becomes new again (the
   * cards themselves are kept). A learner may reset only their own decks.
   */
  async function reset(deckId: string) {
    setResettingId(deckId);
    setError(null);
    const res = await fetch(`/api/srs/decks/${deckId}/reset`, {
      method: "POST",
    }).catch(() => null);
    setResettingId(null);
    if (res?.ok) {
      refetch(); // reload the new/due counters
    } else {
      setError("Đặt lại bộ thẻ thất bại");
    }
  }



  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <ConfirmDialog
        open={confirmResetId !== null}
        title="Đặt lại tiến độ?"
        message="Mọi thẻ trong bộ này sẽ trở thành thẻ mới và lịch ôn tập của bạn bị xoá. Thẻ vẫn được giữ nguyên."
        confirmLabel="Đặt lại"
        busy={resettingId !== null}
        onCancel={() => setConfirmResetId(null)}
        onConfirm={() => {
          const id = confirmResetId;
          if (id) void reset(id).finally(() => setConfirmResetId(null));
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
          Bộ flashcard
        </h1>
        <div className="flex gap-2">
          <Link
            href="/learn/study"
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]"
          >
            Bắt đầu ôn tập
          </Link>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]"
        >
          {error}
        </p>
      )}

      {/* Create a personal deck */}
      <form
        onSubmit={createDeck}
        className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-5"
      >
        <h2 className="text-sm font-semibold text-[var(--foreground)]">
          Tạo bộ thẻ mới
        </h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <label className="grow text-sm">
            <span className="text-[var(--muted-foreground)]">Tên bộ thẻ</span>
            <input
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className={`mt-1 ${inputClass}`}
              placeholder="Từ vựng N5"
            />
          </label>
          <div className="w-full sm:w-40 text-sm">
            <span className="text-[var(--muted-foreground)]">Cấp độ</span>
            <LevelSelect value={newLevel} onChange={(lv) => setNewLevel(lv)} />
          </div>
          <label className="w-full sm:w-44 text-sm">
            <span className="text-[var(--muted-foreground)]">Phân loại</span>
            <input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              list="deck-category-list"
              className={`mt-1 ${inputClass}`}
              placeholder="Từ vựng, Kanji…"
            />
            <datalist id="deck-category-list">
              {deckCategories(decks).map(([c]) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <button
            type="submit"
            disabled={creating || newTitle.trim() === ""}
            className="self-end rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creating ? "Đang tạo…" : "Tạo bộ"}
          </button>
        </div>
      </form>

      <CategoryFilter decks={decks} value={catFilter} onChange={setCatFilter} />

      {/* Deck list */}
      <div className="mt-6 space-y-3">
        {loading && (
          <p className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
            Đang tải…
          </p>
        )}
        {!loading && decks.length === 0 && (
          <p className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
            Chưa có bộ thẻ nào. Tạo bộ đầu tiên phía trên hoặc nhập hàng
            loạt{" "}
            <Link
              href="/admin/import"
              className="font-medium text-[var(--primary)] hover:underline"
            >
              tại khu quản trị
            </Link>
            .
          </p>
        )}
        {decks
          .filter((d) => !catFilter || d.category === catFilter)
          .map((deck) => {
          const mine = !deck.shared;
          const counts = progress[deck._id];
          return (
            <div
              key={deck._id}
              role="link"
              tabIndex={0}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("a,button,input,select,textarea,label,[role=dialog]")) return;
                router.push(`/learn/decks/${deck._id}`);
              }}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && e.key === "Enter") router.push(`/learn/decks/${deck._id}`);
              }}
              className="cursor-pointer rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-5 transition-colors hover:border-[var(--primary)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-base font-semibold text-[var(--foreground)]">
                    <Link href={`/learn/decks/${deck._id}`} className="hover:text-[var(--primary)] hover:underline">
                      {deck.title}
                    </Link>
                    {deck.shared && (
                      <span className="rounded-full bg-[var(--layer)] px-2 py-0.5 text-xs font-medium text-[var(--muted-foreground)]">
                        Chung
                      </span>
                    )}
                    {deck.status === "DRAFT" && (
                      <span className="rounded-full bg-[#fef9c3] px-2 py-0.5 text-xs font-medium text-[#a16207] dark:bg-[#3a3210] dark:text-[#fde047]">
                        Bản nháp
                      </span>
                    )}
                    <CategoryChip category={deck.category} />
                    {deck.level && (
                      <LevelBadge level={deck.level} />
                    )}
                  </h3>
                  {deck.summary && (
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                      {deck.summary}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <a
                    href={`/api/flashcards/decks/${deck._id}/export`}
                    download
                    title="Xuất CSV — tải toàn bộ thẻ của bộ này (nhập lại được)"
                    aria-label="Xuất CSV"
                    className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--layer-hover)] disabled:opacity-60"
                  >
                    <Icon name="download" />
                  </a>
                  {mine && (
                    <RetryExamplesButton
                      deckId={deck._id}
                      iconOnly
                      className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--layer-hover)] disabled:opacity-60"
                      onChanged={() => void reloadDecks("/api/flashcards/decks", setDecks)}
                    />
                  )}
                  <Link
                      href={`/learn/study?deck=${deck._id}`}
                      title="Ôn tập"
                      aria-label="Ôn tập"
                      className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
                    >
                      <Icon name="play" />
                    </Link>
                  <button
                      type="button"
                      onClick={() => setConfirmResetId(deck._id)}
                      disabled={resettingId === deck._id}
                      title="Đặt lại tiến độ học — mọi thẻ thành thẻ mới (thẻ vẫn giữ nguyên)"
                      aria-label="Đặt lại tiến độ"
                      className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--layer-hover)] disabled:opacity-60"
                    >
                      <Icon name="reset" className={"size-4" + (resettingId === deck._id ? " animate-spin" : "")} />
                    </button>
                  {mine && (
                    <button
                      type="button"
                      onClick={() => void remove(deck._id)}
                      disabled={deletingId === deck._id}
                      title="Xoá"
                      aria-label="Xoá"
                      className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--destructive)] text-[var(--destructive)] hover:bg-[#fef2f2] disabled:opacity-60"
                    >
                      <Icon name="trash" />
                    </button>
                  )}
                </div>
              </div>

              {/* Progress (P3-UI-03: số thẻ mới/đến hạn) */}
              <dl className="mt-3 flex flex-wrap gap-4 text-xs text-[var(--muted-foreground)]">
                <div>
                  <dt className="inline">Tổng thẻ: </dt>
                  <dd className="inline font-semibold text-[var(--foreground)]">
                    {deck.cardCount}
                  </dd>
                </div>
                <div>
                  <dt className="inline">Thẻ mới: </dt>
                  <dd className="inline font-semibold text-[var(--foreground)]">
                    {counts ? counts.new : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="inline">Đến hạn: </dt>
                  <dd className="inline font-semibold text-[var(--foreground)]">
                    {counts ? counts.due : "—"}
                  </dd>
                </div>
                {deck.createdAt && (
                  <div>
                    <dt className="inline">Tạo: </dt>
                    <dd className="inline">
                      {new Date(deck.createdAt).toLocaleDateString("vi-VN")}
                    </dd>
                  </div>
                )}
              </dl>

              {deck.examples && (
                <DeckProcessing
                  examples={deck.examples}
                  draft={deck.status === "DRAFT"}
                  deckId={deck._id}
                  onChanged={() => void reloadDecks("/api/flashcards/decks", setDecks)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
