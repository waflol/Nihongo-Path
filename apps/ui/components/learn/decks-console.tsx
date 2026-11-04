"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { emitSessionChanged } from "@/lib/session-events";

/**
 * Deck list + per-deck progress (P3-UI-03, spec §4.2 "người dùng tạo/sửa bộ
 * flashcard cá nhân").
 *
 * Talks to the `/api/flashcards/…` + `/api/srs/…` gateways (the access token
 * stays server-side, P2-UI-05). Two data sources are merged per deck: the
 * deck record (identity, shared flag) and the caller's `{ new, due }`
 * counts from the SRS progress endpoint.
 */

interface Deck {
  _id: string;
  title: string;
  summary?: string;
  shared: boolean;
  level?: string;
  status: string;
  createdAt: string;
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
      const ids = list.filter((d) => !d.shared).map((d) => d._id);
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
      refetch();
    } else if (res && res.status === 403) {
      setError("Chỉ chủ sở hữu xoá được bộ thẻ cá nhân");
    } else {
      setError("Xoá thất bại");
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
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
          const counts = mine ? progress[deck._id] : undefined;
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
                  {mine && (
                    <Link
                      href={`/learn/study?deck=${deck._id}`}
                      className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
                    >
                      Ôn tập
                    </Link>
                  )}
                  {mine && (
                    <button
                      type="button"
                      onClick={() => remove(deck._id)}
                      disabled={deletingId === deck._id}
                      className="rounded-lg border border-[var(--destructive)] px-3 py-1.5 text-xs font-medium text-[var(--destructive)] hover:bg-[#fef2f2] disabled:opacity-60"
                    >
                      {deletingId === deck._id ? "Đang xoá…" : "Xoá"}
                    </button>
                  )}
                </div>
              </div>

              {/* Progress (P3-UI-03: số thẻ mới/đến hạn) */}
              <dl className="mt-3 flex gap-4 text-xs text-[var(--muted-foreground)]">
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
