"use client";

import type { ReactNode } from "react";
import { JaText } from "@/components/learn/grammar-detail";
import {
  BOOKS,
  LEVELS,
  VIEWS,
  bookUnits,
  inCategory,
  sectionGrammar,
  selectGrammar,
  type BrowseState,
  type GrammarIndexItem,
} from "@/lib/grammar-catalog";

const chip = (active: boolean) =>
  `shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
    active
      ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
      : "border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
  }`;

const card =
  "rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4 text-left transition enabled:hover:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50";

interface Props {
  items: GrammarIndexItem[];
  state: BrowseState;
  onChange: (next: BrowseState) => void;
  renderRow: (item: GrammarIndexItem) => ReactNode;
  /** Extra controls beside a section title (admin: select the section). */
  sectionAction?: (items: GrammarIndexItem[]) => ReactNode;
  /** Controls shown next to the result count. */
  actions?: ReactNode;
}

/** Browse grammar by level, theme, context or textbook; used by learners and admins. */
export function GrammarExplorer({ items, state, onChange, renderRow, sectionAction, actions }: Props) {
  const view = VIEWS.find((v) => v.id === state.view)!;
  const selected = view.list.find((c) => c.id === state.id);
  const listing = state.view === "search" || !!selected;
  const results = selectGrammar(items, state);
  const sections = sectionGrammar(results, state);
  const set = (patch: Partial<BrowseState>) => onChange({ ...state, ...patch });

  return (
    <div>
      <nav aria-label="Cách phân loại" className="flex gap-2 overflow-x-auto border-b border-[var(--border)] pb-3">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-current={state.view === v.id ? "page" : undefined}
            onClick={() => onChange({ view: v.id, id: "", unit: "", level: "", q: "" })}
            className={chip(state.view === v.id)}
          >
            {v.label}
          </button>
        ))}
      </nav>

      {!listing && (
        <div className={`mt-5 grid gap-3 ${state.view === "book" ? "sm:grid-cols-2" : "grid-cols-2 lg:grid-cols-3"}`}>
          {view.list.map((c) => {
            const inside = items.filter((i) => inCategory(i, state.view, c.id));
            const units = state.view === "book" ? bookUnits(items, c.id).length : 0;
            return (
              <button key={c.id} type="button" disabled={!inside.length} onClick={() => set({ id: c.id, unit: "", level: "", q: "" })} className={card}>
                <span className={`block font-bold text-[var(--primary)] ${state.view === "level" ? "text-3xl" : "text-lg"}`}>{c.ja}</span>
                <span className="mt-1 block text-sm font-medium text-[var(--foreground)]">{c.vi}</span>
                <span className="mt-2 block text-xs text-[var(--muted-foreground)]">
                  {inside.length ? `${units ? `${units} bài · ` : ""}${inside.length} mẫu` : "Chưa mở"}
                </span>
                {state.view !== "level" && !!inside.length && (
                  <span className="mt-2 flex flex-wrap gap-1">
                    {LEVELS.map((l) => {
                      const n = inside.filter((i) => i.level === l.id).length;
                      return n ? (
                        <span key={l.id} className="rounded bg-[var(--background)] px-1.5 py-0.5 text-[11px] text-[var(--muted-foreground)]">
                          {l.id} {n}
                        </span>
                      ) : null;
                    })}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {listing && (
        <div className="mt-5 space-y-4">
          {selected && (
            <div>
              <button type="button" onClick={() => set({ id: "", unit: "", level: "", q: "" })} className="text-sm text-[var(--primary)]">
                ← Tất cả {view.label.toLowerCase()}
              </button>
              <h2 className="mt-2 text-2xl font-bold text-[var(--foreground)]">
                {state.view === "level" ? `Ngữ pháp ${selected.id}` : selected.vi}
              </h2>
              <p className="text-sm text-[var(--muted-foreground)]">{state.view === "level" ? selected.vi : selected.ja}</p>
            </div>
          )}

          {state.view === "level" && (
            <div className="flex gap-2 overflow-x-auto">
              {LEVELS.map((l) => (
                <button key={l.id} type="button" onClick={() => set({ id: l.id, q: "" })} className={chip(state.id === l.id)}>{l.id}</button>
              ))}
            </div>
          )}
          {state.view === "book" && (
            <div role="group" aria-label={`Bài trong ${BOOKS.find((b) => b.id === state.id)?.vi ?? ""}`} className="flex gap-2 overflow-x-auto pb-1">
              <button type="button" onClick={() => set({ unit: "" })} className={chip(!state.unit)}>Mọi bài</button>
              {bookUnits(items, state.id).map((u) => (
                <button key={u} type="button" onClick={() => set({ unit: u })} className={chip(state.unit === u)}>{u}</button>
              ))}
            </div>
          )}
          {state.view !== "level" && state.view !== "book" && (
            <div className="flex gap-2 overflow-x-auto">
              {[{ id: "" }, ...LEVELS].map((l) => (
                <button key={l.id} type="button" onClick={() => set({ level: l.id })} className={chip(state.level === l.id)}>{l.id || "Mọi cấp"}</button>
              ))}
            </div>
          )}

          <label className="block">
            <span className="sr-only">Tìm ngữ pháp</span>
            <input
              value={state.q}
              onChange={(e) => set({ q: e.target.value })}
              placeholder="Tìm mẫu câu hoặc nghĩa…"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--background-1)] px-4 py-2.5 text-sm outline-none focus:border-[var(--primary)]"
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p aria-live="polite" className="text-sm text-[var(--muted-foreground)]">{results.length} mẫu</p>
            {actions}
          </div>

          {!results.length && <p className="py-10 text-center text-sm text-[var(--muted-foreground)]">Không tìm thấy mẫu phù hợp.</p>}
          {sections.map((section) => (
            <section key={section.key}>
              {section.title && (
                <div className="mb-2 mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="text-base font-bold text-[var(--foreground)]">{section.title}</h3>
                  {section.ja && <span className="text-sm text-[var(--muted-foreground)]"><JaText text={section.ja} /></span>}
                  <span className="text-xs text-[var(--muted-foreground)]">{section.items.length} mẫu</span>
                  {sectionAction?.(section.items)}
                </div>
              )}
              <ul className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--background-1)]">
                {section.items.map((item) => <li key={item._id}>{renderRow(item)}</li>)}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
