"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { KanjiGroups } from "./kanji-groups";
import { MasteryLegend, masteryStyle, useKanjiMastery } from "./kanji-mastery";
import { splitHanViet, type KanjiItem } from "./kanji-types";

interface DeckCard {
  front: string;
  hanViet?: string;
  order?: number;
}

interface Family {
  head: string;
  hanViet: string;
  members: { char: string; hanViet: string }[];
}

const PAGE_SIZE = 100;

const message = (text: string) => (
  <p className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
    {text}
  </p>
);

/** Every card of the deck matching the search / tag, page by page (the API caps a page at 100). */
async function allCards(deckId: string, q: string, tag: string, signal: AbortSignal) {
  const get = async (page: number) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (q) params.set("q", q);
    if (tag) params.set("tag", tag);
    const res = await fetch(`/api/flashcards/decks/${deckId}/cards/page?${params}`, { cache: "no-store", signal });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as { items: DeckCard[]; total: number };
  };
  const first = await get(1);
  const cards = [...first.items];
  // One at a time: a level deck is ~10 pages and the server is small.
  for (let page = 2; page <= Math.ceil(first.total / PAGE_SIZE); page++) cards.push(...(await get(page)).items);
  return cards;
}

/** A whole kanji deck as groups of 20, or by family (shared component). */
export function KanjiDeckViews({
  view,
  deckId,
  q,
  tag,
  version,
}: {
  view: "groups" | "families";
  deckId: string;
  q: string;
  tag: string;
  /** Bumped by the deck page after an edit. */
  version: number;
}) {
  const [cards, setCards] = useState<DeckCard[] | null>(null);
  const [families, setFamilies] = useState<Family[] | null>(null);
  const [error, setError] = useState(false);
  const mastery = useKanjiMastery();

  useEffect(() => {
    const ctrl = new AbortController();
    allCards(deckId, q, tag, ctrl.signal)
      .then((list) => {
        setCards(list);
        setError(false);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setError(true);
      });
    return () => ctrl.abort();
  }, [deckId, q, tag, version]);

  useEffect(() => {
    if (view !== "families" || families) return;
    const ctrl = new AbortController();
    fetch("/api/kanji/families", { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Family[]>) : Promise.reject()))
      .then(setFamilies)
      .catch(() => {
        if (!ctrl.signal.aborted) setError(true);
      });
    return () => ctrl.abort();
  }, [view, families]);

  if (error) return <p className="text-sm text-red-500">Không tải được danh sách Kanji.</p>;
  if (!cards || (view === "families" && !families)) return message("Đang tải danh sách Kanji…");

  if (view === "groups") {
    const items: KanjiItem[] = cards.map((c, i) => ({
      char: c.front,
      rank: c.order && c.order > 0 ? c.order : i + 1,
      hanViet: c.hanViet ?? "",
      level: "",
      onyomi: [],
      kunyomi: [],
      strokeCount: 0,
      meanings: [],
      meaningsEn: [],
      mnemonic: "",
      words: [],
    }));
    return (
      <>
        <MasteryLegend className="" />
        <KanjiGroups
          items={items}
          loading={false}
          mastery={mastery}
          href={(k) => `/learn/kanji/${encodeURIComponent(k.char)}`}
        />
      </>
    );
  }

  const inDeck = new Set(cards.map((c) => c.front));
  const shown = (families ?? []).filter((f) => f.members.some((m) => inDeck.has(m.char)));
  if (shown.length === 0) return message("Không có gia đình nào chứa chữ trong bộ này.");

  return (
    <>
      <p className="mb-3 text-sm text-[var(--muted-foreground)]">
        {shown.length} gia đình · xếp A–Z Hán Việt · chữ mờ không có trong danh sách đang xem
      </p>
      <MasteryLegend className="mb-3" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {shown.map((f) => (
          <Link
            key={f.head}
            href={`/learn/kanji/families?f=${encodeURIComponent(f.head)}`}
            className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-3 transition-colors hover:bg-[var(--layer-hover)]"
          >
            <div className="w-14 shrink-0 text-center">
              <div
                lang="ja"
                className="rounded-lg border-2 border-transparent text-3xl font-semibold text-[var(--foreground)]"
                style={masteryStyle(mastery, f.head)}
              >
                {f.head}
              </div>
              <div className="text-[10px] font-semibold text-[var(--accent)]">{f.hanViet || "—"}</div>
            </div>
            <div className="min-w-0 border-l border-dashed border-[var(--border)] pl-3">
              <div lang="ja" className="break-all text-lg tracking-wider text-[var(--foreground)]">
                {f.members.map((m) => (
                  <span
                    key={m.char}
                    title={splitHanViet(m.hanViet).join(" · ")}
                    className={`inline-block rounded border-2 border-transparent ${inDeck.has(m.char) ? "" : "opacity-30"}`}
                    style={masteryStyle(mastery, m.char)}
                  >
                    {m.char}
                  </span>
                ))}
              </div>
              <div className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                {f.members.filter((m) => inDeck.has(m.char)).length}/{f.members.length} chữ
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
