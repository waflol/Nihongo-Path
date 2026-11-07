import type { Metadata } from "next";
import { CardReportsConsole } from "@/components/admin/card-reports-console";

export const metadata: Metadata = {
  title: "Góp ý & báo lỗi",
  description: "Xem góp ý và báo lỗi từ người học.",
  robots: { index: false, follow: false },
};

export default function AdminReportsPage() {
  return <CardReportsConsole />;
}
