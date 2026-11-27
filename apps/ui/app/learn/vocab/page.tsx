import type { Metadata } from "next";
import { DecksConsole } from "@/components/learn/decks-console";
import { PillarNav } from "@/components/learn/pillar-nav";
import { PillarProgress } from "@/components/learn/pillar-progress";

export const metadata: Metadata = {
  title: "Từ vựng — Bộ thẻ",
  description: "Quản lý bộ thẻ từ vựng cá nhân và bộ thẻ chung.",
  robots: { index: false, follow: true },
};

export default function VocabPage() {
  return (
    <>
      <PillarNav pillar="vocab" />
      <PillarProgress pillar="vocab" className="max-w-6xl" />
      <DecksConsole />
    </>
  );
}
