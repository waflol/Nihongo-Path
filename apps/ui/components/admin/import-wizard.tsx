"use client";

import Link from "next/link";
import { useRef, useState } from "react";

/**
 * Bulk-import wizard (P3-UI-02, spec §4.2 "preview, ánh xạ cột, kiểm tra
 * lỗi, phát hiện trùng lặp và xác nhận trước khi nhập").
 *
 * Four steps over a single screen:
 *   1. Chọn file + bộ thẻ đích (CSV/XLSX, ≤ 10 MB)
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
  error?: string;
}

interface Preview {
  format: string;
  columns: string[];
  totalRows: number;
  okRows: number;
  errorRows: number;
  duplicateRows: number;
  rows: PreviewRow[];
}

interface ConfirmResult {
  imported: number;
  skipped: number;
  overwritten: number;
  errors: { rowNumber: number; error: string }[];
}

const inputClass =
  "block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-focus)]";

const ROW_LIMIT = 40; // preview table window (the API caps rows per file)

export function ImportWizard() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [deckId, setDeckId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [policy, setPolicy] = useState<"skip" | "overwrite">("skip");
  const [result, setResult] = useState<ConfirmResult | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<
    "preview" | "confirm" | null
  >(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadDecks() {
    const res = await fetch("/api/flashcards/decks", { cache: "no-store" }).catch(
      () => null,
    );
    if (!res || !res.ok) {
      setError("Không tải được danh sách bộ thẻ");
      return;
    }
    const list = (await res.json().catch(() => [])) as Deck[];
    setDecks(list);
    if (!deckId && list.length > 0) setDeckId(list[0]._id);
  }

  // Step 2: fetch the columns for the chosen mapping (no mapping sent yet →
  // the API returns just the header row's names).
  async function runPreview(revealed: boolean) {
    if (!file || !deckId) {
      setError("Chọn file và bộ thẻ đích trước");
      return;
    }
    setRunning("preview");
    setError(null);
    setPreview(null);

    const form = new FormData();
    form.append("file", file);
    form.append("deckId", deckId);
    if (revealed && mapping.front && mapping.back) {
      form.append(
        "mapping",
        JSON.stringify({
          front: mapping.front,
          back: mapping.back,
          tags: mapping.tags || undefined,
        }),
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
        const guess = (name: string, candidates: string[]) => {
          const hit = cols.find((c) =>
            candidates.some((k) => c.toLowerCase().includes(k)),
          );
          return hit ?? "";
        };
        return {
          front: m.front || guess("front", ["front", "term", "word", "câu hỏi"]),
          back: m.back || guess("back", ["back", "meaning", "nghĩa", "đáp án"]),
          tags: m.tags || guess("tags", ["tag"]),
        };
      });
    }
    setPreview(data);
  }

  async function runConfirm() {
    if (!file || !deckId || !mapping.front || !mapping.back) {
      setError("Chưa ánh xạ đủ cột (câu hỏi + đáp án)");
      return;
    }
    setRunning("confirm");
    setError(null);

    const form = new FormData();
    form.append("file", file);
    form.append("deckId", deckId);
    form.append(
      "mapping",
      JSON.stringify({
        front: mapping.front,
        back: mapping.back,
        tags: mapping.tags || undefined,
      }),
    );
    form.append("duplicatePolicy", policy);

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
    setPreview(null);
  }

  const steps: string[] = ["1. Chọn file + bộ thẻ", "2. Ánh xạ cột", "3. Xác nhận"];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
          Nhập flashcard hàng loạt
        </h1>
        <Link
          href="/admin/content"
          className="text-sm font-medium text-[var(--primary)] hover:text-[var(--primary-hover)]"
        >
          ← Nội dung học
        </Link>
      </div>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        CSV hoặc XLSX, ≤ 10 MB. Nhập chỉ ghi vào bộ thẻ khi bạn bấm{" "}
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

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]"
        >
          {error}
        </p>
      )}

      {/* ── Step 1: file + target deck ─────────────────────────────── */}
      <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)]">
              File CSV / XLSX
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,text/csv"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
                setResult(null);
                setMapping({});
              }}
              className={`mt-1 ${inputClass} file:mr-3 file:rounded file:border-0 file:bg-[var(--layer)] file:px-3 file:py-1 file:text-xs file:font-medium file:text-[var(--foreground)]`}
            />
            {file && (
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
                {file.size > 10 * 1024 * 1024 && (
                  <span className="ml-2 text-[#b91c1c]">— vượt 10 MB, sẽ bị từ chối</span>
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
                onClick={loadDecks}
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
          </div>
        </div>

        <div className="mt-4">
          <button
            type="button"
            disabled={!file || !deckId || running !== null}
            onClick={() => void runPreview(false)}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {running === "preview"
              ? "Đang đọc file…"
              : "Đọc file (nháp, chưa nhập)"}
          </button>
        </div>
      </section>

      {/* ── Step 2: column mapping ─────────────────────────────────── */}
      {preview && preview.columns.length > 0 && !result && (
        <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-5">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">
            Ánh xạ cột ({preview.format.toUpperCase()}, {preview.totalRows} dòng)
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {(
              [
                ["front", "Câu hỏi (bắt buộc)"],
                ["back", "Đáp án (bắt buộc)"],
                ["tags", "Tags (tuỳ chọn)"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-sm">
                <span className="text-[var(--muted-foreground)]">
                  {label}
                </span>
                <select
                  value={mapping[key] ?? ""}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, [key]: e.target.value }))
                  }
                  className={`mt-1 ${inputClass}`}
                >
                  <option value="">—</option>
                  {preview.columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

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
            <label className="text-xs text-[var(--muted-foreground)]">
              Khi trùng:{" "}
              <select
                value={policy}
                onChange={(e) => setPolicy(e.target.value as "skip" | "overwrite")}
                className="ml-1 rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs text-[var(--foreground)]"
              >
                <option value="skip">bỏ qua (giữ thẻ cũ)</option>
                <option value="overwrite">ghi đè (dùng giá trị mới)</option>
              </select>
            </label>
          </div>

          <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border)]">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-[var(--layer)] text-left text-xs text-[var(--muted-foreground)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Trạng thái</th>
                    <th className="px-3 py-2 font-medium">Câu hỏi</th>
                    <th className="px-3 py-2 font-medium">Đáp án</th>
                    <th className="px-3 py-2 font-medium">Lỗi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--table-line)]">
                  {preview.rows.slice(0, ROW_LIMIT).map((r) => (
                    <tr key={r.rowNumber}>
                      <td className="px-3 py-2 text-[var(--muted-foreground)]">
                        {r.rowNumber}
                      </td>
                      <td className="px-3 py-2">
                        {r.status === "ok" && (
                          <span className="rounded-full bg-[#f0fdf4] px-2 py-0.5 text-xs font-medium text-[#15803d]">
                            Hợp lệ
                          </span>
                        )}
                        {r.status === "duplicate" && (
                          <span className="rounded-full bg-[#fef9c3] px-2 py-0.5 text-xs font-medium text-[#a16207]">
                            Trùng
                          </span>
                        )}
                        {r.status === "error" && (
                          <span className="rounded-full bg-[#fef2f2] px-2 py-0.5 text-xs font-medium text-[#b91c1c]">
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
        <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[#f0fdf4] p-5">
          <h2 className="text-sm font-semibold text-[#15803d]">
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
              href="/learn/decks"
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
            >
              Xem bộ thẻ
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
