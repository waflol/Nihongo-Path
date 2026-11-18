import Link from "next/link";
import type { ReactNode } from "react";
import { LegalNav } from "./legal-nav";

type Props = {
  kicker: string;
  title: string;
  updated: string;
  intro: ReactNode;
  highlightsTitle: string;
  highlights: ReactNode;
  toc: { id: string; label: string }[];
  tocLabel: string;
  related: { title: string; text: string; href: string; cta: string };
  children: ReactNode;
};

/** Shared layout for /terms and /privacy: gradient hero, highlight cards, sticky TOC, prose card. */
export function LegalShell({
  kicker,
  title,
  updated,
  intro,
  highlightsTitle,
  highlights,
  toc,
  tocLabel,
  related,
  children,
}: Props) {
  return (
    <div className="legal">
      <header className="legal-hero">
        <div className="legal-hero-pattern" aria-hidden="true" />
        <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-12 sm:px-6 sm:pt-16 lg:px-8">
          <div className="legal-chip">
            <span className="legal-dot" aria-hidden="true" />
            {kicker}
            <span aria-hidden="true">·</span>
            Cập nhật {updated}
          </div>
          <h1 className="legal-title">{title}</h1>
          <div className="legal-intro">{intro}</div>
        </div>
      </header>

      <div className="mx-auto -mt-16 w-full max-w-6xl px-4 pb-16 sm:px-6 lg:px-8">
        <section aria-label={highlightsTitle} className="legal-highlights">
          <h2>{highlightsTitle}</h2>
          {highlights}
        </section>

        <div className="mt-10 grid gap-8 lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:gap-12">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <LegalNav items={toc} label={tocLabel} />
          </aside>

          <div>
            <article className="legal-prose">{children}</article>

            <footer className="legal-related">
              <div>
                <p className="font-semibold text-[var(--foreground)]">{related.title}</p>
                <p className="mt-1 text-[var(--muted-foreground)]">{related.text}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href={related.href} className="legal-btn legal-btn-primary">
                  {related.cta}
                </Link>
                <Link href="/register" className="legal-btn">
                  Tạo tài khoản
                </Link>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
