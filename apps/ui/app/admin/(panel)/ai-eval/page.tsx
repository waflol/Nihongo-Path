import type { Metadata } from "next";
import { AiEvalConsole } from "@/components/admin/ai-eval-console";

export const metadata: Metadata = {
  title: "Đánh giá AI",
  description: "Benchmark các dịch vụ AI trên bộ câu JLPT N5–N1: dịch, đặt câu, từ vựng, ngữ pháp.",
  robots: { index: false, follow: false },
};

/** Admin evaluation benchmark. The role gate lives in the panel layout. */
export default function AdminAiEvalPage() {
  return <AiEvalConsole />;
}
