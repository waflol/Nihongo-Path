import type { Metadata } from "next";
import { KanjiDetail } from "@/components/learn/kanji-detail";

export const metadata: Metadata = {
  title: "Chi tiết kanji",
  robots: { index: false, follow: true },
};

export default async function KanjiDetailPage({
  params,
}: {
  params: Promise<{ char: string }>;
}) {
  const { char } = await params;
  return <KanjiDetail char={decodeURIComponent(char)} />;
}
