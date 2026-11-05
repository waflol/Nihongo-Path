import type { Metadata } from "next";
import Link from "next/link";
import { ProgressPanel } from "@/components/learn/progress-panel";

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
export default function LearnPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
        Khu học tập
      </h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Đây là khung của khu học tập cá nhân. Flashcard, bài tập, luyện nghe
        và lộ trình ôn tập sẽ được triển khai theo từng sprint.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          href="/learn/decks"
          className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-6 transition-colors hover:bg-[var(--layer-hover)]"
        >
          <h2 className="text-sm font-semibold text-[var(--foreground)]">
            Flashcard
          </h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Bộ thẻ cá nhân + ôn tập ngắt quãng (SRS). Bắt đầu từ danh sách
            bộ thẻ.
          </p>
        </Link>
        <Link
          href="/learn/study"
          className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-6 transition-colors hover:bg-[var(--layer-hover)]"
        >
          <h2 className="text-sm font-semibold text-[var(--foreground)]">
            Ôn tập SRS
          </h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Phiên ôn tập thẻ mới + đến hạn theo lịch cá nhân.
          </p>
        </Link>
        <Link
          href="/learn/exercises"
          className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-6 transition-colors hover:bg-[var(--layer-hover)]"
        >
          <h2 className="text-sm font-semibold text-[var(--foreground)]">
            Bài tập
          </h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Trắc nghiệm 4 lựa chọn và gõ đáp án theo bộ thẻ — luyện không tính
            vào lịch ôn tập.
          </p>
        </Link>
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--background-1)] p-6">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">
            Luyện nghe
          </h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Chờ triển khai (Sprint 6)
          </p>
        </div>
      </div>

      <ProgressPanel />
    </div>
  );
}
