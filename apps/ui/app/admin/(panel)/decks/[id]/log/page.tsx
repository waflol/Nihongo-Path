import type { Metadata } from "next";
import { Suspense } from "react";
import { HanVietLogPanel } from "@/components/learn/han-viet-log-panel";

export const metadata: Metadata = { title: "Log kiểm tra", robots: { index: false, follow: false } };

async function Panel({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <HanVietLogPanel deckId={id} mode="admin" />;
}

export default function AdminHanVietLogPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <Panel params={params} />
    </Suspense>
  );
}
