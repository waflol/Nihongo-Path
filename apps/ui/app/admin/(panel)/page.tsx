import type { Metadata } from "next";
import { AdminOverview } from "@/components/admin/admin-overview";

export const metadata: Metadata = {
  title: "Quản trị",
  description: "Bàn điều khiển quản trị nội dung.",
  // Admin is a private area; never indexed or crawlable (spec §17.3).
  robots: { index: false, follow: false },
};

/** Admin overview. The role gate + sidebar live in the panel layout. */
export default function AdminPage() {
  return <AdminOverview />;
}
