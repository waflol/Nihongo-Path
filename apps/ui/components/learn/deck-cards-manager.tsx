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
import { LevelSelect } from "@/components/learn/level-select";
import { CategoryChip } from "@/components/learn/category-filter";
import { useHanVietPref } from "@/lib/use-han-viet-pref";
import { AiUnusedExamples } from "@/components/learn/ai-unused-examples";

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
}

interface PageData {
  items: PageCard[];
  total: number;
  missingExamples: number;
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

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [bulkTag, setBulkTag] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [showHanViet, toggleHanViet] = useHanVietPref();

  // Deck info editor (rename / level / category / summary).
  const [editInfo, setEditInfo] = useState(false);
  const [info, setInfo] = useState({ title: "", level: "", category: "", summary: "" });
  const [infoBusy, setInfoBusy] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);

  const canWrite = mode === "admin" || (deck !== null && !deck.shared);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

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
  }, [deckId, page, q, tag, missing, version]);

  /** Queue every card without an example: Tatoeba first, the AI when nothing is found. */
  async function generateExamples() {
    setAiBusy(true);
    setNotice(null);
    const res = await fetch(`/api/flashcards/import/examples/${deckId}/retry`, { method: "POST" }).catch(() => null);
    setAiBusy(false);
    if (!res?.ok) {
      setError("Không bắt đầu tạo ví dụ được — thử lại sau");
      return;
    }
    const body = (await res.json().catch(() => null)) as { remaining?: number } | null;
    setNotice(
      body?.remaining
        ? `Đang tạo ví dụ cho ${body.remaining} thẻ ở nền (Tatoeba, không có thì AI). Tải lại trang sau ít phút.`
        : "Mọi thẻ đều đã có ví dụ",
    );
    reload();
  }

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

  function setFilter(next: { tag?: string; missing?: boolean }) {
    if (next.tag !== undefined) setTag(next.tag);
    if (next.missing !== undefined) setMissing(next.missing);
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
          <HanVietToggle on={showHanViet} onToggle={toggleHanViet} />
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
          {canWrite && data && data.missingExamples > 0 && (
            <button
              type="button"
              className={btn}
              disabled={aiBusy}
              onClick={() => void generateExamples()}
              title="Tìm trên Tatoeba; không có thì nhờ AI dịch/viết câu"
            >
              {aiBusy ? "Đang xếp hàng…" : "✨ Tạo ví dụ bằng AI"}
            </button>
          )}
        </div>
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
            {total} thẻ{q || tag || missing ? " khớp bộ lọc" : ""}
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
      <div className="mt-4">
        {loading && !data && <p className="text-sm text-[var(--muted-foreground)]">Đang tải thẻ…</p>}
        {!loading && items.length === 0 && (
          <p className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
            {q || tag || missing ? "Không có thẻ nào khớp bộ lọc." : "Bộ này chưa có thẻ."}
          </p>
        )}
        <ul className={"space-y-3 transition-opacity " + (loading && data ? "opacity-60" : "")}>
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
          <nav className="mt-5 flex items-center justify-center gap-3" aria-label="Phân trang">
            <button type="button" className={btn} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ← Trước
            </button>
            <span className="text-sm text-[var(--muted-foreground)]">
              Trang {page}/{pages}
            </span>
            <button type="button" className={btn} disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Sau →
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
