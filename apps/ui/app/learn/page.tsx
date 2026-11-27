import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ProgressPanel } from "@/components/learn/progress-panel";
import { FitScreen } from "@/components/fit-screen";
import { ReviewChart } from "@/components/learn/review-chart";
import { DueButton } from "@/components/learn/due-button";
import { TodayStrip } from "@/components/learn/today-strip";
import { LearnSidebar } from "@/components/learn/learn-sidebar";
import { ExamStructureSlot } from "@/components/learn/exam-structure-slot";
import { ExtraDialog } from "@/components/learn/learn-extras";
import { PushReminderCard } from "@/components/pwa/push-reminder-card";
import { InstallAppCard } from "@/components/pwa/install-app-card";

export const metadata: Metadata = {
  title: "Khu học tập",
  description: "Khu học tập 3 trụ cột: Từ vựng, Ngữ pháp, Kanji và Luyện thi JLPT.",
  robots: { index: false, follow: true },
};

const SERIF = '"Yu Mincho","Hiragino Mincho ProN","Noto Serif JP","Shippori Mincho",serif';

type PillarCard = {
  kanji: string;
  title: string;
  desc: string;
  href: string;
  studyHref: string;
  reviewHref: string;
  practiceHref: string;
};

const PILLARS: PillarCard[] = [
  {
    kanji: "語",
    title: "Từ vựng",
    desc: "Bộ thẻ cá nhân, học từ mới, ôn tập FSRS và bài tập.",
    href: "/learn/vocab",
    studyHref: "/learn/vocab/study",
    reviewHref: "/learn/vocab/review",
    practiceHref: "/learn/vocab/exercises",
  },
  {
    kanji: "文",
    title: "Ngữ pháp",
    desc: "Mẫu ngữ pháp N5–N1, flashcard học mới, ôn tập và bài tập.",
    href: "/learn/grammar",
    studyHref: "/learn/grammar/study",
    reviewHref: "/learn/grammar/review",
    practiceHref: "/learn/grammar/practice",
  },
  {
    kanji: "漢",
    title: "Kanji",
    desc: "Tra cứu N5–N1, nét viết KanjiVG, Hán Việt, ôn tập và bài tập.",
    href: "/learn/kanji",
    studyHref: "/learn/kanji/study",
    reviewHref: "/learn/kanji/review",
    practiceHref: "/learn/kanji/practice",
  },
];

type ExamTile = {
  href: string | null;
  kanji: string;
  title: string;
  desc: string;
};

const EXAM_TILES: ExamTile[] = [
  { href: "/learn/exam", kanji: "試", title: "Luyện thi 問題", desc: "6 dạng 問題 kiểu JLPT." },
  { href: "/learn/exams", kanji: "考", title: "Đề thi có thời gian", desc: "Làm đề, chấm điểm trên máy chủ, xem lại lỗi." },
  { href: null, kanji: "聴", title: "Luyện nghe", desc: "Sắp ra mắt — Sprint 6." },
];

export default function LearnPage() {
  return (
    <div
      data-learn
      className="mx-auto flex min-h-0 w-full max-w-[1360px] flex-col px-4 pb-4 pt-3 sm:px-8 sm:py-5 lg:min-h-[calc(100dvh-65px)] lg:px-10 lg:py-8"
    >
      <FitScreen lg media="(min-width: 1024px)" />
      <div className="flex shrink-0 flex-col gap-3 max-lg:rounded-3xl max-lg:border max-lg:border-[var(--border)] max-lg:bg-[var(--background-1)] max-lg:p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            style={{ fontFamily: SERIF }}
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)] text-lg font-bold text-[var(--primary-foreground)] lg:size-10 lg:text-xl"
          >
            学
          </span>
          <TodayStrip />
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <DueButton />
          <ExtraDialog
            ariaLabel="Nhắc ôn tập & cài ứng dụng"
            title="Nhắc ôn tập & cài ứng dụng"
            className="w-10 shrink-0 sm:w-auto sm:px-3.5"
            label={
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 sm:size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
            }
          >
            <PushReminderCard />
            <InstallAppCard />
          </ExtraDialog>
          <ExtraDialog label="Chi tiết" title="Tiến độ ghi nhớ">
            <ProgressPanel dense />
          </ExtraDialog>
        </div>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 sm:mt-5 lg:grid lg:flex-none lg:grid-cols-[26rem_minmax(0,1fr)] lg:grid-rows-[auto_auto]">
        <div className="flex flex-col gap-4 max-lg:order-2 lg:col-span-2 lg:row-start-2">
          {/* Hàng trên: 3 trụ cột đối xứng */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            {PILLARS.map((p) => (
              <div
                key={p.title}
                className="flex flex-col justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4 transition hover:border-[color-mix(in_srgb,var(--primary)_45%,var(--border))]"
              >
                <Link href={p.href} className="group flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    style={{ fontFamily: SERIF }}
                    className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--primary)_13%,transparent)] text-2xl font-bold text-[var(--primary)]"
                  >
                    {p.kanji}
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold tracking-tight text-[var(--foreground)] group-hover:text-[var(--primary)]">
                      {p.title}
                    </h2>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-[var(--muted-foreground)] sm:text-[13px]">
                      {p.desc}
                    </p>
                  </div>
                </Link>
                <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] pt-2.5">
                  <Link
                    href={p.studyHref}
                    className="rounded-lg bg-[var(--primary)] px-2.5 py-1 text-xs font-medium text-[var(--primary-foreground)] transition hover:opacity-90"
                  >
                    Học mới
                  </Link>
                  <Link
                    href={p.reviewHref}
                    className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--foreground)] transition hover:bg-[var(--background)]"
                  >
                    Ôn tập
                  </Link>
                  <Link
                    href={p.practiceHref}
                    className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--foreground)] transition hover:bg-[var(--background)]"
                  >
                    Bài tập
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* Cấu trúc đề của cấp độ đang chọn */}
          <Suspense fallback={null}>
            <ExamStructureSlot />
          </Suspense>

          {/* Hàng dưới: Luyện thi & mở rộng */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            {EXAM_TILES.map((t) =>
              t.href ? (
                <Link
                  key={t.title}
                  href={t.href}
                  className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-3.5 transition hover:border-[color-mix(in_srgb,var(--primary)_45%,var(--border))]"
                >
                  <span
                    aria-hidden="true"
                    style={{ fontFamily: SERIF }}
                    className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--primary)_13%,transparent)] text-xl font-bold text-[var(--primary)]"
                  >
                    {t.kanji}
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-[var(--foreground)]">{t.title}</h2>
                    <p className="mt-0.5 line-clamp-1 text-xs text-[var(--muted-foreground)]">{t.desc}</p>
                  </div>
                </Link>
              ) : (
                <div
                  key={t.title}
                  className="flex items-center gap-3 rounded-2xl border border-dashed border-[var(--border)] p-3.5 opacity-80"
                >
                  <span
                    aria-hidden="true"
                    style={{ fontFamily: SERIF }}
                    className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-xl font-bold text-[var(--primary)]"
                  >
                    {t.kanji}
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-[var(--foreground)]">{t.title}</h2>
                    <p className="mt-0.5 line-clamp-1 text-xs text-[var(--muted-foreground)]">{t.desc}</p>
                  </div>
                </div>
              ),
            )}
          </div>
        </div>

        <ReviewChart className="hidden lg:-ml-3 lg:col-start-2 lg:row-start-1 lg:flex lg:rounded-l-none" />
        <LearnSidebar />
      </div>
    </div>
  );
}
