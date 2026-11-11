import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { HanVietLogPanel } from "@/components/learn/han-viet-log-panel";

export const metadata: Metadata = { title: "Log kiểm tra", robots: { index: false, follow: false } };

async function Gate({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session.authenticated) redirect("/login?from=/learn/decks");
  return <HanVietLogPanel deckId={id} mode="learn" />;
}

export default function LearnHanVietLogPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense
      fallback={
        <p className="mx-auto max-w-5xl px-4 py-16 text-center text-sm text-[var(--muted-foreground)] sm:px-6">
          Đang tải…
        </p>
      }
    >
      <Gate params={params} />
    </Suspense>
  );
}
