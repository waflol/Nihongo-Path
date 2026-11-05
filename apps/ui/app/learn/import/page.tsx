import type { Metadata } from "next";
import { Suspense } from "react";
import { LearnImportGate } from "./gate";

export const metadata: Metadata = {
  title: "Nhập thẻ từ file",
  description: "Nhập thẻ vào bộ flashcard của bạn từ CSV hoặc XLSX.",
  robots: { index: false, follow: true },
};

export default function LearnImportPage() {
  return (
    <Suspense
      fallback={
        <p className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-[var(--muted-foreground)] sm:px-6">
          Đang tải…
        </p>
      }
    >
      <LearnImportGate />
    </Suspense>
  );
}
