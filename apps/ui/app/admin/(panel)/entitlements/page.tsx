import type { Metadata } from "next";
import { EntitlementsConsole } from "@/components/admin/entitlements-console";

export const metadata: Metadata = {
  title: "Hạn mức & gói",
  description: "Giới hạn tính năng theo gói người học, chu kỳ tính hạn mức và chính sách vượt.",
  robots: { index: false, follow: false },
};

/**
 * Admin entitlements / quota configuration (P5-ADMIN-04, P5-QUOTA-01).
 * The role gate lives in the panel layout.
 */
export default function AdminEntitlementsPage() {
  return <EntitlementsConsole />;
}
