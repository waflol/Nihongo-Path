import type { Metadata } from "next";
import { Suspense } from "react";
import { KanjiDetail } from "@/components/learn/kanji-detail";

export const metadata: Metadata = {
  title: "Chi tiết kanji",
  robots: { index: false, follow: true },
};

async function Detail({ params }: { params: Promise<{ char: string }> }) {
  const { char } = await params;
  return <KanjiDetail char={decodeURIComponent(char)} />;
}

export default function KanjiDetailPage({ params }: { params: Promise<{ char: string }> }) {
  return (
    <Suspense
      fallback={
        <p className="mx-auto max-w-5xl px-4 py-16 text-center text-sm text-[var(--muted-foreground)] sm:px-6">
          Đang tải…
        </p>
      }
    >
      <Detail params={params} />
    </Suspense>
  );
}
