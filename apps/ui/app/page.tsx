import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { FitScreen } from "@/components/fit-screen";
import { siteConfig } from "./site";
import BlurText from "@/components/reactbits/BlurText";
import SpotlightCard from "@/components/reactbits/SpotlightCard";
import StarBorder from "@/components/reactbits/StarBorder";
import ShinyText from "@/components/reactbits/ShinyText";
import FadeContent from "@/components/reactbits/FadeContent";
import { LoginCta } from "@/components/auth/login-cta";
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
    icon: "札",
    href: "/learn/decks",
    title: "Flashcard từ vựng & ngữ pháp",
    desc: "Học theo giáo trình, cấp độ và bộ thẻ; lặp lại ngắt quãng theo tiến độ cá nhân.",
  },
  {
    icon: "聴",
    href: "/learn",
    title: "Luyện nghe & chính tả",
    desc: "Video/audio với transcript theo đoạn, nghe lại từng câu và rèn chính tả.",
  },
  {
    icon: "解",
    href: "/learn",
    title: "Phân tích câu",
    desc: "Tách từ, furigana, từ loại và nghĩa — hỗ trợ hiểu sâu cấu trúc câu.",
  },
  {
    icon: "復",
    href: "/learn/review",
    title: "Lộ trình ôn tập",
    desc: "Lịch ôn tự động theo trình độ và lịch sử học, ôn đúng lúc hiệu quả.",
  },
];

export default function Home() {
  return (
    <div data-learn className="flex h-[calc(100dvh-4rem)] min-h-0 flex-col overflow-hidden">
      <FitScreen />
      {/* Hero */}
      <section className="relative min-h-0 flex-1 overflow-hidden home-hero rounded-b-[2rem] bg-gradient-to-b from-[var(--primary-950)] via-[var(--primary-600)] to-[var(--primary-200)]">
        <HeroScene className="pointer-events-none absolute inset-0" />
        <div className="relative mx-auto flex h-full max-w-7xl items-center px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p
              aria-hidden="true"
              style={{ fontFamily: '"Yu Mincho","Hiragino Mincho ProN","Noto Serif JP",serif' }}
              className="mb-2 text-lg tracking-[0.5em] text-white/70"
            >
              日本語の道
            </p>
            <h1 className="sr-only">{siteConfig.name}</h1>
            <BlurText
              text={siteConfig.name}
              animateBy="words"
              className="text-5xl font-bold tracking-tight text-white drop-shadow-lg sm:text-6xl"
            />
            <p className="mt-3 text-lg text-white/80">
              <ShinyText text={siteConfig.tagline} color="rgba(255,255,255,0.8)" shineColor="#ffffff" />
            </p>
            <p className="mt-3 max-w-xl text-base leading-7 text-white/90 drop-shadow">{siteConfig.defaultDescription}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <StarBorder
                as="a"
                href="/learn"
                color="#ffffff"
                backgroundColor="var(--primary-500)"
                textColor="#ffffff"
                className="h-12 px-6! py-0! text-sm font-semibold"
              >
                Vào khu học tập
              </StarBorder>
              <LoginCta>
                <Link
                  href="/login"
                  className="inline-flex h-12 items-center justify-center rounded-lg border border-white/50 bg-white/10 px-6 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Đăng nhập
                </Link>
              </LoginCta>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section aria-labelledby="features-heading" className="shrink-0 px-4 py-3 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h2 id="features-heading" className="sr-only">
            Những gì bạn sẽ làm được
          </h2>
          <FadeContent blur duration={0.8} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {features.map((f) => (
              <Link key={f.title} href={f.href} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]">
              <SpotlightCard
                theme="light"
                spotlightColor="var(--primary)"
                className="learn-tile !rounded-xl !p-3 sm:!p-4"
                style={{ "--spotlight-card-surface": "var(--card)", "--spotlight-card-border": "var(--border)" } as CSSProperties}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    style={{ fontFamily: '"Yu Mincho","Hiragino Mincho ProN","Noto Serif JP",serif' }}
                    className="flex size-8 shrink-0 -rotate-3 items-center justify-center rounded-md bg-[var(--primary)] text-base font-bold text-white"
                  >
                    {f.icon}
                  </span>
                  <h3 className="text-sm font-semibold leading-tight text-[var(--foreground)]">{f.title}</h3>
                </div>
                <p className="mt-2 hidden text-xs leading-5 text-[var(--muted-foreground-1)] [@media(min-height:760px)]:block">
                  {f.desc}
                </p>
              </SpotlightCard>
              </Link>
            ))}
          </FadeContent>
          <p className="mt-2 flex justify-center gap-4 text-[11px] text-[var(--muted-foreground-1)]">
            <span>© 2026 {siteConfig.name}</span>
            <Link href="/terms" className="hover:underline">Điều khoản</Link>
            <Link href="/privacy" className="hover:underline">Bảo mật</Link>
          </p>
        </div>
      </section>
    </div>
  );
}
