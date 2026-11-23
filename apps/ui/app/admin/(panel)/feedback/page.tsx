import type { Metadata } from "next";
import { FeedbackConsole } from "@/components/admin/feedback-console";

export const metadata: Metadata = {
  title: "Hộp thư phản hồi",
  description: "Góp ý chung của người học, lọc theo trạng thái và xem lịch sử xử lý.",
  robots: { index: false, follow: false },
};

/** Admin inbox for general learner feedback. The role gate lives in the panel layout. */
export default function AdminFeedbackPage() {
  return <FeedbackConsole />;
}
