import { readFile } from "node:fs/promises";
import path from "node:path";
import { siteConfig } from "../site";

/**
 * Web App Manifest (docs/plans/plan-pwa.md, PWA-01), served at /app.webmanifest.
 *
 * Why a route handler and not the `app/manifest.ts` file convention:
 * browsers fetch the manifest (and its icons) WITHOUT cookies by default.
 * Behind the ngrok free tunnel that request gets ngrok's HTML warning page
 * instead of the JSON, and Chrome refuses to install ("Không thể cài đặt").
 * The file convention renders `<link rel="manifest">` without a way to set
 * `crossorigin` (Next only adds it on Vercel preview), so the layout links
 * this route itself with `crossOrigin="use-credentials"`, and the icons are
 * inlined as data: URLs so Chrome needs no further (cookie-less) fetch.
 */

const ICONS = [
  { file: "icon-192.png", sizes: "192x192", purpose: "any" },
  { file: "icon-512.png", sizes: "512x512", purpose: "any" },
  { file: "maskable-512.png", sizes: "512x512", purpose: "maskable" },
] as const;

let body: string | null = null;

async function buildManifest(): Promise<string> {
  const dir = path.join(process.cwd(), "public/icons");
  const icons = await Promise.all(
    ICONS.map(async ({ file, sizes, purpose }) => ({
      src: `data:image/png;base64,${(await readFile(path.join(dir, file))).toString("base64")}`,
      sizes,
      type: "image/png",
      purpose,
    })),
  );
  return JSON.stringify({
    id: "/",
    name: siteConfig.name,
    short_name: siteConfig.name,
    description: siteConfig.defaultDescription,
    lang: "vi",
    dir: "ltr",
    // Learners land on their dashboard; proxy.ts sends signed-out users to /login.
    start_url: "/learn",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#4f46e5",
    categories: ["education"],
    icons,
  });
}

export async function GET(): Promise<Response> {
  body ??= await buildManifest();
  return new Response(body, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
