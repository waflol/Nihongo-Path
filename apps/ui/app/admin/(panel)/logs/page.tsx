import type { Metadata } from "next";
import { LogsConsole } from "@/components/admin/logs-console";

export const metadata: Metadata = {
  title: "Nhật ký hệ thống",
  description: "Theo dõi các request tới backend.",
  robots: { index: false, follow: false },
};

/** Admin request-log viewer. The role gate lives in the panel layout. */
export default function AdminLogsPage() {
  return <LogsConsole />;
}
