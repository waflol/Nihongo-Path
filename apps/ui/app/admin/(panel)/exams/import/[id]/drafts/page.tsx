import type { Metadata } from "next";
import { ExamImportDrafts } from "@/components/admin/exam-import-drafts";

export const metadata: Metadata = { title: "Duyệt bản nháp đề", robots: { index: false, follow: false } };

export default async function AdminExamImportDraftsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExamImportDrafts jobId={id} />;
}
