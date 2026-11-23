"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EXAM_IMPORT_STARTED_EVENT } from "@/components/admin/exam-import-tracker";

const inputClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]";
const btnPrimary =
  "rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60";
const LEVELS = ["N5", "N4", "N3", "N2", "N1"];

interface AudioAsset {
  _id: string;
  fileName: string;
  size: number;
  level?: string;
  label?: string;
}

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
    const res = await fetch("/api/exam-import", { method: "POST", body: fd }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) {
      setMsg({ ok: false, text: res ? await errorOf(res) : "Không kết nối được máy chủ" });
      return;
    }
    setFile(null);
    (e.target as HTMLFormElement).reset();
    setMsg({ ok: true, text: "Đã bắt đầu nhập — theo dõi ở thẻ tiến độ góc phải dưới (có thể sang trang khác, có nút Hủy và Nhật ký)." });
    window.dispatchEvent(new Event(EXAM_IMPORT_STARTED_EVENT));
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4 sm:p-5">
      <h2 className="text-base font-semibold text-[var(--foreground)]">Nhập đề từ PDF</h2>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Đọc từng trang, tách theo 問題, AI chỉ cấu trúc hoá (không đoán đáp án). Mỗi lần một file; tối đa 30 MB.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_8rem_10rem]">
        <label className="text-sm">
          <span className="text-[var(--muted-foreground)]">File PDF</span>
          <input
            type="file"
            accept="application/pdf"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className={`mt-1 ${inputClass}`}
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

interface RecentJob {
  _id: string;
  fileName: string;
  level: string;
  status: string;
  blocksFound?: number;
  blocksOk?: number;
  blocksError?: number;
}

/** Past imports, each linking to its draft review screen. */
function RecentImports() {
  const [jobs, setJobs] = useState<RecentJob[]>([]);
  useEffect(() => {
    void fetch("/api/exam-import", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((j) => setJobs(Array.isArray(j) ? (j as RecentJob[]) : []))
      .catch(() => undefined);
  }, []);
  if (jobs.length === 0) return null;
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4 sm:p-5">
      <h2 className="text-base font-semibold text-[var(--foreground)]">Các lần nhập gần đây</h2>
      <ul className="mt-2 divide-y divide-[var(--border)] text-sm">
        {jobs.map((j) => (
          <li key={j._id} className="flex flex-wrap items-center gap-2 py-2">
            <span className="min-w-0 flex-1 truncate text-[var(--foreground)]">
              {j.level} · {j.fileName}
            </span>
            <span className="text-xs text-[var(--muted-foreground)]">
              {j.status} · {j.blocksFound ?? 0} khối ({j.blocksOk ?? 0} ổn, {j.blocksError ?? 0} lỗi)
            </span>
            <Link href={`/admin/exams/import/${j._id}/drafts`} className="font-medium text-[var(--primary)] hover:underline">
              Duyệt bản nháp
            </Link>
            <Link href={`/admin/exams/import/${j._id}/log`} className="text-[var(--muted-foreground)] hover:underline">
              Log
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Listening clips: upload, list, and attach a stretch of a clip to a question / passage. */
function AudioLibrary() {
  const [assets, setAssets] = useState<AudioAsset[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [level, setLevel] = useState("N3");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [target, setTarget] = useState<"question" | "stimulus">("question");
  const [targetId, setTargetId] = useState("");
  const [assetId, setAssetId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/exam-audio", { cache: "no-store" }).catch(() => null);
    const list = res?.ok ? ((await res.json().catch(() => [])) as AudioAsset[]) : [];
    setAssets(Array.isArray(list) ? list : []);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) return;
    setBusy(true);
    setMsg(null);
    let ok = 0;
    const errors: string[] = [];
    for (const f of files) {
      const fd = new FormData();
      fd.set("file", f);
      fd.set("level", level);
      fd.set("label", label || f.name);
      const res = await fetch("/api/exam-audio", { method: "POST", body: fd }).catch(() => null);
      if (res?.ok) ok += 1;
      else errors.push(`${f.name}: ${res ? await errorOf(res) : "mất kết nối"}`);
    }
    setBusy(false);
    setFiles([]);
    (e.target as HTMLFormElement).reset();
    setMsg({ ok: errors.length === 0, text: `Đã tải ${ok}/${files.length} file.${errors.length ? ` Lỗi: ${errors.join(" | ")}` : ""}` });
    void load();
  }

  async function attach(clear: boolean) {
    setMsg(null);
    const body = clear
      ? { assetId: null }
      : { assetId, ...(start !== "" ? { startSec: Number(start) } : {}), ...(end !== "" ? { endSec: Number(end) } : {}) };
    const res = await fetch(`/api/exam-audio?target=${target}&id=${encodeURIComponent(targetId.trim())}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setMsg(res?.ok ? { ok: true, text: clear ? "Đã gỡ âm thanh." : "Đã gắn âm thanh." } : { ok: false, text: res ? await errorOf(res) : "Mất kết nối" });
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4 sm:p-5">
      <h2 className="text-base font-semibold text-[var(--foreground)]">File nghe (聴解)</h2>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Tải mp3 / m4a / ogg (≤ 40 MB). Một file có thể là cả bài nghe — mỗi câu gắn một đoạn <em>bắt đầu–kết thúc</em> (giây) của nó, hoặc mỗi câu một file riêng.
      </p>
      <form onSubmit={upload} className="mt-3 grid gap-3 sm:grid-cols-[1fr_8rem_1fr_auto] sm:items-end">
        <label className="text-sm">
          <span className="text-[var(--muted-foreground)]">File (chọn nhiều được)</span>
          <input
            type="file"
            multiple
            required
            accept="audio/mpeg,audio/mp4,audio/ogg,.mp3,.m4a,.ogg"
            onChange={(e) => setFiles([...(e.target.files ?? [])])}
            className={`mt-1 ${inputClass}`}
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
          <span className="text-[var(--muted-foreground)]">Nhãn (mặc định: tên file)</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} className={`mt-1 ${inputClass}`} />
        </label>
        <button type="submit" disabled={busy || files.length === 0} className={btnPrimary}>
          {busy ? "Đang tải…" : "Tải lên"}
        </button>
      </form>

      {assets.length > 0 && (
        <ul className="mt-4 max-h-56 divide-y divide-[var(--border)] overflow-y-auto rounded-lg border border-[var(--border)] text-sm">
          {assets.map((a) => (
            <li key={a._id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <span className="min-w-0 flex-1 truncate" title={a.fileName}>
                {a.label || a.fileName} {a.level && <span className="text-[var(--muted-foreground)]">· {a.level}</span>}
              </span>
              <span className="text-xs text-[var(--muted-foreground)]">{(a.size / 1048576).toFixed(1)} MB</span>
              <audio controls preload="none" src={`/api/exam-audio/${a._id}`} className="h-8 w-full sm:w-56" />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 border-t border-[var(--border)] pt-4">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">Gắn đoạn nghe vào câu</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-[8rem_1fr_1fr_6rem_6rem]">
          <label className="text-sm">
            <span className="text-[var(--muted-foreground)]">Gắn vào</span>
            <select value={target} onChange={(e) => setTarget(e.target.value as "question" | "stimulus")} className={`mt-1 ${inputClass}`}>
              <option value="question">Câu hỏi</option>
              <option value="stimulus">Cả nhóm (bài đọc/nghe)</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="text-[var(--muted-foreground)]">ID {target === "question" ? "câu hỏi" : "nhóm"}</span>
            <input value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder="ObjectId" className={`mt-1 ${inputClass}`} />
          </label>
          <label className="text-sm">
            <span className="text-[var(--muted-foreground)]">File</span>
            <select value={assetId} onChange={(e) => setAssetId(e.target.value)} className={`mt-1 ${inputClass}`}>
              <option value="">—</option>
              {assets.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.label || a.fileName}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-[var(--muted-foreground)]">Từ (giây)</span>
            <input value={start} onChange={(e) => setStart(e.target.value)} inputMode="decimal" className={`mt-1 ${inputClass}`} />
          </label>
          <label className="text-sm">
            <span className="text-[var(--muted-foreground)]">Đến (giây)</span>
            <input value={end} onChange={(e) => setEnd(e.target.value)} inputMode="decimal" className={`mt-1 ${inputClass}`} />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={!targetId.trim() || !assetId} onClick={() => void attach(false)} className={btnPrimary}>
            Gắn
          </button>
          <button
            type="button"
            disabled={!targetId.trim()}
            onClick={() => void attach(true)}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)] disabled:opacity-60"
          >
            Gỡ âm thanh
          </button>
        </div>
      </div>
      {msg && (
        <p role="status" className={`mt-3 text-sm ${msg.ok ? "text-[var(--muted-foreground)]" : "text-[#b91c1c]"}`}>
          {msg.text}
        </p>
      )}
    </section>
  );
}

/** Admin page body: import a PDF exam + manage listening clips (NP-407 / NP-410). */
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
        File nghe: chỉ thêm sau khi đã duyệt và xuất bản xong bản nháp của đề (bước duyệt ở trên).
      </p>
      <AudioLibrary />
    </div>
  );
}
