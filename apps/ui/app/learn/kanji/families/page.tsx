import type { Metadata } from "next";
import { Suspense } from "react";
import { KanjiFamilies } from "@/components/learn/kanji-families";
import { PillarNav } from "@/components/learn/pillar-nav";

export const metadata: Metadata = {
  title: "Gia đình Kanji",
  description: "Kanji gom theo thành phần chung, xếp A–Z theo Hán Việt, học bằng flashcard.",
  robots: { index: false, follow: true },
};

export default function KanjiFamiliesPage() {
  return (
    <>
      <PillarNav pillar="kanji" />
      <Suspense
        fallback={
          <p className="mx-auto max-w-6xl px-4 py-16 text-center text-sm text-[var(--muted-foreground)] sm:px-6">
            Đang tải…
          </p>
        }
      >
        <KanjiFamilies />
      </Suspense>
    </>
  );
}
