"use client";

import { EXAMPLES_STARTED_EVENT } from "@/components/learn/example-job-tracker";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DuplicatesPanel, type DuplicateInfo } from "@/components/admin/duplicates-panel";
import { ExampleStarter } from "@/components/admin/example-starter";
import { PdfPageReview } from "@/components/admin/pdf-page-review";
import { JOB_STARTED_EVENT, type PdfJob } from "@/components/admin/import-job-tracker";

/**
 * Bulk-import wizard (P3-UI-02, spec §4.2 "preview, ánh xạ cột, kiểm tra
 * lỗi, phát hiện trùng lặp và xác nhận trước khi nhập").
 *
 * Four steps over a single screen:
 *   1. Chọn file + bộ thẻ đích (CSV/XLSX ≤ 10 MB, PDF ≤ 50 MB)
 *   2. Ánh xạ cột (câu hỏi / đáp án / tags) — từ danh sách cột API trả về
 *   3. Xem trước từng dòng (ok / lỗi / trùng) + chính sách trùng
 *   4. Xác nhận nhập (idempotent — gửi lại không tạo bản ghi đôi)
 *
 * Uploads go to `/api/import?action=…` (the gateway forwards the multipart
 * body with the server-side access token). A preview request **never**
 * writes to the DB; only the final confirm does (P3-IMPORT-02/04).
 */

interface Deck {
  _id: string;
  title: string;
  shared: boolean;
  level?: string;
}

interface PreviewRow {
  rowNumber: number;
  front: string;
  back: string;
  status: "ok" | "error" | "duplicate";
  reading?: string;
  partOfSpeech?: string;
  examples?: number;
  no?: number;
  hanViet?: string;
  error?: string;
}

interface Preview {
  format: string;
  columns: string[];
  totalRows: number;
  okRows: number;
  errorRows: number;
  duplicateRows: number;
  duplicates?: DuplicateInfo[];
  rows: PreviewRow[];
}

interface ConfirmResult {
  deckId: string;
  imported: number;
  skipped: number;
  overwritten: number;
  examplesQueued?: number;
  examplesDeferred?: number;
  duplicates?: DuplicateInfo[];
  errors: { rowNumber: number; error: string }[];
}

const inputClass =
  "block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-focus)]";

/** Optional columns the wizard can map (the API derives hiragana/POS when blank). */
const OPTIONAL_COLUMNS = [
  ["order", "STT (số thứ tự)"],
  ["hanViet", "Âm Hán Việt"],
  ["reading", "Hiragana (trống → tự tạo)"],
  ["partOfSpeech", "Từ loại (trống → tự nhận)"],
  ["example", "Câu ví dụ"],
  ["exampleTranslation", "Nghĩa câu ví dụ"],
  ["tags", "Tags"],
] as const;

const POS_LABEL: Record<string, string> = {
  verb: "Động từ",
  noun: "Danh từ",
  adjective: "Tính từ",
};

/** Sample CSV (UTF-8 + BOM so Excel opens Japanese correctly). */
function downloadTemplate() {
  const rows = [
    ["front", "back", "reading", "partOfSpeech", "example", "exampleTranslation", "tags"],
    ["食べる", "ăn", "", "verb", "朝ご飯を食べます。", "Tôi ăn cơm sáng.", "N5, động từ"],
    ["猫", "con mèo", "", "noun", "猫が好きです。", "Tôi thích mèo.", "N5, động vật"],
    ["大きい", "to, lớn", "", "adjective", "この犬、大きいよ。", "Con chó này to.", "N5"],
    ["テレビ", "tivi", "", "noun", "", "", "N5"],
  ];
  const csv = rows
    .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "mau-nhap-the.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function mappingPayload(m: Record<string, string>) {
  return {
    front: m.front,
    back: m.back,
    reading: m.reading || undefined,
    order: m.order || undefined,
    hanViet: m.hanViet || undefined,
    partOfSpeech: m.partOfSpeech || undefined,
    example: m.example || undefined,
    exampleTranslation: m.exampleTranslation || undefined,
    tags: m.tags || undefined,
  };
}

const ROW_LIMIT = 40; // preview table window (the API caps rows per file)

export function ImportWizard({ learner = false }: { learner?: boolean }) {
  const backHref = learner ? "/learn/decks" : "/admin/decks";
  const backLabel = learner ? "← Bộ flashcard của tôi" : "← Bộ thẻ chung";
  const [decks, setDecks] = useState<Deck[]>([]);
  const [deckId, setDeckId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
    const [result, setResult] = useState<ConfirmResult | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<
    "preview" | "confirm" | null
  >(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const search = useSearchParams();
  const wantedDeck = search.get("deck");
  const wantedJob = search.get("job");

  // A PDF is read in the background (OCR can take minutes): the job survives
  // leaving this page, and the global tracker notifies when it is done.
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<PdfJob | null>(null);
  const autoPreviewed = useRef<string | null>(null);

  useEffect(() => {
    if (!jobId || job?.status !== "running") return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/import?job=${encodeURIComponent(jobId)}`, { cache: "no-store" }).catch(() => null);
      if (r?.ok) setJob((await r.json().catch(() => null)) as PdfJob | null);
    }, 2000);
    return () => clearInterval(t);
  }, [jobId, job?.status]);

  useEffect(() => {
    if (!job || job.id !== jobId) return;
    if (job.status === "done" && autoPreviewed.current !== job.id) {
      autoPreviewed.current = job.id;
      void runPreview(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status, job?.id, jobId]);

  // Coming back from the "đã đọc xong" notification: resume that job.
  useEffect(() => {
    if (!wantedJob) return;
    void (async () => {
      const r = await fetch(`/api/import?job=${encodeURIComponent(wantedJob)}`, { cache: "no-store" }).catch(() => null);
      if (!r?.ok) {
        setError("Tác vụ đọc PDF không còn (đã hết hạn hoặc server khởi động lại) — hãy chọn lại file");
        return;
      }
      const j = (await r.json()) as PdfJob;
      setDeckId(j.deckId);
      setJobId(j.id);
      setJob(j);
    })();
  }, [wantedJob]);

  // Shared decks (any status) — what an admin imports into. Falls back to the
  // caller's own list when the admin endpoint is not available to them.
  async function fetchDecks(): Promise<Deck[] | null> {
    let res = learner
      ? null
      : await fetch("/api/flashcards/admin/decks", { cache: "no-store" }).catch(() => null);
    if (!res || !res.ok) {
      res = await fetch("/api/flashcards/decks", { cache: "no-store" }).catch(() => null);
    }
    if (!res || !res.ok) return null;
    const list = (await res.json().catch(() => [])) as Deck[];
    // Learners can only import into their OWN decks (shared decks are admin-only).
    return learner ? list.filter((d) => !d.shared) : list;
  }

  function applyDecks(list: Deck[] | null, selectId?: string) {
    if (!list) {
      setError("Không tải được danh sách bộ thẻ");
      return;
    }
    setDecks(list);
    setDeckId((cur) => {
      if (selectId && list.some((d) => d._id === selectId)) return selectId;
      if (cur) return cur;
      if (wantedDeck && list.some((d) => d._id === wantedDeck)) return wantedDeck;
      return list[0]?._id ?? "";
    });
  }

  useEffect(() => {
    let cancelled = false;
    void fetchDecks().then((list) => {
      if (!cancelled) applyDecks(list);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Create a new shared deck without leaving the wizard.
  const [newTitle, setNewTitle] = useState("");
  const [creatingDeck, setCreatingDeck] = useState(false);
  // Decks created inside this wizard session: an import into one stays a draft
  // (with a progress strip) until its example sentences are generated.
  const createdDeckIds = useRef<Set<string>>(new Set());
  async function createDeck() {
    if (!newTitle.trim()) return;
    setCreatingDeck(true);
    setError(null);
    const res = await fetch(learner ? "/api/flashcards/decks" : "/api/flashcards/admin/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        learner ? { title: newTitle.trim() } : { title: newTitle.trim(), status: "DRAFT" },
      ),
    }).catch(() => null);
    setCreatingDeck(false);
    if (!res?.ok) {
      setError(learner ? "Không tạo được bộ thẻ" : "Không tạo được bộ thẻ chung (cần quyền admin)");
      return;
    }
    const created = (await res.json().catch(() => null)) as { _id?: string } | null;
    if (created?._id) createdDeckIds.current.add(created._id);
    setNewTitle("");
    applyDecks(await fetchDecks(), created?._id);
  }

  // Step 2: fetch the columns for the chosen mapping (no mapping sent yet →
  // the API returns just the header row's names).
  async function runPreview(revealed: boolean) {
    if ((!file && !jobId) || !deckId) {
      setError("Chọn file và bộ thẻ đích trước");
      return;
    }
    setRunning("preview");
    setError(null);
    setPreview(null);

    // PDF → start the background read first; the preview follows when it is done.
    if (file && !jobId && file.name.toLowerCase().endsWith(".pdf")) {
      const start = new FormData();
      start.append("file", file);
      start.append("deckId", deckId);
      const r = await fetch("/api/import?action=job", { method: "POST", body: start }).catch(() => null);
      setRunning(null);
      const started = (await r?.json().catch(() => null)) as (PdfJob & { message?: string }) | null;
      if (!r?.ok || !started) {
        setError(started?.message ?? "Không bắt đầu đọc được PDF");
        return;
      }
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        void Notification.requestPermission();
      }
      setJobId(started.id);
      setJob(started);
      window.dispatchEvent(new Event(JOB_STARTED_EVENT));
      return;
    }

    const form = new FormData();
    if (jobId) form.append("jobId", jobId);
    else if (file) form.append("file", file);
    form.append("deckId", deckId);
    if (revealed && mapping.front && mapping.back) {
      form.append(
        "mapping",
        JSON.stringify(mappingPayload(mapping)),
      );
    }

    const res = await fetch("/api/import?action=preview", {
      method: "POST",
      body: form,
    }).catch(() => null);
    setRunning(null);
    if (!res) {
      setError("Không kết nối được API");
      return;
    }
    const data = (await res.json().catch(() => null)) as
      | (Preview & { message?: string })
      | null;
    if (!res.ok) {
      setError(data?.message ?? `Xem trước thất bại (${res.status})`);
      return;
    }
    // Auto-suggest the mapping from column names when first revealed.
    if (data && data.columns.length > 0) {
      setMapping((m) => {
        const cols = data!.columns;
        const guess = (name: string, candidates: string[], exclude?: RegExp) => {
          const hit = cols.find(
            (c) =>
              candidates.some((k) => c.toLowerCase().includes(k)) &&
              !(exclude && exclude.test(c.toLowerCase())),
          );
          return hit ?? "";
        };
        return {
          front: m.front || guess("front", ["front", "term", "word", "câu hỏi", "chữ hán", "từ vựng", "kanji", "漢字"], /âm hán|hán việt/),
          back: m.back || guess("back", ["back", "meaning", "nghĩa", "đáp án"]),
          order: m.order || guess("order", ["stt", "số thứ tự"]),
          hanViet: m.hanViet || guess("hanViet", ["âm hán", "hán việt", "am han"]),
          tags: m.tags || guess("tags", ["tag"]),
          reading: m.reading || guess("reading", ["reading", "hiragana", "kana", "cách đọc", "furigana"]),
          partOfSpeech: m.partOfSpeech || guess("pos", ["partofspeech", "part_of_speech", "pos", "từ loại", "loại từ", "wordtype"]),
          example: m.example || guess("example", ["example", "ví dụ", "例文"], /translation|meaning|nghĩa|dịch/),
          exampleTranslation:
            m.exampleTranslation ||
            guess("exampleTranslation", ["exampletranslation", "example_translation", "example_meaning", "nghĩa ví dụ", "dịch ví dụ"]),
        };
      });
    }
    setPreview(data);
  }

  async function runConfirm() {
    if ((!file && !jobId) || !deckId || !mapping.front || !mapping.back) {
      setError("Chưa ánh xạ đủ cột (câu hỏi + đáp án)");
      return;
    }
    setRunning("confirm");
    setError(null);

    const form = new FormData();
    if (jobId) form.append("jobId", jobId);
    else if (file) form.append("file", file);
    form.append("deckId", deckId);
    form.append(
      "mapping",
      JSON.stringify(mappingPayload(mapping)),
    );
    form.append("duplicatePolicy", "skip");
    if (createdDeckIds.current.has(deckId)) form.append("newDeck", "true");

    const res = await fetch("/api/import?action=confirm", {
      method: "POST",
      body: form,
    }).catch(() => null);
    setRunning(null);
    if (!res) {
      setError("Không kết nối được API");
      return;
    }
    const data = (await res.json().catch(() => null)) as
      | (ConfirmResult & { message?: string })
      | null;
    if (!res.ok) {
      setError(data?.message ?? `Xác nhận thất bại (${res.status})`);
      return;
    }
    setResult(data);
    if (data && (data.examplesQueued ?? 0) > 0) window.dispatchEvent(new Event(EXAMPLES_STARTED_EVENT)); // progress popup
    setPreview(null);
  }

  const steps: string[] = ["1. Chọn file + bộ thẻ", "2. Ánh xạ cột", "3. Xác nhận"];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
          Nhập flashcard hàng loạt
        </h1>
        <Link
          href={backHref}
          className="text-sm font-medium text-[var(--primary)] hover:text-[var(--primary-hover)]"
        >
          {backLabel}
        </Link>
      </div>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        CSV / XLSX (≤ 10 MB) hoặc PDF có bảng STT (≤ 50 MB). Nhập chỉ ghi vào bộ thẻ khi bạn bấm{" "}
        <strong>Xác nhận</strong> — xem trước không chạm database.
      </p>

      {/* Step indicator */}
      <ol className="mt-6 flex flex-wrap gap-2 text-xs text-[var(--muted-foreground)]" aria-label="Các bước nhập">
        {steps.map((s, i) => {
          const active =
            (i === 0 && !preview) ||
            (i === 1 && preview && !result) ||
            (i === 2 && result);
          return (
            <li
              key={s}
              className={
                "rounded-full px-3 py-1 " +
                (active
                  ? "bg-[var(--primary)] font-medium text-[var(--primary-foreground)]"
                  : "bg-[var(--layer)]")
              }
            >
              {s}
            </li>
          );
        })}
      </ol>

      {(error || (job?.status === "error" && job.id === jobId)) && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c] dark:bg-[#2a1215] dark:text-[#fca5a5]"
        >
          {error ?? job?.error ?? "Đọc PDF thất bại"}
        </p>
      )}

      {/* ── Step 1: file + target deck ─────────────────────────────── */}
      <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="flex items-center justify-between gap-2">
              <label className="block text-sm font-medium text-[var(--foreground)]">
                File CSV / XLSX / PDF
              </label>
              <button
                type="button"
                onClick={downloadTemplate}
                className="text-xs font-medium text-[var(--primary)] hover:underline"
              >
                ⬇ Tải file mẫu (CSV)
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.pdf,text/csv,application/pdf"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setJobId(null);
                setJob(null);
                setPreview(null);
                setResult(null);
                setMapping({});
              }}
              className={`mt-1 ${inputClass} file:mr-3 file:rounded file:border-0 file:bg-[var(--layer)] file:px-3 file:py-1 file:text-xs file:font-medium file:text-[var(--foreground)]`}
            />
            {file && (
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
                {file.size > (file.name.toLowerCase().endsWith(".pdf") ? 50 : 10) * 1024 * 1024 && (
                  <span className="ml-2 text-[#b91c1c]">
                    — vượt {file.name.toLowerCase().endsWith(".pdf") ? 50 : 10} MB, sẽ bị từ chối
                  </span>
                )}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="import-deck"
              className="block text-sm font-medium text-[var(--foreground)]"
            >
              Bộ thẻ đích
            </label>
            <div className="mt-1 flex gap-2">
              <select
                id="import-deck"
                value={deckId}
                onChange={(e) => {
                  setDeckId(e.target.value);
                  setPreview(null);
                  setResult(null);
                }}
                className={inputClass}
              >
                <option value="">— chọn bộ thẻ —</option>
                {decks.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.title}
                    {d.shared ? " (chung)" : d.level ? ` (${d.level})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              Thẻ được tạo trong đúng bộ thẻ này, dấu nguồn là{" "}
              <code>import</code>.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void createDeck();
                  }
                }}
                placeholder={learner ? "Hoặc tạo bộ thẻ mới…" : "Hoặc tạo bộ chung mới…"}
                aria-label="Tên bộ thẻ chung mới"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => void createDeck()}
                disabled={creatingDeck || !newTitle.trim()}
                className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--primary)] hover:bg-[var(--layer-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creatingDeck ? "Đang tạo…" : "＋ Tạo"}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <button
            type="button"
            disabled={(!file && !jobId) || !deckId || running !== null || job?.status === "running"}
            onClick={() => void runPreview(false)}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {running === "preview" || job?.status === "running"
              ? "Đang đọc file…"
              : "Đọc file (nháp, chưa nhập)"}
          </button>
        </div>

        {job && job.status === "running" && (
          <div className="mt-4" aria-live="polite">
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={job.total > 0 ? Math.round((job.done / job.total) * 100) : 0}
              className="h-2.5 overflow-hidden rounded-full bg-[var(--layer)]"
            >
              <div
                className="h-full bg-[var(--primary)] transition-all"
                style={{ width: `${Math.max(job.total > 0 ? (job.done / job.total) * 100 : 0, 3)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              {job.total > 0
                ? `Đang đọc trang ${job.done}/${job.total} (${Math.round((job.done / job.total) * 100)}%)`
                : "Đang chuẩn bị…"}{" "}
              — bạn có thể chuyển sang trang khác, hệ thống sẽ báo khi đọc xong.
            </p>
          </div>
        )}
      </section>

      {file?.name.toLowerCase().endsWith(".pdf") && (
        <p className="mt-4 rounded-lg bg-[#fef9c3] px-4 py-3 text-sm text-[#a16207] dark:bg-[#3a3210] dark:text-[#fde047]">
          Chỉ nhập PDF do bạn tự soạn hoặc có quyền sử dụng — không nhập giáo
          trình có bản quyền. PDF có lớp văn bản sạch và bảng STT được đọc
          trực tiếp; PDF scan hoặc có lớp OCR lỗi sẽ được đọc lại bằng AI có hỗ
          trợ ảnh (Gemini / Claude / GPT-4o) — có thể mất vài phút.
        </p>
      )}

      {job?.status === "done" && job.id === jobId && (
        <PdfPageReview
          job={job}
          onChanged={(j) => {
            setJob(j);
            void runPreview(false);
          }}
        />
      )}

      {/* ── Step 2: column mapping ─────────────────────────────────── */}
      {preview && preview.columns.length > 0 && !result && (
        <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-5">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">
            Ánh xạ cột ({preview.format.toUpperCase()}, {preview.totalRows} dòng)
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(
              [
                ["front", "Mặt trước / từ vựng (bắt buộc)"],
                ["back", "Mặt sau / nghĩa (bắt buộc)"],
              ] as const
            ).map(([key, label]) => (
              <ColumnSelect
                key={key}
                label={label}
                value={mapping[key] ?? ""}
                columns={preview.columns}
                onChange={(v) => setMapping((m) => ({ ...m, [key]: v }))}
              />
            ))}
          </div>
          <p className="mt-4 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            Cột tuỳ chọn
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {OPTIONAL_COLUMNS.map(([key, label]) => (
              <ColumnSelect
                key={key}
                label={label}
                value={mapping[key] ?? ""}
                columns={preview.columns}
                onChange={(v) => setMapping((m) => ({ ...m, [key]: v }))}
              />
            ))}
          </div>
          <p className="mt-3 text-xs text-[var(--muted-foreground)]">
            Không có cột hiragana/từ loại? Hệ thống tự tạo hiragana cho từ có kanji (từ chỉ có
            hiragana/katakana để trống) và tự nhận động từ / danh từ / tính từ.
          </p>

          <div className="mt-4">
            <button
              type="button"
              disabled={running !== null || !mapping.front || !mapping.back}
              onClick={() => void runPreview(true)}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {running === "preview" ? "Đang xem trước…" : "Xem trước từng dòng"}
            </button>
          </div>
        </section>
      )}

      {/* ── Step 3: preview rows + policy + confirm ─────────────────── */}
      {preview && preview.rows.length > 0 && !result && (
        <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">
              Xem trước —{" "}
              <span className="text-[var(--primary)]">
                {preview.okRows} hợp lệ
              </span>
              , {preview.duplicateRows} trùng, {preview.errorRows} lỗi
            </h2>
            <p className="text-xs text-[var(--muted-foreground)]">
              Thẻ trùng sẽ được bỏ qua (giữ thẻ cũ).
            </p>
          </div>

          <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border)]">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-[var(--layer)] text-left text-xs text-[var(--muted-foreground)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">STT</th>
                    <th className="px-3 py-2 font-medium">Trạng thái</th>
                    <th className="px-3 py-2 font-medium">Câu hỏi</th>
                    <th className="px-3 py-2 font-medium">Đáp án</th>
                    <th className="px-3 py-2 font-medium">Hiragana</th>
                    <th className="px-3 py-2 font-medium">Hán Việt</th>
                    <th className="px-3 py-2 font-medium">Từ loại</th>
                    <th className="px-3 py-2 font-medium">Ví dụ</th>
                    <th className="px-3 py-2 font-medium">Lỗi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--table-line)]">
                  {preview.rows.slice(0, ROW_LIMIT).map((r) => (
                    <tr key={r.rowNumber}>
                      <td className="px-3 py-2 text-[var(--muted-foreground)]">
                        {r.no ?? r.rowNumber}
                      </td>
                      <td className="px-3 py-2">
                        {r.status === "ok" && (
                          <span className="rounded-full bg-[#f0fdf4] px-2 py-0.5 text-xs font-medium text-[#15803d] dark:bg-[#0f2418] dark:text-[#86efac]">
                            Hợp lệ
                          </span>
                        )}
                        {r.status === "duplicate" && (
                          <span className="rounded-full bg-[#fef9c3] px-2 py-0.5 text-xs font-medium text-[#a16207] dark:bg-[#3a3210] dark:text-[#fde047]">
                            Trùng
                          </span>
                        )}
                        {r.status === "error" && (
                          <span className="rounded-full bg-[#fef2f2] px-2 py-0.5 text-xs font-medium text-[#b91c1c] dark:bg-[#2a1215] dark:text-[#fca5a5]">
                            Lỗi
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[var(--foreground)]">
                        {r.front || "—"}
                      </td>
                      <td className="px-3 py-2 text-[var(--foreground)]">
                        {r.back || "—"}
                      </td>
                      <td lang="ja" className="px-3 py-2 text-[var(--muted-foreground)]">
                        {r.reading || "—"}
                      </td>
                      <td className="px-3 py-2 text-[var(--muted-foreground)]">
                        {r.hanViet || "—"}
                      </td>
                      <td className="px-3 py-2 text-[var(--muted-foreground)]">
                        {r.partOfSpeech ? POS_LABEL[r.partOfSpeech] ?? r.partOfSpeech : "—"}
                      </td>
                      <td className="px-3 py-2 text-[var(--muted-foreground)]">
                        {r.examples ? r.examples : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-[#b91c1c]">
                        {r.error ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.rows.length > ROW_LIMIT && (
              <p className="border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
                Hiển thị {ROW_LIMIT}/{preview.rows.length} dòng.
              </p>
            )}
          </div>

          <DuplicatesPanel duplicates={preview.duplicates ?? []} total={preview.duplicateRows} />

          <div className="mt-4">
            <button
              type="button"
              disabled={running !== null || preview.okRows === 0}
              onClick={() => void runConfirm()}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {running === "confirm"
                ? "Đang nhập…"
                : `Xác nhận nhập ${preview.okRows} thẻ`}
            </button>
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">
              Nhập idempotent: gửi lại đúng file này không tạo thẻ trùng.
            </p>
          </div>
        </section>
      )}

      {/* ── Done ───────────────────────────────────────────────────── */}
      {result && (
        <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[#f0fdf4] p-5 dark:bg-[#0f2418]">
          <h2 className="text-sm font-semibold text-[#15803d] dark:text-[#86efac]">
            Đã nhập: {result.imported} thẻ mới
          </h2>
          <dl className="mt-2 space-y-1 text-sm text-[var(--muted-foreground)]">
            <div>
              <dt className="inline">Bỏ qua (trùng): </dt>
              <dd className="inline font-medium text-[var(--foreground)]">
                {result.skipped}
              </dd>
            </div>
            {result.overwritten > 0 && (
              <div>
                <dt className="inline">Ghi đè: </dt>
                <dd className="inline font-medium text-[var(--foreground)]">
                  {result.overwritten}
                </dd>
              </div>
            )}
            {result.errors.length > 0 && (
              <div>
                <dt className="inline">Dòng lỗi: </dt>
                <dd className="ml-2 text-xs">
                  {result.errors
                    .slice(0, 10)
                    .map((e) => `#${e.rowNumber}: ${e.error}`)
                    .join(" · ")}
                  {result.errors.length > 10 && ` · +${result.errors.length - 10} dòng khác`}
                </dd>
              </div>
            )}
          </dl>
          {(result.examplesDeferred ?? 0) > 0 && (
            <ExampleStarter
              key={result.deckId}
              deckId={result.deckId}
              count={result.examplesDeferred ?? 0}
              learner={learner}
              decksHref={backHref}
            />
          )}
          <DuplicatesPanel duplicates={result.duplicates ?? []} total={result.skipped} />
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setPreview(null);
                setFile(null);
                setMapping({});
                if (fileRef.current) fileRef.current.value = "";
              }}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]"
            >
              Nhập file khác
            </button>
            <Link
              href={backHref}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
            >
              {learner ? "Xem bộ thẻ" : "Xem bộ thẻ chung"}
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

function ColumnSelect({
  label,
  value,
  columns,
  onChange,
}: {
  label: string;
  value: string;
  columns: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="text-[var(--muted-foreground)]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 ${inputClass}`}
      >
        <option value="">—</option>
        {columns.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </label>
  );
}
