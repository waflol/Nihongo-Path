import type { Metadata } from "next";
import { GrammarPractice } from "@/components/learn/grammar-practice";
import { PillarNav } from "@/components/learn/pillar-nav";

export const metadata: Metadata = {
  title: "Luyện tập ngữ pháp",
  description: "Luyện chọn nghĩa và mẫu ngữ pháp tiếng Nhật.",
  robots: { index: false, follow: true },
};

export default function GrammarPracticePage() {
  return (
    <>
      <PillarNav pillar="grammar" />
      <GrammarPractice />
    </>
  );
}
