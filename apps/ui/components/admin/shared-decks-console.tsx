"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/learn/icons";
import { LevelBadge, LevelSelect } from "@/components/learn/level-select";
import { CategoryChip, CategoryFilter, deckCategories } from "@/components/learn/category-filter";
import { DeckProcessing, RetryExamplesButton, reloadDecks, useDeckProgressPolling, type DeckExamples } from "@/components/learn/deck-processing";

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
  category?: string;
  lang: string;
  status: string;
  cardCount: number;
  examples?: DeckExamples | null;
  createdAt: string;
  updatedAt: string;
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
  const [newCategory, setNewCategory] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [newSummary, setNewSummary] = useState("");

  // Per-deck card management (only one deck expanded at a time).
  const [busyDeckId, setBusyDeckId] = useState<string | null>(null);

  const loading = loadedFor !== version;
  useDeckProgressPolling(decks, "/api/flashcards/admin/decks", setDecks);

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
        category: newCategory.trim() || undefined,
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
    setNewCategory("");
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
      refetch();
    } else {
      setError("Xoá thất bại");
    }
  }


  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
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
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
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
          <div className="block text-sm">
            <span className="text-[var(--muted-foreground)]">Cấp độ</span>
            <LevelSelect value={newLevel} onChange={(lv) => setNewLevel(lv)} />
          </div>
          <label className="block text-sm">
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
      <CategoryFilter decks={decks} value={catFilter} onChange={setCatFilter} />

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
        {decks
          .filter((d) => !catFilter || d.category === catFilter)
          .map((deck) => {
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
                  <Link
                    href={`/admin/decks/${deck._id}`}
                    title={`Quản lý thẻ (${deck.cardCount})`}
                    aria-label="Quản lý thẻ"
                    className="relative inline-flex size-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
                  >
                    <Icon name="list" />
                    <span className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-[var(--primary)] px-1 text-center text-[10px] font-semibold leading-4 text-white">
                      {deck.cardCount}
                    </span>
                  </Link>
                  <Link
                    href={`/admin/import?deck=${deck._id}`}
                    title="Nhập file"
                    aria-label="Nhập file"
                    className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--layer-hover)] disabled:opacity-60"
                  >
                    <Icon name="upload" />
                  </Link>
                  <a
                    href={`/api/flashcards/admin/decks/${deck._id}/export`}
                    download
                    className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--layer-hover)] disabled:opacity-60"
                    title="Xuất CSV — tải toàn bộ thẻ của bộ này (nhập lại được)"
                    aria-label="Xuất CSV"
                  >
                    <Icon name="download" />
                  </a>
                  <RetryExamplesButton
                    deckId={deck._id}
                    iconOnly
                    className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--layer-hover)] disabled:opacity-60"
                    onChanged={() => void reloadDecks("/api/flashcards/admin/decks", setDecks)}
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void updateDeck(deck._id, {
                        status: published ? "DRAFT" : "PUBLISHED",
                      })
                    }
                    title={published ? "Bỏ công khai" : "Công khai"}
                    aria-label={published ? "Bỏ công khai" : "Công khai"}
                    className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--layer-hover)] disabled:opacity-60"
                  >
                    <Icon name={published ? "eye-off" : "eye"} />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void remove(deck._id)}
                    title="Xoá"
                    aria-label="Xoá"
                    className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--destructive)] text-[var(--destructive)] hover:bg-[#fef2f2] disabled:opacity-60"
                  >
                    <Icon name="trash" />
                  </button>
                </div>
              </div>

              {deck.examples && (
                <DeckProcessing
                  examples={deck.examples}
                  draft={!published}
                  deckId={deck._id}
                  onChanged={() => void reloadDecks("/api/flashcards/admin/decks", setDecks)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
