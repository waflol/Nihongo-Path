import type { MetadataRoute } from "next";
import { siteConfig } from "./site";

/**
 * sitemap.ts — Next.js metadata convention (spec §17.3).
 * Only PUBLIC, crawlable routes go here. Login/learn/admin are excluded.
 * `base` is empty in local dev; Next falls back to the request host at build.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteConfig.url;
  const lastModified = new Date();

  const routes: Array<MetadataRoute.Sitemap[number]> = [
    {
      url: `${base}/`,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];

  // As public content pages are added (courses, topics, grammar ...), append
  // them here. Do NOT list private or user-specific URLs.
  return routes;
}
