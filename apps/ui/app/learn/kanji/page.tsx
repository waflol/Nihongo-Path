import type { Metadata } from "next";
import { Suspense } from "react";
import { KanjiBrowser } from "@/components/learn/kanji-browser";
import { PillarNav } from "@/components/learn/pillar-nav";
import { PillarProgress } from "@/components/learn/pillar-progress";

export const metadata: Metadata = {
  title: "Kanji N5–N1",
  description: "Tra cứu kanji theo cấp JLPT và âm Hán Việt, xem thứ tự nét.",
  robots: { index: false, follow: true },
};

type Search = { view?: string | string[]; level?: string | string[] };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Browser({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  return <KanjiBrowser initialView={first(sp.view)} initialLevel={first(sp.level)} />;
}

export default function KanjiPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <>
      <PillarNav pillar="kanji" />
      <PillarProgress pillar="kanji" className="max-w-6xl" />
      <Suspense
        fallback={
          <p className="mx-auto max-w-5xl px-4 py-16 text-center text-sm text-[var(--muted-foreground)] sm:px-6">
            Đang tải…
          </p>
        }
      >
        <Browser searchParams={searchParams} />
      </Suspense>
    </>
  );
}
