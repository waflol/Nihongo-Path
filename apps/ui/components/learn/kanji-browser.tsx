"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { KanjiGroups } from "./kanji-groups";
import { KANJI_LEVELS, splitHanViet, type KanjiPage } from "./kanji-types";

const LIMIT = 60;

/** /learn/kanji — level tabs + Hán Việt search (plan-kanji §7.1). */
export function KanjiBrowser({
  initialView,
  initialLevel,
}: {
  initialView?: string;
  initialLevel?: string;
}) {
  const [level, setLevel] = useState<string>(
    initialLevel && (initialLevel === "ALL" || (KANJI_LEVELS as readonly string[]).includes(initialLevel))
      ? initialLevel
      : "N5",
  );
  const [view, setView] = useState<"cards" | "groups">(initialView === "groups" ? "groups" : "cards");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<KanjiPage | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/kanji/levels")
      .then((r) => r.json())
      .then((rows: { level: string; count: number }[]) =>
        setCounts(Object.fromEntries(rows.map((r) => [r.level, r.count]))),
      )
      .catch(() => {});
  }, []);

  // Keep the view and level in the URL so a refresh (F5) restores them.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (view === "groups") url.searchParams.set("view", "groups");
    else url.searchParams.delete("view");
    if (level !== "N5") url.searchParams.set("level", level);
    else url.searchParams.delete("level");
    window.history.replaceState(window.history.state, "", url);
  }, [view, level]);

  useEffect(() => {
    const ctrl = new AbortController();
    const grouped = view === "groups";
    const timer = setTimeout(async () => {
      const build = (pg: number) => {
        const p = new URLSearchParams({ page: String(pg), limit: grouped ? "100" : String(LIMIT) });
        if (level !== "ALL") p.set("level", level);
        if (query.trim()) p.set("hanViet", query.trim());
        return p;
      };
      const get = (pg: number) =>
        fetch(`/api/kanji?${build(pg)}`, { signal: ctrl.signal }).then((r) =>
          r.ok ? (r.json() as Promise<KanjiPage>) : Promise.reject(),
        );
      try {
        const first = await get(grouped ? 1 : page);
        if (grouped) {
          // Group view shows the whole level: pull the remaining pages (max 100 each).
          const last = Math.min(30, Math.ceil(first.total / 100));
          const rest = await Promise.all(
            Array.from({ length: Math.max(0, last - 1) }, (_, i) => get(i + 2).catch(() => null)),
          );
          first.items = [...first.items, ...rest.flatMap((r) => r?.items ?? [])];
        }
        setData(first);
        setError(false);
      } catch (e) {
        if ((e as { name?: string })?.name !== "AbortError") setError(true);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [level, query, page, view]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const tab = (id: string, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => {
        setLevel(id);
        setPage(1);
      }}
      className={`rounded-full border px-3 py-1 text-sm ${
        level === id
          ? "border-[var(--accent)] bg-[var(--accent)] text-white"
          : "border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
      }`}
    >
      {label}
      {counts[id] != null && <span className="ml-1 opacity-70">{counts[id]}</span>}
    </button>
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">Kanji</h1>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {KANJI_LEVELS.map((l) => tab(l, l))}
        {tab("ALL", "Tất cả")}
        <div
          role="group"
          aria-label="Chế độ xem"
          className="ml-auto flex items-center gap-0.5 rounded-full border border-[var(--border)] bg-[var(--layer)] p-0.5 text-sm"
        >
          {(
            [
              { id: "cards", label: "Thẻ" },
              { id: "groups", label: "Nhóm 20 chữ" },
            ] as const
          ).map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={view === v.id}
              onClick={() => setView(v.id)}
              className={`rounded-full px-3 py-1 ${
                view === v.id
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Tìm theo âm Hán Việt (vd: hoc)"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background-1)] px-3 py-1.5 text-sm sm:w-64"
        />
      </div>

      {error && <p className="mt-6 text-sm text-red-500">Không tải được danh sách kanji.</p>}
      {data && data.items.length === 0 && (
        <p className="mt-6 text-sm text-[var(--muted-foreground)]">Chưa có kanji nào được xuất bản.</p>
      )}

      {view === "groups" ? (
        <KanjiGroups
          items={data?.items ?? []}
          loading={!data && !error}
          href={(k) => `/learn/kanji/${encodeURIComponent(k.char)}`}
        />
      ) : (
        <>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {data?.items.map((k) => (
          <Link
            key={k.char}
            href={`/learn/kanji/${encodeURIComponent(k.char)}`}
            className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4 text-center transition-colors hover:bg-[var(--layer-hover)]"
          >
            <div className="text-4xl text-[var(--foreground)]">{k.char}</div>
            <div className="mt-1 text-xs font-semibold uppercase text-[var(--accent)]">
              {splitHanViet(k.hanViet).join(" · ") || "—"}
            </div>
            <div className="mt-1 truncate text-xs text-[var(--muted-foreground)]">
              {[...k.onyomi.slice(0, 1), ...k.kunyomi.slice(0, 1)].join(" · ")}
            </div>
            <div className="mt-1 text-[10px] text-[var(--muted-foreground)]">{k.level}</div>
          </Link>
        ))}
      </div>

      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3 text-sm">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-3 py-1 disabled:opacity-40">
            ‹
          </button>
          <span>{page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded border px-3 py-1 disabled:opacity-40">
            ›
          </button>
        </div>
      )}
        </>
      )}
    </div>
  );
}
