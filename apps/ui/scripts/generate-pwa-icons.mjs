// Generate the PWA / iOS icons from app/icon.svg (docs/plans/plan-pwa.md, PWA-02).
// Run from apps/ui after changing the logo:  node scripts/generate-pwa-icons.mjs
//
// sharp is not a direct dependency: it ships with Next (image optimization),
// so resolve it through Next's own install instead of adding a package.
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const sharp = require(require.resolve("sharp", { paths: [require.resolve("next")] }));

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const svg = await readFile(path.join(root, "app/icon.svg"));
const outDir = path.join(root, "public/icons");
await mkdir(outDir, { recursive: true });

// Brand indigo — the icon's own background (app/icon.svg) and the manifest theme color.
const BRAND = "#4f46e5";

/** Plain icon: the SVG as-is (rounded square), transparent corners. */
async function plain(size, file) {
  await sharp(svg, { density: 512 }).resize(size, size).png().toFile(file);
}

/**
 * Full-bleed icon on a solid brand square, logo scaled down to `scale`.
 * Maskable icons get cropped to a circle/squircle by Android, so the logo
 * must sit inside the central safe zone (80%). iOS also wants no transparency.
 */
async function fullBleed(size, scale, file) {
  const inner = Math.round(size * scale);
  const logo = await sharp(svg, { density: 512 }).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BRAND } })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(file);
}

await plain(192, path.join(outDir, "icon-192.png"));
await plain(512, path.join(outDir, "icon-512.png"));
await fullBleed(512, 0.72, path.join(outDir, "maskable-512.png"));
// Next file convention: app/apple-icon.png → <link rel="apple-touch-icon">.
await fullBleed(180, 0.9, path.join(root, "app/apple-icon.png"));

console.log("PWA icons written to public/icons/ and app/apple-icon.png");
