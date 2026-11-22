import type { Metadata } from "next";
import { ExamImportLogPanel } from "@/components/admin/exam-import-log-panel";

export const metadata: Metadata = { title: "Log nhập đề", robots: { index: false, follow: false } };

export default async function AdminExamImportLogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExamImportLogPanel jobId={id} />;
}
