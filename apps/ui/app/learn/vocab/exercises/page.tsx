import type { Metadata } from "next";
import { ExercisesConsole } from "@/components/learn/exercises-console";
import { PillarNav } from "@/components/learn/pillar-nav";

export const metadata: Metadata = {
  title: "Bài tập từ vựng",
  description: "Luyện tập từ vựng ưu tiên theo SRS hoặc luyện tự do theo bộ thẻ.",
  robots: { index: false, follow: true },
};

export default function VocabExercisesPage() {
  return (
    <>
      <PillarNav pillar="vocab" />
      <ExercisesConsole />
    </>
  );
}
