import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "./site";
import { LoginCta } from "@/components/auth/login-cta";
import { FlashDemo } from "@/components/home/flash-demo";
import { HeroScene } from "@/components/hero-scene";
import { FitScreen } from "@/components/fit-screen";
import { PetalField } from "@/components/home/petal-field";

export const metadata: Metadata = {
  title: "Học tiếng Nhật mỗi ngày",
  description: siteConfig.defaultDescription,
  openGraph: {
    title: `${siteConfig.name} — Học tiếng Nhật mỗi ngày`,
    description: siteConfig.defaultDescription,
  },
};

const features = [
  { icon: "札", href: "/learn/decks", title: "Flashcard", desc: "Bộ thẻ theo giáo trình và cấp độ." },
  { icon: "聴", href: "/learn", title: "Nghe & chính tả", desc: "Nghe lại từng câu, rèn chính tả." },
  { icon: "解", href: "/learn", title: "Phân tích câu", desc: "Furigana, từ loại và nghĩa." },
  { icon: "復", href: "/learn/review", title: "Lộ trình ôn tập", desc: "Lịch ôn tự xếp theo trí nhớ." },
];

const SERIF_STACK = '"Yu Mincho","Hiragino Mincho ProN","Noto Serif JP",serif';

export default function Home() {
  return (
    <div className="relative isolate overflow-hidden">
      <FitScreen maxWidth={1023} minHeight={540} />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 lg:landscape:hidden"
        style={{ background: "linear-gradient(to bottom, color-mix(in srgb, var(--primary) 16%, transparent) 0%, color-mix(in srgb, #ffb88a 12%, transparent) 55%, transparent 85%)" }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[54%] overflow-hidden opacity-[0.42] [mask-image:linear-gradient(to_bottom,#000_55%,transparent_100%)] md:hidden"
      >
        <HeroScene fit="slice" align="xMidYMax" viewBox="760 0 1280 600" className="absolute inset-0" />
      </div>
      <PetalField className="pointer-events-none absolute inset-0 -z-10 overflow-hidden sm:hidden" />
      <HeroScene className="pointer-events-none hidden lg:landscape:block absolute -left-[30%] right-[22%] bottom-[20%] -z-10 h-[80%] opacity-[0.3] [mask-image:linear-gradient(to_right,transparent_6%,#000_40%,#000_78%,transparent_100%),linear-gradient(to_bottom,#000_88%,transparent_100%)] [mask-composite:intersect] [-webkit-mask-composite:source-in] dark:opacity-45" />
    <div className="relative mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-7xl flex-col justify-center overflow-hidden px-4 max-lg:justify-start lg:portrait:justify-start max-lg:[@media(min-height:540px)]:h-[calc(100dvh-65px)] max-lg:[@media(min-height:540px)]:min-h-0 sm:px-6 lg:px-8">
      <span
        aria-hidden="true"
        style={{ fontFamily: '"Yu Mincho","Hiragino Mincho ProN","Noto Serif JP",serif' }}
        className="pointer-events-none absolute -left-6 top-1/2 hidden -translate-y-[58%] select-none text-[min(52vh,34rem)] leading-none text-[var(--primary)] opacity-[0.045] lg:landscape:block"
      >
        道
      </span>
      <section className="relative grid items-center max-md:flex max-md:flex-none max-md:flex-col max-md:items-stretch md:grid-cols-[1fr_21rem] gap-5 pb-3 pt-4 sm:gap-8 sm:pb-8 sm:pt-8 lg:grid-cols-[1fr_27rem] lg:gap-16 lg:py-10 xl:grid-cols-[1fr_30rem] lg:[@media(min-height:1000px)_and_(orientation:landscape)]:py-16">
        <div className="relative max-w-xl max-md:shrink-0">
          <p
            aria-hidden="true"
            style={{ fontFamily: '"Yu Mincho","Hiragino Mincho ProN","Noto Serif JP",serif' }}
            className="relative mb-2 text-base tracking-[0.5em] text-[var(--muted-foreground)] sm:text-lg"
          >
            日本語の道
          </p>
          <h1 className="relative text-4xl font-bold leading-[1.05] min-[400px]:text-5xl [@media(max-height:700px)]:!text-3xl tracking-tight text-[var(--foreground)] sm:text-6xl lg:text-[4rem] xl:text-7xl lg:[@media(min-height:1000px)_and_(orientation:landscape)]:text-7xl">
            {siteConfig.name}
          </h1>
          <p className="relative mt-3 max-w-md text-sm leading-6 [@media(max-height:780px)]:max-sm:hidden sm:mt-5 sm:text-base sm:leading-7 text-[var(--muted-foreground)] sm:text-lg lg:[@media(min-height:1000px)_and_(orientation:landscape)]:max-w-lg lg:[@media(min-height:1000px)_and_(orientation:landscape)]:text-xl lg:[@media(min-height:1000px)_and_(orientation:landscape)]:leading-8">
            {siteConfig.tagline}
          </p>
          <p className="relative mt-2 max-w-md text-sm leading-6 max-md:hidden [@media(max-height:780px)]:max-sm:hidden sm:text-base sm:leading-7 text-[var(--muted-foreground)]">
            {siteConfig.defaultDescription}
          </p>
          <div className="relative mt-4 flex flex-wrap gap-3 sm:mt-7">
            <Link
              href="/learn"
              className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--primary)] px-6 text-sm [@media(max-height:700px)]:max-sm:h-10 [@media(max-height:700px)]:max-sm:px-4 [@media(max-height:700px)]:max-sm:text-[13px] font-semibold text-[var(--primary-foreground)] shadow-[0_12px_28px_-14px_var(--primary)] transition hover:bg-[var(--primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
            >
              Vào khu học tập
            </Link>
            <LoginCta>
              <Link
                href="/login"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--background)] px-6 text-sm [@media(max-height:700px)]:max-sm:h-10 [@media(max-height:700px)]:max-sm:px-4 [@media(max-height:700px)]:max-sm:text-[13px] font-semibold text-[var(--foreground)] transition hover:border-[var(--primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
              >
                Đăng nhập
              </Link>
            </LoginCta>
          </div>
        </div>

        <div className="hidden sm:block">
          <FlashDemo />
        </div>
      </section>

      <section
        aria-label="Bạn sẽ làm được gì"
        className="relative mt-1 grid grid-cols-2 gap-2.5 pb-3 max-md:min-h-0 max-md:flex-1 max-md:grid-rows-2 md:grid-cols-4 sm:gap-0 sm:border-t sm:border-[var(--border)] sm:pb-0 lg:mt-6 lg:grid-cols-4 lg:[@media(min-height:1000px)_and_(orientation:landscape)]:mt-10"
      >
        {features.map((f, n) => (
          <Link
            key={f.title}
            href={f.href}
            aria-label={f.title}
            className={
              "group relative flex min-w-0 flex-col justify-between overflow-hidden rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_68%,transparent)] p-3.5 backdrop-blur-sm transition-all duration-300 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] " +
              "md:flex-row md:items-center md:justify-start md:gap-3 md:rounded-none md:border-0 md:bg-transparent md:p-0 md:px-1 md:py-4 md:backdrop-blur-none md:active:scale-100 lg:px-4 lg:[@media(min-height:1000px)_and_(orientation:landscape)]:py-6 " +
              (n > 0 ? "lg:border-l lg:border-[var(--border)] " : "") +
              (n % 2 === 1 ? "md:pl-4 " : "")
            }
          >
            <span
              aria-hidden="true"
              style={{ fontFamily: SERIF_STACK }}
              className="pointer-events-none absolute -bottom-3 -right-1 select-none text-[6.5rem] leading-none text-[var(--primary)] opacity-[0.09] transition-all duration-500 group-hover:-translate-y-1 group-hover:opacity-[0.14] md:hidden"
            >
              {f.icon}
            </span>
            <span
              aria-hidden="true"
              style={{ fontFamily: SERIF_STACK }}
              className="relative flex size-10 shrink-0 -rotate-3 items-center justify-center rounded-xl bg-[var(--primary)] text-xl font-bold text-[var(--primary-foreground)] shadow-md md:size-auto md:rotate-0 md:rounded-none md:bg-transparent md:text-3xl md:font-normal md:text-[var(--muted-foreground)] md:shadow-none md:transition-colors md:group-hover:text-[var(--primary)]"
            >
              {f.icon}
            </span>
            <span className="relative min-w-0">
              <span className="block text-[15px] font-semibold leading-tight text-[var(--foreground)] md:text-sm">{f.title}</span>
              <span className="mt-1 line-clamp-2 block text-xs leading-snug text-[var(--muted-foreground)] [@media(max-height:600px)]:max-sm:hidden lg:truncate">{f.desc}</span>
            </span>
          </Link>
        ))}
      </section>

      <div
        aria-hidden="true"
        className="relative -mx-4 mt-auto min-h-[8rem] max-h-[34rem] flex-1 overflow-hidden max-md:hidden [mask-image:linear-gradient(to_bottom,transparent,#000_30%)] sm:-mx-6 lg:landscape:hidden"
      >
        <HeroScene fit="slice" align="xMidYMax" viewBox="760 0 1280 600" className="absolute inset-0 opacity-[0.8]" />
      </div>
    </div>
    </div>
  );
}
