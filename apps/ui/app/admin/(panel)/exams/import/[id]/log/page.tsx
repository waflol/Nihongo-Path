import type { Metadata } from "next";
import { Suspense } from "react";
import { ExamImportLogPanel } from "@/components/admin/exam-import-log-panel";

export const metadata: Metadata = { title: "Log nhập đề", robots: { index: false, follow: false } };

export default function AdminExamImportLogPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="py-16 text-center text-sm text-[var(--muted-foreground)]">Đang tải…</p>}>
      <AsyncPanel params={params} />
    </Suspense>
  );
}

// Awaiting `params` inside Suspense keeps the page shell instant (Next.js "URL data outside of Suspense").
async function AsyncPanel({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExamImportLogPanel jobId={id} />;
}
