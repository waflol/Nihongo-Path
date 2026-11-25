"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface RecentJob {
  _id: string;
  fileName: string;
  level: string;
  status: string;
  numPages?: number;
  pagesDone?: number;
  blocksFound?: number;
  blocksOk?: number;
  blocksError?: number;
  error?: string;
  createdAt?: string;
}

const STATUS: Record<string, { label: string; tone: string }> = {
  running: { label: "Đang nhập", tone: "bg-[var(--primary)]/15 text-[var(--primary)]" },
  done: { label: "Xong", tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  error: { label: "Dừng vì lỗi", tone: "bg-red-500/15 text-red-700 dark:text-red-300" },
  cancelled: { label: "Đã huỷ", tone: "bg-[var(--foreground)]/10 text-[var(--muted-foreground)]" },
};
const statusOf = (s: string) => STATUS[s] ?? { label: s, tone: STATUS.cancelled.tone };

const WHEN = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
/** Same file imported several times is told apart by when it ran. */
const whenOf = (j: RecentJob) => (j.createdAt ? WHEN.format(new Date(j.createdAt)) : "");

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]";
const quietButton = `inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--foreground)] transition-colors hover:border-[var(--primary)] sm:h-9 sm:rounded-lg ${focusRing}`;

/** The card's one main action: a deepened accent with white type, whichever accent is chosen. */
const reviewButton = `group inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[linear-gradient(180deg,color-mix(in_oklab,var(--primary)_82%,#1e1250),color-mix(in_oklab,var(--primary)_58%,#1e1250))] px-3 text-sm font-semibold text-white sm:px-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_10px_22px_-12px_var(--primary)] ring-1 ring-inset ring-white/10 transition-[filter,transform] hover:brightness-110 active:translate-y-px sm:order-last sm:h-9 sm:flex-none sm:rounded-lg ${focusRing}`;

function ReviewIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5M8.5 14.5l2.5 2.5 4.5-5" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  );
}

/** How much of the paper came through: read cleanly, failed, and the rest still unparsed. */
function Yield({ job }: { job: RecentJob }) {
  const found = job.blocksFound ?? 0;
  const parts = [
    { n: job.blocksOk ?? 0, label: "đọc ổn", color: "bg-emerald-500" },
    { n: job.blocksError ?? 0, label: "lỗi", color: "bg-red-400" },
    { n: Math.max(0, found - (job.blocksOk ?? 0) - (job.blocksError ?? 0)), label: "chưa xử lý", color: "bg-[var(--foreground)]/25" },
  ].filter((p) => p.n > 0);
  return (
    <div className="mt-3 min-w-0 flex-1">
      <p className="flex items-baseline gap-1.5 text-sm text-[var(--muted-foreground)]">
        <b className="text-2xl font-semibold leading-none tabular-nums text-[var(--foreground)]">{found}</b> khối
      </p>
      <div aria-hidden className="mt-2 flex h-2 gap-0.5 overflow-hidden rounded-full bg-[var(--foreground)]/10">
        {parts.map((p) => (
          <span key={p.label} className={`min-w-1 ${p.color}`} style={{ flexGrow: p.n, flexBasis: 0 }} />
        ))}
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-[var(--muted-foreground)]">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5">
            <span aria-hidden className={`h-2 w-2 rounded-full ${p.color}`} />
            <b className="font-semibold tabular-nums text-[var(--foreground)]">{p.n}</b> {p.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function JobCard({ job, onRemove }: { job: RecentJob; onRemove: () => void }) {
  const status = statusOf(job.status);
  const running = job.status === "running";
  const hasDrafts = (job.blocksFound ?? 0) > 0;
  const trash = (
    <button
      type="button"
      disabled={running}
      onClick={onRemove}
      aria-label={`Xoá lần nhập ${job.fileName}, ${whenOf(job)}`}
      title="Xoá lần nhập"
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_10px_20px_-14px_#dc2626] transition-colors enabled:hover:bg-red-700 disabled:opacity-35 sm:h-9 sm:w-9 sm:rounded-lg ${focusRing}`}
    >
      <TrashIcon />
    </button>
  );
  const log = (
    <Link href={`/admin/exams/import/${job._id}/log`} className={`${quietButton} shrink-0 px-4`}>
      Log
    </Link>
  );
  return (
    <li className={`rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4 ${hasDrafts ? "shadow-[0_14px_30px_-22px_rgba(10,14,30,0.55)]" : ""}`}>
      <div className="flex items-start gap-3">
        <span
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl text-lg font-bold tracking-tight ${
            hasDrafts ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "border border-dashed border-[var(--border)] text-[var(--muted-foreground)]"
          }`}
        >
          {job.level}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 break-words text-[15px] font-semibold leading-5 text-[var(--foreground)]" title={job.fileName}>
            {job.fileName}
          </h3>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[var(--muted-foreground)]">
            <span className={`rounded-full px-2 py-0.5 font-semibold ${status.tone}`}>{status.label}</span>
            <span className="tabular-nums">{whenOf(job)}</span>
            {job.numPages ? <span className="tabular-nums">{running ? `${job.pagesDone ?? 0}/${job.numPages}` : job.numPages} trang</span> : null}
          </p>
        </div>
      </div>

      {job.error && <p className="mt-2 line-clamp-2 break-words text-xs leading-5 text-red-700 dark:text-red-300">{job.error}</p>}

      {hasDrafts ? (
        <div className="sm:flex sm:items-end sm:gap-6">
          <Yield job={job} />
          <div className="mt-3.5 flex shrink-0 gap-2">
            <Link href={`/admin/exams/import/${job._id}/drafts`} className={reviewButton}>
              <ReviewIcon />
              Duyệt bản nháp
            </Link>
            {log}
            {trash}
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <p className="min-w-0 flex-1 text-sm text-[var(--muted-foreground)]">{running ? "Đang đọc trang…" : "Không có khối nào để duyệt"}</p>
          {log}
          {trash}
        </div>
      )}
    </li>
  );
}

/** Past imports, each linking to its draft review screen. */
export function RecentImports() {
  const [jobs, setJobs] = useState<RecentJob[]>([]);
  useEffect(() => {
    void fetch("/api/exam-import", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((j) => setJobs(Array.isArray(j) ? (j as RecentJob[]) : []))
      .catch(() => undefined);
  }, []);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string> | null>(null); // null = popup closed
  const [busy, setBusy] = useState(false);
  const removable = jobs.filter((j) => j.status !== "running");
  function toggle(id: string) {
    setPicked((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  async function removeSelected() {
    if (!picked || picked.size === 0) return;
    setBusy(true);
    setErr(null);
    const failed: string[] = [];
    for (const id of picked) {
      const r = await fetch(`/api/exam-import?remove=${id}`, { method: "POST" }).catch(() => null);
      if (r?.ok) setJobs((cur) => cur.filter((x) => x._id !== id));
      else failed.push(id);
    }
    setBusy(false);
    if (failed.length) {
      setErr(`Không xoá được ${failed.length} lần nhập`);
      setPicked(new Set(failed));
    } else setPicked(null);
  }
  if (jobs.length === 0) return null;
  return (
    <section aria-labelledby="recent-imports">
      <h2 id="recent-imports" className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
        Các lần nhập gần đây
      </h2>
      {err && <p className="mt-1 text-xs text-[var(--destructive,#ef4444)]">{err}</p>}
      <ul className="mt-3 space-y-3">
        {jobs.map((j) => (
          <JobCard key={j._id} job={j} onRemove={() => setPicked(new Set([j._id]))} />
        ))}
      </ul>
      {picked && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Xoá lần nhập"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
          onClick={() => !busy && setPicked(null)}
        >
          <div
            className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-[var(--foreground)]">Xoá lần nhập</h3>
            <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">
              Xoá cả bản nháp, trang và file PDF của các lần nhập đã chọn. Câu hỏi đã xuất bản vẫn được giữ.
            </p>
            <label className="mt-3 flex items-center gap-3 px-3 text-sm font-medium text-[var(--foreground)]">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--primary)]"
                checked={removable.length > 0 && picked.size === removable.length}
                onChange={(e) => setPicked(new Set(e.target.checked ? removable.map((j) => j._id) : []))}
              />
              Chọn tất cả ({removable.length})
            </label>
            <ul className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto text-sm">
              {jobs.map((j) => (
                <li key={j._id}>
                  <label
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                      picked.has(j._id) ? "border-[var(--primary)] bg-[var(--primary)]/10" : "border-[var(--border)]"
                    } ${j.status === "running" ? "opacity-50" : "cursor-pointer"}`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 accent-[var(--primary)]"
                      disabled={j.status === "running"}
                      checked={picked.has(j._id)}
                      onChange={() => toggle(j._id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-[var(--foreground)]">
                        {j.level} {j.fileName}
                      </span>
                      <span className="flex flex-wrap gap-x-2.5 text-xs text-[var(--muted-foreground)]">
                        <span className="tabular-nums">{whenOf(j)}</span>
                        <span>{statusOf(j.status).label}</span>
                        <span className="tabular-nums">{j.blocksFound ?? 0} khối</span>
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {err && <p className="mt-2 text-xs text-[var(--destructive,#ef4444)]">{err}</p>}
            <div className="mt-4 flex shrink-0 justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setPicked(null)} className={`${quietButton} px-4`}>
                Huỷ
              </button>
              <button
                type="button"
                disabled={busy || picked.size === 0}
                onClick={() => void removeSelected()}
                className={`inline-flex h-11 items-center rounded-xl bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-50 sm:h-9 sm:rounded-lg ${focusRing}`}
              >
                {busy ? "Đang xoá…" : `Xoá ${picked.size} lần nhập`}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
