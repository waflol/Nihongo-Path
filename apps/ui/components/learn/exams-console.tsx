"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { JLPT_LEVELS, LevelBadge } from "@/components/learn/level-select";
import type {
  AttemptListItem,
  ExamListItem,
  ExamStats,
} from "./exam-types";

/**
 * The exam console (P4-UI-02 + P4-EXAM-08): published exams to take, my
 * sittings, and my progress. Talks to the `/api/exams/…` gateway (token
 * stays server-side). Starting an exam navigates to `/learn/exams/<id>`
 * — the server's `start` returns the sit payload, so a learner can resume
 * a half-finished sitting from the "Đã làm" tab without losing answers.
 */

type Tab = "available" | "done" | "stats";

const TABS: { key: Tab; label: string }[] = [
  { key: "available", label: "Đề có sẵn" },
  { key: "done", label: "Đã làm" },
  { key: "stats", label: "Thống kê" },
];

const statusLabel: Record<string, string> = {
  in_progress: "Đang làm",
  submitted: "Đã nộp",
  timed_out: "Hết giờ",
};

function fmtTime(ms: number | null | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ExamsConsole() {
  const [tab, setTab] = useState<Tab>("available");
  const [exams, setExams] = useState<ExamListItem[]>([]);
  const [attempts, setAttempts] = useState<AttemptListItem[]>([]);
  const [stats, setStats] = useState<ExamStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [levelFilter, setLevelFilter] = useState("");
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [examsRes, attemptsRes, statsRes] = await Promise.all([
        fetch("/api/exams", { cache: "no-store" }).catch(() => null),
        fetch("/api/exams/attempts", { cache: "no-store" }).catch(() => null),
        fetch("/api/exams/stats", { cache: "no-store" }).catch(() => null),
      ]);
      if (cancelled) return;
      if (!examsRes || !examsRes.ok) {
        setError(examsRes ? "Không tải được danh sách đề thi" : "Không kết nối được API");
        setLoading(false);
        return;
      }
      setExams(((await examsRes.json().catch(() => [])) as ExamListItem[]) ?? []);
      setAttempts(((await attemptsRes?.json().catch(() => [])) as AttemptListItem[]) ?? []);
      setStats(((await statsRes?.json().catch(() => null)) as ExamStats | null));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Start (or resume) a sitting → the server answers where to render it. */
  const startExam = useCallback(async (examId: string) => {
    setStarting(examId);
    setError(null);
    const res = await fetch(`/api/exams/${examId}/start`, { method: "POST" }).catch(() => null);
    if (!res || !res.ok) {
      const data = (res ? (await res.json().catch(() => null)) : null) as { message?: string } | null;
      setError(data?.message ? `Lỗi: ${data.message}` : "Không bắt đầu được đề thi");
      setStarting(null);
      return;
    }
    const payload = (await res.json()) as { attemptId?: string };
    // `start` returns the sit payload; the attempt id tells the sitting screen
    // what to render. A half-finished sitting resolves to its existing id.
    if (payload.attemptId) {
      window.location.href = `/learn/exams/${payload.attemptId}`;
      return;
    }
    // No attempt id (e.g. an exam finished between list and start) — refresh.
    setStarting(null);
    window.location.reload();
  }, []);

  const visibleExams = levelFilter ? exams.filter((e) => e.level === levelFilter) : exams;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
          Đề thi
        </h1>
        <Link
          href="/learn/exam"
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
        >
          Bài luyện nhanh
        </Link>
      </div>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Làm đề có thời gian, xáo câu hỏi, chấm điểm và giải thích — điểm được
        tính trên máy chủ.
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">
          {error}
        </p>
      )}

      <div className="mt-5 flex w-full rounded-xl border border-[var(--border)] bg-[var(--background-1)] p-1 sm:inline-flex sm:w-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            onClick={() => setTab(t.key)}
            className={
              "min-h-10 flex-1 rounded-lg px-3 text-sm font-semibold transition-colors sm:flex-none sm:px-4 " +
              (tab === t.key
                ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <p className="mt-8 text-center text-sm text-[var(--muted-foreground)]">Đang tải…</p>
      )}

      {!loading && tab === "available" && (
        <div className="mt-5">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => setLevelFilter("")}
              className={
                "min-h-9 shrink-0 rounded-full px-4 text-sm font-semibold " +
                (!levelFilter
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]")
              }
            >
              Tất cả
            </button>
            {JLPT_LEVELS.map((lv) => (
              <button
                key={lv}
                type="button"
                onClick={() => setLevelFilter(lv)}
                className={
                  "min-h-9 shrink-0 rounded-full px-4 text-sm font-semibold " +
                  (levelFilter === lv
                    ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                    : "border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]")
                }
              >
                {lv}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            {visibleExams.length === 0 && (
              <p className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
                Chưa có đề thi{levelFilter ? ` cấp ${levelFilter}` : ""} nào được công khai.
              </p>
            )}
            {visibleExams.map((exam) => (
              <div
                key={exam._id}
                className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4 sm:p-5"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold text-[var(--foreground)]">
                      {exam.title}
                      {exam.level && <LevelBadge level={exam.level} />}
                      {exam.examType && (
                        <span className="rounded-full bg-[var(--layer)] px-2 py-0.5 text-xs font-medium text-[var(--muted-foreground)]">
                          {exam.examType}
                        </span>
                      )}
                    </h3>
                    {exam.description && (
                      <p className="mt-1 text-sm text-[var(--muted-foreground)]">{exam.description}</p>
                    )}
                    <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-[var(--muted-foreground)] sm:text-xs">
                      <div>
                        <dt className="inline">Câu hỏi: </dt>
                        <dd className="inline font-semibold text-[var(--foreground)]">{exam.questionCount}</dd>
                      </div>
                      <div>
                        <dt className="inline">Thời gian: </dt>
                        <dd className="inline font-semibold text-[var(--foreground)]">
                          {exam.timeLimitMin ? `${exam.timeLimitMin} phút` : "Không giới hạn"}
                        </dd>
                      </div>
                      {exam.year && (
                        <div>
                          <dt className="inline">Năm: </dt>
                          <dd className="inline font-semibold text-[var(--foreground)]">{exam.year}</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                  <button
                    type="button"
                    disabled={starting === exam._id || exam.questionCount === 0}
                    onClick={() => void startExam(exam._id)}
                    className="min-h-11 w-full shrink-0 rounded-xl bg-[var(--primary)] px-5 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  >
                    {starting === exam._id ? "Đang mở…" : "Làm bài"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && tab === "done" && (
        <div className="mt-5 space-y-3">
          {attempts.length === 0 && (
            <p className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
              Bạn chưa làm đề nào — chọn một đề ở tab “Đề có sẵn”.
            </p>
          )}
          {attempts.map((a) => {
            const finished = a.status !== "in_progress";
            return (
              <div
                key={a.attemptId}
                className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
              >
                <div className="min-w-0">
                  <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold text-[var(--foreground)]">
                    {a.examTitle}
                    {a.level && <LevelBadge level={a.level} />}
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-xs font-medium " +
                        (a.status === "in_progress"
                          ? "bg-[#fef9c3] text-[#a16207]"
                          : a.status === "timed_out"
                            ? "bg-[#fef2f2] text-[#b91c1c]"
                            : "bg-[#f0fdf4] text-[#15803d]")
                      }
                    >
                      {statusLabel[a.status] ?? a.status}
                    </span>
                  </h3>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    {finished
                      ? `Điểm ${a.percent}% · đúng ${a.score}/${a.total} · ${fmtTime(a.submittedAtMs)}`
                      : `Bắt đầu ${fmtTime(a.startedAtMs)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/learn/exams/${a.attemptId}`}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[var(--primary)] px-5 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] sm:w-auto"
                  >
                    {a.status === "in_progress" ? "Tiếp tục" : "Xem kết quả"}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && tab === "stats" && (
        <div className="mt-5">
          {stats === null ? (
            <p className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
              Chưa đủ dữ liệu để thống kê.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-5">
                <h3 className="text-sm font-semibold text-[var(--foreground)]">Tổng</h3>
                <dl className="mt-3 space-y-1 text-sm text-[var(--muted-foreground)]">
                  <div>
                    <dt className="inline">Số lượt làm bài: </dt>
                    <dd className="inline font-semibold text-[var(--foreground)]">{stats.attempts}</dd>
                  </div>
                  <div>
                    <dt className="inline">Điểm trung bình: </dt>
                    <dd className="inline font-semibold text-[var(--foreground)]">
                      {stats.avgPercent === null ? "—" : `${stats.avgPercent}%`}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-5">
                <h3 className="text-sm font-semibold text-[var(--foreground)]">Theo cấp</h3>
                {stats.byLevel.length === 0 ? (
                  <p className="mt-3 text-sm text-[var(--muted-foreground)]">—</p>
                ) : (
                  <ul className="mt-3 space-y-1 text-sm">
                    {stats.byLevel.map((l) => (
                      <li key={l.level} className="flex justify-between">
                        <span className="text-[var(--muted-foreground)]">{l.level} · {l.attempts} lượt</span>
                        <span className="font-semibold text-[var(--foreground)]">{l.avgPercent}%</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-5">
                <h3 className="text-sm font-semibold text-[var(--foreground)]">Theo nhóm đề</h3>
                {stats.byType.length === 0 ? (
                  <p className="mt-3 text-sm text-[var(--muted-foreground)]">—</p>
                ) : (
                  <ul className="mt-3 space-y-1 text-sm">
                    {stats.byType.map((t) => (
                      <li key={t.examType} className="flex justify-between">
                        <span className="text-[var(--muted-foreground)]">{t.examType} · {t.attempts} lượt</span>
                        <span className="font-semibold text-[var(--foreground)]">{t.avgPercent}%</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
