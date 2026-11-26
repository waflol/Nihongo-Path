import type { Metadata } from "next";
import { Suspense } from "react";
import { GrammarBrowser } from "@/components/learn/grammar-browser";

export const metadata: Metadata = {
  title: "Ngữ pháp N5–N1",
  description: "Học ngữ pháp tiếng Nhật theo cấp độ, chủ đề, bối cảnh và giáo trình.",
  robots: { index: false, follow: true },
};

export default function GrammarPage() {
  return (
    <Suspense fallback={<p className="py-16 text-center text-sm text-[var(--muted-foreground)]">Đang tải…</p>}>
      <GrammarBrowser />
    </Suspense>
  );
}
