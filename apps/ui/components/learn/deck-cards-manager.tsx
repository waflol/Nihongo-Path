"use client";

import { useConfirm } from "@/components/learn/use-confirm";
import Link from "next/link";
import { isJlptLevel } from "@/components/learn/level-select";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CardTile, HanVietToggle } from "@/components/learn/card-tile";
import { CardEditForm } from "@/components/learn/card-edit-form";
import { ExampleFields, cleanExampleInputs, type ExampleInput } from "@/components/learn/example-fields";
import { ReadingFields, type PartOfSpeech } from "@/components/learn/reading-fields";
import { ImageField } from "@/components/learn/image-field";
import { Icon } from "@/components/learn/icons";
import { RECHECK_PROGRESS_EVENT, RECHECK_STARTED_EVENT } from "@/components/learn/recheck-tracker";
import { LevelSelect } from "@/components/learn/level-select";
import { CategoryChip } from "@/components/learn/category-filter";
import { useHanVietPref } from "@/lib/use-han-viet-pref";
import { AiUnusedExamples } from "@/components/learn/ai-unused-examples";
import { RetryExamplesButton } from "@/components/learn/deck-processing";

/**
 * Full-page card manager for one deck: search, filter by tag / "no example",
 * edit, add, and tag many cards at once. Used by `/admin/decks/[id]` (shared
 * decks) and `/learn/decks/[id]` (a learner's own deck, read-only for shared
 * ones). All lists are paged + filtered on the server.
 */

interface Deck {
  _id: string;
  title: string;
  summary?: string;
  level?: string;
  category?: string;
  shared: boolean;
  cardCount: number;
}

interface PageCard {
  _id: string;
  front: string;
  back: string;
  reading?: string;
  image?: string;
  imageCredit?: string;
  partOfSpeech?: string;
  hanViet?: string;
  examples?: { sentence: string; translation?: string; source?: string }[];
  tags?: string[];
  origin?: string;
  order?: number;
  /** Import warnings: why this card should be double-checked. */
  reviewIssues?: string[];
  /** The warnings as actionable items: the field each is about and a suggested fix, if any. */
  reviewItems?: { text: string; field: "hanViet" | "reading" | "back"; fix?: string }[];
}

type ReviewField = "hanViet" | "reading" | "back";

/** The three kinds of check / warning, in the order the buttons show. */
const CHECKS: { field: ReviewField; checkLabel: string; warnLabel: string; hint: string }[] = [
  { field: "hanViet", checkLabel: "Kiểm tra Hán tự", warnLabel: "Hán Việt", hint: "Đối chiếu âm Hán Việt của mọi thẻ với bảng kanji admin" },
  { field: "reading", checkLabel: "Kiểm tra phát âm", warnLabel: "Cách đọc", hint: "Đối chiếu cách đọc với âm on/kun trong bảng kanji admin (AI chỉ xem những thẻ còn nghi ngờ)" },
  { field: "back", checkLabel: "Kiểm tra nghĩa", warnLabel: "Nghĩa", hint: "AI kiểm tra nghĩa tiếng Việt của mọi thẻ" },
];

interface PageData {
  items: PageCard[];
  total: number;
  missingExamples: number;
  needsReview?: number;
  needsReviewBy?: Record<ReviewField, number>;
  tags: { tag: string; count: number }[];
}

const PAGE_SIZE = 30;

const inputClass =
  "block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-focus)]";
const btn =
  "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[var(--border)] px-3 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--layer-hover)] disabled:opacity-60";
const primaryBtn =
  "inline-flex h-9 items-center justify-center rounded-lg bg-[var(--primary)] px-4 text-xs font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60";

const emptyForm = {
  front: "",
  back: "",
  reading: "",
  image: "",
  imageCredit: "",
  partOfSpeech: "" as PartOfSpeech | "",
  examples: [{ sentence: "", translation: "" }] as ExampleInput[],
  tags: "",
};

const splitTags = (v: string) =>
  v
    .split(/[;,]/)
    .map((t) => t.trim().replace(/^#/, ""))
    .filter(Boolean);

export function DeckCardsManager({ mode, deckId }: { mode: "admin" | "learn"; deckId: string }) {
  const { confirm, dialog } = useConfirm();
  const backHref = mode === "admin" ? "/admin/decks" : "/learn/decks";
  const importHref = mode === "admin" ? `/admin/import?deck=${deckId}` : `/learn/import?deck=${deckId}`;

  const [deck, setDeck] = useState<Deck | null>(null);
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const [page, setPage] = useState(1);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [missing, setMissing] = useState(false);
  const [review, setReview] = useState<"" | ReviewField>("");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [bulkTag, setBulkTag] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  // `?card=<id>` (from an admin error report): show just that card, ready to edit.
  const [focusCard, setFocusCard] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [showHanViet, toggleHanViet] = useHanVietPref();
  const [view, setView] = useState<"cards" | "table">("cards");
  useEffect(() => {
    try {
      if (window.localStorage.getItem("deck-view") === "table") setView("table");
    } catch {}
  }, []);
  function changeView(v: "cards" | "table") {
    setView(v);
    try {
      window.localStorage.setItem("deck-view", v);
    } catch {}
  }

  // Deck info editor (rename / level / category / summary).
  const [editInfo, setEditInfo] = useState(false);
  const [info, setInfo] = useState({ title: "", level: "", category: "", summary: "" });
  const [infoBusy, setInfoBusy] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);

  const canWrite = mode === "admin" || (deck !== null && !deck.shared);
  const [rechecking, setRechecking] = useState<ReviewField | null>(null);
  const [recheckMsg, setRecheckMsg] = useState<string | null>(null);
  // Off: cards unchanged since their last check are skipped (fast). On: judge every card again.
  const [recheckForce, setRecheckForce] = useState(false);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  /** Re-check one field (Hán Việt / reading / meaning) of every card → refreshes that kind of "Cần xem xét" warning. */
  async function recheckAll(field: ReviewField) {
    setRechecking(field);
    setRecheckMsg(null);
    try {
      const res = await fetch(`/api/flashcards/decks/${deckId}/recheck?field=${field}${recheckForce ? "&force=1" : ""}`, { method: "POST" });
      if (res.status === 409) setRecheckMsg("Đang có một lần kiểm tra khác chạy — đợi nó xong rồi thử lại.");
      else if (!res.ok) setRecheckMsg("Không bắt đầu kiểm tra lại được. Thử lại sau.");
      else window.dispatchEvent(new Event(RECHECK_STARTED_EVENT)); // progress shows bottom-right, on any page
    } catch {
      setRecheckMsg("Không bắt đầu kiểm tra lại được. Thử lại sau.");
    } finally {
      setRechecking(null);
    }
  }
  // Reload the warnings as the background run advances.
  useEffect(() => {
    window.addEventListener(RECHECK_PROGRESS_EVENT, reload);
    return () => window.removeEventListener(RECHECK_PROGRESS_EVENT, reload);
  }, [reload]);

  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("card");
    if (c) {
      setFocusCard(c);
      setEditingId(c);
    }
  }, []);

  function clearFocus() {
    setFocusCard(null);
    setEditingId(null);
    setPage(1);
    window.history.replaceState(null, "", window.location.pathname);
  }

  // Debounce the search box.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setQ(qInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [qInput]);

  // Deck header.
  useEffect(() => {
    let off = false;
    (async () => {
      const res = await fetch(`/api/flashcards/decks/${deckId}`, { cache: "no-store" }).catch(() => null);
      if (off) return;
      if (!res?.ok) {
        setError(res?.status === 404 || res?.status === 403 ? "Không tìm thấy bộ thẻ" : "Không tải được bộ thẻ");
        return;
      }
      setDeck((await res.json().catch(() => null)) as Deck | null);
    })();
    return () => {
      off = true;
    };
  }, [deckId, version]);

  // Cards of the current page / filter.
  useEffect(() => {
    let off = false;
    (async () => {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (q) params.set("q", q);
      if (tag) params.set("tag", tag);
      if (missing) params.set("missing", "1");
      if (review) params.set("review", review);
      if (focusCard) params.set("card", focusCard);
      const res = await fetch(`/api/flashcards/decks/${deckId}/cards/page?${params}`, {
        cache: "no-store",
      }).catch(() => null);
      if (off) return;
      setLoading(false);
      if (!res?.ok) {
        setError("Không tải được danh sách thẻ");
        return;
      }
      setData((await res.json().catch(() => null)) as PageData | null);
    })();
    return () => {
      off = true;
    };
  }, [deckId, page, q, tag, missing, review, focusCard, version]);

  async function openInfo() {
    if (!deck) return;
    setInfo({
      title: deck.title,
      level: deck.level ?? "",
      category: deck.category ?? "",
      summary: deck.summary ?? "",
    });
    setEditInfo(true);
    const res = await fetch(mode === "admin" ? "/api/flashcards/admin/decks" : "/api/flashcards/decks", {
      cache: "no-store",
    }).catch(() => null);
    const list = (await res?.json().catch(() => null)) as { category?: string }[] | null;
    if (Array.isArray(list)) {
      setCategories([...new Set(list.map((d) => d.category?.trim() ?? "").filter(Boolean))].sort());
    }
  }

  async function saveInfo(event: FormEvent) {
    event.preventDefault();
    if (info.title.trim() === "") return;
    if (!(await confirm({ title: "Lưu thay đổi?", message: "Thông tin bộ thẻ sẽ được cập nhật.", confirmLabel: "Lưu", tone: "primary" }))) return;
    setInfoBusy(true);
    setError(null);
    const res = await fetch(
      mode === "admin" ? `/api/flashcards/admin/decks/${deckId}` : `/api/flashcards/decks/${deckId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: info.title.trim(),
          level: info.level.trim(),
          category: info.category.trim(),
          summary: info.summary.trim(),
        }),
      },
    ).catch(() => null);
    setInfoBusy(false);
    if (!res?.ok) {
      setError("Không lưu được thông tin bộ thẻ");
      return;
    }
    setEditInfo(false);
    setNotice("Đã lưu thông tin bộ thẻ");
    reload();
  }

  function clearSelection() {
    setSelected(new Set());
    setAllMatching(false);
  }

  /** A reading warning being turned into a second card: which card, and the meaning typed for the new reading. */
  const [split, setSplit] = useState<{ cardId: string; meaning: string; busy: boolean } | null>(null);

  /** Same meaning, several readings: keep the suggested reading beside the current one (きのう / さくじつ). */
  async function addAltReading(card: PageCard, fix: string) {
    const merged = [card.reading ?? "", fix].filter(Boolean).join(" / ");
    const res = await fetch(`/api/flashcards/cards/${card._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reading: merged, resolve: "reading", learnReading: true }),
    }).catch(() => null);
    if (!res?.ok) {
      setError("Không thêm được cách đọc phụ");
      return;
    }
    reload();
  }

  /** A different meaning per reading: a new card with the same word, the suggested reading and its own meaning. */
  async function splitCard(card: PageCard, fix: string, meaning: string) {
    const back = meaning.trim();
    if (!back) return;
    setSplit((s) => (s ? { ...s, busy: true } : s));
    const created = await fetch("/api/flashcards/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deckId, front: card.front, back, reading: fix, tags: card.tags ?? [], ...(card.partOfSpeech ? { partOfSpeech: card.partOfSpeech } : {}) }),
    }).catch(() => null);
    if (!created?.ok) {
      setSplit(null);
      setError(created?.status === 409 ? "Đã có thẻ giống hệt trong bộ này" : "Không tách được thẻ mới");
      return;
    }
    const fresh = (await created.json().catch(() => null)) as { _id?: string } | null;
    // Both readings are now confirmed, each with its own meaning (the new card also gets the word's Hán Việt).
    const settle = (id: string, extra: object) =>
      fetch(`/api/flashcards/cards/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resolve: "reading", ...extra }) }).catch(() => null);
    await Promise.all([settle(card._id, {}), fresh?._id ? settle(fresh._id, card.hanViet ? { hanViet: card.hanViet } : {}) : null]);
    setSplit(null);
    reload();
  }

  /** Apply the suggested fix of one import warning, or just dismiss it (Bỏ qua). */
  async function resolveIssue(cardId: string, item: { field: "hanViet" | "reading" | "back"; fix?: string }, apply: boolean) {
    const res = await fetch(`/api/flashcards/cards/${cardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolve: item.field, ...(apply && item.fix ? { [item.field]: item.fix } : {}) }),
    }).catch(() => null);
    if (!res?.ok) {
      setError(apply ? "Không áp dụng được gợi ý" : "Không bỏ qua được cảnh báo");
      return;
    }
    reload();
  }

  /**
   * "Áp dụng tất cả" / "Bỏ qua tất cả": settle the warnings of the filtered kind in one go — for the
   * selected cards, or (nothing selected) every card that still has that warning under the current filters.
   */
  async function resolveBulk(action: "apply" | "dismiss") {
    if (!review) return;
    const useIds = !allMatching && selected.size > 0;
    const count = useIds ? selected.size : total;
    if (count === 0) return;
    const kind = { hanViet: "Hán Việt", reading: "cách đọc", back: "nghĩa" }[review];
    const scope = useIds ? `${count} thẻ đã chọn` : `${count} thẻ đang có cảnh báo ${kind}`;
    const ok = await confirm({
      title: action === "apply" ? "Áp dụng gợi ý hàng loạt?" : "Bỏ qua cảnh báo hàng loạt?",
      message:
        action === "apply"
          ? `Thay ${kind} theo gợi ý cho ${scope}. Thẻ không có gợi ý được giữ nguyên.`
          : `Giữ nguyên ${kind} và xoá cảnh báo cho ${scope}.${review === "reading" ? " Cách đọc đó sẽ được ghi nhớ là hợp lệ của từ." : ""}`,
      confirmLabel: action === "apply" ? "Áp dụng" : "Bỏ qua",
      tone: "primary",
    });
    if (!ok) return;
    setBulkBusy(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/flashcards/decks/${deckId}/cards/review/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        field: review,
        action,
        ...(useIds ? { ids: [...selected] } : { filter: { q: q || undefined, tag: tag || undefined, missing: missing || undefined } }),
      }),
    }).catch(() => null);
    setBulkBusy(false);
    if (!res?.ok) {
      setError(action === "apply" ? "Không áp dụng được hàng loạt" : "Không bỏ qua được hàng loạt");
      return;
    }
    const r = (await res.json().catch(() => null)) as { applied: number; dismissed: number; skipped: number; matched: number } | null;
    setNotice(
      action === "apply"
        ? `Đã áp dụng gợi ý cho ${r?.applied ?? 0} thẻ${r && r.skipped > 0 ? `, ${r.skipped} thẻ không có gợi ý` : ""}`
        : `Đã bỏ qua cảnh báo của ${r?.dismissed ?? 0} thẻ${r && r.skipped > 0 ? `, ${r.skipped} thẻ lỗi` : ""}`,
    );
    clearSelection();
    reload();
  }

  const FIELD_LABEL = { hanViet: "Hán Việt", reading: "Cách đọc", back: "Nghĩa" } as const;

  const reviewNote = (card: PageCard) => {
    const all = card.reviewItems ?? (card.reviewIssues ?? []).map((text) => ({ text, field: "back" as const, fix: undefined }));
    // Filtering on one kind of warning (Hán Việt / cách đọc / nghĩa) shows only that kind's lines.
    const items = review ? all.filter((it) => it.field === review) : all;
    if (items.length === 0) return null;
    return (
      <div className="mx-4 mb-4 mt-1 overflow-hidden rounded-xl border border-[#f59e0b]/40 bg-[#f59e0b]/10">
        <div className="flex items-center gap-2 border-b border-[#f59e0b]/25 px-3 py-1.5 text-xs font-semibold text-[#b45309] dark:text-[#fbbf24]">
          <span aria-hidden="true">⚠</span> Cần xem xét
        </div>
        <ul className="divide-y divide-[#f59e0b]/20">
          {items.map((it) => {
            const current = it.field === "hanViet" ? card.hanViet : it.field === "reading" ? card.reading : card.back;
            return (
              <li key={it.text} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-[#f59e0b]/20 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#b45309] dark:text-[#fbbf24]">
                      {FIELD_LABEL[it.field]}
                    </span>
                    <span className="text-xs text-[var(--muted-foreground)]">{it.text.replace(/ → đã tự sửa thành .*$/, "").replace(/ \(AI gợi ý: .*\)$/, "")}</span>
                  </div>
                  {it.fix && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                      <span className="rounded-md bg-[#ef4444]/10 px-2 py-0.5 font-medium text-[#dc2626] line-through decoration-[#dc2626]/60 dark:text-[#fca5a5]">
                        {current || "—"}
                      </span>
                      <span aria-hidden="true" className="text-[var(--muted-foreground)]">→</span>
                      <span className="rounded-md bg-[#22c55e]/15 px-2 py-0.5 font-semibold text-[#15803d] dark:text-[#86efac]">
                        ✨ {it.fix}
                      </span>
                      <span className="text-[11px] text-[var(--muted-foreground)]">gợi ý</span>
                    </div>
                  )}
                </div>
                {canWrite && (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {it.field === "reading" && it.fix && (
                      <>
                        <button
                          type="button"
                          onClick={() => void addAltReading(card, it.fix!)}
                          title="Cùng nghĩa, nhiều cách đọc: ghi cả hai cách đọc trên thẻ này"
                          className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--layer-hover)]"
                        >
                          ＋ Cách đọc phụ
                        </button>
                        <button
                          type="button"
                          onClick={() => setSplit({ cardId: card._id, meaning: "", busy: false })}
                          title="Mỗi cách đọc một nghĩa: tạo thẻ mới với cách đọc gợi ý"
                          className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--layer-hover)]"
                        >
                          ⎘ Tách thẻ mới
                        </button>
                      </>
                    )}
                    {it.fix && (
                      <button
                        type="button"
                        onClick={() => void resolveIssue(card._id, it, true)}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#16a34a] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#15803d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16a34a]"
                      >
                        ✓ Áp dụng
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void resolveIssue(card._id, it, false)}
                      className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs font-medium text-[var(--muted-foreground)] hover:bg-[var(--layer-hover)] hover:text-[var(--foreground)]"
                    >
                      Bỏ qua
                    </button>
                  </div>
                )}
                {canWrite && it.field === "reading" && it.fix && split?.cardId === card._id && (
                  <form
                    className="flex w-full flex-wrap items-center gap-2 text-sm"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void splitCard(card, it.fix!, split.meaning);
                    }}
                  >
                    <span className="text-xs text-[var(--muted-foreground)]">
                      Thẻ mới: <b>{card.front}</b> 【{it.fix}】 — nghĩa:
                    </span>
                    <input
                      autoFocus
                      value={split.meaning}
                      onChange={(e) => setSplit({ ...split, meaning: e.target.value })}
                      placeholder="Nghĩa của cách đọc này"
                      className="min-w-[12rem] flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm"
                    />
                    <button type="submit" disabled={split.busy || !split.meaning.trim()} className="rounded-lg bg-[#16a34a] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                      {split.busy ? "Đang tạo…" : "Tạo thẻ"}
                    </button>
                    <button type="button" onClick={() => setSplit(null)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted-foreground)]">
                      Hủy
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  function setFilter(next: { tag?: string; missing?: boolean; review?: "" | ReviewField }) {
    if (next.tag !== undefined) setTag(next.tag);
    if (next.missing !== undefined) setMissing(next.missing);
    if (next.review !== undefined) setReview(next.review);
    setPage(1);
    clearSelection();
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageAllSelected = items.length > 0 && items.every((c) => selected.has(c._id));
  const selectedCount = allMatching ? total : selected.size;

  function togglePage(on: boolean) {
    setAllMatching(false);
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of items) {
        if (on) next.add(c._id);
        else next.delete(c._id);
      }
      return next;
    });
  }

  async function runBulk(op: "add" | "remove") {
    const tags = splitTags(bulkTag);
    if (tags.length === 0 || selectedCount === 0) return;
    if (!(await confirm({ title: "Cập nhật thẻ đã chọn?", message: `${op === "add" ? "Thêm" : "Gỡ"} tag cho ${allMatching ? "mọi thẻ khớp bộ lọc" : `${selectedCount} thẻ đã chọn`}.`, confirmLabel: "Cập nhật", tone: "primary" }))) return;
    setBulkBusy(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/flashcards/decks/${deckId}/cards/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(allMatching
          ? { filter: { q: q || undefined, tag: tag || undefined, missing: missing || undefined } }
          : { ids: [...selected] }),
        [op]: tags,
      }),
    }).catch(() => null);
    setBulkBusy(false);
    if (!res?.ok) {
      setError("Không cập nhật được tag");
      return;
    }
    setNotice(
      `${op === "add" ? "Đã gắn" : "Đã gỡ"} ${tags.map((t) => "#" + t).join(" ")} cho ${selectedCount} thẻ`,
    );
    setBulkTag("");
    clearSelection();
    reload();
  }

  async function addCard(event: FormEvent) {
    event.preventDefault();
    setAdding(true);
    setError(null);
    const res = await fetch("/api/flashcards/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deckId,
        front: form.front,
        back: form.back,
        reading: form.reading.trim(),
        image: form.image,
        imageCredit: form.imageCredit,
        partOfSpeech: form.partOfSpeech,
        examples: cleanExampleInputs(form.examples),
        tags: form.tags ? splitTags(form.tags) : undefined,
        origin: "manual",
      }),
    }).catch(() => null);
    setAdding(false);
    if (!res) {
      setError("Không kết nối được API");
      return;
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      setError(body?.message ? `Lỗi: ${body.message}` : `Không thêm được thẻ (${res.status})`);
      return;
    }
    setFormKey((k) => k + 1);
    setForm(emptyForm);
    reload();
  }

  async function removeCard(cardId: string) {
    if (!(await confirm({ title: "Xoá thẻ?", message: "Tiến độ học trên thẻ cũng bị xoá. Không thể hoàn tác.", confirmLabel: "Xoá" }))) return;
    const res = await fetch(`/api/flashcards/cards/${cardId}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) reload();
    else setError("Xoá thẻ thất bại");
  }

  const exportHref =
    mode === "admin"
      ? `/api/flashcards/admin/decks/${deckId}/export`
      : `/api/flashcards/decks/${deckId}/export`;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      {dialog}
      <Link href={backHref} className="text-sm text-[var(--primary)] hover:underline">
        ← Về danh sách bộ thẻ
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
            {deck?.title ?? "Bộ thẻ"}
            {deck?.level && (
              <span className="ml-2 rounded-full bg-[var(--layer)] px-2 py-0.5 align-middle text-xs font-medium text-[var(--muted-foreground)]">
                {deck.level}
              </span>
            )}
            <span className="ml-2 align-middle">
              <CategoryChip category={deck?.category} />
            </span>
          </h1>
          {deck?.summary && <p className="mt-1 text-sm text-[var(--muted-foreground)]">{deck.summary}</p>}
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {deck ? `${deck.cardCount} thẻ` : ""}
            {data && data.missingExamples > 0 ? ` · ${data.missingExamples} thẻ chưa có ví dụ` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Chế độ xem" className="inline-flex overflow-hidden rounded-lg border border-[var(--border)] text-xs font-semibold">
            {(["cards", "table"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => changeView(v)}
                className={
                  "h-9 px-3 " +
                  (view === v
                    ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                    : "text-[var(--foreground)] hover:bg-[var(--layer-hover)]")
                }
              >
                {v === "cards" ? "Thẻ" : "Bảng"}
              </button>
            ))}
          </div>
          <HanVietToggle on={showHanViet} onToggle={toggleHanViet} />
          {mode === "learn" && (
            <Link href={`/learn/study?deck=${deckId}`} className={btn} title="Học bộ thẻ này">
              <Icon name="play" /> Học
            </Link>
          )}
          {canWrite && deck && (
            <button type="button" className={btn} onClick={() => (editInfo ? setEditInfo(false) : void openInfo())} aria-expanded={editInfo}>
              ✎ Đổi tên / phân loại
            </button>
          )}
          {canWrite && (
            <Link href={importHref} className={btn} title="Nhập từ CSV / XLSX">
              <Icon name="upload" /> Nhập file
            </Link>
          )}
          <a href={exportHref} download className={btn} title="Xuất toàn bộ thẻ ra CSV">
            <Icon name="download" /> Xuất CSV
          </a>
          {canWrite && (
            <button type="button" className={primaryBtn} onClick={() => setShowAdd((v) => !v)} aria-expanded={showAdd}>
              {showAdd ? "Đóng" : "＋ Thêm thẻ"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-4 rounded-lg bg-[#f0fdf4] px-4 py-3 text-sm text-[#15803d]">
          {notice}
        </p>
      )}

      {canWrite && editInfo && (
        <form onSubmit={saveInfo} className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Thông tin bộ thẻ</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="block text-sm sm:col-span-3">
              <span className="text-[var(--muted-foreground)]">Tên bộ thẻ</span>
              <input
                required
                value={info.title}
                onChange={(e) => setInfo((f) => ({ ...f, title: e.target.value }))}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--muted-foreground)]">Phân loại</span>
              <input
                value={info.category}
                onChange={(e) => setInfo((f) => ({ ...f, category: e.target.value }))}
                list="deck-category-list"
                className={`mt-1 ${inputClass}`}
                placeholder="Từ vựng, Kanji…"
              />
              <datalist id="deck-category-list">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <div className="block text-sm">
              <span className="text-[var(--muted-foreground)]">Cấp độ</span>
              <LevelSelect value={info.level} onChange={(lv) => setInfo((f) => ({ ...f, level: lv }))} />
            </div>
            <label className="block text-sm sm:col-span-3">
              <span className="text-[var(--muted-foreground)]">Mô tả ngắn</span>
              <input
                value={info.summary}
                onChange={(e) => setInfo((f) => ({ ...f, summary: e.target.value }))}
                className={`mt-1 ${inputClass}`}
              />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="submit" disabled={infoBusy || info.title.trim() === ""} className={primaryBtn}>
              {infoBusy ? "Đang lưu…" : "Lưu"}
            </button>
            <button type="button" className={btn} onClick={() => setEditInfo(false)}>
              Huỷ
            </button>
          </div>
        </form>
      )}

      {/* Add card */}
      {canWrite && showAdd && (
        <form onSubmit={addCard} className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Thêm thẻ vào bộ này</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-[var(--muted-foreground)]">Mặt trước (câu hỏi)</span>
              <input
                required
                value={form.front}
                onChange={(e) => setForm((f) => ({ ...f, front: e.target.value }))}
                className={`mt-1 ${inputClass}`}
                placeholder="猫"
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--muted-foreground)]">Mặt sau (đáp án)</span>
              <input
                required
                value={form.back}
                onChange={(e) => setForm((f) => ({ ...f, back: e.target.value }))}
                className={`mt-1 ${inputClass}`}
                placeholder="chú mèo"
              />
            </label>
            <ReadingFields
              key={formKey}
              front={form.front}
              reading={form.reading}
              partOfSpeech={form.partOfSpeech}
              onReading={(reading) => setForm((f) => ({ ...f, reading }))}
              onPartOfSpeech={(partOfSpeech) => setForm((f) => ({ ...f, partOfSpeech }))}
            />
            <ImageField
              key={`img-${formKey}`}
              term={form.front}
              image={form.image}
              credit={form.imageCredit}
              onChange={(image, imageCredit) => setForm((f) => ({ ...f, image, imageCredit }))}
            />
            <ExampleFields
              autoSuggest
              value={form.examples}
              onChange={(examples) => setForm((f) => ({ ...f, examples }))}
            />
            <label className="block text-sm sm:col-span-2">
              <span className="text-[var(--muted-foreground)]">Tags (tuỳ chọn, phân tách bằng dấu phẩy)</span>
              <input
                value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                className={`mt-1 ${inputClass}`}
                placeholder="động vật, N5"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={adding || form.front.trim() === "" || form.back.trim() === ""}
            className={`mt-3 ${primaryBtn}`}
          >
            {adding ? "Đang thêm…" : "Thêm thẻ"}
          </button>
        </form>
      )}

      {mode === "admin" && data && <AiUnusedExamples deckId={deckId} missing={data.missingExamples} />}

      {/* Filters */}
      <div className="mt-5 space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Tìm theo từ, nghĩa, cách đọc, Hán Việt…"
            className={`${inputClass} min-w-56 flex-1`}
          />
          <button
            type="button"
            aria-pressed={missing}
            onClick={() => setFilter({ missing: !missing })}
            className={
              btn + (missing ? " border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-[var(--primary)]" : "")
            }
          >
            Chưa có ví dụ{data ? ` (${data.missingExamples})` : ""}
          </button>
          {CHECKS.map(({ field, warnLabel }) => {
            const n = data?.needsReviewBy?.[field] ?? 0;
            if (n === 0 && review !== field) return null;
            const on = review === field;
            return (
              <button
                key={`warn-${field}`}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter({ review: on ? "" : field })}
                className={btn + (on ? " border-[#f59e0b] bg-[#fffbeb] text-[#92400e] dark:bg-[#2a2008] dark:text-[#fcd34d]" : "")}
              >
                ⚠ {warnLabel} ({n})
              </button>
            );
          })}
          {canWrite &&
            CHECKS.map(({ field, checkLabel, hint }) => (
              <button
                key={`check-${field}`}
                type="button"
                className={btn}
                onClick={() => void recheckAll(field)}
                disabled={rechecking !== null}
                title={hint}
              >
                {rechecking === field ? "Đang bắt đầu…" : `↻ ${checkLabel}`}
              </button>
            ))}
          {canWrite && (
            <label className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]" title="Bỏ chọn: chỉ kiểm tra thẻ mới hoặc thẻ đã sửa từ lần kiểm tra trước (nhanh hơn)">
              <input type="checkbox" checked={recheckForce} onChange={(e) => setRecheckForce(e.target.checked)} />
              Kiểm tra lại cả thẻ đã kiểm tra
            </label>
          )}
          {canWrite && (
            <Link href={`${mode === "admin" ? "/admin/decks" : "/learn/decks"}/${deckId}/log`} className={btn} title="Xem những từ Hán Việt đã được cập nhật ở lần kiểm tra gần nhất">
              📋 Log Hán tự
            </Link>
          )}
          {canWrite && data && data.missingExamples > 0 && (
            <RetryExamplesButton deckId={deckId} className={btn} onChanged={reload} />
          )}
        </div>
        {recheckMsg && <p role="status" className="text-sm text-[var(--muted-foreground)]">{recheckMsg}</p>}
        {canWrite && review && total > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#f59e0b]/40 bg-[#f59e0b]/10 px-3 py-2 text-sm">
            <span className="text-xs font-medium text-[#b45309] dark:text-[#fbbf24]">
              {!allMatching && selected.size > 0 ? `${selected.size} thẻ đã chọn` : `Tất cả ${total} thẻ trong bộ lọc`}
            </span>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => void resolveBulk("apply")}
              className="inline-flex items-center gap-1 rounded-lg bg-[#16a34a] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#15803d] disabled:opacity-60"
            >
              {bulkBusy ? "Đang xử lý…" : "✓ Áp dụng gợi ý tất cả"}
            </button>
            <button type="button" disabled={bulkBusy} onClick={() => void resolveBulk("dismiss")} className={btn}>
              Bỏ qua tất cả
            </button>
          </div>
        )}
        {data && data.tags.length > 0 && (
          <div className="flex max-h-28 flex-wrap items-center gap-1.5 overflow-y-auto">
            <span className="mr-1 text-xs font-medium text-[var(--muted-foreground)]">Tag:</span>
            <button
              type="button"
              onClick={() => setFilter({ tag: "" })}
              aria-pressed={tag === ""}
              className={chip(tag === "")}
            >
              Tất cả
            </button>
            {data.tags.map((t) => (
              <button
                key={t.tag}
                type="button"
                onClick={() => setFilter({ tag: tag === t.tag ? "" : t.tag })}
                aria-pressed={tag === t.tag}
                className={chip(tag === t.tag)}
              >
                {isJlptLevel(t.tag) ? t.tag.toUpperCase() : "#" + t.tag} <span className="opacity-70">{t.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selection / bulk tagging */}
      {canWrite && items.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <label className="inline-flex items-center gap-2 text-[var(--foreground)]">
            <input
              type="checkbox"
              checked={pageAllSelected || allMatching}
              onChange={(e) => togglePage(e.target.checked)}
              className="size-4 accent-[var(--primary)]"
            />
            Chọn cả trang
          </label>
          {pageAllSelected && !allMatching && total > items.length && (
            <button type="button" onClick={() => setAllMatching(true)} className="text-[var(--primary)] hover:underline">
              Chọn tất cả {total} thẻ khớp bộ lọc
            </button>
          )}
          <span className="text-[var(--muted-foreground)]">
            {total} thẻ{q || tag || missing || review ? " khớp bộ lọc" : ""}
          </span>
        </div>
      )}
      {canWrite && selectedCount > 0 && (
        <div className="sticky top-2 z-10 mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--primary)] bg-[var(--background)] p-3 shadow-md">
          <span className="text-sm font-semibold text-[var(--foreground)]">Đã chọn {selectedCount} thẻ</span>
          <input
            value={bulkTag}
            onChange={(e) => setBulkTag(e.target.value)}
            placeholder="tag (nhiều tag: cách nhau dấu phẩy)"
            list="deck-tag-list"
            className={`${inputClass} min-w-48 flex-1`}
          />
          <datalist id="deck-tag-list">
            {data?.tags.map((t) => <option key={t.tag} value={t.tag} />)}
          </datalist>
          <button type="button" disabled={bulkBusy || splitTags(bulkTag).length === 0} onClick={() => void runBulk("add")} className={primaryBtn}>
            Gắn tag
          </button>
          <button type="button" disabled={bulkBusy || splitTags(bulkTag).length === 0} onClick={() => void runBulk("remove")} className={btn}>
            Gỡ tag
          </button>
          <button type="button" onClick={clearSelection} className={btn}>
            Bỏ chọn
          </button>
        </div>
      )}

      {/* Cards */}
      {focusCard && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] px-4 py-2.5 text-sm text-[var(--foreground)]">
          <span>Đang xem thẻ được báo lỗi — sửa rồi lưu, sau đó đánh dấu “Đã sửa” ở trang báo lỗi.</span>
          <button type="button" onClick={clearFocus} className="font-semibold text-[var(--primary)] hover:underline">
            Xem cả bộ thẻ
          </button>
        </div>
      )}
      <div className="mt-4">
        {loading && !data && <p className="text-sm text-[var(--muted-foreground)]">Đang tải thẻ…</p>}
        {!loading && items.length === 0 && (
          <p className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
            {q || tag || missing || review ? "Không có thẻ nào khớp bộ lọc." : "Bộ này chưa có thẻ."}
          </p>
        )}
        {view === "table" && items.length > 0 && (
          <div className={"overflow-x-auto rounded-2xl border border-[var(--border)] transition-opacity " + (loading && data ? "opacity-60" : "")}>
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="bg-[var(--layer)] text-xs text-[var(--muted-foreground)]">
                <tr>
                  {canWrite && (
                    <th className="w-10 px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label="Chọn cả trang"
                        checked={pageAllSelected || allMatching}
                        onChange={(e) => togglePage(e.target.checked)}
                        className="size-4 accent-[var(--primary)]"
                      />
                    </th>
                  )}
                  <th className="w-10 px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Mặt trước</th>
                  <th className="px-3 py-2 font-medium">Cách đọc</th>
                  {showHanViet && <th className="px-3 py-2 font-medium">Hán Việt</th>}
                  <th className="px-3 py-2 font-medium">Mặt sau</th>
                  <th className="px-3 py-2 font-medium">Loại từ</th>
                  <th className="px-3 py-2 font-medium">Ví dụ</th>
                  <th className="px-3 py-2 font-medium">Tags</th>
                  {canWrite && <th className="w-28 px-3 py-2" />}
                </tr>
              </thead>
              <tbody>
                {items.map((card, i) =>
                  editingId === card._id ? (
                    <tr key={card._id} className="border-t border-[var(--border)]">
                      <td colSpan={20} className="bg-[var(--background)] p-4">
                        <CardEditForm
                          card={card}
                          onCancel={() => setEditingId(null)}
                          onError={setError}
                          onSaved={() => {
                            setEditingId(null);
                            setError(null);
                            reload();
                          }}
                        />
                      </td>
                    </tr>
                  ) : (
                    <tr key={card._id} className="border-t border-[var(--border)] align-top hover:bg-[var(--layer-hover)]">
                      {canWrite && (
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            aria-label="Chọn thẻ"
                            checked={allMatching || selected.has(card._id)}
                            onChange={(e) => {
                              const on = e.target.checked;
                              setAllMatching(false);
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (on) next.add(card._id);
                                else next.delete(card._id);
                                return next;
                              });
                            }}
                            className="size-4 accent-[var(--primary)]"
                          />
                        </td>
                      )}
                      <td className="px-3 py-2 text-xs text-[var(--muted-foreground)]">{(page - 1) * PAGE_SIZE + i + 1}</td>
                      <td className="px-3 py-2 text-base font-semibold text-[var(--foreground)]">
                        {card.front}
                        {reviewNote(card)}
                      </td>
                      <td className="px-3 py-2 text-[var(--foreground)]">{card.reading ?? ""}</td>
                      {showHanViet && <td className="px-3 py-2 text-[var(--foreground)]">{card.hanViet ?? ""}</td>}
                      <td className="px-3 py-2 text-[var(--foreground)]">{card.back}</td>
                      <td className="px-3 py-2 text-xs text-[var(--muted-foreground)]">{card.partOfSpeech ?? ""}</td>
                      <td className="max-w-64 px-3 py-2 text-xs text-[var(--muted-foreground)]">
                        {card.examples && card.examples.length > 0 ? (
                          <span title={card.examples.map((e) => e.sentence).join("\n")} className="line-clamp-2">
                            {card.examples[0].sentence}
                            {card.examples.length > 1 ? ` (+${card.examples.length - 1})` : ""}
                          </span>
                        ) : (
                          <span className="text-[#b45309]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {(card.tags ?? []).map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setFilter({ tag: t })}
                              className="rounded-full bg-[var(--layer)] px-2 py-0.5 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                            >
                              {isJlptLevel(t) ? t.toUpperCase() : "#" + t}
                            </button>
                          ))}
                        </div>
                      </td>
                      {canWrite && (
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1.5">
                            <button type="button" onClick={() => setEditingId(card._id)} className={btn}>
                              Sửa
                            </button>
                            <button
                              type="button"
                              onClick={() => void removeCard(card._id)}
                              title="Xoá thẻ"
                              aria-label="Xoá thẻ"
                              className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--destructive)] text-[var(--destructive)] hover:bg-[#fef2f2] dark:hover:bg-[#2a1215]"
                            >
                              <Icon name="trash" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
        <ul className={"space-y-3 transition-opacity " + (loading && data ? "opacity-60" : "") + (view === "table" ? " hidden" : "")}>
          {items.map((card, i) =>
            editingId === card._id ? (
              <li key={card._id} className="rounded-2xl border border-[var(--primary)] bg-[var(--background)] p-4 shadow-sm">
                <CardEditForm
                  card={card}
                  onCancel={() => setEditingId(null)}
                  onError={setError}
                  onSaved={() => {
                    setEditingId(null);
                    setError(null);
                    reload();
                  }}
                />
              </li>
            ) : (
              <CardTile
                key={card._id}
                card={card}
                index={(page - 1) * PAGE_SIZE + i}
                showHanViet={showHanViet}
                selected={allMatching || selected.has(card._id)}
                onSelect={
                  canWrite
                    ? (on) => {
                        setAllMatching(false);
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (on) next.add(card._id);
                          else next.delete(card._id);
                          return next;
                        });
                      }
                    : undefined
                }
                onTagClick={(t) => setFilter({ tag: t })}
                note={reviewNote(card)}
                actions={
                  canWrite ? (
                    <>
                      <button type="button" onClick={() => setEditingId(card._id)} className={btn}>
                        Sửa
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeCard(card._id)}
                        title="Xoá thẻ"
                        aria-label="Xoá thẻ"
                        className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--destructive)] text-[var(--destructive)] hover:bg-[#fef2f2] dark:hover:bg-[#2a1215]"
                      >
                        <Icon name="trash" />
                      </button>
                    </>
                  ) : undefined
                }
              />
            ),
          )}
        </ul>

        {pages > 1 && (
          <nav className="mt-6 flex items-center justify-center gap-2" aria-label="Phân trang">
            <button
              type="button"
              className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--layer-hover)] disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              aria-label="Trang trước"
            >
              ←
            </button>
            <form
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--background-1)] px-3 text-sm text-[var(--muted-foreground)] focus-within:border-[var(--primary-focus)] focus-within:ring-1 focus-within:ring-[var(--primary-focus)]"
              onSubmit={(e) => {
                e.preventDefault();
                const n = Number(new FormData(e.currentTarget).get("page"));
                if (Number.isFinite(n)) setPage(Math.min(pages, Math.max(1, Math.trunc(n))));
              }}
            >
              <span>Trang</span>
              <input
                key={page}
                name="page"
                type="number"
                inputMode="numeric"
                min={1}
                max={pages}
                defaultValue={page}
                aria-label="Nhập số trang rồi nhấn Enter"
                title="Nhập số trang rồi nhấn Enter"
                onFocus={(e) => e.currentTarget.select()}
                className="w-12 bg-transparent text-center font-semibold text-[var(--foreground)] [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span>/ {pages}</span>
            </form>
            <button
              type="button"
              className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--layer-hover)] disabled:opacity-40"
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Trang sau"
            >
              →
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}

function chip(active: boolean) {
  return (
    "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors " +
    (active
      ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-[var(--primary)]"
      : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--layer-hover)] hover:text-[var(--foreground)]")
  );
}
