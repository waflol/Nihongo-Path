import type { Metadata } from "next";
import { ReadingOverridesPanel } from "@/components/admin/reading-overrides-panel";

export const metadata: Metadata = {
  title: "Từ vựng đã học",
  description: "Các từ được sửa tay hoặc giữ lại bằng Bỏ qua; AI kiểm tra mặc định bỏ qua những từ này.",
  robots: { index: false, follow: false },
};

/** Admin list of the learned vocabulary. The role gate lives in the panel layout. */
export default function AdminReadingOverridesPage() {
  return <ReadingOverridesPanel />;
}
