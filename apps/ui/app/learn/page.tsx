import type { Metadata } from "next";
import Link from "next/link";
import { ProgressPanel } from "@/components/learn/progress-panel";
import { FitScreen } from "@/components/fit-screen";
import { ReviewChart } from "@/components/learn/review-chart";
import { DueButton } from "@/components/learn/due-button";
import { TodayStrip } from "@/components/learn/today-strip";
import { LearnSidebar } from "@/components/learn/learn-sidebar";
import { ExtraDialog } from "@/components/learn/learn-extras";

export const metadata: Metadata = {
  title: "Khu học tập",
  description:
    "Khu học tập: flashcard, bài tập, luyện nghe và lộ trình ôn tập. (Placeholder)",
  // Private learning area — not public crawlable content (spec §17.3).
  robots: { index: false, follow: true },
};

/**
 * Learning area placeholder. No real business logic yet — this route is a
 * shell for the post-auth learning experience (Sprint 2+).
 */
const SERIF = '"Yu Mincho","Hiragino Mincho ProN","Noto Serif JP","Shippori Mincho",serif';

type Tile = { href: string | null; kanji: string; title: string; desc: string; area: string };

// Bento layout: one featured tile, the rest sized by how often they are used.
const tiles: Tile[] = [
  { href: "/learn/decks", kanji: "札", title: "Flashcard", desc: "Bộ thẻ cá nhân, ôn theo thuật toán lặp lại ngắt quãng.", area: "col-span-2 lg:col-span-4 lg:h-28" },
  { href: "/learn/review", kanji: "復", title: "Ôn tập hôm nay", desc: "Những từ đã đến hạn ôn.", area: "" },
  { href: "/learn/exercises", kanji: "練", title: "Bài tập", desc: "Trắc nghiệm, gõ đáp án, đặt câu.", area: "" },
  { href: "/learn/exam", kanji: "試", title: "Luyện thi", desc: "6 dạng 問題 kiểu JLPT.", area: "" },
  { href: "/learn/kanji", kanji: "漢", title: "Kanji N5–N1", desc: "Tra theo cấp, Hán Việt, thứ tự nét, on/kun.", area: "" },
  { href: "/learn/exams", kanji: "試", title: "Đề thi có thời gian", desc: "Làm đề, chấm điểm trên máy chủ, xem lại lỗi.", area: "lg:col-span-2" },
  { href: null, kanji: "聴", title: "Luyện nghe", desc: "Đang chuẩn bị, sẽ có ở Sprint 6.", area: "lg:col-span-2" },
];

function TileBody({ t, featured }: { t: Tile; featured: boolean }) {
  return (
    <>
      <span
        aria-hidden="true"
        style={{ fontFamily: SERIF }}
        className={
          "pointer-events-none absolute -bottom-[0.18em] -right-[0.04em] select-none leading-none text-[var(--foreground)] opacity-[0.07] transition-all duration-500 group-hover:-translate-y-1 group-hover:text-[var(--primary)] group-hover:opacity-[0.16] " +
          (featured ? "text-[4.5rem] sm:text-[clamp(4rem,14vh,8rem)] lg:text-[8rem]" : "text-[4.5rem] sm:text-[clamp(4rem,14vh,8rem)] lg:text-[6rem]")
        }
      >
        {t.kanji}
      </span>

      {featured && (
        <div aria-hidden="true" className="pointer-events-none absolute right-[6%] top-1/2 hidden h-[78%] w-28 -translate-y-1/2 lg:block">
          <div className="absolute inset-0 rotate-[7deg] rounded-xl border border-[var(--border)] bg-[var(--background)] opacity-70 transition-transform duration-500 group-hover:rotate-[11deg]" />
          <div className="absolute inset-0 -rotate-[3deg] rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-lg transition-transform duration-500 group-hover:-rotate-[6deg]">
            <div className="flex h-full flex-col items-center justify-center gap-1">
              <span style={{ fontFamily: SERIF }} className="text-[clamp(1.8rem,5vh,3.2rem)] leading-none text-[var(--foreground)]">言葉</span>
              <span className="text-xs text-[var(--muted-foreground)]">ことば · từ vựng</span>
            </div>
          </div>
        </div>
      )}

      <span
        aria-hidden="true"
        style={{ fontFamily: SERIF }}
        className="relative flex size-9 shrink-0 sm:mb-1 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] text-lg font-bold text-[var(--primary)] sm:size-8 sm:text-lg lg:mb-0 lg:size-10 lg:text-xl lg:[.featured_&]:hidden"
      >
        {t.kanji}
      </span>
      <div className="relative min-w-0 sm:mt-auto lg:mt-0">
        <h2 className={(featured ? "text-[15px] sm:text-base lg:text-2xl" : "text-sm leading-tight sm:text-base lg:text-base") + " font-semibold tracking-tight text-[var(--foreground)]"}>
          {t.title}
        </h2>
        <p className={(featured ? "max-w-xs lg:max-w-md lg:text-base" : "max-w-[16rem] max-sm:hidden lg:text-[13px]") + " mt-0.5 line-clamp-2 max-sm:line-clamp-1 text-xs leading-snug text-[var(--muted-foreground)] sm:mt-1 sm:text-sm"}>
          {t.desc}
        </p>
      </div>

      {!t.href && (
        <span
          style={{ fontFamily: SERIF }}
          className="absolute right-2 top-2 flex size-6 -rotate-6 lg:right-4 lg:top-4 lg:size-9 items-center justify-center rounded-md bg-[var(--primary)] text-sm font-bold text-white shadow-sm"
          title="Sắp ra mắt"
        >
          近
        </span>
      )}
    </>
  );
}

export default function LearnPage() {
  return (
    <div
      data-learn
      className="mx-auto flex min-h-0 w-full max-w-7xl flex-col px-3 py-3 sm:px-6 lg:min-h-[calc(100dvh-65px)] lg:py-5"
    >
      <FitScreen lg media="(min-width: 1024px)" />
      <div className="flex shrink-0 flex-col gap-3 max-lg:gap-2 max-lg:rounded-2xl max-lg:border max-lg:border-[var(--border)] max-lg:bg-[var(--background-1)] max-lg:p-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            style={{ fontFamily: SERIF }}
            className="flex size-8 shrink-0 -rotate-3 lg:size-11 items-center justify-center rounded-lg bg-[var(--primary)] text-lg font-bold lg:text-xl text-white shadow-md lg:text-2xl"
          >
            学
          </span>
          <TodayStrip />
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 [&>*:first-child]:flex-1 sm:[&>*:first-child]:flex-none">
        <DueButton />
        <ExtraDialog label="Chi tiết" title="Tiến độ ghi nhớ"><ProgressPanel dense /></ExtraDialog>
        </div>
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 lg:mt-5 lg:grid lg:flex-none lg:grid-cols-[26rem_minmax(0,1fr)] lg:grid-rows-[auto_auto] lg:gap-3">
      <div className="grid shrink-0 grid-cols-2 gap-2 sm:h-[clamp(8.5rem,23dvh,13rem)] sm:grid-cols-4 sm:grid-rows-2 lg:col-span-2 lg:row-start-2 lg:h-auto lg:min-h-0 lg:grid-rows-[auto_auto_auto] lg:gap-3">
        {tiles.map((t, i) => {
          const featured = i === 0;
          const cls =
            "learn-tile group relative flex min-h-0 min-h-14 items-center gap-2.5 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-2.5 sm:min-h-0 sm:flex-col sm:items-stretch sm:gap-0 sm:p-4 lg:flex-row lg:items-center lg:gap-3 lg:p-4 transition-all duration-300 hover:z-10 hover:scale-[1.05] motion-reduce:hover:scale-100 " +
            t.area + (featured ? " featured" : "");
          const node = t.href ? (
            <Link
              key={t.title}
              href={t.href}
              className={cls + " hover:border-[var(--primary)] hover:shadow-[0_10px_30px_-12px_color-mix(in_srgb,var(--primary)_45%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"}
            >
              <TileBody t={t} featured={featured} />
            </Link>
          ) : (
            <div key={t.title} className={cls + " border-dashed max-sm:pr-9"}>
              <TileBody t={t} featured={featured} />
            </div>
          );
          return node;
        })}
      </div>

      <ReviewChart className="hidden lg:col-start-2 lg:row-start-1 lg:-ml-3 lg:flex lg:rounded-l-none" />

      <LearnSidebar />
      </div>
    </div>
  );
}
