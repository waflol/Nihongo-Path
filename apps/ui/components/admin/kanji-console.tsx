"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  KANJI_LEVELS,
  splitHanViet,
  type KanjiItem,
  type KanjiPage,
  type KanjiWord,
} from "@/components/learn/kanji-types";
import { StrokeOrder } from "@/components/learn/stroke-order";
import { useConfirm } from "@/components/learn/use-confirm";
import { hanVietReadings } from "@/lib/han-viet";
import { KanjiGroups } from "@/components/learn/kanji-groups";

interface LevelSummary {
  level: string;
  total: number;
  published: number;
  draft: number;
  withHanViet: number;
  withMeaning: number;
  withMnemonic: number;
}

interface KanjiFormState {
  isNew: boolean;
  /** The stored key; `char` may be edited to rename it. */
  originalChar: string;
  char: string;
  level: string;
  rank: number;
  hanVietList: string[];
  hanVietDraft: string;
  onyomi: string;
  kunyomi: string;
  strokeCount: number;
  strokes?: string[];
  meanings: string;
  meaningsEn: string;
  mnemonic: string;
  radicals: string;
  words: KanjiWord[];
  status: "DRAFT" | "PUBLISHED";
}

const LIMIT = 40;
const fieldClass =
  "rounded-lg border border-[var(--border)] bg-[var(--background-1)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-focus)]";

function splitList(raw: string): string[] {
  return raw
    .split(/[,、;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function emptyForm(defaultLevel = "N5"): KanjiFormState {
  return {
    isNew: true,
    originalChar: "",
    char: "",
    level: KANJI_LEVELS.includes(defaultLevel as (typeof KANJI_LEVELS)[number]) ? defaultLevel : "N5",
    rank: 0,
    hanVietList: [],
    hanVietDraft: "",
    onyomi: "",
    kunyomi: "",
    strokeCount: 0,
    strokes: [],
    meanings: "",
    meaningsEn: "",
    mnemonic: "",
    radicals: "",
    words: [],
    status: "DRAFT",
  };
}

function itemToForm(k: KanjiItem): KanjiFormState {
  return {
    isNew: false,
    originalChar: k.char,
    char: k.char,
    level: k.level ?? "",
    rank: k.rank ?? 0,
    hanVietList: splitHanViet(k.hanViet),
    hanVietDraft: "",
    onyomi: (k.onyomi ?? []).join(", "),
    kunyomi: (k.kunyomi ?? []).join(", "),
    strokeCount: k.strokeCount ?? 0,
    strokes: k.strokes,
    meanings: (k.meanings ?? []).join(", "),
    meaningsEn: (k.meaningsEn ?? []).join(", "),
    mnemonic: k.mnemonic ?? "",
    radicals: (k.radicals ?? []).join(", "),
    words: (k.words ?? []).map((w) => ({
      term: w.term ?? "",
      reading: w.reading ?? "",
      meaning: w.meaning ?? "",
      glossEn: w.glossEn ?? "",
      chars: w.chars ?? [...(w.term ?? "")],
      level: w.level,
    })),
    status: k.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
  };
}

const LEVEL_TABS = ["N5", "N4", "N3", "N2", "N1", "NONE", "ALL"];

/** `initialView` / `initialLevel` come from the URL (?view=groups&level=N2) so F5 keeps the screen. */
export function KanjiAdminConsole({
  initialView,
  initialLevel,
}: {
  initialView?: string;
  initialLevel?: string;
}) {
  const { confirm, dialog } = useConfirm();
  const [levelTab, setLevelTab] = useState<string>(
    initialLevel && LEVEL_TABS.includes(initialLevel) ? initialLevel : "N5",
  );
  const [hanVietQuery, setHanVietQuery] = useState("");
  const [containsMatch, setContainsMatch] = useState(false);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [missingFilter, setMissingFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<"table" | "groups">(
    initialView === "groups" ? "groups" : "table",
  );

  const [data, setData] = useState<KanjiPage | null>(null);
  const [summaries, setSummaries] = useState<LevelSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [busyChar, setBusyChar] = useState<string | null>(null);

  const [editing, setEditing] = useState<KanjiFormState | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  // Keep the view and level in the URL so a refresh (F5) or shared link restores them.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (viewMode === "groups") url.searchParams.set("view", "groups");
    else url.searchParams.delete("view");
    if (levelTab !== "N5") url.searchParams.set("level", levelTab);
    else url.searchParams.delete("level");
    window.history.replaceState(window.history.state, "", url);
  }, [viewMode, levelTab]);

  const loadSummaries = useCallback(async () => {
    const res = await fetch("/api/admin/kanji/levels", { cache: "no-store" }).catch(() => null);
    if (res?.ok) {
      const rows = (await res.json().catch(() => [])) as LevelSummary[];
      if (Array.isArray(rows)) setSummaries(rows);
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    const grouped = viewMode === "groups";
    const buildParams = (pg: number) => {
      const params = new URLSearchParams({
        page: String(pg),
        limit: grouped ? "100" : String(LIMIT),
      });
      if (levelTab !== "ALL") params.set("level", levelTab);
      if (hanVietQuery.trim()) {
        params.set("hanViet", hanVietQuery.trim());
        if (containsMatch) params.set("contains", "1");
      }
      if (q.trim()) params.set("q", q.trim());
      if (statusFilter) params.set("status", statusFilter);
      if (missingFilter) params.set("missing", missingFilter);
      return params;
    };

    const res = await fetch(`/api/admin/kanji?${buildParams(grouped ? 1 : page)}`, {
      cache: "no-store",
    }).catch(() => null);
    if (!res) {
      setLoading(false);
      setError("Không kết nối được máy chủ API.");
      return;
    }
    if (res.status === 401 || res.status === 403) {
      setLoading(false);
      setError("Tài khoản không có quyền quản trị Kanji.");
      return;
    }
    if (!res.ok) {
      setLoading(false);
      setError("Không tải được danh sách Kanji.");
      return;
    }
    const pageData = (await res.json()) as KanjiPage;
    if (grouped) {
      // Group view shows the whole result set: pull the remaining pages (max 100 each).
      const lastPage = Math.min(30, Math.ceil(pageData.total / 100));
      const rest = await Promise.all(
        Array.from({ length: Math.max(0, lastPage - 1) }, (_, i) =>
          fetch(`/api/admin/kanji?${buildParams(i + 2)}`, { cache: "no-store" })
            .then((r) => (r.ok ? (r.json() as Promise<KanjiPage>) : null))
            .catch(() => null),
        ),
      );
      pageData.items = [...pageData.items, ...rest.flatMap((r) => r?.items ?? [])];
    }
    setLoading(false);
    setData(pageData);
    setSelected(new Set());
    setError(null);
  }, [page, levelTab, hanVietQuery, containsMatch, q, statusFilter, missingFilter, viewMode]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadSummaries();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadSummaries]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadList();
    }, 200);
    return () => clearTimeout(timer);
  }, [loadList]);

  const byLevel = useMemo(
    () => Object.fromEntries(summaries.map((s) => [s.level || "NONE", s])),
    [summaries],
  );

  const currentStats = useMemo<LevelSummary>(() => {
    if (levelTab !== "ALL" && byLevel[levelTab]) return byLevel[levelTab];
    return summaries.reduce(
      (acc, s) => ({
        level: "ALL",
        total: acc.total + s.total,
        published: acc.published + s.published,
        draft: acc.draft + s.draft,
        withHanViet: acc.withHanViet + s.withHanViet,
        withMeaning: acc.withMeaning + s.withMeaning,
        withMnemonic: acc.withMnemonic + s.withMnemonic,
      }),
      { level: "ALL", total: 0, published: 0, draft: 0, withHanViet: 0, withMeaning: 0, withMnemonic: 0 },
    );
  }, [levelTab, byLevel, summaries]);

  async function openEdit(item: KanjiItem) {
    setEditing(itemToForm(item));
    setLoadingDetail(true);
    const res = await fetch(`/api/admin/kanji/${encodeURIComponent(item.char)}`, {
      cache: "no-store",
    }).catch(() => null);
    setLoadingDetail(false);
    if (res?.ok) {
      const detail = (await res.json()) as KanjiItem;
      setEditing(itemToForm(detail));
    }
  }

  function addHanVietReadings(raw: string) {
    if (!editing) return;
    const incoming = splitHanViet(raw).map((s) => s.toLocaleLowerCase("vi"));
    if (incoming.length === 0) return;
    const next = [...editing.hanVietList];
    for (const r of incoming) {
      if (!next.some((x) => x.toLocaleLowerCase("vi") === r)) {
        next.push(r);
      }
    }
    setEditing({ ...editing, hanVietList: next, hanVietDraft: "" });
  }

  function removeHanVietReading(target: string) {
    if (!editing) return;
    setEditing({
      ...editing,
      hanVietList: editing.hanVietList.filter((r) => r !== target),
    });
  }

  function promoteHanVietReading(idx: number) {
    if (!editing || idx <= 0) return;
    const next = [...editing.hanVietList];
    const [picked] = next.splice(idx, 1);
    next.unshift(picked);
    setEditing({ ...editing, hanVietList: next });
  }

  async function handleGenerateAi() {
    if (!editing || !editing.char.trim()) return;
    setAiBusy(true);
    setError(null);
    const res = await fetch(
      `/api/admin/kanji/${encodeURIComponent(editing.isNew ? editing.char.trim() : editing.originalChar)}/generate`,
      { method: "POST" },
    ).catch(() => null);
    setAiBusy(false);
    if (!res?.ok) {
      setError("Không gọi được AI gợi ý (kiểm tra cấu hình dịch vụ AI hoặc lưu chữ Kanji trước).");
      return;
    }
    const gen = (await res.json()) as {
      hanViet?: string;
      meanings?: string[];
      mnemonic?: string;
      words?: KanjiWord[];
    };
    setEditing((prev) => {
      if (!prev) return prev;
      const mergedHv = splitHanViet([prev.hanVietList.join("/"), gen.hanViet ?? ""].join("/"));
      const uniqueHv: string[] = [];
      for (const r of mergedHv) {
        const low = r.toLocaleLowerCase("vi");
        if (!uniqueHv.includes(low)) uniqueHv.push(low);
      }
      return {
        ...prev,
        hanVietList: uniqueHv.length > 0 ? uniqueHv : prev.hanVietList,
        meanings:
          prev.meanings.trim() || !gen.meanings?.length
            ? prev.meanings
            : gen.meanings.join(", "),
        mnemonic: gen.mnemonic || prev.mnemonic,
        words: gen.words?.length ? gen.words : prev.words,
      };
    });
    setNotice(`Đã điền gợi ý AI cho chữ ${editing.char}. Kiểm tra lại rồi bấm Lưu.`);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const char = editing.char.trim();
    if (!char) {
      setError("Vui lòng nhập chữ Kanji.");
      return;
    }
    const pendingHv = splitHanViet(editing.hanVietDraft).map((s) => s.toLocaleLowerCase("vi"));
    const allHv = [...editing.hanVietList];
    for (const r of pendingHv) {
      if (!allHv.some((x) => x.toLocaleLowerCase("vi") === r)) allHv.push(r);
    }

    const payload = {
      char,
      level: editing.level,
      rank: Number(editing.rank) || 0,
      hanViet: allHv.join("/"),
      onyomi: splitList(editing.onyomi),
      kunyomi: splitList(editing.kunyomi),
      strokeCount: Number(editing.strokeCount) || 0,
      meanings: splitList(editing.meanings),
      meaningsEn: splitList(editing.meaningsEn),
      mnemonic: editing.mnemonic.trim(),
      radicals: splitList(editing.radicals),
      words: editing.words
        .map((w) => ({
          term: w.term.trim(),
          reading: w.reading.trim(),
          meaning: w.meaning.trim(),
          glossEn: w.glossEn?.trim() || undefined,
          chars: w.chars?.length ? w.chars : [...w.term.trim()],
          level: w.level,
        }))
        .filter((w) => w.term.length > 0),
      status: editing.status,
    };

    setSaving(true);
    setError(null);
    const url = editing.isNew
      ? "/api/admin/kanji"
      : `/api/admin/kanji/${encodeURIComponent(editing.originalChar)}`;
    const method = editing.isNew ? "POST" : "PATCH";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    setSaving(false);

    if (!res?.ok) {
      const errBody = (await res?.json().catch(() => null)) as { message?: string | string[] } | null;
      const msg = Array.isArray(errBody?.message)
        ? errBody.message.join(", ")
        : errBody?.message || "Lưu Kanji thất bại.";
      setError(msg);
      return;
    }

    setNotice(`Đã lưu chữ Kanji “${char}” (${allHv.map((x) => x.toLocaleUpperCase("vi")).join(" · ") || "chưa có âm Hán Việt"}).`);
    setEditing(null);
    await Promise.all([loadList(), loadSummaries()]);
  }

  async function quickUpdateRow(char: string, patch: { status?: "DRAFT" | "PUBLISHED"; level?: string }) {
    setBusyChar(char);
    setError(null);
    const res = await fetch(`/api/admin/kanji/${encodeURIComponent(char)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => null);
    setBusyChar(null);
    if (!res?.ok) {
      setError(`Không cập nhật được chữ ${char}.`);
      return;
    }
    await Promise.all([loadList(), loadSummaries()]);
  }

  async function handleDelete(char: string) {
    const ok = await confirm({
      title: `Xoá chữ Kanji “${char}”?`,
      message: "Chữ Kanji này sẽ bị xoá khỏi cơ sở dữ liệu. Các thẻ flashcard đã tạo trước đó vẫn được giữ nguyên.",
      confirmLabel: "Xoá",
      tone: "danger",
    });
    if (!ok) return;
    setBusyChar(char);
    const res = await fetch(`/api/admin/kanji/${encodeURIComponent(char)}`, {
      method: "DELETE",
    }).catch(() => null);
    setBusyChar(null);
    if (!res?.ok && res?.status !== 204) {
      setError(`Không xoá được chữ ${char}.`);
      return;
    }
    setNotice(`Đã xoá chữ Kanji “${char}”.`);
    if (editing?.char === char) setEditing(null);
    await Promise.all([loadList(), loadSummaries()]);
  }

  async function handleBulk(patch: { status?: "DRAFT" | "PUBLISHED"; level?: string }, byLevelFilter?: string) {
    const chars = byLevelFilter ? undefined : [...selected];
    if (!byLevelFilter && (!chars || chars.length === 0)) return;
    const targetDesc = byLevelFilter
      ? `toàn bộ cấp ${byLevelFilter === "NONE" ? "Chưa phân cấp" : byLevelFilter}`
      : `${chars!.length} chữ Kanji đã chọn`;
    const actionDesc = patch.status
      ? patch.status === "PUBLISHED"
        ? "Xuất bản"
        : "Chuyển về bản nháp"
      : `Chuyển sang cấp ${patch.level || "Chưa phân cấp"}`;

    const ok = await confirm({
      title: `${actionDesc}?`,
      message: `Áp dụng cho ${targetDesc}.`,
      confirmLabel: "Xác nhận",
      tone: "primary",
    });
    if (!ok) return;

    setBulkBusy(true);
    setError(null);
    const res = await fetch("/api/admin/kanji/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chars,
        filterLevel: byLevelFilter,
        ...patch,
      }),
    }).catch(() => null);
    setBulkBusy(false);
    if (!res?.ok) {
      setError("Thao tác hàng loạt thất bại.");
      return;
    }
    const result = (await res.json().catch(() => ({ modifiedCount: 0 }))) as { modifiedCount?: number };
    setNotice(`Đã cập nhật ${result.modifiedCount ?? 0} chữ Kanji.`);
    await Promise.all([loadList(), loadSummaries()]);
  }

  const csvInput = useRef<HTMLInputElement>(null);
  const [csvBusy, setCsvBusy] = useState(false);

  /** Restore kanji from the backup the "Xuất Excel" button produced (or a CSV). */
  async function handleCsvFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const ok = await confirm({
      title: `Nhập file “${file.name}”?`,
      message:
        "Chữ Kanji trùng sẽ được cập nhật theo file, chữ mới sẽ được thêm. Ô từ vựng / nét vẽ để trống sẽ không xoá dữ liệu đang có.",
      confirmLabel: "Nhập",
      tone: "primary",
    });
    if (!ok) return;
    setCsvBusy(true);
    setError(null);
    const res = await fetch("/api/admin/kanji/import", {
      method: "POST",
      headers: {
        "Content-Type": file.name.toLowerCase().endsWith(".csv")
          ? "text/csv"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      body: file.name.toLowerCase().endsWith(".csv") ? await file.text() : await file.arrayBuffer(),
    }).catch(() => null);
    setCsvBusy(false);
    const body = (await res?.json().catch(() => null)) as
      | { created?: number; updated?: number; skipped?: number; errors?: { line: number; char: string; message: string }[]; message?: string | string[] }
      | null;
    if (!res?.ok || !body) {
      const m = body?.message;
      setError(`Nhập file thất bại${m ? `: ${Array.isArray(m) ? m.join(", ") : m}` : "."}`);
      return;
    }
    const bad = body.errors?.length
      ? ` Bỏ qua ${body.skipped}: ${body.errors.slice(0, 5).map((x) => `dòng ${x.line} (${x.char || "?"}) ${x.message}`).join("; ")}${body.errors.length > 5 ? "…" : ""}`
      : "";
    setNotice(`Đã nhập: thêm ${body.created ?? 0}, cập nhật ${body.updated ?? 0}.${bad}`);
    await Promise.all([loadList(), loadSummaries()]);
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / LIMIT));
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.char));

  const curatedSuggestions = useMemo(() => {
    if (!editing?.char.trim()) return [];
    const cur = new Set(editing.hanVietList.map((x) => x.toLocaleLowerCase("vi")));
    return hanVietReadings(editing.char.trim()).filter((r) => !cur.has(r.toLocaleLowerCase("vi")));
  }, [editing]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      {dialog}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            aria-hidden="true"
            className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--primary)] text-3xl font-medium text-white shadow-sm"
            lang="ja"
          >
            漢
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
              Quản lý Kanji N5–N1
            </h1>
            <p className="mt-0.5 max-w-2xl text-sm text-[var(--muted-foreground)]">
              Chữ Hán theo cấp JLPT, nhiều âm Hán Việt, nghĩa tiếng Việt và liên tưởng.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Chế độ xem"
            className="flex items-center gap-0.5 rounded-xl border border-[var(--border)] bg-[var(--layer)] p-0.5 text-xs font-semibold"
          >
            {(
              [
                { id: "table", label: "Bảng" },
                { id: "groups", label: "Nhóm 20 chữ" },
              ] as const
            ).map((v) => (
              <button
                key={v.id}
                type="button"
                aria-pressed={viewMode === v.id}
                onClick={() => setViewMode(v.id)}
                className={`rounded-[10px] px-3 py-1.5 transition-colors ${
                  viewMode === v.id
                    ? "bg-[var(--primary)] text-white shadow-sm"
                    : "text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <a
            href="/api/admin/kanji/export"
            download
            title="Tải toàn bộ chữ Kanji (cả từ vựng, nét vẽ) về file Excel để sao lưu"
            className="rounded-xl border border-[var(--border)] bg-[var(--background-1)] px-3.5 py-2 text-xs font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--layer-hover)]"
          >
            Xuất Excel
          </a>
          <button
            type="button"
            disabled={csvBusy}
            onClick={() => csvInput.current?.click()}
            title="Khôi phục / nhập chữ Kanji từ file Excel đã xuất (cả khi đổi database)"
            className="rounded-xl border border-[var(--border)] bg-[var(--background-1)] px-3.5 py-2 text-xs font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--layer-hover)] disabled:opacity-50"
          >
            {csvBusy ? "Đang nhập…" : "Nhập Excel"}
          </button>
          <input
            ref={csvInput}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={(e) => void handleCsvFile(e)}
          />
          <Link
            href="/learn/kanji"
            className="rounded-xl border border-[var(--border)] bg-[var(--background-1)] px-3.5 py-2 text-xs font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--layer-hover)]"
          >
            Xem trang học ↗
          </Link>
          <button
            type="button"
            onClick={() => setEditing(emptyForm(levelTab))}
            className="rounded-xl bg-[var(--primary)] px-4 py-2 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
          >
            + Thêm chữ Kanji
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Tổng số chữ", value: currentStats.total, of: 0, tone: "var(--primary)" },
          { label: "Đã xuất bản", value: currentStats.published, of: currentStats.total, tone: "#10b981" },
          { label: "Bản nháp", value: currentStats.draft, of: currentStats.total, tone: "#f59e0b" },
          { label: "Có Hán Việt", value: currentStats.withHanViet, of: currentStats.total, tone: "var(--accent)" },
          { label: "Có nghĩa Việt", value: currentStats.withMeaning, of: currentStats.total, tone: "var(--accent)" },
          { label: "Có liên tưởng", value: currentStats.withMnemonic, of: currentStats.total, tone: "var(--accent)" },
        ].map((card) => {
          const pct = card.of > 0 ? Math.round((card.value / card.of) * 100) : 0;
          return (
            <div
              key={card.label}
              className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-3.5"
            >
              <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                {card.label}
              </dt>
              <dd className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold tabular-nums text-[var(--foreground)]">
                  {card.value}
                </span>
                {card.of > 0 && (
                  <span className="text-xs tabular-nums text-[var(--muted-foreground)]">
                    / {card.of}
                  </span>
                )}
              </dd>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--layer)]">
                <div
                  className="h-full rounded-full transition-[width]"
                  style={{ width: card.of > 0 ? `${pct}%` : "100%", background: card.tone, opacity: card.of > 0 ? 1 : 0.25 }}
                />
              </div>
            </div>
          );
        })}
      </dl>

      {/* Level Tabs N5 - N1 */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-[var(--border)] bg-[var(--layer)] p-1">
        {[
          { id: "N5", label: "N5" },
          { id: "N4", label: "N4" },
          { id: "N3", label: "N3" },
          { id: "N2", label: "N2" },
          { id: "N1", label: "N1" },
          { id: "NONE", label: "Chưa phân cấp" },
          { id: "ALL", label: "Tất cả" },
        ].map((t) => {
          const stat = t.id === "ALL" ? null : byLevel[t.id];
          const active = levelTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setLevelTab(t.id);
                setPage(1);
              }}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? "bg-[var(--primary)] text-white shadow-sm"
                  : "text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
              }`}
            >
              <span>{t.label}</span>
              {stat && (
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[11px] tabular-nums ${
                    active ? "bg-white/20 text-white" : "bg-[var(--background-1)] text-[var(--muted-foreground)]"
                  }`}
                >
                  {stat.published}/{stat.total}
                </span>
              )}
            </button>
          );
        })}
        </div>

        {levelTab !== "ALL" && currentStats.total > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {currentStats.draft > 0 && (
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void handleBulk({ status: "PUBLISHED" }, levelTab)}
                className="rounded-lg border border-[var(--border)] bg-[var(--background-1)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)] disabled:opacity-40"
              >
                Xuất bản cả cấp {levelTab === "NONE" ? "Chưa phân cấp" : levelTab} ({currentStats.draft} nháp)
              </button>
            )}
            {currentStats.published > 0 && (
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void handleBulk({ status: "DRAFT" }, levelTab)}
                className="rounded-lg border border-[var(--border)] bg-[var(--background-1)] px-3 py-1.5 text-xs font-medium text-[var(--muted-foreground)] hover:bg-[var(--layer-hover)] disabled:opacity-40"
              >
                Chuyển cả cấp về Nháp
              </button>
            )}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-3">
        <input
          className={fieldClass + " min-w-52 flex-1"}
          placeholder="Tìm theo âm Hán Việt (vd: trường, trưởng, hành, lạc…)"
          aria-label="Tìm theo âm Hán Việt"
          value={hanVietQuery}
          onChange={(e) => {
            setHanVietQuery(e.target.value);
            setPage(1);
          }}
        />
        <label className="flex items-center gap-1.5 px-2 text-xs text-[var(--muted-foreground)]">
          <input
            type="checkbox"
            checked={containsMatch}
            onChange={(e) => {
              setContainsMatch(e.target.checked);
              setPage(1);
            }}
          />
          Chứa chuỗi
        </label>
        <input
          className={fieldClass + " min-w-48 flex-1"}
          placeholder="Tìm chữ Kanji, từ vựng, nghĩa…"
          aria-label="Tìm Kanji hoặc nghĩa"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <select
          className={fieldClass}
          aria-label="Lọc trạng thái"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Mọi trạng thái</option>
          <option value="PUBLISHED">Đã xuất bản</option>
          <option value="DRAFT">Bản nháp</option>
        </select>
        <select
          className={fieldClass}
          aria-label="Lọc dữ liệu thiếu"
          value={missingFilter}
          onChange={(e) => {
            setMissingFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Đủ / Mọi dữ liệu</option>
          <option value="hanViet">Thiếu âm Hán Việt</option>
          <option value="meaning">Thiếu nghĩa tiếng Việt</option>
          <option value="mnemonic">Thiếu liên tưởng</option>
        </select>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-700 dark:text-emerald-300">
          {notice}
        </div>
      )}

      {/* Create / Edit Panel */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 backdrop-blur-sm sm:p-6"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditing(null);
          }}
        >
        <form
          onSubmit={(e) => void handleSave(e)}
          className="my-auto w-full max-w-6xl rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-5 shadow-2xl sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
            <div>
              <h2 className="text-base font-semibold text-[var(--foreground)]">
                {editing.isNew ? "Thêm chữ Kanji mới" : `Chỉnh sửa Kanji: ${editing.char}`}
              </h2>
              <p className="text-xs text-[var(--muted-foreground)]">
                Một chữ Kanji có thể có nhiều âm Hán Việt (âm đầu tiên là âm chính).
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!editing.isNew && (
                <button
                  type="button"
                  disabled={aiBusy}
                  onClick={() => void handleGenerateAi()}
                  className="rounded-lg border border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] px-3 py-1.5 text-xs font-semibold text-[var(--primary)] hover:opacity-90 disabled:opacity-40"
                >
                  {aiBusy ? "Đang gọi AI…" : "✨ Gợi ý AI (Hán Việt, nghĩa & liên tưởng)"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted-foreground)] hover:bg-[var(--layer-hover)]"
              >
                Đóng
              </button>
            </div>
          </div>

          {loadingDetail && (
            <p className="mt-3 text-xs text-[var(--muted-foreground)]">Đang tải chi tiết nét vẽ và từ vựng…</p>
          )}

          <div className="mt-4 grid gap-5 lg:grid-cols-3">
            {/* Left column: Kanji char, stroke preview, level, status */}
            <div className="space-y-3">
              <div className="flex items-start gap-4">
                <div className="flex size-20 shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--background)] text-5xl font-medium text-[var(--foreground)]">
                  {editing.char || "字"}
                </div>
                <div className="flex-1 space-y-2">
                  <label className="block text-xs font-medium text-[var(--muted-foreground)]">
                    Chữ Kanji *
                    <input
                      className={fieldClass + " mt-1 w-full text-lg font-semibold"}
                      value={editing.char}
                      maxLength={4}
                      placeholder="学"
                      onChange={(e) => setEditing({ ...editing, char: e.target.value })}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-xs font-medium text-[var(--muted-foreground)]">
                      Cấp JLPT
                      <select
                        className={fieldClass + " mt-1 w-full"}
                        value={editing.level}
                        onChange={(e) => setEditing({ ...editing, level: e.target.value })}
                      >
                        {KANJI_LEVELS.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                        <option value="">Chưa phân cấp</option>
                      </select>
                    </label>
                    <label className="block text-xs font-medium text-[var(--muted-foreground)]">
                      Trạng thái
                      <select
                        className={fieldClass + " mt-1 w-full"}
                        value={editing.status}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            status: e.target.value === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
                          })
                        }
                      >
                        <option value="PUBLISHED">Đã xuất bản</option>
                        <option value="DRAFT">Bản nháp</option>
                      </select>
                    </label>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-medium text-[var(--muted-foreground)]">
                  Thứ tự học (rank)
                  <input
                    type="number"
                    min={0}
                    className={fieldClass + " mt-1 w-full"}
                    value={editing.rank}
                    onChange={(e) => setEditing({ ...editing, rank: Number(e.target.value) || 0 })}
                  />
                </label>
                <label className="block text-xs font-medium text-[var(--muted-foreground)]">
                  Số nét
                  <input
                    type="number"
                    min={0}
                    className={fieldClass + " mt-1 w-full"}
                    value={editing.strokeCount}
                    onChange={(e) =>
                      setEditing({ ...editing, strokeCount: Number(e.target.value) || 0 })
                    }
                  />
                </label>
              </div>

              {editing.strokes && editing.strokes.length > 0 && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
                  <p className="mb-2 text-xs font-medium text-[var(--muted-foreground)]">
                    Thứ tự nét ({editing.strokes.length} nét)
                  </p>
                  <StrokeOrder strokes={editing.strokes} />
                </div>
              )}
            </div>

            {/* Middle column: Multiple Hán Việt readings + On/Kun + Meanings */}
            <div className="space-y-3">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3.5">
                <span className="block text-xs font-semibold text-[var(--foreground)]">
                  Âm Hán Việt (hỗ trợ nhiều âm)
                </span>
                <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
                  Âm đầu tiên là âm chính. Bấm ↑ để đưa âm lên đầu, hoặc × để xoá.
                </p>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {editing.hanVietList.length === 0 && (
                    <span className="text-xs italic text-[var(--muted-foreground)]">
                      Chưa có âm Hán Việt nào
                    </span>
                  )}
                  {editing.hanVietList.map((hv, idx) => (
                    <span
                      key={hv}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold uppercase ${
                        idx === 0
                          ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)]"
                          : "border-[var(--border)] bg-[var(--background-1)] text-[var(--foreground)]"
                      }`}
                    >
                      <span>{hv}</span>
                      {idx === 0 && (
                        <span className="text-[10px] font-normal lowercase opacity-75">(chính)</span>
                      )}
                      {idx > 0 && (
                        <button
                          type="button"
                          title="Đặt làm âm chính"
                          onClick={() => promoteHanVietReading(idx)}
                          className="ml-0.5 rounded px-1 text-[11px] hover:bg-[var(--layer-hover)]"
                        >
                          ↑
                        </button>
                      )}
                      <button
                        type="button"
                        title="Xoá âm này"
                        onClick={() => removeHanVietReading(hv)}
                        className="rounded px-1 text-[11px] hover:bg-[var(--layer-hover)]"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>

                <div className="mt-2.5 flex gap-1.5">
                  <input
                    className={fieldClass + " flex-1"}
                    placeholder="Nhập 1 hoặc nhiều âm (vd: trường, trưởng)…"
                    value={editing.hanVietDraft}
                    onChange={(e) => setEditing({ ...editing, hanVietDraft: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addHanVietReadings(editing.hanVietDraft);
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => addHanVietReadings(editing.hanVietDraft)}
                    className="rounded-lg border border-[var(--border)] bg-[var(--background-1)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
                  >
                    + Thêm âm
                  </button>
                </div>

                {curatedSuggestions.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-[var(--muted-foreground)]">Gợi ý từ điển:</span>
                    {curatedSuggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => addHanVietReadings(s)}
                        className="rounded-md border border-dashed border-[var(--accent)] px-2 py-0.5 text-[11px] font-semibold uppercase text-[var(--accent)] hover:bg-[var(--layer-hover)]"
                      >
                        + {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <label className="block text-xs font-medium text-[var(--muted-foreground)]">
                Onyomi (cách nhau dấu phẩy)
                <input
                  className={fieldClass + " mt-1 w-full"}
                  lang="ja"
                  placeholder="がく, こう"
                  value={editing.onyomi}
                  onChange={(e) => setEditing({ ...editing, onyomi: e.target.value })}
                />
              </label>

              <label className="block text-xs font-medium text-[var(--muted-foreground)]">
                Kunyomi (giữ dấu chấm okurigana, vd: まな.ぶ)
                <input
                  className={fieldClass + " mt-1 w-full"}
                  lang="ja"
                  placeholder="まな.ぶ, なが.い"
                  value={editing.kunyomi}
                  onChange={(e) => setEditing({ ...editing, kunyomi: e.target.value })}
                />
              </label>

              <label className="block text-xs font-medium text-[var(--muted-foreground)]">
                Bộ thủ (radicals, cách nhau dấu phẩy)
                <input
                  className={fieldClass + " mt-1 w-full"}
                  placeholder="子, 宀"
                  value={editing.radicals}
                  onChange={(e) => setEditing({ ...editing, radicals: e.target.value })}
                />
              </label>
            </div>

            {/* Right column: Meanings & Mnemonic */}
            <div className="space-y-3">
              <label className="block text-xs font-medium text-[var(--muted-foreground)]">
                Nghĩa tiếng Việt (cách nhau dấu phẩy)
                <input
                  className={fieldClass + " mt-1 w-full"}
                  placeholder="học tập, nghiên cứu, khoa học"
                  value={editing.meanings}
                  onChange={(e) => setEditing({ ...editing, meanings: e.target.value })}
                />
              </label>

              <label className="block text-xs font-medium text-[var(--muted-foreground)]">
                Nghĩa tiếng Anh (tham khảo KANJIDIC)
                <input
                  className={fieldClass + " mt-1 w-full"}
                  placeholder="Study, Learning"
                  value={editing.meaningsEn}
                  onChange={(e) => setEditing({ ...editing, meaningsEn: e.target.value })}
                />
              </label>

              <label className="block text-xs font-medium text-[var(--muted-foreground)]">
                Câu chuyện / Liên tưởng dễ nhớ (Mnemonic)
                <textarea
                  rows={4}
                  className={fieldClass + " mt-1 w-full"}
                  placeholder="Ví dụ: Đứa trẻ (子) ngồi dưới mái nhà (宀) chăm chỉ HỌC (学) bài…"
                  value={editing.mnemonic}
                  onChange={(e) => setEditing({ ...editing, mnemonic: e.target.value })}
                />
              </label>
            </div>
          </div>

          {/* Related words table */}
          <div className="mt-5 border-t border-[var(--border)] pt-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--foreground)]">
                Từ vựng liên quan ({editing.words.length})
              </span>
              <button
                type="button"
                onClick={() =>
                  setEditing({
                    ...editing,
                    words: [
                      ...editing.words,
                      { term: "", reading: "", meaning: "", glossEn: "", chars: [] },
                    ],
                  })
                }
                className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
              >
                + Thêm từ vựng
              </button>
            </div>
            {editing.words.length > 0 && (
              <div className="mt-2 space-y-2">
                {editing.words.map((w, i) => (
                  <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                    <input
                      className={fieldClass + " sm:col-span-3"}
                      placeholder="Từ (vd: 学生)"
                      lang="ja"
                      value={w.term}
                      onChange={(e) => {
                        const next = [...editing.words];
                        next[i] = { ...w, term: e.target.value };
                        setEditing({ ...editing, words: next });
                      }}
                    />
                    <input
                      className={fieldClass + " sm:col-span-3"}
                      placeholder="Cách đọc (vd: がくせい)"
                      lang="ja"
                      value={w.reading}
                      onChange={(e) => {
                        const next = [...editing.words];
                        next[i] = { ...w, reading: e.target.value };
                        setEditing({ ...editing, words: next });
                      }}
                    />
                    <input
                      className={fieldClass + " sm:col-span-5"}
                      placeholder={w.glossEn ? `Nghĩa Việt (EN: ${w.glossEn})` : "Nghĩa tiếng Việt"}
                      value={w.meaning}
                      onChange={(e) => {
                        const next = [...editing.words];
                        next[i] = { ...w, meaning: e.target.value };
                        setEditing({ ...editing, words: next });
                      }}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setEditing({
                          ...editing,
                          words: editing.words.filter((_, idx) => idx !== i),
                        })
                      }
                      className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-red-600 hover:bg-[var(--layer-hover)] sm:col-span-1"
                    >
                      Xoá
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-5 flex justify-end gap-2 border-t border-[var(--border)] pt-4">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-[var(--primary)] px-5 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
            >
              {saving ? "Đang lưu…" : "Lưu Kanji"}
            </button>
          </div>
        </form>
        </div>
      )}

      {/* Bulk Action Bar when rows are selected */}
      {selected.size > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] px-4 py-2.5 text-xs">
          <span className="font-semibold text-[var(--foreground)]">
            Đã chọn {selected.size} chữ Kanji:
          </span>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => void handleBulk({ status: "PUBLISHED" })}
            className="rounded-lg bg-[var(--primary)] px-3 py-1 font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            Xuất bản
          </button>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => void handleBulk({ status: "DRAFT" })}
            className="rounded-lg border border-[var(--border)] bg-[var(--background-1)] px-3 py-1 font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)] disabled:opacity-40"
          >
            Chuyển về Nháp
          </button>
          <span className="ml-2 text-[var(--muted-foreground)]">Đổi cấp:</span>
          {KANJI_LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              disabled={bulkBusy}
              onClick={() => void handleBulk({ level: l })}
              className="rounded-lg border border-[var(--border)] bg-[var(--background-1)] px-2.5 py-1 font-semibold text-[var(--foreground)] hover:bg-[var(--layer-hover)] disabled:opacity-40"
            >
              {l}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto text-[var(--muted-foreground)] hover:underline"
          >
            Bỏ chọn
          </button>
        </div>
      )}

      {viewMode === "groups" ? (
        <KanjiGroups
          items={items}
          loading={loading}
          selected={selected}
          onOpen={(k) => void openEdit(k)}
          showDraft
        />
      ) : (
        <>
      {/* Kanji Table */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background-1)] shadow-sm">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="sticky top-0 border-b border-[var(--border)] bg-[var(--layer)] text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            <tr>
              <th className="w-8 px-2.5 py-3">
                <input
                  type="checkbox"
                  aria-label="Chọn tất cả trên trang"
                  checked={allSelected}
                  onChange={(e) => {
                    if (e.target.checked) setSelected(new Set(items.map((i) => i.char)));
                    else setSelected(new Set());
                  }}
                />
              </th>
              <th className="w-14 px-2 py-3 text-center">STT</th>
              <th className="w-16 px-2 py-3">Chữ</th>
              <th className="w-32 px-2 py-3">Hán Việt</th>
              <th className="w-20 px-2 py-3">Cấp</th>
              <th className="w-36 px-2 py-3">On / Kun</th>
              <th className="px-2 py-3">Nghĩa & Liên tưởng</th>
              <th className="w-16 px-2 py-3 text-center">Từ vựng</th>
              <th className="w-20 px-2 py-3 text-center">Trạng thái</th>
              <th className="w-32 px-3 py-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {loading && items.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">
                  Đang tải danh sách Kanji…
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">
                  Không có chữ Kanji nào khớp bộ lọc.
                </td>
              </tr>
            )}
            {items.map((k) => {
              const hvList = splitHanViet(k.hanViet);
              const isBusy = busyChar === k.char;
              const isPublished = k.status === "PUBLISHED";
              return (
                <tr
                  key={k.char}
                  className={`transition-colors hover:bg-[var(--layer-hover)] ${
                    selected.has(k.char) ? "bg-[color-mix(in_srgb,var(--primary)_8%,transparent)]" : ""
                  }`}
                >
                  <td className="px-2.5 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={`Chọn ${k.char}`}
                      checked={selected.has(k.char)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(k.char);
                        else next.delete(k.char);
                        setSelected(next);
                      }}
                    />
                  </td>
                  <td className="px-2 py-2.5 text-center text-xs font-semibold tabular-nums text-[var(--muted-foreground)]">
                    {k.rank || "—"}
                  </td>
                  <td className="px-2 py-2.5">
                    <button
                      type="button"
                      onClick={() => void openEdit(k)}
                      className="flex size-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--background)] text-2xl font-medium leading-none text-[var(--foreground)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
                      lang="ja"
                      title="Bấm để chỉnh sửa"
                    >
                      {k.char}
                    </button>
                  </td>
                  <td className="px-2 py-2.5">
                    {hvList.length > 0 ? (
                      <div className="flex min-w-0 items-stretch gap-2">
                        <span
                          aria-hidden="true"
                          className="w-0.5 shrink-0 rounded-full bg-[var(--accent)] opacity-70"
                        />
                        <div className="min-w-0">
                          <div
                            className="truncate text-[13px] font-bold uppercase leading-5 tracking-wide text-[var(--accent)]"
                            title={`Âm chính: ${hvList[0]}`}
                          >
                            {hvList[0]}
                          </div>
                          {hvList.length > 1 && (
                            <div
                              className="mt-0.5 flex flex-wrap gap-x-1.5 text-[11px] font-medium uppercase leading-4 text-[var(--muted-foreground)]"
                              title={`Âm phụ: ${hvList.slice(1).join(", ")}`}
                            >
                              {hvList.slice(1).map((hv, i) => (
                                <span key={hv}>
                                  {i > 0 && <span aria-hidden="true" className="mr-1.5 opacity-40">·</span>}
                                  {hv}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs italic text-amber-600 dark:text-amber-400">
                        Chưa có
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2.5">
                    <select
                      aria-label={`Cấp của ${k.char}`}
                      disabled={isBusy}
                      value={k.level || ""}
                      onChange={(e) => void quickUpdateRow(k.char, { level: e.target.value })}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-1.5 py-1 text-xs font-semibold text-[var(--foreground)]"
                    >
                      {KANJI_LEVELS.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                      <option value="">—</option>
                    </select>
                  </td>
                  <td className="px-2 py-2.5 text-xs">
                    <div className="truncate text-[var(--foreground)]" title={k.onyomi.join("、")}>
                      {k.onyomi.join("、") || "—"}
                    </div>
                    <div
                      className="truncate text-[var(--muted-foreground)]"
                      title={k.kunyomi.join("、")}
                    >
                      {k.kunyomi.join("、") || "—"}
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-xs">
                    {k.meanings.length > 0 ? (
                      <div
                        className="truncate font-medium text-[var(--foreground)]"
                        title={k.meanings.join(", ")}
                      >
                        {k.meanings.join(", ")}
                      </div>
                    ) : (
                      <div
                        className="truncate italic text-amber-600 dark:text-amber-400"
                        title={k.meaningsEn.length ? `Chưa có nghĩa tiếng Việt (EN: ${k.meaningsEn.join(", ")})` : undefined}
                      >
                        Chưa có nghĩa tiếng Việt
                      </div>
                    )}
                    {k.mnemonic && (
                      <div
                        className="mt-0.5 truncate text-[11px] text-[var(--muted-foreground)]"
                        title={k.mnemonic}
                      >
                        💡 {k.mnemonic}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-center text-xs tabular-nums text-[var(--muted-foreground)]">
                    {k.words?.length ?? 0} từ
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <button
                      type="button"
                      disabled={isBusy}
                      title={
                        isPublished
                          ? "Đã xuất bản — bấm để chuyển về bản nháp"
                          : "Bản nháp — bấm để xuất bản"
                      }
                      aria-label={isPublished ? "Đã xuất bản" : "Bản nháp"}
                      onClick={() =>
                        void quickUpdateRow(k.char, {
                          status: isPublished ? "DRAFT" : "PUBLISHED",
                        })
                      }
                      className={`inline-flex size-6 items-center justify-center rounded-full transition-colors ${
                        isPublished
                          ? "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 dark:text-emerald-400"
                          : "bg-amber-500/15 text-amber-600 hover:bg-amber-500/25 dark:text-amber-400"
                      }`}
                    >
                      {isPublished ? (
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 20 20"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2.4}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="size-3.5"
                        >
                          <path d="M4.5 10.5 8.2 14.2 15.5 6.5" />
                        </svg>
                      ) : (
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 20 20"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="size-3.5"
                        >
                          <circle cx="10" cy="10" r="6" strokeDasharray="3 2.5" />
                          <path d="M10 7v3.2l2 1.3" />
                        </svg>
                      )}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="inline-flex items-center justify-end gap-0.5 whitespace-nowrap rounded-xl border border-[var(--border)] bg-[var(--background)] p-0.5">
                      <button
                        type="button"
                        title={`Sửa ${k.char}`}
                        aria-label={`Sửa ${k.char}`}
                        onClick={() => void openEdit(k)}
                        className="inline-flex size-8 items-center justify-center rounded-lg text-[var(--primary)] transition-colors hover:bg-[var(--layer-hover)]"
                      >
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 20 20"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.8}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="size-4"
                        >
                          <path d="M13.5 3.5a1.8 1.8 0 0 1 2.5 2.5L6.5 15.5 3 16.5l1-3.5 9.5-9.5Z" />
                        </svg>
                      </button>
                      <Link
                        href={`/learn/kanji/${encodeURIComponent(k.char)}`}
                        title={`Xem ${k.char}`}
                        aria-label={`Xem ${k.char}`}
                        className="inline-flex size-8 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:bg-[var(--layer-hover)] hover:text-[var(--foreground)]"
                      >
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 20 20"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.8}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="size-4"
                        >
                          <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z" />
                          <circle cx="10" cy="10" r="2.3" />
                        </svg>
                      </Link>
                      <button
                        type="button"
                        disabled={isBusy}
                        title={`Xoá ${k.char}`}
                        aria-label={`Xoá ${k.char}`}
                        onClick={() => void handleDelete(k.char)}
                        className="inline-flex size-8 items-center justify-center rounded-lg text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-40 dark:text-red-400"
                      >
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 20 20"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.8}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="size-4"
                        >
                          <path d="M3.5 5.5h13M7.5 5.5v-1a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1M5.5 5.5l.7 10a1.5 1.5 0 0 0 1.5 1.4h4.6a1.5 1.5 0 0 0 1.5-1.4l.7-10M8.5 8.5v5M11.5 8.5v5" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>


      {/* Pagination */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--muted-foreground)]">
        <span>
          Hiển thị {items.length} / {total} chữ Kanji
        </span>
        {pages > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 font-medium text-[var(--foreground)] disabled:opacity-40"
            >
              ‹ Trước
            </button>
            <span className="tabular-nums">
              Trang {page} / {pages}
            </span>
            <button
              type="button"
              disabled={page >= pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 font-medium text-[var(--foreground)] disabled:opacity-40"
            >
              Sau ›
            </button>
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}
