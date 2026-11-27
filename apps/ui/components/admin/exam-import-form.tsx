"use client";

import Link from "next/link";
import { useState } from "react";
import { RecentImports } from "@/components/admin/exam-import-recent";
import { EXAM_IMPORT_STARTED_EVENT } from "@/components/admin/exam-import-tracker";

const inputClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]";
const btnPrimary =
  "rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60";
// Native "Choose file" button: styled as a button while empty, hidden once a file is picked.
const fileButton =
  "file:mr-3 file:rounded file:border-0 file:bg-[var(--layer)] file:px-3 file:py-0.5 file:text-xs file:font-medium file:text-[var(--foreground)]";
const LEVELS = ["N5", "N4", "N3", "N2", "N1"];
const KINDS = [
  { value: "full", label: "Đề đầy đủ", hint: "Có đủ các phần thi của cấp độ, kể cả 聴解." },
  { value: "section", label: "Đề theo phần", hint: "Chỉ một vài phần thi. File khác cùng bộ đề và kỳ thi sẽ gộp vào đề này." },
  { value: "practice", label: "Sách luyện tập", hint: "Đọc và duyệt được, nhưng chưa xuất bản được — phần làm từng câu đang được làm." },
] as const;

async function errorOf(res: Response): Promise<string> {
  const b = (await res.json().catch(() => null)) as { message?: string | string[]; error?: string } | null;
  const m = b?.message ?? b?.error;
  return Array.isArray(m) ? m.join("; ") : (m ?? `Lỗi ${res.status}`);
}

/** Upload a JLPT exam PDF (background import, shown by the global tracker). */
function PdfUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [level, setLevel] = useState("N3");
  const [rights, setRights] = useState("reference");
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("full");
  const [setName, setSetName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("level", level);
    fd.set("rights", rights);
    fd.set("kind", kind);
    fd.set("setName", setName.trim());
    const res = await fetch("/api/exam-import", { method: "POST", body: fd }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) {
      setMsg({ ok: false, text: res ? await errorOf(res) : "Không kết nối được máy chủ" });
      return;
    }
    setFile(null);
    setSetName("");
    (e.target as HTMLFormElement).reset();
    setMsg({ ok: true, text: "Đã bắt đầu nhập — theo dõi ở thẻ tiến độ góc phải dưới (có thể sang trang khác, có nút Hủy và Nhật ký)." });
    window.dispatchEvent(new Event(EXAM_IMPORT_STARTED_EVENT));
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4 sm:p-5">
      <h2 className="text-base font-semibold text-[var(--foreground)]">Nhập đề từ PDF</h2>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Đọc từng trang, tách theo 問題, AI chỉ cấu trúc hoá (không đoán đáp án). Mỗi lần một file; tối đa 100 MB.
      </p>
      <fieldset className="mt-3">
        <legend className="text-sm text-[var(--muted-foreground)]">Loại file</legend>
        <div className="mt-1 grid gap-2 sm:grid-cols-3">
          {KINDS.map((k) => (
            <label
              key={k.value}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--foreground)] has-[:checked]:border-[var(--primary)] has-[:checked]:bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]"
            >
              <input
                type="radio"
                name="exam-kind"
                checked={kind === k.value}
                onChange={() => setKind(k.value)}
                className="size-4 accent-[var(--primary)]"
              />
              {k.label}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-[var(--muted-foreground)]">{KINDS.find((k) => k.value === kind)?.hint}</p>
      </fieldset>
      <label className="mt-3 block text-sm">
        <span className="text-[var(--muted-foreground)]">{kind === "practice" ? "Tên sách" : "Tên bộ đề"} (bỏ trống = tên file)</span>
        <input
          value={setName}
          maxLength={150}
          onChange={(e) => setSetName(e.target.value)}
          placeholder="Đề chính thức N3"
          className={`mt-1 ${inputClass}`}
        />
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_8rem_10rem]">
        <label className="text-sm">
          <span className="text-[var(--muted-foreground)]">File PDF</span>
          <input
            type="file"
            accept="application/pdf"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className={`mt-1 ${inputClass} ${file ? "file:hidden" : fileButton}`}
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted-foreground)]">Cấp độ</span>
          <select value={level} onChange={(e) => setLevel(e.target.value)} className={`mt-1 ${inputClass}`}>
            {LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted-foreground)]">Bản quyền</span>
          <select value={rights} onChange={(e) => setRights(e.target.value)} className={`mt-1 ${inputClass}`}>
            <option value="reference">Tham khảo</option>
            <option value="licensed">Có giấy phép</option>
            <option value="own">Tự soạn</option>
          </select>
        </label>
      </div>
      {rights === "reference" && (
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">Đề nguồn tham khảo không công khai được cho người học; admin vẫn làm thử được.</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy || !file} className={btnPrimary}>
          {busy ? "Đang tải lên…" : "Tải lên và nhập"}
        </button>
        {msg && (
          <p role="status" className={`text-sm ${msg.ok ? "text-[var(--muted-foreground)]" : "text-[#b91c1c]"}`}>
            {msg.text}
          </p>
        )}
      </div>
    </form>
  );
}

/** Admin page body: import a PDF exam (NP-407). Listening files are attached per block on the review screen. */
export function ExamImportForm() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <Link href="/admin/exams" className="text-sm text-[var(--primary)] hover:underline">
          ← Đề thi
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--foreground)]">Nhập đề JLPT</h1>
      </div>
      <PdfUpload />
      <RecentImports />
      <p className="text-sm text-[var(--muted-foreground)]">
        File nghe (聴解) gắn ở màn duyệt bản nháp: mở lần nhập, chọn khối nghe hiểu, dùng ô “File nghe” trên đầu khối.
      </p>
    </div>
  );
}
