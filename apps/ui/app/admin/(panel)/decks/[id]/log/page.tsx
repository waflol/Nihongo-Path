import type { Metadata } from "next";
import { HanVietLogPanel } from "@/components/learn/han-viet-log-panel";

export const metadata: Metadata = { title: "Log kiểm tra Hán tự", robots: { index: false, follow: false } };

export default async function AdminHanVietLogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <HanVietLogPanel deckId={id} mode="admin" />;
}
