import type { Metadata } from "next";
import { Suspense } from "react";
import { HanVietLogPanel } from "@/components/learn/han-viet-log-panel";

export const metadata: Metadata = { title: "Log kiểm tra", robots: { index: false, follow: false } };

export default async function AdminHanVietLogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <HanVietLogPanel deckId={id} mode="admin" />
    </Suspense>
  );
}
