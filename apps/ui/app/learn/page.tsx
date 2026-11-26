import type { Metadata } from "next";
import Link from "next/link";
import { ProgressPanel } from "@/components/learn/progress-panel";
import { FitScreen } from "@/components/fit-screen";
import { ReviewChart } from "@/components/learn/review-chart";
import { DueButton } from "@/components/learn/due-button";
import { TodayStrip } from "@/components/learn/today-strip";
import { LearnSidebar } from "@/components/learn/learn-sidebar";
import { ExtraDialog } from "@/components/learn/learn-extras";
import { PushReminderCard } from "@/components/pwa/push-reminder-card";
import { InstallAppCard } from "@/components/pwa/install-app-card";

export const metadata: Metadata = {
  title: "Khu học tập",
  description:
    "Khu học tập: flashcard, bài tập, luyện nghe và lộ trình ôn tập. (Placeholder)",
  // Private learning area — not public crawlable content (spec §17.3).
  robots: { index: false, follow: true },
};

const SERIF = '"Yu Mincho","Hiragino Mincho ProN","Noto Serif JP","Shippori Mincho",serif';

type Tile = {
  href: string | null;
  kanji: string;
  title: string;
  desc: string;
  featured?: boolean;
};

// Bento: one featured 2×2 tile, six compact tiles, one full-width "coming soon" strip.
const tiles: Tile[] = [
  { href: "/learn/decks", kanji: "札", title: "Flashcard", desc: "Bộ thẻ cá nhân, ôn theo thuật toán lặp lại ngắt quãng.", featured: true },
  { href: "/learn/review", kanji: "復", title: "Ôn tập hôm nay", desc: "Những từ đã đến hạn ôn." },
  { href: "/learn/exercises", kanji: "練", title: "Bài tập", desc: "Trắc nghiệm, gõ đáp án, đặt câu." },
  { href: "/learn/exam", kanji: "試", title: "Luyện thi", desc: "6 dạng 問題 kiểu JLPT." },
  { href: "/learn/kanji", kanji: "漢", title: "Kanji N5–N1", desc: "Tra theo cấp, Hán Việt, thứ tự nét, on/kun." },
  { href: "/learn/grammar", kanji: "文", title: "Ngữ pháp N5–N1", desc: "Theo cấp độ, chủ đề, bối cảnh và giáo trình." },
  { href: "/learn/exams", kanji: "考", title: "Đề thi có thời gian", desc: "Làm đề, chấm điểm trên máy chủ, xem lại lỗi." },
  { href: null, kanji: "聴", title: "Luyện nghe", desc: "Đang chuẩn bị, sẽ có ở Sprint 6." },
];

function tileClasses(t: Tile): string {
  const featured = !!t.featured;
  return [
    "learn-tile relative flex min-h-0 flex-col items-center justify-center gap-2.5 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-4 text-center transition-all duration-300 sm:gap-3",
    featured ? "learn-tile-featured col-span-2 sm:row-span-2 sm:items-start sm:text-left lg:gap-4 lg:p-6" : "",
    !t.href ? "border-dashed bg-transparent col-span-2 opacity-90 sm:col-span-2" : "",
    t.href
      ? "hover:z-10 hover:scale-[1.02] hover:border-[color-mix(in_srgb,var(--primary)_45%,var(--border))] hover:shadow-[0_14px_30px_-18px_color-mix(in_srgb,var(--primary)_55%,transparent)] motion-reduce:hover:scale-100 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
      : "lg:flex-row lg:justify-start lg:gap-4 lg:text-left lg:items-center",
  ]
    .filter(Boolean)
    .join(" ");
}

function TileBody({ t }: { t: Tile }) {
  const featured = !!t.featured;
  return (
    <>
      <span
        aria-hidden="true"
        style={{ fontFamily: SERIF }}
        className={
          "flex shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--primary)_13%,transparent)] font-bold text-[var(--primary)] " +
          (featured ? "size-12 text-3xl lg:size-14 lg:text-4xl" : "max-sm:size-9 max-sm:text-lg size-10 text-xl lg:size-11 lg:text-2xl")
        }
      >
        {t.kanji}
      </span>
      <div className="min-w-0">
        <h2
          className={
            "tracking-tight text-[var(--foreground)] " +
            (featured ? "text-lg font-semibold lg:text-[26px]" : "max-sm:text-sm text-[15px] font-semibold")
          }
        >
          {t.title}
        </h2>
        <p
          className={
            featured
              ? "mt-1.5 max-w-[19rem] text-sm leading-relaxed text-[var(--muted-foreground)] lg:text-[15px]"
              : "mt-0.5 line-clamp-2 max-sm:line-clamp-1 text-xs leading-snug text-[var(--muted-foreground)] sm:text-[13px]"
          }
        >
          {t.desc}
        </p>
      </div>
      {!t.href && (
        <span className="absolute right-3 top-3 rounded-full bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] px-2.5 py-1 text-[11px] font-medium text-[var(--primary)] max-sm:hidden sm:right-4 sm:top-4">
          Sắp ra mắt
        </span>
      )}
    </>
  );
}

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

      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3 sm:mt-5 lg:grid lg:flex-none lg:grid-cols-[26rem_minmax(0,1fr)] lg:grid-rows-[auto_auto] lg:gap-4">
        <div className="grid grid-cols-2 gap-3 max-lg:order-2 sm:grid-cols-4 sm:gap-4 lg:col-span-2 lg:row-start-2">
          {tiles.map((t) =>
            t.href ? (
              <Link key={t.title} href={t.href} className={tileClasses(t)}>
                <TileBody t={t} />
              </Link>
            ) : (
              <div key={t.title} className={tileClasses(t)}>
                <TileBody t={t} />
              </div>
            )
          )}
        </div>

        <ReviewChart className="hidden lg:-ml-3 lg:col-start-2 lg:row-start-1 lg:flex lg:rounded-l-none" />
        <LearnSidebar />
      </div>
    </div>
  );
}
