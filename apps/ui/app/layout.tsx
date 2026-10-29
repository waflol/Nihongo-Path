import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Preline } from "@/components/preline";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { siteConfig } from "./site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Default (site-wide) metadata. Per-page overrides live on each public page.
 * `metadataBase`/canonical are only meaningful once the production domain is
 * decided, so they stay unset here (spec §17.3).
 */
export const metadata: Metadata = {
  title: {
    default: `${siteConfig.name} — Học tiếng Nhật`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.defaultDescription,
  applicationName: siteConfig.applicationName,
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    locale: siteConfig.locale,
    title: `${siteConfig.name} — Học tiếng Nhật`,
    description: siteConfig.defaultDescription,
    // No canonical/OG base URL until the production domain is chosen.
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-[var(--background)] font-sans text-[var(--foreground)]">
        <SiteHeader />
        <main className="flex flex-1 flex-col">{children}</main>
        <SiteFooter />
        {/* Preline JS init (client, idempotent, re-runs on route change). */}
        <Preline />
      </body>
    </html>
  );
}
