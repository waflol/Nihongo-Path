import type { Metadata } from "next";
import { SystemMonitor } from "@/components/admin/system-monitor";

export const metadata: Metadata = {
  title: "Giám sát máy chủ",
  description: "RAM, ổ đĩa và CPU của máy chủ.",
  robots: { index: false, follow: false },
};

/** Admin server monitor. The role gate lives in the panel layout. */
export default function AdminSystemPage() {
  return <SystemMonitor />;
}
