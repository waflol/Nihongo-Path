import type { Metadata } from "next";
import { AiPlayground } from "@/components/admin/ai-playground";

export const metadata: Metadata = {
  title: "Sân chơi AI",
  description: "Thử tạo câu ví dụ, dịch và phân tích ngữ pháp trên từng dịch vụ AI.",
  robots: { index: false, follow: false },
};

/** Admin AI playground. The role gate lives in the panel layout. */
export default function AdminAiPlaygroundPage() {
  return <AiPlayground />;
}
