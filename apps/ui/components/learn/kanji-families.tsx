"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { MasteryLegend, masteryLabel, masteryStyle, useKanjiMastery } from "./kanji-mastery";
import { KANJI_LEVELS, splitHanViet } from "./kanji-types";

/** A family from `GET /kanji/families`; `level` is "" for a kanji the app does not have. */
interface Family {
  head: string;
  hanViet: string;
  members: { char: string; level: string; hanViet: string }[];
}

type Sort = "az" | "default";

const LEVELS: readonly string[] = KANJI_LEVELS;

const fold = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gi, "d").toLowerCase().trim();

const levelsOf = (f: Family) => LEVELS.filter((l) => f.members.some((m) => m.level === l));

/** Default order: families reaching the easiest level first, then the bigger ones. */
function byLevel(a: Family, b: Family) {
  const first = (f: Family) => {
    const i = LEVELS.findIndex((l) => f.members.some((m) => m.level === l));
    return i < 0 ? LEVELS.length : i;
  };
  return first(a) - first(b) || b.members.length - a.members.length;
}

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1 text-sm ${
    on
      ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
      : "border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
  }`;

const primaryButton =
  "rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:opacity-90";
const secondaryButton =
  "rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)]";

const studyHref = (mode: "study" | "review", family: string) =>
  `/learn/kanji/${mode}?family=${encodeURIComponent(family)}`;

/** /learn/kanji/families — kanji grouped by a shared component; `?f=` opens one family. */
export function KanjiFamilies() {
  const router = useRouter();
  const params = useSearchParams();
  const selected = params.get("f");
  const sort: Sort = params.get("sort") === "default" ? "default" : "az";
  const level = params.get("level") ?? "";
  const [query, setQuery] = useState("");
  const [families, setFamilies] = useState<Family[] | null>(null);
  const [error, setError] = useState(false);
  const mastery = useKanjiMastery();

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/kanji/families", { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Family[]>) : Promise.reject()))
      .then(setFamilies)
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name !== "AbortError") setError(true);
      });
    return () => ctrl.abort();
  }, []);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`?${next}`, { scroll: false });
  }

  const shell = (children: React.ReactNode) => (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">{children}</div>
  );

  if (error) return shell(<p className="text-sm text-red-500">Không tải được các gia đình Kanji.</p>);
  if (!families) return shell(<p className="text-sm text-[var(--muted-foreground)]">Đang tải…</p>);

  if (selected) {
    const family = families.find((f) => f.head === selected);
    const back = new URLSearchParams(params.toString());
    back.delete("f");
    return shell(
      <>
        <Link href={`/learn/kanji/families?${back}`} className="text-sm text-[var(--muted-foreground)] hover:underline">
          ← Gia đình Kanji
        </Link>
        {!family ? (
          <p className="mt-4 text-sm text-[var(--muted-foreground)]">Không có gia đình này.</p>
        ) : (
          <>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--foreground)]">
              Gia đình “<span lang="ja">{family.head}</span>”{family.hanViet && ` · ${family.hanViet}`}
            </h1>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {family.members.length} chữ có chung thành phần <span lang="ja">{family.head}</span>.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={studyHref("study", family.head)} className={primaryButton}>
                Học flashcard
              </Link>
              <Link href={studyHref("review", family.head)} className={secondaryButton}>
                Ôn tập
              </Link>
            </div>
            <MasteryLegend className="mt-4" />
            <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {family.members.map((m) => {
                const inner = (
                  <>
                    <div lang="ja" className="text-4xl text-[var(--foreground)]">
                      {m.char}
                    </div>
                    <div className="mt-1 text-xs font-semibold uppercase text-[var(--accent)]">
                      {splitHanViet(m.hanViet).join(" · ") || "—"}
                    </div>
                    <div className="mt-1 text-[10px] text-[var(--muted-foreground)]">{m.level || "chưa có"}</div>
                  </>
                );
                const box = "rounded-2xl border-2 border-[var(--border)] p-4 text-center";
                return m.level ? (
                  <Link
                    key={m.char}
                    href={`/learn/kanji/${encodeURIComponent(m.char)}`}
                    className={`${box} bg-[var(--background-1)] transition-colors hover:bg-[var(--layer-hover)]`}
                    style={masteryStyle(mastery, m.char)}
                    title={masteryLabel(mastery, m.char)}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div key={m.char} className={`${box} border-dashed opacity-60`}>
                    {inner}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </>,
    );
  }

  const q = fold(query);
  const shown = families.filter(
    (f) =>
      (!level || f.members.some((m) => m.level === level)) &&
      (!q ||
        f.head === query.trim() ||
        fold(f.hanViet).startsWith(q) ||
        f.members.some(
          (m) => m.char === query.trim() || splitHanViet(m.hanViet).some((h) => fold(h).startsWith(q)),
        )),
  );
  // The API lists the families A–Z already.
  if (sort === "default") shown.sort(byLevel);
  const charCount = new Set(shown.flatMap((f) => f.members.map((m) => m.char))).size;

  return shell(
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">Gia đình Kanji</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Những chữ có chung một phần gốc được gom lại thành một gia đình: cùng nhìn, cùng so sánh để không
            nhầm giữa các chữ giống nhau.
          </p>
        </div>
        <p className="text-sm tabular-nums text-[var(--muted-foreground)]">
          {shown.length} gia đình · {charCount} chữ
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {["", ...LEVELS].map((l) => (
          <button
            key={l || "all"}
            type="button"
            aria-pressed={level === l}
            onClick={() => setParam("level", l)}
            className={chip(level === l)}
          >
            {l || "Tất cả"}
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm chữ hoặc Hán Việt"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background-1)] px-3 py-1.5 text-sm sm:w-56"
        />
        <div role="group" aria-label="Sắp xếp" className="flex items-center gap-1 sm:ml-auto">
          <span className="mr-1 text-sm text-[var(--muted-foreground)]">Sắp xếp</span>
          <button type="button" aria-pressed={sort === "default"} onClick={() => setParam("sort", "default")} className={chip(sort === "default")}>
            Mặc định
          </button>
          <button type="button" aria-pressed={sort === "az"} onClick={() => setParam("sort", "")} className={chip(sort === "az")}>
            A–Z Hán Việt
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={studyHref("study", "all")} className={primaryButton}>
          Học flashcard A–Z mọi gia đình
        </Link>
        <Link href={studyHref("review", "all")} className={secondaryButton}>
          Ôn tập
        </Link>
      </div>

      <MasteryLegend />

      {shown.length === 0 && (
        <p className="mt-6 text-sm text-[var(--muted-foreground)]">Không có gia đình nào khớp bộ lọc.</p>
      )}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {shown.map((f) => {
          const next = new URLSearchParams(params.toString());
          next.set("f", f.head);
          return (
            <Link
              key={f.head}
              href={`/learn/kanji/families?${next}`}
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
                      className="inline-block rounded border-2 border-transparent"
                      style={masteryStyle(mastery, m.char)}
                    >
                      {m.char}
                    </span>
                  ))}
                </div>
                <div className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                  {f.members.length} chữ · {levelsOf(f).join(", ")}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </>,
  );
}
