import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Let the ngrok tunnel load dev-only resources (HMR, /_next/*); otherwise
  // Next blocks them as cross-origin and the page never hydrates.
  // Extra hosts/IPs come from ALLOWED_DEV_ORIGINS (comma-separated).
  allowedDevOrigins: [
    "*.ngrok-free.dev",
    "*.ngrok-free.app",
    "*.ngrok.app",
    ...(process.env.ALLOWED_DEV_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ],
  // PWA service worker (docs/plans/plan-pwa.md, PWA-05): never let a browser
  // or the ngrok edge keep an old sw.js, or fixes to it never reach devices.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  // The floating "N" dev badge sits on top of the mobile UI while testing the PWA.
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
