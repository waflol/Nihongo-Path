import type { Metadata } from "next";
import { Suspense } from "react";
import { KanjiAdminConsole } from "@/components/admin/kanji-console";

export const metadata: Metadata = {
  title: "Quản lý Kanji N5–N1",
  description: "Quản lý chữ Hán theo cấp độ N5–N1, âm Hán Việt, nghĩa và liên tưởng.",
  robots: { index: false, follow: false },
};

type Search = { view?: string | string[]; level?: string | string[] };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function AdminKanjiPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <Suspense fallback={<p className="py-16 text-center text-sm text-[var(--muted-foreground)]">Đang tải…</p>}>
      <AsyncAdminKanjiPage searchParams={searchParams} />
    </Suspense>
  );
}

// Awaiting URL data inside Suspense keeps navigation instant (Next.js "URL data outside of Suspense").
async function AsyncAdminKanjiPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  return <KanjiAdminConsole initialView={first(sp.view)} initialLevel={first(sp.level)} />;
}
