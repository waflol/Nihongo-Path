"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { KANJI_LEVELS, splitHanViet, type KanjiPage } from "./kanji-types";

const LIMIT = 60;

/** /learn/kanji — level tabs + Hán Việt search (plan-kanji §7.1). */
export function KanjiBrowser() {
  const [level, setLevel] = useState<string>("N5");
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

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      const p = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (level !== "ALL") p.set("level", level);
      if (query.trim()) p.set("hanViet", query.trim());
      fetch(`/api/kanji?${p}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d: KanjiPage) => {
          setData(d);
          setError(false);
        })
        .catch((e) => {
          if (e?.name !== "AbortError") setError(true);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [level, query, page]);

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
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Tìm theo âm Hán Việt (vd: hoc)"
          className="ml-auto w-full rounded-lg border border-[var(--border)] bg-[var(--background-1)] px-3 py-1.5 text-sm sm:w-64"
        />
      </div>

      {error && <p className="mt-6 text-sm text-red-500">Không tải được danh sách kanji.</p>}
      {data && data.items.length === 0 && (
        <p className="mt-6 text-sm text-[var(--muted-foreground)]">Chưa có kanji nào được xuất bản.</p>
      )}

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
    </div>
  );
}
