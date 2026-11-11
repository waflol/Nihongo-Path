import type { Metadata } from "next";
import { MaziiLogPanel } from "@/components/admin/mazii-log-panel";

export const metadata: Metadata = {
  title: "Log đồng bộ Mazii",
  description: "Tiến độ và log chi tiết của lượt cập nhật Hán Việt, On, Kun từ Mazii.",
  robots: { index: false, follow: false },
};

export default function AdminKanjiMaziiLogPage() {
  return <MaziiLogPanel />;
}
