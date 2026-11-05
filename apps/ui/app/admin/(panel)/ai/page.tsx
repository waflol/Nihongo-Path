import type { Metadata } from "next";
import { AiServicesConsole } from "@/components/admin/ai-services-console";
import { AiActivityPanel } from "@/components/admin/ai-activity-panel";
import { AiCallLogPanel } from "@/components/admin/ai-call-log-panel";

export const metadata: Metadata = {
  title: "Dịch vụ AI",
  description: "Quản lý các dịch vụ AI tạo câu ví dụ: thêm, sắp xếp ưu tiên, bật/tắt, kiểm tra.",
  robots: { index: false, follow: false },
};

/** Admin AI-service management. The role gate lives in the panel layout. */
export default function AdminAiPage() {
  return (
    <>
      <AiServicesConsole />
      <AiActivityPanel />
      <AiCallLogPanel />
    </>
  );
}
