import type { Metadata } from "next";
import { BackupConsole } from "@/components/admin/backup-console";

export const metadata: Metadata = {
  title: "Sao lưu dữ liệu",
  description: "Tải bản sao lưu dữ liệu hệ thống.",
  robots: { index: false, follow: false },
};

/** Admin data backup. The role gate lives in the panel layout. */
export default function AdminBackupPage() {
  return <BackupConsole />;
}
