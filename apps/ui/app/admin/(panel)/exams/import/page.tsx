import type { Metadata } from "next";
import { ExamImportForm } from "@/components/admin/exam-import-form";

export const metadata: Metadata = {
  title: "Nhập đề JLPT",
  description: "Nhập PDF đề thi và file nghe.",
  robots: { index: false, follow: false },
};

/** Admin: import a JLPT exam PDF + listening clips. The role gate lives in the panel layout. */
export default function AdminExamImportPage() {
  return <ExamImportForm />;
}
