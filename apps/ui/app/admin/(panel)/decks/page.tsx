import type { Metadata } from "next";
import { SharedDecksConsole } from "@/components/admin/shared-decks-console";

export const metadata: Metadata = {
  title: "Quản trị bộ thẻ chung",
  description: "Tạo, chỉnh và xem bộ thẻ chia sẻ dùng chung cho người học.",
  robots: { index: false, follow: false },
};

/** Admin shared-deck management (P3-UI-04). The role gate lives in the panel layout. */
export default function AdminDecksPage() {
  return <SharedDecksConsole />;
}
