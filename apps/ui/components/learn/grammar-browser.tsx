"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { JaText } from "@/components/learn/grammar-detail";
import { GrammarExplorer } from "@/components/learn/grammar-explorer";
import { browseQuery, parseBrowseState, type BrowseState, type GrammarIndexItem } from "@/lib/grammar-catalog";

/** Learner catalogue; the URL holds the position so back and sharing work. */
export function GrammarBrowser() {
  const router = useRouter();
  const state = parseBrowseState(useSearchParams());
  const [items, setItems] = useState<GrammarIndexItem[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/grammar/browse", { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<GrammarIndexItem[]>) : Promise.reject(new Error("request"))))
      .then(setItems)
      .catch((err: Error) => {
        if (err.name !== "AbortError") setError(true);
      });
    return () => controller.abort();
  }, []);

  function change(next: BrowseState) {
    const url = `/learn/grammar${browseQuery(next)}`;
    // Typing must not add a history entry per keystroke.
    if (next.q !== state.q) router.replace(url, { scroll: false });
    else router.push(url, { scroll: false });
  }

  const study = new URLSearchParams();
  if (state.view === "level" && state.id) study.set("level", state.id);
  if (state.view === "theme" && state.id) study.set("themeId", state.id);
  if (state.view === "context" && state.id) study.set("contextId", state.id);
  if (state.view === "book" && state.id) study.set("textbookId", state.id);
  if (state.view === "book" && state.unit) study.set("unitId", state.unit);
  if (state.level && state.view !== "level") study.set("level", state.level);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[var(--primary)]">文法 · BUNPOU</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[var(--foreground)]">Ngữ pháp tiếng Nhật</h1>
          {items && <p className="mt-1 text-sm text-[var(--muted-foreground)]">{items.length} mẫu đang mở</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/learn/grammar/practice" className="rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-[var(--primary-foreground)]">Luyện tập →</Link>
          <Link href={`/learn/grammar/study${study.size ? `?${study}` : ""}`} className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-semibold text-[var(--foreground)] hover:border-[var(--primary)] hover:text-[var(--primary)]">Học thẻ đã lưu →</Link>
        </div>
      </div>

      {error && <p className="rounded-xl border border-red-300 p-4 text-sm text-red-600">Không tải được dữ liệu ngữ pháp.</p>}
      {!error && !items && <p className="py-12 text-center text-sm text-[var(--muted-foreground)]">Đang tải…</p>}
      {items && (
        <GrammarExplorer
          items={items}
          state={state}
          onChange={change}
          renderRow={(item) => (
            <Link href={`/learn/grammar/${item._id}`} className="flex flex-col gap-1 px-4 py-3 transition hover:bg-[var(--background)] sm:flex-row sm:items-baseline sm:gap-4">
              <span className="flex min-w-0 items-baseline gap-2 sm:w-1/2">
                <span className="shrink-0 rounded bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--primary)]">{item.level}</span>
                <span className="text-lg font-semibold leading-loose text-[var(--foreground)]"><JaText text={item.label} /></span>
              </span>
              <span className="text-sm text-[var(--muted-foreground)] sm:flex-1">{item.meaning}</span>
            </Link>
          )}
        />
      )}
    </main>
  );
}
