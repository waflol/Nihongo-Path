import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "./site";
import BlurText from "@/components/reactbits/BlurText";
import SpotlightCard from "@/components/reactbits/SpotlightCard";
import StarBorder from "@/components/reactbits/StarBorder";
import ShinyText from "@/components/reactbits/ShinyText";
import FadeContent from "@/components/reactbits/FadeContent";
import { HeroScene } from "@/components/hero-scene";

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
      <section className="relative min-h-[460px] overflow-hidden border-b border-[var(--border)] bg-gradient-to-b from-[#1e1b4b] via-[#4f46e5] to-[#fed7aa]">
        <HeroScene className="pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="grid items-center gap-8 lg:grid-cols-2">
          <div className="max-w-2xl">
            <h1 className="sr-only">{siteConfig.name}</h1>
            <BlurText
              text={siteConfig.name}
              animateBy="words"
              className="text-4xl font-bold tracking-tight text-white sm:text-5xl"
            />
            <p className="mt-4 text-lg text-white/80">
              <ShinyText text={siteConfig.tagline} color="rgba(255,255,255,0.8)" shineColor="#ffffff" />
            </p>
            <p className="mt-4 text-base text-white/90">
              {siteConfig.defaultDescription}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <StarBorder
                as="a"
                href="/learn"
                color="#ffffff"
                backgroundColor="#ff5a3c"
                textColor="#ffffff"
                className="h-12 px-6! py-0! text-sm font-semibold"
              >
                Vào khu học tập
              </StarBorder>
              <Link
                href="/login"
                className="inline-flex h-12 items-center justify-center rounded-lg border border-white/50 bg-white/10 px-6 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Đăng nhập
              </Link>
            </div>
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
        <FadeContent blur duration={0.8} className="mt-8 grid gap-6 sm:grid-cols-2">
          {features.map((f) => (
            <SpotlightCard
              key={f.title}
              theme="light"
              spotlightColor="var(--primary)"
              className="!rounded-2xl !p-6"
              style={{ "--spotlight-card-surface": "var(--card)", "--spotlight-card-border": "var(--border)" } as CSSProperties}
            >
              <h3 className="text-base font-semibold text-[var(--foreground)]">{f.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground-1)]">{f.desc}</p>
            </SpotlightCard>
          ))}
        </FadeContent>
      </section>
    </div>
  );
}
