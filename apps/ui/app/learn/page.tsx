import type { Metadata } from "next";

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
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
        Khu học tập
      </h1>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        Đây là khung của khu học tập cá nhân. Flashcard, bài tập, luyện nghe
        và lộ trình ôn tập sẽ được triển khai theo từng sprint.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {["Flashcard", "Bài tập", "Luyện nghe", "Ôn tập"].map((item) => (
          <div
            key={item}
            className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--background-1)] p-6"
          >
            <h2 className="text-sm font-semibold text-[var(--foreground)]">{item}</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Chờ triển khai
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
