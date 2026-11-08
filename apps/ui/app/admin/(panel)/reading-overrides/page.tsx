import type { Metadata } from "next";
import { ReadingOverridesPanel } from "@/components/admin/reading-overrides-panel";

export const metadata: Metadata = {
  title: "Cách đọc đã học",
  description: "Các từ máy phân tích đã học lại cách đọc từ thao tác Bỏ qua.",
  robots: { index: false, follow: false },
};

/** Admin list of learned readings. The role gate lives in the panel layout. */
export default function AdminReadingOverridesPage() {
  return <ReadingOverridesPanel />;
}
