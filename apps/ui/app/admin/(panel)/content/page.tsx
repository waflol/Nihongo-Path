import type { Metadata } from "next";
import { AdminContentConsole } from "@/components/admin/content-console";

export const metadata: Metadata = {
  title: "Quản trị nội dung",
  description: "CRUD nội dung học (giáo trình, đơn vị, từ vựng, ngữ pháp).",
  robots: { index: false, follow: false },
};

/** Admin content console (P2-UI-04). The role gate lives in the panel layout. */
export default function AdminContentPage() {
  return <AdminContentConsole />;
}
