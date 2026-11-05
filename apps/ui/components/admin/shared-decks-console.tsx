"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  ExampleFields,
  cleanExampleInputs,
  type ExampleInput,
} from "@/components/learn/example-fields";
import { CardEditForm } from "@/components/learn/card-edit-form";
import { ReadingFields, type PartOfSpeech } from "@/components/learn/reading-fields";
import { ImageField } from "@/components/learn/image-field";
import { CardTile, HanVietToggle } from "@/components/learn/card-tile";
import { useHanVietPref } from "@/lib/use-han-viet-pref";

/**
 * Admin shared-deck management (P3-UI-04). Talks to the
 * `/api/flashcards/admin/decks` gateway (the access token stays server-side;
 * the API enforces `@ContentAdmin`, so a non-admin gets 403 even if the UI
 * gate were bypassed).
 *
 * - lists ALL shared decks (any status) with their card count,
 * - create / edit / publish-hold / delete,
 * - add cards to a shared deck (the learner import path is admin-only).
 *
 * Learners' personal decks are intentionally absent from this screen.
 */

interface SharedDeck {
  _id: string;
  title: string;
  summary?: string;
  level?: string;
  lang: string;
  status: string;
  cardCount: number;
  createdAt: string;
  updatedAt: string;
}

interface SharedCard {
  _id: string;
  front: string;
  back: string;
  reading?: string;
  image?: string;
  imageCredit?: string;
  partOfSpeech?: string;
  examples?: { sentence: string; translation?: string }[];
  tags?: string[];
  origin: string;
}

const inputClass =
  "block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-focus)]";

export function SharedDecksConsole() {
  const [decks, setDecks] = useState<SharedDeck[]>([]);
  const [loadedFor, setLoadedFor] = useState(-1);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Create-deck form.
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newLevel, setNewLevel] = useState("");
  const [newSummary, setNewSummary] = useState("");

  // Per-deck card management (only one deck expanded at a time).
  const [openDeck, setOpenDeck] = useState<string | null>(null);
  const [cards, setCards] = useState<SharedCard[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [showHanViet, toggleHanViet] = useHanVietPref();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [cardForm, setCardForm] = useState<{ front: string; back: string; reading: string; image: string; imageCredit: string; partOfSpeech: PartOfSpeech | ""; examples: ExampleInput[]; tags: string }>({ front: "", back: "", reading: "", image: "", imageCredit: "", partOfSpeech: "", examples: [{ sentence: "", translation: "" }], tags: "" });
  const [busyDeckId, setBusyDeckId] = useState<string | null>(null);

  const loading = loadedFor !== version;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const res = await fetch("/api/flashcards/admin/decks", {
        cache: "no-store",
      }).catch(() => null);
      if (cancelled) return;
      if (!res) {
        setError("Không kết nối được API");
        setLoadedFor(version);
        return;
      }
      if (res.status === 401) {
        setError("Cần đăng nhập để quản trị bộ thẻ chung");
        setLoadedFor(version);
        return;
      }
      if (res.status === 403) {
        setError("Tài khoản hiện tại không có quyền quản trị nội dung");
        setLoadedFor(version);
        return;
      }
      const list = (await res.json().catch(() => [])) as SharedDeck[];
      if (cancelled) return;
      setDecks(Array.isArray(list) ? list : []);
      setLoadedFor(version);
      setError(null);
    })();

    return () => {
      cancelled = true;
    };
  }, [version]);

  function refetch() {
    setVersion((v) => v + 1);
  }

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
    setCards(((await res.json().catch(() => [])) as SharedCard[]) ?? []);
  }

  async function toggleDeck(deck: SharedDeck) {
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
    const res = await fetch("/api/flashcards/admin/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newTitle,
        level: newLevel || undefined,
        summary: newSummary || undefined,
        status: "PUBLISHED",
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
    setNewSummary("");
    refetch();
  }

  async function updateDeck(
    id: string,
    patch: Partial<Pick<SharedDeck, "title" | "summary" | "level" | "status">>,
  ) {
    setBusyDeckId(id);
    setError(null);
    const res = await fetch(`/api/flashcards/admin/decks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => null);
    setBusyDeckId(null);
    if (!res || !res.ok) {
      setError(res ? "Cập nhật thất bại" : "Không kết nối được API");
      return;
    }
    refetch();
  }

  async function remove(deckId: string) {
    setBusyDeckId(deckId);
    setError(null);
    const res = await fetch(`/api/flashcards/admin/decks/${deckId}`, {
      method: "DELETE",
    }).catch(() => null);
    setBusyDeckId(null);
    if (res?.ok) {
      if (openDeck === deckId) {
        setOpenDeck(null);
        setCards([]);
      }
      refetch();
    } else {
      setError("Xoá thất bại");
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
        origin: "manual",
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
        data?.message ? `Lỗi: ${data.message}` : `Không thêm được thẻ (${res.status})`,
      );
      return;
    }
    setFormKey((k) => k + 1);
    setCardForm({ front: "", back: "", reading: "", image: "", imageCredit: "", partOfSpeech: "", examples: [{ sentence: "", translation: "" }], tags: "" });
    await loadCards(openDeck);
    refetch();
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
          Bộ thẻ chia sẻ
        </h1>
        <Link
          href="/admin/import"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]"
        >
          ⬆ Nhập từ CSV / XLSX
        </Link>
      </div>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Bộ thẻ dùng chung cho người học: bạn tạo, chỉnh và thêm thẻ; người
        học chỉ đọc và ôn tập. Bộ thẻ cá nhân của người học không xuất hiện
        ở đây.
      </p>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]"
        >
          {error}
        </p>
      )}

      {/* Create a shared deck */}
      <form
        onSubmit={createDeck}
        className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-5"
      >
        <h2 className="text-sm font-semibold text-[var(--foreground)]">
          Tạo bộ thẻ chung
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="text-[var(--muted-foreground)]">Tên (bắt buộc)</span>
            <input
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className={`mt-1 ${inputClass}`}
              placeholder="Tủ từ N5"
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--muted-foreground)]">Cấp độ</span>
            <input
              value={newLevel}
              onChange={(e) => setNewLevel(e.target.value)}
              className={`mt-1 ${inputClass}`}
              placeholder="N5"
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--muted-foreground)]">Mô tả ngắn</span>
            <input
              value={newSummary}
              onChange={(e) => setNewSummary(e.target.value)}
              className={`mt-1 ${inputClass}`}
              placeholder="Từ vựng cơ bản N5 theo chủ đề"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={creating || newTitle.trim() === ""}
          className="mt-3 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {creating ? "Đang tạo…" : "Tạo bộ thẻ chung"}
        </button>
      </form>

      {/* Shared-deck list */}
      <div className="mt-6 space-y-3">
        {loading && (
          <p className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
            Đang tải…
          </p>
        )}
        {!loading && decks.length === 0 && (
          <p className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
            Chưa có bộ thẻ chung nào. Tạo bộ đầu tiên phía trên.
          </p>
        )}
        {decks.map((deck) => {
          const isOpen = openDeck === deck._id;
          const busy = busyDeckId === deck._id;
          const published = deck.status === "PUBLISHED";
          return (
            <div
              key={deck._id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-base font-semibold text-[var(--foreground)]">
                    {deck.title}
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-xs font-medium " +
                        (published
                          ? "bg-[#f0fdf4] text-[#15803d]"
                          : "bg-[#fef9c3] text-[#a16207]")
                      }
                    >
                      {published ? "Công khai" : "Bản nháp"}
                    </span>
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

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void toggleDeck(deck)}
                    aria-expanded={isOpen}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
                  >
                    {isOpen ? "Ẩn thẻ" : `Quản lý thẻ (${deck.cardCount})`}
                  </button>
                  <Link
                    href={`/admin/import?deck=${deck._id}`}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--primary)] hover:bg-[var(--layer-hover)]"
                  >
                    Nhập file
                  </Link>
                  <a
                    href={`/api/flashcards/admin/decks/${deck._id}/export`}
                    download
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--primary)] hover:bg-[var(--layer-hover)]"
                    title="Tải toàn bộ thẻ của bộ này thành file CSV (nhập lại được)"
                  >
                    Xuất CSV
                  </a>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void updateDeck(deck._id, {
                        status: published ? "DRAFT" : "PUBLISHED",
                      })
                    }
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)] disabled:opacity-60"
                  >
                    {published ? "Bỏ công khai" : "Công khai"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void remove(deck._id)}
                    className="rounded-lg border border-[var(--destructive)] px-3 py-1.5 text-xs font-medium text-[var(--destructive)] hover:bg-[#fef2f2] disabled:opacity-60"
                  >
                    {busy ? "Đang xử lý…" : "Xoá"}
                  </button>
                </div>
              </div>

              {/* Card management (expanded) */}
              {isOpen && (
                <div className="mt-4 border-t border-[var(--border)] pt-4">
                  <form
                    onSubmit={addCard}
                    className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-[var(--foreground)]">
                        Thêm thẻ vào bộ này
                      </h3>
                      <Link
                        href={`/admin/import?deck=${deck._id}`}
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

                  {/* Cards */}
                  <div className="mt-4">
                    {cardsLoading && (
                      <p className="text-sm text-[var(--muted-foreground)]">
                        Đang tải thẻ…
                      </p>
                    )}
                    {!cardsLoading && cards.length === 0 && (
                      <p className="text-sm text-[var(--muted-foreground)]">
                        Bộ này chưa có thẻ. Thêm thẻ hoặc import hàng loạt.
                      </p>
                    )}
                    {cards.length > 0 && (
                      <>
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-[var(--muted-foreground)]">
                          {cards.length} thẻ
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <a
                            href={`/api/flashcards/admin/decks/${deck._id}/export`}
                            download
                            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3.5 py-1.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
                          >
                            ⬇ Xuất CSV
                          </a>
                          <HanVietToggle on={showHanViet} onToggle={toggleHanViet} />
                        </div>
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
                                  await loadCards(deck._id);
                                }}
                              />
                            </li>
                          ) : (
                            <CardTile
                              key={card._id}
                              card={card}
                              index={i}
                              showHanViet={showHanViet}
                              actions={true && (<>
                              <button
                                type="button"
                                onClick={() => setEditingId(card._id)}
                                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
                              >
                                Sửa
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void (async () => {
                                  if (!window.confirm("Xoá thẻ này khỏi bộ chung? Tiến độ của người học trên thẻ cũng bị xoá.")) return;
                                  const res = await fetch(`/api/flashcards/cards/${card._id}`, { method: "DELETE" }).catch(() => null);
                                  if (res?.ok) {
                                    await loadCards(deck._id);
                                    refetch();
                                  } else {
                                    setError("Xoá thẻ thất bại");
                                  }
                                })()}
                                className="rounded-lg border border-[var(--destructive)] px-3 py-1.5 text-xs font-semibold text-[var(--destructive)] hover:bg-[#fef2f2] disabled:opacity-60 dark:hover:bg-[#2a1215]"
                              >
                                Xoá
                              </button>
                            </>)}
                            />
                          ),
                        )}
                      </ul>
                      </>
                    )}
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
