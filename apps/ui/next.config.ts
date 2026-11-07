import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Let the ngrok tunnel load dev-only resources (HMR, /_next/*); otherwise
  // Next blocks them as cross-origin and the page never hydrates.
  allowedDevOrigins: ["*.ngrok-free.dev", "*.ngrok-free.app", "*.ngrok.app"],
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
