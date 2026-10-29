import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "./site";

export const metadata: Metadata = {
  title: "Học tiếng Nhật mỗi ngày",
  description: siteConfig.defaultDescription,
  openGraph: {
    title: `${siteConfig.name} — Học tiếng Nhật mỗi ngày`,
    description: siteConfig.defaultDescription,
  },
};

const features = [
  {
    title: "Flashcard từ vựng & ngữ pháp",
    desc: "Học theo giáo trình, cấp độ và bộ thẻ; lặp lại ngắt quãng theo tiến độ cá nhân.",
  },
  {
    title: "Luyện nghe & chính tả",
    desc: "Video/audio với transcript theo đoạn, nghe lại từng câu và rèn chính tả.",
  },
  {
    title: "Phân tích câu",
    desc: "Tách từ, furigana, từ loại và nghĩa — hỗ trợ hiểu sâu cấu trúc câu.",
  },
  {
    title: "Lộ trình ôn tập",
    desc: "Lịch ôn tự động theo trình độ và lịch sử học, ôn đúng lúc hiệu quả.",
  },
];

export default function Home() {
  return (
    <div>
      {/* Hero */}
      <section className="border-b border-[var(--border)] bg-[var(--background-1)]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h1 className="text-4xl font-bold tracking-tight text-[var(--foreground)] sm:text-5xl">
              {siteConfig.name}
            </h1>
            <p className="mt-4 text-lg text-[var(--muted-foreground)]">
              {siteConfig.tagline}
            </p>
            <p className="mt-4 text-base text-[var(--foreground)]">
              {siteConfig.defaultDescription}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/learn"
                className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary-focus)]"
              >
                Vào khu học tập
              </Link>
              <Link
                href="/login"
                className="rounded-lg border border-[var(--border)] px-5 py-2.5 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
              >
                Đăng nhập
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features (placeholder content — replace with real learning content later) */}
      <section aria-labelledby="features-heading" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <h2
          id="features-heading"
          className="text-2xl font-semibold tracking-tight text-[var(--foreground)]"
        >
          Những gì bạn sẽ làm được
        </h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {features.map((f) => (
            <article
              key={f.title}
              className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm"
            >
              <h3 className="text-base font-semibold text-[var(--foreground)]">{f.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground-1)]">{f.desc}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
