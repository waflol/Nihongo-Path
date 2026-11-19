import type { Metadata } from "next";
import { ExamsConsole } from "@/components/admin/exams-console";

export const metadata: Metadata = {
  title: "Quản trị đề thi",
  description: "Soạn đề thi, ngân hàng câu hỏi 問題 cho người học.",
  robots: { index: false, follow: false },
};

/** Admin exam authoring (P4-EXAM-09). The role gate lives in the panel layout. */
export default function AdminExamsPage() {
  return <ExamsConsole />;
}
