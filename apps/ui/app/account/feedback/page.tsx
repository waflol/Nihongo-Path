import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MyFeedbackList } from "@/components/account/my-feedback-list";
import { getSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Báo lỗi & góp ý của tôi",
  robots: { index: false, follow: false },
};

/** Learner's own card reports / feedback with status filter and processing timeline. */
export default async function MyFeedbackPage() {
  const session = await getSession();
  if (!session.authenticated || !session.user) redirect("/login?from=/account/feedback");

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <Link href="/account" className="text-sm text-[var(--primary)] hover:underline">
        ← Tài khoản
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-[var(--foreground)]">Báo lỗi &amp; góp ý của tôi</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Theo dõi trạng thái và phản hồi của đội ngũ cho từng báo lỗi thẻ hoặc góp ý bạn đã gửi. Bấm vào một mục để xem tiến trình.
      </p>
      <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
        <MyFeedbackList />
      </section>
    </div>
  );
}
