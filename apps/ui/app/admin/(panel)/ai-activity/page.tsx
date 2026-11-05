import type { Metadata } from "next";
import { AiActivityPanel } from "@/components/admin/ai-activity-panel";
import { AiCallLogPanel } from "@/components/admin/ai-call-log-panel";

export const metadata: Metadata = {
  title: "Theo dõi AI",
  description: "Hoạt động trực tiếp của các dịch vụ AI và lịch sử các lần gọi.",
  robots: { index: false, follow: false },
};

/** Live AI activity + call history. The role gate lives in the panel layout. */
export default function AdminAiActivityPage() {
  return (
    <div className="mx-auto w-full max-w-6xl py-8">
      <div className="px-4 pb-6 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">Theo dõi AI</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--muted-foreground)]">
          Dịch vụ nào đang chạy, nghỉ hay lỗi, và lịch sử các yêu cầu đã gửi tới AI cùng câu trả lời.
        </p>
      </div>
      <AiActivityPanel />
      <AiCallLogPanel />
    </div>
  );
}
