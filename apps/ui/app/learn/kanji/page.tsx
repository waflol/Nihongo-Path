import type { Metadata } from "next";
import { KanjiBrowser } from "@/components/learn/kanji-browser";

export const metadata: Metadata = {
  title: "Kanji N5–N1",
  description: "Tra cứu kanji theo cấp JLPT và âm Hán Việt, xem thứ tự nét.",
  robots: { index: false, follow: true },
};

export default function KanjiPage() {
  return <KanjiBrowser />;
}
