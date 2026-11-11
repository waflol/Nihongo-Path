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
