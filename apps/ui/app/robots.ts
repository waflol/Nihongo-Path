import type { MetadataRoute } from "next";
import { siteConfig } from "./site";

/**
 * robots.ts — Next.js metadata convention (spec §17.3).
 * Production URL comes from NEXT_PUBLIC_SITE_URL; robots must use a real
 * origin when set. When unset (local dev) we emit sitemap rules without an
 * absolute URL so the file stays valid.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteConfig.url;
  const sitemapUrl = base ? `${base}/sitemap.xml` : "/sitemap.xml";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Keep private/admin areas out of crawlers (extra layer; real
        // protection is auth + noindex, spec §17.3).
        disallow: ["/admin", "/learn"],
      },
      // AdSense policy: no crawling of checkout (not present yet; defensive).
      {
        userAgent: "Googlebot-Ads",
        disallow: ["/admin", "/learn", "/login"],
      },
    ],
    sitemap: sitemapUrl,
  };
}
