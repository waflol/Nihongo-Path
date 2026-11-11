import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { HanVietLogPanel } from "@/components/learn/han-viet-log-panel";

export const metadata: Metadata = { title: "Log kiểm tra Hán tự", robots: { index: false, follow: false } };

export default async function LearnHanVietLogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session.authenticated) redirect("/login?from=/learn/decks");
  return <HanVietLogPanel deckId={id} mode="learn" />;
}
