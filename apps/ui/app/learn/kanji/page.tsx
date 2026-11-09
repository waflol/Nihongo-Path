import type { Metadata } from "next";
import { KanjiBrowser } from "@/components/learn/kanji-browser";

export const metadata: Metadata = {
  title: "Kanji N5–N1",
  description: "Tra cứu kanji theo cấp JLPT và âm Hán Việt, xem thứ tự nét.",
  robots: { index: false, follow: true },
};

type Search = { view?: string | string[]; level?: string | string[] };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function KanjiPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  return <KanjiBrowser initialView={first(sp.view)} initialLevel={first(sp.level)} />;
}
