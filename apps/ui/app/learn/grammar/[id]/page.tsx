import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SaveGrammarButton } from "@/components/learn/save-grammar-button";
import { GrammarDetail, type GrammarDetailData } from "@/components/learn/grammar-detail";
import { API_BASE_URL } from "@/lib/api";

export const metadata: Metadata = { title: "Chi tiết ngữ pháp", robots: { index: false, follow: true } };

async function getGrammar(id: string): Promise<GrammarDetailData | null> {
  const response = await fetch(`${API_BASE_URL}/content/grammar/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!response.ok) return null;
  return response.json();
}

export default function GrammarDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="py-16 text-center text-sm text-[var(--muted-foreground)]">Đang tải…</p>}>
      <AsyncGrammarDetailPage params={params} />
    </Suspense>
  );
}

// Awaiting URL data inside Suspense keeps navigation instant (Next.js "URL data outside of Suspense").
async function AsyncGrammarDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getGrammar(id);
  if (!item) notFound();
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <Link href="/learn/grammar" className="text-sm text-[var(--primary)]">← Tất cả ngữ pháp</Link>
      <article className="mt-5 rounded-3xl border border-[var(--border)] bg-[var(--background-1)] p-6 sm:p-10">
        <GrammarDetail item={item} />
        <SaveGrammarButton grammarId={item._id} />
      </article>
    </main>
  );
}
