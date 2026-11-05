"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { emitSessionChanged } from "@/lib/session-events";
import {
  ExampleFields,
  cleanExampleInputs,
  type ExampleInput,
} from "@/components/learn/example-fields";
import { CardEditForm } from "@/components/learn/card-edit-form";
import { ReadingFields, type PartOfSpeech } from "@/components/learn/reading-fields";
import { ImageField } from "@/components/learn/image-field";
import { CardTile, HanVietToggle } from "@/components/learn/card-tile";
import { ConfirmDialog } from "@/components/learn/confirm-dialog";
import { useHanVietPref } from "@/lib/use-han-viet-pref";

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
  status: string;
  cardCount: number;
  createdAt: string;
}

interface Card {
  _id: string;
  front: string;
  back: string;
  reading?: string;
  image?: string;
  imageCredit?: string;
  partOfSpeech?: string;
  hanViet?: string;
  examples?: { sentence: string; translation?: string }[];
  tags?: string[];
  origin: string;
}

interface DeckProgress {
  [deckId: string]: { new: number; due: number };
}

const inputClass =
  "block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-focus)]";

export function DecksConsole() {
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [confirmResetId, setConfirmResetId] = useState<string | null>(null);

  // Card management state, per open deck.
  const [openDeck, setOpenDeck] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [adding, setAdding] = useState(false);
  const [cardForm, setCardForm] = useState<{ front: string; back: string; reading: string; image: string; imageCredit: string; partOfSpeech: PartOfSpeech | ""; examples: ExampleInput[]; tags: string }>({ front: "", back: "", reading: "", image: "", imageCredit: "", partOfSpeech: "", examples: [{ sentence: "", translation: "" }], tags: "" });
  const [showHanViet, toggleHanViet] = useHanVietPref();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingCardId, setDeletingCardId] = useState<string | null>(null);

  const loading = loadedFor !== version;

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

  /** Load (or reload) the cards of the open deck. */
  async function loadCards(deckId: string) {
    setCardsLoading(true);
    const res = await fetch(`/api/flashcards/decks/${deckId}/cards`, {
      cache: "no-store",
    }).catch(() => null);
    setCardsLoading(false);
    if (!res || !res.ok) {
      setError("Không tải được danh sách thẻ");
      return;
    }
    setCards(((await res.json().catch(() => [])) as Card[]) ?? []);
  }

  async function toggleDeck(deck: Deck) {
    if (openDeck === deck._id) {
      setOpenDeck(null);
      setCards([]);
      return;
    }
    setOpenDeck(deck._id);
    setCardForm({ front: "", back: "", reading: "", image: "", imageCredit: "", partOfSpeech: "", examples: [{ sentence: "", translation: "" }], tags: "" });
    setError(null);
    await loadCards(deck._id);
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
      if (openDeck === deckId) {
        setOpenDeck(null);
        setCards([]);
      }
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

  async function addCard(event: FormEvent) {
    event.preventDefault();
    if (!openDeck) return;
    setAdding(true);
    setError(null);
    const res = await fetch("/api/flashcards/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deckId: openDeck,
        front: cardForm.front,
        back: cardForm.back,
        reading: cardForm.reading.trim(),
        image: cardForm.image,
        imageCredit: cardForm.imageCredit,
        partOfSpeech: cardForm.partOfSpeech,
        examples: cleanExampleInputs(cardForm.examples),
        tags: cardForm.tags
          ? cardForm.tags.split(/[;,]/).map((t) => t.trim()).filter(Boolean)
          : undefined,
      }),
    }).catch(() => null);
    setAdding(false);
    if (!res) {
      setError("Không kết nối được API");
      return;
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as
        | { message?: string }
        | null;
      setError(
        data?.message
          ? `Lỗi: ${data.message}`
          : `Không thêm được thẻ (${res.status})`,
      );
      return;
    }
    setFormKey((k) => k + 1);
    setCardForm({ front: "", back: "", reading: "", image: "", imageCredit: "", partOfSpeech: "", examples: [{ sentence: "", translation: "" }], tags: "" });
    await loadCards(openDeck);
    refetch();
  }

  async function removeCard(cardId: string) {
    if (!window.confirm("Xoá thẻ này? Tiến độ học của thẻ cũng bị xoá.")) return;
    setDeletingCardId(cardId);
    setError(null);
    const res = await fetch(`/api/flashcards/cards/${cardId}`, {
      method: "DELETE",
    }).catch(() => null);
    setDeletingCardId(null);
    if (res?.ok) {
      if (openDeck) await loadCards(openDeck);
      refetch();
    } else {
      setError("Xoá thẻ thất bại");
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
          <label className="w-full sm:w-40 text-sm">
            <span className="text-[var(--muted-foreground)]">Cấp độ</span>
            <input
              value={newLevel}
              onChange={(e) => setNewLevel(e.target.value)}
              className={`mt-1 ${inputClass}`}
              placeholder="N5"
            />
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
        {decks.map((deck) => {
          const mine = !deck.shared;
          const counts = progress[deck._id];
          const isOpen = openDeck === deck._id;
          return (
            <div
              key={deck._id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-base font-semibold text-[var(--foreground)]">
                    {deck.title}
                    {deck.shared && (
                      <span className="rounded-full bg-[var(--layer)] px-2 py-0.5 text-xs font-medium text-[var(--muted-foreground)]">
                        Chung
                      </span>
                    )}
                    {deck.level && (
                      <span className="rounded-full bg-[var(--layer)] px-2 py-0.5 text-xs font-medium text-[var(--muted-foreground)]">
                        {deck.level}
                      </span>
                    )}
                  </h3>
                  {deck.summary && (
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                      {deck.summary}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void toggleDeck(deck)}
                    aria-expanded={isOpen}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
                  >
                    {isOpen ? "Ẩn thẻ" : `Xem thẻ (${deck.cardCount})`}
                  </button>
                  <a
                    href={`/api/flashcards/decks/${deck._id}/export`}
                    download
                    title="Tải toàn bộ thẻ của bộ này thành file CSV (nhập lại được)"
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--primary)] hover:bg-[var(--layer-hover)]"
                  >
                    Xuất CSV
                  </a>
                  <Link
                      href={`/learn/study?deck=${deck._id}`}
                      className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
                    >
                      Ôn tập
                    </Link>
                  <button
                      type="button"
                      onClick={() => setConfirmResetId(deck._id)}
                      disabled={resettingId === deck._id}
                      title="Đặt lại tiến độ học — mọi thẻ thành thẻ mới (thẻ vẫn giữ nguyên)"
                      className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted-foreground)] hover:bg-[var(--layer-hover)] hover:text-[var(--foreground)] disabled:opacity-60"
                    >
                      {resettingId === deck._id ? "Đang đặt lại…" : "↺ Đặt lại"}
                    </button>
                  {mine && (
                    <button
                      type="button"
                      onClick={() => void remove(deck._id)}
                      disabled={deletingId === deck._id}
                      className="rounded-lg border border-[var(--destructive)] px-3 py-1.5 text-xs font-medium text-[var(--destructive)] hover:bg-[#fef2f2] disabled:opacity-60"
                    >
                      {deletingId === deck._id ? "Đang xoá…" : "Xoá"}
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

              {/* ── Card list + add-card form (expanded) ───────────────── */}
              {isOpen && (
                <div className="mt-4 border-t border-[var(--border)] pt-4">
                  {/* Add a card (own decks only) */}
                  {mine && (
                    <form
                      onSubmit={addCard}
                      className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-[var(--foreground)]">
                          Thêm thẻ
                        </h3>
                        <Link
                          href={`/learn/import?deck=${deck._id}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--primary)] hover:bg-[var(--layer-hover)]"
                        >
                          ⬆ Nhập từ CSV / XLSX
                        </Link>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="block text-sm">
                          <span className="text-[var(--muted-foreground)]">
                            Mặt trước (câu hỏi)
                          </span>
                          <input
                            required
                            value={cardForm.front}
                            onChange={(e) =>
                              setCardForm((f) => ({ ...f, front: e.target.value }))
                            }
                            className={`mt-1 ${inputClass}`}
                            placeholder="猫"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="text-[var(--muted-foreground)]">
                            Mặt sau (đáp án)
                          </span>
                          <input
                            required
                            value={cardForm.back}
                            onChange={(e) =>
                              setCardForm((f) => ({ ...f, back: e.target.value }))
                            }
                            className={`mt-1 ${inputClass}`}
                            placeholder="chú mèo"
                          />
                        </label>
                        <ReadingFields
                          key={formKey}
                          front={cardForm.front}
                          reading={cardForm.reading}
                          partOfSpeech={cardForm.partOfSpeech}
                          onReading={(reading) => setCardForm((f) => ({ ...f, reading }))}
                          onPartOfSpeech={(partOfSpeech) => setCardForm((f) => ({ ...f, partOfSpeech }))}
                        />
                        <ImageField
                          key={`img-${formKey}`}
                          term={cardForm.front}
                          image={cardForm.image}
                          credit={cardForm.imageCredit}
                          onChange={(image, imageCredit) =>
                            setCardForm((f) => ({ ...f, image, imageCredit }))
                          }
                        />
                        <ExampleFields
                          autoSuggest
                          value={cardForm.examples}
                          onChange={(examples) => setCardForm((f) => ({ ...f, examples }))}
                        />
                        <label className="block text-sm sm:col-span-2">
                          <span className="text-[var(--muted-foreground)]">
                            Tags (tuỳ chọn, phân tách bằng dấu phẩy)
                          </span>
                          <input
                            value={cardForm.tags}
                            onChange={(e) =>
                              setCardForm((f) => ({ ...f, tags: e.target.value }))
                            }
                            className={`mt-1 ${inputClass}`}
                            placeholder="động vật, N5"
                          />
                        </label>
                      </div>
                      <button
                        type="submit"
                        disabled={
                          adding ||
                          cardForm.front.trim() === "" ||
                          cardForm.back.trim() === ""
                        }
                        className="mt-3 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {adding ? "Đang thêm…" : "Thêm thẻ"}
                      </button>
                    </form>
                  )}

                  {/* Cards */}
                  <div className="mt-4">
                    {cardsLoading && (
                      <p className="text-sm text-[var(--muted-foreground)]">
                        Đang tải thẻ…
                      </p>
                    )}
                    {!cardsLoading && cards.length === 0 && (
                      <p className="text-sm text-[var(--muted-foreground)]">
                        Bộ thẻ này chưa có thẻ nào.
                      </p>
                    )}
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-[var(--muted-foreground)]">
                        {cards.length} thẻ
                      </p>
                      <HanVietToggle on={showHanViet} onToggle={toggleHanViet} />
                    </div>
                    <ul className="space-y-3">
                      {cards.map((card, i) =>
                        editingId === card._id ? (
                          <li
                            key={card._id}
                            className="rounded-2xl border border-[var(--primary)] bg-[var(--background)] p-4 shadow-sm"
                          >
                            <CardEditForm
                              card={card}
                              onCancel={() => setEditingId(null)}
                              onError={setError}
                              onSaved={async () => {
                                setEditingId(null);
                                setError(null);
                                await (openDeck ? loadCards(openDeck) : Promise.resolve());
                              }}
                            />
                          </li>
                        ) : (
                          <CardTile
                            key={card._id}
                            card={card}
                            index={i}
                            showHanViet={showHanViet}
                            actions={mine && (<>
                              <button
                                type="button"
                                onClick={() => setEditingId(card._id)}
                                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
                              >
                                Sửa
                              </button>
                              <button
                                type="button"
                                disabled={deletingCardId === card._id}
                                onClick={() => void removeCard(card._id)}
                                className="rounded-lg border border-[var(--destructive)] px-3 py-1.5 text-xs font-semibold text-[var(--destructive)] hover:bg-[#fef2f2] disabled:opacity-60 dark:hover:bg-[#2a1215]"
                              >
                                {deletingCardId === card._id ? "…" : "Xoá"}
                              </button>
                            </>)}
                          />
                        ),
                      )}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
