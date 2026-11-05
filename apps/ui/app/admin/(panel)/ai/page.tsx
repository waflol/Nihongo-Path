import type { Metadata } from "next";
import { AiServicesConsole } from "@/components/admin/ai-services-console";

export const metadata: Metadata = {
  title: "Dịch vụ AI",
  description: "Quản lý các dịch vụ AI tạo câu ví dụ: thêm, sắp xếp ưu tiên, bật/tắt, kiểm tra.",
  robots: { index: false, follow: false },
};

/** Admin AI-service management. The role gate lives in the panel layout. */
export default function AdminAiPage() {
  return <AiServicesConsole />;
}
