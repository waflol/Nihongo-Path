"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FormattedText } from "../rich-text";
import {
  isExamResult,
  type ExamPayload,
  type ExamResult,
  type ResultQuestion,
} from "./exam-types";
import { SectionedSitting, SectionScoreTable } from "./exam-sectioned";

/**
 * One exam sitting (P4-UI-01/02): the timed question flow with per-question
 * navigation + flags, debounced draft autosave (a refresh never loses
 * answers — T-P4-10), and the result screen with the "xem lại lỗi" list.
 *
 * All grading is the server's (P4-EXAM-06/04): the client only sends chosen
 * option indices and a flag list. When the clock runs out the UI auto-submits
 * and the API marks the attempt `timed_out` — the client clock is not the
 * authority, the stored `deadlineMs` is.
 */

const inputClass =
  "block w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-base text-[var(--foreground)] focus:border-[var(--primary-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-focus)]";

/** `mm:ss` (or `h:mm:ss` past the hour) from milliseconds. */
function fmtClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function ExamSitting({ attemptId }: { attemptId: string }) {
  const [payload, setPayload] = useState<ExamPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Local drafts: chosen option (served index) per question, and flags.
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [flagged, setFlagged] = useState<string[]>([]);
  const [current, setCurrent] = useState(0);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const sit = payload && !isExamResult(payload) ? payload : null;
  const result = payload && isExamResult(payload) ? payload : null;
  const inProgress = sit?.status === "in_progress";

  const load = useCallback(async (showErr: boolean) => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/exams/attempts/${attemptId}`, { cache: "no-store" }).catch(() => null);
    if (!res) {
      if (showErr) setError("Không kết nối được API");
      setLoading(false);
      return;
    }
    if (res.status === 404) {
      // Not my attempt (T-P4-07) or deleted — send back to the console.
      window.location.href = "/learn/exams";
      return;
    }
    if (!res.ok) {
      if (showErr) {
        const data = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(data?.message ? `Lỗi: ${data.message}` : `Không tải được đề (HTTP ${res.status})`);
      }
      setLoading(false);
      return;
    }
    const p = (await res.json().catch(() => null)) as ExamPayload | null;
    if (!p) {
      if (showErr) setError("Dữ liệu đề thi không hợp lệ");
      setLoading(false);
      return;
    }
    setPayload(p);
    setAnswers({ ...p.answers });
    setFlagged([...p.flagged]);
    setNow(Date.now());
    setLoading(false);
  }, [attemptId]);

  useEffect(() => {
    void load(true);
  }, [load]);

  // Re-sync when the tab comes back: a submit on another tab (or the server
  // finalising a lap) may have changed the attempt under us.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible" && !busy) void load(false);
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [load, busy]);

  // The countdown (server-anchored): ticks every second while in progress.
  const remaining = useMemo(() => {
    if (!sit?.deadlineMs || sit.status !== "in_progress") return 0;
    return Math.max(0, sit.deadlineMs - now);
  }, [sit, now]);

  useEffect(() => {
    if (!inProgress) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [inProgress]);

  // Debounced draft autosave (P4-UI-01 "lưu nháp"): every answer / flag
  // change is persisted after a short pause. The API auto-grades a lapsed
  // sitting even on a draft save — that response is the RESULT payload.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSeq = useRef(0);
  useEffect(() => {
    if (!inProgress) return;
    const seq = ++saveSeq.current;
    setSaveState("saving");
    saveTimer.current = setTimeout(async () => {
      const res = await fetch(`/api/exams/attempts/${attemptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, flagged }),
      }).catch(() => null);
      if (!res || !res.ok) {
        setSaveState("error");
        return;
      }
      // Ignore a stale response that raced with a newer save.
      if (seq !== saveSeq.current) return;
      const data = (await res.json().catch(() => null)) as { results?: unknown; status?: string } | null;
      if (data && Array.isArray(data.results)) {
        // The sitting just timed out server-side — reload into the result.
        void load(false);
        return;
      }
      setSaveState("saved");
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [answers, flagged, inProgress, attemptId, load]);

  const submit = useCallback(
    async (auto: boolean) => {
      if (busy) return;
      setBusy(true);
      // Flush a pending autosave first, then submit with the local answers.
      const res = await fetch(`/api/exams/attempts/${attemptId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      }).catch(() => null);
      if (!res || !res.ok) {
        const data = (res ? (await res.json().catch(() => null)) : null) as { message?: string } | null;
        setError(auto ? "Đã qua hạn — không nộp được, thử lại" : (data?.message ? `Lỗi: ${data.message}` : "Không nộp được bài, thử lại"));
        setBusy(false);
        return;
      }
      const p = (await res.json().catch(() => null)) as ExamPayload | null;
      if (p && "results" in p) {
        setPayload(p);
        setBusy(false);
        return;
      }
      // Rare: the server returned a sit payload (e.g. it re-opened nothing).
      await load(false);
      setBusy(false);
    },
    [attemptId, answers, busy, load],
  );

  // Auto-submit at zero.
  useEffect(() => {
    if (!inProgress || remaining > 0) return;
    void submit(true);
  }, [inProgress, remaining, submit]);

  const toggleFlag = useCallback(
    (qid: string) => {
      setFlagged((f) => (f.includes(qid) ? f.filter((x) => x !== qid) : [...f, qid]));
    },
    [],
  );

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <p className="text-center text-sm text-[var(--muted-foreground)]">Đang tải đề…</p>
      </div>
    );
  }

  if (error && !payload) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <p role="alert" className="rounded-lg bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">{error}</p>
        <Link href="/learn/exams" className="mt-4 inline-block text-sm font-medium text-[var(--primary)] hover:underline">
          ← Về danh sách đề thi
        </Link>
      </div>
    );
  }

  // ── Result view (P4-UI-02 "màn hình kết quả + xem lại lỗi") ────
  if (result) {
    const wrong = result.results.filter((r) => !r.correct);
    return (
      <ResultView
        result={result}
        wrong={wrong}
        onRetake={() => {
          void (async () => {
            const res = await fetch(`/api/exams/${result.examId}/start`, { method: "POST" }).catch(() => null);
            const p = res ? ((await res.json().catch(() => null)) as { attemptId?: string } | null) : null;
            if (p?.attemptId) window.location.href = `/learn/exams/${p.attemptId}`;
            else window.location.reload();
          })();
        }}
      />
    );
  }

  // JLPT sectional exam (NP-409): parts, passages and a number grid.
  if (sit!.sections && sit!.sections.length > 0) {
    return (
      <>
        {error && (
          <p role="alert" className="mx-auto mt-4 max-w-6xl rounded-lg bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">{error}</p>
        )}
        <SectionedSitting
          sit={sit!}
          now={now}
          remaining={remaining}
          answers={answers}
          setAnswers={setAnswers}
          flagged={flagged}
          toggleFlag={toggleFlag}
          busy={busy}
          saveState={saveState}
          onSubmit={() => void submit(false)}
        />
      </>
    );
  }

  const questions = sit!.questions;
  const q = questions[current];

  // ── In-progress view (P4-UI-01: timer, điều hướng, cờ đánh dấu) ─
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pt-4 pb-6 sm:px-6 sm:py-8">
      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">{error}</p>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight text-[var(--foreground)] sm:text-xl">
            {sit!.exam.title}
          </h1>
          <p className="text-xs text-[var(--muted-foreground)]">
            Câu {current + 1}/{questions.length}
            {saveState === "saving" && " · đang lưu…"}
            {saveState === "saved" && " · đã lưu"}
            {saveState === "error" && " · lỗi lưu nháp"}
          </p>
        </div>
        {sit!.deadlineMs ? (
          <div
            className={
              "shrink-0 rounded-xl border px-3 py-1.5 text-center sm:px-4 sm:py-2 " +
              (remaining <= 5 * 60_000
                ? "border-[#ef4444] bg-[#fef2f2] text-[#b91c1c]"
                : "border-[var(--border)] bg-[var(--background-1)] text-[var(--foreground)]")
            }
            aria-label={`Còn ${fmtClock(remaining)}`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Còn lại</p>
            <p className="font-mono text-lg font-bold tabular-nums sm:text-xl">{fmtClock(remaining)}</p>
          </div>
        ) : (
          <div className="shrink-0 rounded-xl border border-[var(--border)] bg-[var(--background-1)] px-3 py-1.5 text-center sm:px-4 sm:py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Không giới hạn</p>
            <p className="text-xl font-bold text-[var(--foreground)]">∞</p>
          </div>
        )}
      </div>

      {/* Question nav + flags */}
      <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-1.5" role="tablist" aria-label="Điều hướng câu hỏi">
        {questions.map((sq, i) => {
          const picked = answers[sq.qid] !== null && answers[sq.qid] !== undefined;
          const isFlag = flagged.includes(sq.qid);
          const here = i === current;
          return (
            <button
              key={sq.qid}
              type="button"
              role="tab"
              aria-selected={here}
              onClick={() => setCurrent(i)}
              title={isFlag ? "Đã đánh dấu" : picked ? "Đã trả lời" : "Chưa trả lời"}
              className={
                "inline-flex h-10 items-center justify-center rounded-lg border text-sm font-semibold transition-colors " +
                (here
                  ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : picked
                    ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)]"
                    : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]") +
                (isFlag ? " ring-2 ring-[#f59e0b] ring-offset-1 ring-offset-[var(--background)]" : "")
              }
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      {/* The question */}
      {q && (
        <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4 sm:mt-5 sm:p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            Câu hỏi {current + 1} · {q.kind}
          </p>
          <p className="mt-3 break-words text-xl font-semibold leading-snug text-[var(--foreground)] sm:text-2xl" lang="ja">
            <FormattedText text={q.prompt} />
          </p>
          {q.sub && <p className="mt-1 text-sm text-[var(--muted-foreground)]">{q.sub}</p>}

          <div className="mt-5 grid gap-2">
            {q.options.map((opt, idx) => {
              const isPicked = answers[q.qid] === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  aria-pressed={isPicked}
                  onClick={() => setAnswers((a) => ({ ...a, [q.qid]: idx }))}
                  className={
                    "flex min-h-14 items-center gap-3 rounded-xl border px-3 py-3 text-left font-medium active:scale-[0.99] sm:px-4 text-[var(--foreground)] transition-colors " +
                    (isPicked
                      ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] ring-1 ring-[var(--primary)]"
                      : "border-[var(--border)] bg-[var(--background)] hover:bg-[var(--layer-hover)]")
                  }
                >
                  <span
                    className={
                      "inline-flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold " +
                      (isPicked ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]" : "border-[var(--border)] text-[var(--muted-foreground)]")
                    }
                  >
                    {"ABCD"[idx] ?? idx + 1}
                  </span>
                  <span className="min-w-0 flex-1 break-words text-base" lang="ja"><FormattedText text={opt} /></span>
                </button>
              );
            })}
          </div>

          <div className="mt-4">
            <button
              type="button"
              aria-pressed={flagged.includes(q.qid)}
              onClick={() => toggleFlag(q.qid)}
              className={
                "min-h-10 rounded-lg border px-4 text-sm font-semibold transition-colors " +
                (flagged.includes(q.qid)
                  ? "border-[#f59e0b] bg-[#fffbeb] text-[#b45309]"
                  : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]")
              }
            >
              {flagged.includes(q.qid) ? "✦ Đã đánh dấu" : "Đánh dấu câu này"}
            </button>
          </div>
        </div>
      )}

      {/* Sticky action bar: prev / next / submit stay under the thumb on mobile */}
      <div className="sticky bottom-0 z-20 -mx-4 mt-5 border-t border-[var(--border)] bg-[var(--background)]/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:backdrop-blur-none">
        <p className="mb-2 text-center text-xs text-[var(--muted-foreground)] sm:text-left">
          Đã trả lời {questions.filter((x) => answers[x.qid] !== null && answers[x.qid] !== undefined).length}/{questions.length}
          {" · "}Đánh dấu {flagged.length} câu
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={current === 0}
            onClick={() => setCurrent((c) => Math.max(0, c - 1))}
            aria-label="Câu trước"
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-[var(--border)] px-4 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)] disabled:opacity-40 sm:flex-none"
          >
            ← <span className="ml-1 hidden sm:inline">Câu trước</span>
          </button>
          {current < questions.length - 1 ? (
            <button
              type="button"
              onClick={() => setCurrent((c) => Math.min(questions.length - 1, c + 1))}
              aria-label="Câu tiếp"
              className="inline-flex min-h-11 flex-[2] items-center justify-center rounded-xl border border-[var(--border)] px-4 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)] sm:flex-none"
            >
              Câu tiếp →
            </button>
          ) : (
            <span className="flex-[2] sm:hidden" />
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit(false)}
            className="inline-flex min-h-11 flex-[2] items-center justify-center rounded-xl bg-[var(--primary)] px-6 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60 sm:ml-auto sm:flex-none"
          >
            {busy ? "Đang nộp…" : "Nộp bài"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The finished-exam screen: score header, "xem lại lỗi", full review, retake. */
function ResultView({
  result,
  wrong,
  onRetake,
}: {
  result: ExamResult;
  wrong: ResultQuestion[];
  onRetake: () => void;
}) {
  const [onlyWrong, setOnlyWrong] = useState(false);
  const shown = onlyWrong ? wrong : result.results;
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-5 text-center sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
          {result.status === "timed_out" ? "Hết giờ — đã chấm tự động" : "Kết quả"} · {result.exam.title}
        </p>
        <p className="mt-3 text-4xl font-bold text-[var(--foreground)]">{result.percent}%</p>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Đúng {result.score}/{result.total} câu
          {result.status === "timed_out" ? " · qua hạn, câu chưa trả lời tính 0" : ""}
        </p>
        {result.points !== undefined && result.maxPoints !== undefined && (
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Điểm {result.points}/{result.maxPoints}
          </p>
        )}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-center">
          <button
            type="button"
            onClick={() => setOnlyWrong((v) => !v)}
            aria-pressed={onlyWrong}
            className={
              "min-h-11 rounded-xl border px-4 text-sm font-semibold " +
              (onlyWrong
                ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)]"
                : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]")
            }
          >
            {onlyWrong ? "Hiện đang chỉ xem câu sai" : `Xem lại lỗi (${wrong.length})`}
          </button>
          <button
            type="button"
            onClick={onRetake}
            className="min-h-11 rounded-xl bg-[var(--primary)] px-5 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]"
          >
            Làm lại đề này
          </button>
        </div>
      </div>

      <SectionScoreTable result={result} />

      <div className="mt-5 space-y-3">
        {shown.length === 0 && (
          <p className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
            Không có câu sai — điểm tuyệt đối!
          </p>
        )}
        {shown.map((r) => {
          const tone = (idx: number) => {
            const isCorrect = idx === r.correctIndex;
            const isGiven = idx === r.given;
            return isCorrect
              ? "border-[#16a34a] bg-[#f0fdf4]"
              : isGiven
                ? "border-[#ef4444] bg-[#fef2f2]"
                : "border-[var(--border)] bg-[var(--background)] opacity-70";
          };
          return (
            <div key={r.qid} className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 break-words text-lg font-semibold text-[var(--foreground)]" lang="ja">
                  <span className="mr-2 text-xs font-bold text-[var(--muted-foreground)]">
                    Q{result.results.indexOf(r) + 1}
                  </span>
                  <FormattedText text={r.prompt} />
                </p>
                <span
                  aria-label={r.correct ? "đúng" : "sai"}
                  className={
                    "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white " +
                    (r.correct ? "bg-[#16a34a]" : "bg-[#ef4444]")
                  }
                >
                  {r.correct ? "✓" : "✕"}
                </span>
              </div>
              <div className="mt-3 space-y-1.5">
                {r.options.map((opt, idx) => {
                  const isCorrect = idx === r.correctIndex;
                  const isGiven = idx === r.given;
                  return (
                    <div key={idx} className={"flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm " + tone(idx)}>
                      <span className="w-5 text-center text-xs font-bold text-[var(--muted-foreground)]">
                        {"ABCD"[idx] ?? idx + 1}
                      </span>
                      <span className="min-w-0 flex-1 break-words text-[var(--foreground)]" lang="ja"><FormattedText text={opt} /></span>
                      {isCorrect && <span className="text-xs font-semibold text-[#15803d]">đáp án</span>}
                      {isGiven && !isCorrect && <span className="text-xs font-semibold text-[#b91c1c]">bạn chọn</span>}
                    </div>
                  );
                })}
              </div>
              {r.explain && (
                <p className="mt-3 rounded-xl bg-[var(--layer)] p-3 text-sm text-[var(--foreground)]">
                  <span className="font-semibold text-[var(--muted-foreground)]">Giải thích: </span>
                  {r.explain}
                </p>
              )}
              {r.given === null && (
                <p className="mt-2 text-xs text-[var(--muted-foreground)]">Câu này chưa được trả lời.</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 text-center">
        <Link href="/learn/exams" className="text-sm font-medium text-[var(--primary)] hover:underline">
          ← Về danh sách đề thi
        </Link>
      </div>
    </div>
  );
}
