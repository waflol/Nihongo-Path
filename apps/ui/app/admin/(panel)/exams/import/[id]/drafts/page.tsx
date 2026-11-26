import type { Metadata } from "next";
import { Suspense } from "react";
import { ExamImportDrafts } from "@/components/admin/exam-import-drafts";

export const metadata: Metadata = { title: "Duyệt bản nháp đề", robots: { index: false, follow: false } };

export default function AdminExamImportDraftsPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="py-16 text-center text-sm text-[var(--muted-foreground)]">Đang tải…</p>}>
      <AsyncAdminExamImportDraftsPage params={params} />
    </Suspense>
  );
}

// Awaiting URL data inside Suspense keeps navigation instant (Next.js "URL data outside of Suspense").
async function AsyncAdminExamImportDraftsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExamImportDrafts jobId={id} />;
}
