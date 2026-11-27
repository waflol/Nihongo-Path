"use client";

import { useEffect, useRef, useState } from "react";
import { deskButton, deskButtonPrimary, errorOf, questionsOf, type Draft } from "./exam-import-draft-model";

/** The file's answers for one draft, indexed by `no - 1` (0 = not in the file). */
export interface GivenAnswers {
  draftId: string;
  answers: number[];
}

/** An empty answer takes the file's; one already picked is replaced only with `overwrite` (same rule as the API). */
export function mergeGiven(current: number[], given: number[], overwrite: boolean): number[] {
  const out = [...current];
  given.forEach((a, i) => {
    if (a > 0 && (overwrite || !(out[i] > 0))) out[i] = a;
  });
  return Array.from(out, (a) => (a > 0 ? a : 0));
}

interface Preview {
  text: string;
  matched: number;
  problems: string[];
  given: GivenAnswers[];
}

const SHORT_EXAMPLE = ["[2010-07]", "問題1: 3 1 4 2 2", "問題2: 1 3 2 4 4 1 2", "", "[2010-12]", "問題1: 21434"].join("\n");

/**
 * Load the printed answers of the whole import from one file (NP-407): the template
 * (one row per question, downloaded from here) or the short `問題1: 3 1 4 2` layout.
 * The file is matched on the server, previewed against the reviewer's own picks, then
 * stored on the drafts.
 */
export function AnswerFileDialog({
  jobId,
  drafts,
  answersById,
  onApply,
  onClose,
}: {
  jobId: string;
  drafts: Draft[];
  answersById: Record<string, number[]>;
  /** The answers were stored; merge them into the desk's picks. */
  onApply: (given: GivenAnswers[], overwrite: boolean, saved: number) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState<"template" | "read" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    box.current?.focus();
  }, []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function downloadTemplate() {
    setBusy("template");
    setError(null);
    const res = await fetch(`/api/exam-import?answerFile=${jobId}`, { cache: "no-store" }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      setError(res ? await errorOf(res) : "Không kết nối được máy chủ");
      return;
    }
    const t = (await res.json()) as { fileName: string; csv: string };
    const url = URL.createObjectURL(new Blob([t.csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = t.fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function send(body: { text: string; save?: boolean; overwrite?: boolean }) {
    const res = await fetch(`/api/exam-import?answerFile=${jobId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!res?.ok) {
      setError(res ? await errorOf(res) : "Không kết nối được máy chủ");
      return null;
    }
    return (await res.json()) as { matched: number; problems: string[]; given: GivenAnswers[]; saved: number };
  }

  async function read() {
    setBusy("read");
    setError(null);
    setPreview(null);
    const r = await send({ text });
    setBusy(null);
    if (r) setPreview({ text, matched: r.matched, problems: r.problems, given: r.given });
  }

  async function save() {
    if (!preview) return;
    setBusy("save");
    setError(null);
    const r = await send({ text: preview.text, save: true, overwrite });
    setBusy(null);
    if (r) onApply(r.given, overwrite, r.saved);
  }

  // What loading the file would change, against the answers on the desk now.
  const byId = new Map(drafts.map((d) => [d._id, d]));
  let fill = 0;
  let same = 0;
  const differ: string[] = [];
  for (const g of preview?.given ?? []) {
    const d = byId.get(g.draftId);
    const current = answersById[g.draftId] ?? [];
    g.answers.forEach((a, i) => {
      if (!(a > 0)) return;
      const c = current[i] ?? 0;
      if (!(c > 0)) fill += 1;
      else if (c === a) same += 1;
      else {
        const q = d ? questionsOf(d).find((x) => x.no === i + 1) : undefined;
        differ.push(`câu ${q?.printedNo ?? i + 1} (khối ${(d?.blockIndex ?? 0) + 1}): đang ${c}, file ${a}`);
      }
    });
  }
  const changes = fill + (overwrite ? differ.length : 0);

  return (
    <div className="fixed inset-x-0 bottom-0 top-0 z-[60] grid place-items-center bg-black/40 p-3 lg:top-16" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby="answer-file-title"
        tabIndex={-1}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[var(--sheet-rule)] bg-[var(--sheet)] text-[var(--sheet-ink)] shadow-2xl outline-none"
      >
        <header className="flex items-center gap-3 border-b border-[var(--sheet-rule)] px-5 py-3">
          <h2 id="answer-file-title" className="flex-1 text-base font-semibold">
            Nhập file đáp án
          </h2>
          <button type="button" className={deskButton} onClick={onClose}>
            Đóng
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4 text-sm">
          <section className="space-y-2">
            <h3 className="font-semibold">1. Điền đáp án theo cấu trúc đề</h3>
            <p className="text-[var(--muted-foreground)]">
              File mẫu có sẵn mọi câu của lần nhập này, mỗi câu một dòng: <code>de, khoi, dang, cau, dap_an</code>. Chỉ cần điền cột{" "}
              <code>dap_an</code> (1–4). Mở bằng Excel thì lưu lại dạng <b>CSV UTF-8</b>.
            </p>
            <button type="button" className={deskButton} disabled={busy !== null} onClick={() => void downloadTemplate()}>
              {busy === "template" ? "Đang tạo…" : "Tải file mẫu (.csv)"}
            </button>
            <details className="text-[var(--muted-foreground)]">
              <summary className="cursor-pointer select-none">Hoặc gõ gọn theo từng đề và 問題</summary>
              <p className="mt-1.5">
                Mỗi đề mở bằng một dòng <code>[tên đề]</code> (như trong danh sách khối), rồi mỗi <code>問題</code> một dòng, đáp án theo thứ tự câu in
                trên đề. Dùng <code>-</code> cho câu chưa biết. Lần nhập chỉ có một đề thì không cần dòng tên đề.
              </p>
              <pre className="mt-1.5 rounded-md bg-[var(--desk)] px-3 py-2 text-xs leading-5 text-[var(--sheet-ink)]">{SHORT_EXAMPLE}</pre>
            </details>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold">2. Chọn file hoặc dán nội dung</h3>
            <input
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/plain"
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-[var(--sheet-rule)] file:bg-[var(--sheet)] file:px-3 file:py-1.5 file:text-sm"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setFileName(f.name);
                setPreview(null);
                setText(f.size > 300_000 ? "" : await f.text());
                setError(f.size > 300_000 ? "File quá lớn (tối đa ~300 KB)" : null);
              }}
            />
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setFileName("");
                setPreview(null);
              }}
              rows={6}
              spellCheck={false}
              placeholder={SHORT_EXAMPLE}
              aria-label="Nội dung file đáp án"
              className="exam-ja w-full rounded-lg border border-[var(--sheet-rule)] bg-[var(--sheet)] px-3 py-2 font-mono text-xs leading-5"
            />
            <button type="button" className={deskButton} disabled={busy !== null || !text.trim()} onClick={() => void read()}>
              {busy === "read" ? "Đang đọc…" : `Đọc ${fileName ? `“${fileName}”` : "nội dung"}`}
            </button>
          </section>

          {error && (
            <p role="alert" className="text-[var(--bad)]">
              {error}
            </p>
          )}

          {preview && (
            <section role="status" className="space-y-2">
              <h3 className="font-semibold">3. Kiểm tra trước khi lưu</h3>
              <ul className="list-disc space-y-0.5 pl-5">
                <li>
                  File khớp <b>{preview.matched}</b> câu ở {preview.given.length} khối.
                </li>
                <li>
                  Điền <b>{fill}</b> câu còn trống{same > 0 ? `, ${same} câu trùng đáp án đã có` : ""}.
                </li>
                {differ.length > 0 && (
                  <li className="text-[var(--warn)]">
                    {differ.length} câu khác đáp án đang có: {differ.slice(0, 8).join("; ")}
                    {differ.length > 8 ? `; … và ${differ.length - 8} câu nữa` : ""}
                  </li>
                )}
              </ul>
              {differ.length > 0 && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
                  Thay {differ.length} câu đó bằng đáp án trong file
                </label>
              )}
              {preview.problems.length > 0 && (
                <div className="rounded-lg border border-[var(--bad)]/40 bg-[var(--bad)]/10 px-3 py-2 text-[var(--bad)]">
                  <p className="font-semibold">{preview.problems.length} dòng không dùng được</p>
                  <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5">
                    {preview.problems.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[var(--sheet-rule)] px-5 py-3">
          <p className="mr-auto text-xs text-[var(--muted-foreground)]">Đáp án được lưu vào bản nháp; câu hỏi chưa xuất bản.</p>
          <button
            type="button"
            className={deskButtonPrimary}
            disabled={busy !== null || !preview || changes === 0}
            onClick={() => void save()}
          >
            {busy === "save" ? "Đang lưu…" : `Lưu ${changes} đáp án`}
          </button>
        </footer>
      </div>
    </div>
  );
}
