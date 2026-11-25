"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DraftBlock } from "./exam-import-draft-block";
import {
  deskButton,
  errorOf,
  fillAnswers,
  isOpen,
  isReady,
  missingCount,
  STATE_LABEL,
  STATE_TEXT,
  stateOf,
  questionsOf,
  type BlockState,
  type Draft,
} from "./exam-import-draft-model";
import { MONDAI_LABELS } from "@/components/learn/exam-sectioned";

interface Job {
  fileName: string;
  level: string;
  status: string;
}

const PROGRESS: BlockState[] = ["published", "ready", "missing", "error", "discarded"];

/** Review screen of one exam-PDF import (NP-407): check each 問題 block, type the printed answers, publish or discard. */
export function ExamImportDrafts({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [failed, setFailed] = useState(false);
  const [sittingFilter, setSittingFilter] = useState("");
  /** The reviewer's answers per draft, kept here so "publish the whole paper" sees every card's picks. */
  const [answersById, setAnswersById] = useState<Record<string, number[]>>({});
  const [bulk, setBulk] = useState<{ busy: boolean; ok: boolean; text: string } | null>(null);
  const [selected, setSelected] = useState<{ id: string; index: number }>({ id: "", index: 0 });
  /** Small screens show the block list as a drawer. */
  const [listOpen, setListOpen] = useState(false);
  const editing = useRef(false);
  const rail = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    const [dr, lr] = await Promise.all([
      fetch(`/api/exam-import?drafts=${encodeURIComponent(jobId)}`, { cache: "no-store" }).catch(() => null),
      fetch(`/api/exam-import?log=${encodeURIComponent(jobId)}`, { cache: "no-store" }).catch(() => null),
    ]);
    if (!dr?.ok) {
      setFailed(true);
      return;
    }
    setFailed(false);
    const list = (await dr.json()) as Draft[];
    setDrafts(list);
    // Seed answers from the server without overwriting what the reviewer already picked.
    setAnswersById((prev) => {
      const next = { ...prev };
      for (const d of list) {
        if (next[d._id]) continue;
        const a: number[] = [];
        for (const q of d.parsed?.questions ?? []) a[q.no - 1] = d.answers[q.no - 1] ?? 0;
        next[d._id] = a;
      }
      return next;
    });
    const body = lr?.ok ? ((await lr.json().catch(() => null)) as { job?: Job } | null) : null;
    if (body?.job) setJob(body.job);
  }, [jobId]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  // The desk fills the window below the site header; the page behind it must not scroll.
  useEffect(() => {
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = before;
    };
  }, []);

  const all = drafts ?? [];
  const shown = all.filter((d) => (!sittingFilter || d.sitting === sittingFilter) && (filter === "all" || isOpen(d)));
  // When the selected block leaves the list (published, filtered out), move on to the next one.
  const current = shown.find((d) => d._id === selected.id) ?? shown.find((d) => d.blockIndex >= selected.index) ?? shown.at(-1);
  const currentId = current?._id;

  // Pin the block on screen, so typing its last answer or a reload never swaps it out.
  if (current && current._id !== selected.id) setSelected({ id: current._id, index: current.blockIndex });

  useEffect(() => {
    rail.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [currentId]);

  // One group per sitting, in the order the paper presents them.
  const groups = new Map<string, Draft[]>();
  for (const d of shown) groups.set(d.sitting, [...(groups.get(d.sitting) ?? []), d]);
  const sittings = [...new Set(all.map((d) => d.sitting))];
  const sittingStats = (name: string) => {
    const list = all.filter((d) => d.sitting === name);
    return { total: list.length, done: list.filter((d) => !isOpen(d)).length };
  };
  const readyOf = (name: string) =>
    all.filter((d) => d.sitting === name && d.status === "needs_review" && isReady(d, answersById[d._id]));
  const counts = all.reduce<Partial<Record<BlockState, number>>>((m, d) => {
    const k = stateOf(d, answersById[d._id]);
    m[k] = (m[k] ?? 0) + 1;
    return m;
  }, {});

  /** Unsaved edits are lost when the block changes, so ask first. */
  function leaveEditor(): boolean {
    if (editing.current && !window.confirm("Bỏ phần chỉnh sửa chưa lưu của khối này?")) return false;
    editing.current = false;
    return true;
  }
  function select(d: Draft) {
    setListOpen(false);
    if (d._id === currentId || !leaveEditor()) return;
    setSelected({ id: d._id, index: d.blockIndex });
  }
  function step(dir: -1 | 1) {
    const next = shown[shown.findIndex((d) => d._id === currentId) + dir];
    if (next) select(next);
  }

  async function publishSitting(name: string) {
    const ready = readyOf(name);
    if (ready.length === 0) return;
    if (!window.confirm(`Xuất bản ${ready.length} khối đã đủ đáp án của đề "${name}"?`)) return;
    setBulk({ busy: true, ok: true, text: `Đang xuất bản 0/${ready.length}…` });
    let n = 0;
    for (const d of ready) {
      const res = await fetch(`/api/exam-import?publish=${d._id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: fillAnswers(d, answersById[d._id]) }),
      }).catch(() => null);
      if (!res?.ok) {
        setBulk({
          busy: false,
          ok: false,
          text: `Dừng ở khối ${d.blockIndex + 1} (đã xuất bản ${n}/${ready.length}): ${res ? await errorOf(res) : "mất kết nối"}`,
        });
        await load();
        return;
      }
      n += 1;
      setBulk({ busy: true, ok: true, text: `Đang xuất bản ${n}/${ready.length}…` });
    }
    setBulk({ busy: false, ok: true, text: `Đã xuất bản ${n} khối của đề "${name}".` });
    await load();
  }

  /** Re-read the kept PDF and add furigana / underlines to blocks nobody has formatted yet. */
  async function addMarks() {
    if (!leaveEditor()) return;
    setBulk({ busy: true, ok: true, text: "Đang đọc lại PDF để bổ sung furigana, gạch chân… (có thể mất vài phút)" });
    const res = await fetch(`/api/exam-import?marks=${jobId}`, { method: "POST" }).catch(() => null);
    if (!res?.ok) {
      setBulk({ busy: false, ok: false, text: res ? await errorOf(res) : "Mất kết nối khi đang bổ sung — bấm Tải lại để xem kết quả" });
      return;
    }
    const r = (await res.json()) as { drafts: number; changed: number; skipped: number };
    await load();
    setBulk({
      busy: false,
      ok: true,
      text: `Đã bổ sung furigana, gạch chân cho ${r.changed}/${r.drafts} khối chưa xử lý${r.skipped ? `, bỏ qua ${r.skipped} khối không rõ trang` : ""}.`,
    });
  }

  const empty = failed
    ? "Không tải được bản nháp (cần quyền admin nội dung). Đăng nhập lại rồi bấm Tải lại."
    : drafts === null
      ? "Đang tải…"
      : all.length === 0
        ? "Lần nhập này chưa tạo bản nháp nào. Nếu job còn chạy, đợi xong rồi bấm Tải lại; nếu job đã xong, xem log để biết lý do."
        : "Không còn khối nào cần duyệt.";

  return (
    <div className="exam-desk fixed inset-x-0 bottom-0 top-16 z-40 flex flex-col text-[var(--sheet-ink)]">
      <header className="border-b border-[var(--sheet-rule)] bg-[var(--sheet)] px-4 pb-2 pt-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            href="/admin/exams/import"
            onClick={(e) => {
              if (!leaveEditor()) e.preventDefault();
            }}
            className={deskButton}
          >
            Thoát
          </Link>
          <div className="order-first min-w-0 basis-full sm:order-none sm:flex-1 sm:basis-48">
            <h1 className="truncate text-lg font-semibold leading-6 tracking-tight">Duyệt bản nháp đề</h1>
            <p className="truncate text-xs text-[var(--muted-foreground)]" title={job?.fileName}>
              {job ? `${job.level}, ${job.fileName}` : "Đối chiếu text gốc, điền đáp án theo bảng 答案 rồi xuất bản"}
            </p>
          </div>
          {drafts && (
            <ul className="hidden flex-wrap gap-x-4 text-xs text-[var(--muted-foreground)] md:flex">
              {PROGRESS.map((k) => (
                <li key={k} className="flex items-center gap-1.5">
                  <span aria-hidden className={`h-2 w-2 rounded-full bg-current ${STATE_TEXT[k]}`} />
                  {STATE_LABEL[k]} <b className="tabular-nums text-[var(--sheet-ink)]">{counts[k] ?? 0}</b>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className={`${deskButton} lg:hidden`} aria-expanded={listOpen} onClick={() => setListOpen(!listOpen)}>
            Danh sách khối
          </button>
          <button
            type="button"
            className={deskButton}
            disabled={bulk?.busy || !all.some(isOpen)}
            title="Đọc lại file PDF, thêm furigana và gạch chân vào các khối chưa xử lý (khối đã tự định dạng được giữ nguyên)"
            onClick={() => void addMarks()}
          >
            Bổ sung furigana
          </button>
          <button type="button" className={deskButton} onClick={() => void load()}>
            Tải lại
          </button>
        </div>
        <div
          role="img"
          aria-label={`${all.filter((d) => !isOpen(d)).length}/${all.length} khối đã xử lý`}
          className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-[var(--sheet-rule)]"
        >
          {PROGRESS.map((k) => (
            <span key={k} className={`bg-current ${STATE_TEXT[k]}`} style={{ width: `${((counts[k] ?? 0) / Math.max(1, all.length)) * 100}%` }} />
          ))}
        </div>
        {bulk && (
          <p role="status" className={`mt-1.5 text-sm ${bulk.ok ? "text-[var(--muted-foreground)]" : "text-[var(--bad)]"}`}>
            {bulk.text}
          </p>
        )}
      </header>

      <div className="relative flex min-h-0 flex-1">
        <nav
          ref={rail}
          aria-label="Các khối của bản nháp"
          className={`${listOpen ? "absolute inset-y-0 left-0 z-20 flex shadow-2xl" : "hidden"} w-72 max-w-[85vw] shrink-0 flex-col border-r border-[var(--sheet-rule)] bg-[var(--sheet)] lg:static lg:flex lg:shadow-none`}
        >
          <div className="space-y-2 border-b border-[var(--sheet-rule)] p-3">
            {sittings.length > 1 && (
              <select
                aria-label="Lọc theo đề"
                value={sittingFilter}
                onChange={(e) => {
                  if (leaveEditor()) setSittingFilter(e.target.value);
                }}
                className="w-full rounded-lg border border-[var(--sheet-rule)] bg-[var(--sheet)] px-2 py-1.5 text-sm"
              >
                <option value="">Tất cả ({sittings.length} đề)</option>
                {sittings.map((n) => (
                  <option key={n} value={n}>
                    {n} ({sittingStats(n).done}/{sittingStats(n).total} khối xong)
                  </option>
                ))}
              </select>
            )}
            <div role="group" aria-label="Hiển thị" className="grid grid-cols-2 gap-1 rounded-lg bg-[var(--desk)] p-1 text-xs font-medium">
              {(
                [
                  ["open", "Chưa xử lý"],
                  ["all", "Tất cả"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => {
                    if (leaveEditor()) setFilter(value);
                  }}
                  className={`rounded-md py-1 ${filter === value ? "bg-[var(--sheet)] shadow-sm" : "text-[var(--muted-foreground)]"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3">
            {[...groups.entries()].map(([name, items]) => {
              const stats = sittingStats(name);
              const ready = readyOf(name).length;
              return (
                <section key={name}>
                  <div className="sticky top-0 z-10 border-b border-[var(--sheet-rule)] bg-[var(--sheet)] px-3 py-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <h2 className="truncate text-sm font-semibold">Đề {name}</h2>
                      <span className="shrink-0 text-xs tabular-nums text-[var(--muted-foreground)]">
                        {stats.done}/{stats.total} xong
                      </span>
                    </div>
                    {ready > 0 && (
                      <button
                        type="button"
                        className="mt-1.5 w-full rounded-lg border border-[var(--ok)]/50 bg-[var(--ok)]/10 py-1 text-xs font-semibold text-[var(--ok)] hover:bg-[var(--ok)]/20 disabled:opacity-50"
                        disabled={bulk?.busy}
                        onClick={() => void publishSitting(name)}
                      >
                        Xuất bản {ready} khối đã đủ đáp án
                      </button>
                    )}
                  </div>
                  <ul>
                    {items.map((d) => {
                      const state = stateOf(d, answersById[d._id]);
                      const active = d._id === currentId;
                      const total = questionsOf(d).length;
                      return (
                        <li key={d._id}>
                          <button
                            type="button"
                            aria-current={active ? "true" : undefined}
                            onClick={() => select(d)}
                            className={`flex w-full scroll-mt-20 items-center gap-2.5 border-l-[3px] py-2 pl-2.5 pr-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--primary)] ${
                              active ? "border-[var(--primary)] bg-[var(--primary)]/10" : "border-transparent hover:bg-[var(--desk)]"
                            }`}
                          >
                            <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full bg-current ${STATE_TEXT[state]}`} />
                            <span className="w-7 shrink-0 text-xs tabular-nums text-[var(--muted-foreground)]">{d.blockIndex + 1}</span>
                            <span className={`min-w-0 flex-1 truncate text-sm ${d.status === "discarded" ? "line-through opacity-60" : ""}`}>
                              {d.mondai ? (MONDAI_LABELS[d.mondai] ?? d.mondai) : "Chưa nhận ra dạng"}
                              <span className="sr-only">, {STATE_LABEL[state]}</span>
                            </span>
                            <span
                              className="shrink-0 text-xs tabular-nums text-[var(--muted-foreground)]"
                              title={isOpen(d) ? "Số câu đã có đáp án / tổng số câu" : "Số câu"}
                            >
                              {isOpen(d) ? `${total - missingCount(d, answersById[d._id])}/${total}` : total}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        </nav>

        <main className="flex min-w-0 flex-1 flex-col">
          {current ? (
            <DraftBlock
              key={current._id}
              draft={current}
              jobId={jobId}
              answers={answersById[current._id] ?? []}
              setAnswers={(a) => setAnswersById((m) => ({ ...m, [current._id]: a }))}
              onChanged={load}
              onDone={(text) => setBulk({ busy: false, ok: true, text })}
              onEditingChange={(v) => {
                editing.current = v;
              }}
              onStep={step}
            />
          ) : (
            <p role="status" className="m-auto max-w-md px-6 text-center text-sm text-[var(--muted-foreground)]">
              {empty}
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
