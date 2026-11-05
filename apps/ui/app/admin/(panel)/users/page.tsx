import type { Metadata } from "next";
import { UsersConsole } from "@/components/admin/users-console";
import { getSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Quản lý người dùng",
  description: "Danh sách tài khoản, trạng thái hoạt động và phân quyền.",
  robots: { index: false, follow: false },
};

/** Admin user management. The role gate lives in the panel layout. */
export default async function AdminUsersPage() {
  const session = await getSession();
  return <UsersConsole meId={session.user?.id ?? ""} meRole={session.user?.role ?? "ADMIN"} />;
}
