import type { Metadata } from "next";
import { KanjiPractice } from "@/components/learn/kanji-practice";
import { PillarNav } from "@/components/learn/pillar-nav";

export const metadata: Metadata = {
  title: "Luyện tập Kanji",
  description: "Luyện tập Kanji theo SRS hoặc luyện tự do N5–N1.",
  robots: { index: false, follow: true },
};

export default function KanjiPracticePage() {
  return (
    <>
      <PillarNav pillar="kanji" />
      <KanjiPractice />
    </>
  );
}
