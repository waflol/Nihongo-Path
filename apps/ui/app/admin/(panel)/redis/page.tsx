import type { Metadata } from "next";
import { RedisConsole } from "@/components/admin/redis-console";

export const metadata: Metadata = {
  title: "Quản lý Redis",
  description: "Xem key, tác vụ đang chạy và làm trống Redis.",
  robots: { index: false, follow: false },
};

/** Admin Redis manager. The role gate lives in the panel layout. */
export default function AdminRedisPage() {
  return <RedisConsole />;
}
