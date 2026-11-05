#!/usr/bin/env node
/**
 * Build the local Tatoeba example index (speeds up example generation).
 *
 *   cd apps/api
 *   node scripts/import-tatoeba.mjs            # dry run: download + count, writes nothing
 *   node scripts/import-tatoeba.mjs --write    # fill the `tatoebasentences` collection
 *
 * Downloads three small official exports (~4 MB) from downloads.tatoeba.org:
 * Japanese sentences, Vietnamese sentences and their jpn↔vie links. Keeps
 * EVERY Japanese sentence of ≤ 40 chars (~244k), tokenises each with kuromoji
 * and stores `{ ja, vi?, hasVi, tokens }`. `vi` is the human Vietnamese
 * translation when one exists (~6k sentences); the rest get translated by AI
 * when a card needs them. `tokens` are the sentence's content-word dictionary
 * forms (particles / auxiliaries / symbols dropped), so a card's word is found
 * by one indexed query. Keep the token rule in sync with `contentForms()` in
 * example-suggest.service.ts.
 *
 * Idempotent (upsert by Tatoeba id); re-run to refresh. The data is CC BY 2.0
 * FR (Tatoeba contributors).
 */
import { config as loadDotenv } from "dotenv";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import Bunzip from "seek-bzip";
import kuromoji from "kuromoji";
import mongoose from "mongoose";

loadDotenv();
const require = createRequire(import.meta.url);
const write = process.argv.includes("--write");
const BASE = "https://downloads.tatoeba.org/exports/per_language";
const MAX_LEN = 40;

async function fetchTsv(path) {
  const res = await fetch(`${BASE}/${path}`, {
    headers: { "User-Agent": "NihongoPath/0.1 (example index)" },
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const bz = Buffer.from(await res.arrayBuffer());
  const text = Buffer.from(Bunzip.decode(bz)).toString("utf8");
  return text.split("\n").filter(Boolean).map((l) => l.split("\t"));
}

const [jpnRows, vieRows, linkRows] = await Promise.all([
  fetchTsv("jpn/jpn_sentences.tsv.bz2"),
  fetchTsv("vie/vie_sentences.tsv.bz2"),
  fetchTsv("jpn/jpn-vie_links.tsv.bz2"),
]);
const jpn = new Map(jpnRows.filter((r) => r.length >= 3).map((r) => [r[0], r[2]]));
const vie = new Map(vieRows.filter((r) => r.length >= 3).map((r) => [r[0], r[2]]));

// One Japanese sentence may have several Vietnamese translations: keep the first.
const viOf = new Map();
for (const [a, b] of linkRows) {
  const vi = vie.get(b);
  if (vi && !viOf.has(a)) viOf.set(a, vi);
}
const pairs = new Map();
for (const [id, ja] of jpn) {
  if (ja.length <= MAX_LEN) pairs.set(id, { ja, vi: viOf.get(id) ?? null });
}
console.log(`jpn ${jpn.size}, vie ${vie.size}, links ${linkRows.length} → ${pairs.size} sentences ≤ ${MAX_LEN} chars (${[...pairs.values()].filter((p) => p.vi).length} with Vietnamese)`);

const dicPath = join(dirname(require.resolve("kuromoji/package.json")), "dict");
const tk = await new Promise((resolve, reject) =>
  kuromoji.builder({ dicPath }).build((e, t) => (e ? reject(e) : resolve(t))),
);

const SKIP_POS = new Set(["記号", "助詞", "助動詞"]);
const docs = [...pairs].map(([id, { ja, vi }]) => ({
  _id: Number(id),
  ja,
  ...(vi ? { vi } : {}),
  hasVi: Boolean(vi),
  tokens: [
    ...new Set(
      tk
        .tokenize(ja)
        .filter((t) => !SKIP_POS.has(t.pos))
        .map((t) => (t.basic_form && t.basic_form !== "*" ? t.basic_form : t.surface_form)),
    ),
  ],
}));
const bytes = docs.reduce((n, d) => n + Buffer.byteLength(JSON.stringify(d)), 0);
console.log(`${docs.length} documents, ~${(bytes / 1024 / 1024).toFixed(1)} MB of data (before indexes)`);

if (!write) {
  console.log("Dry run — nothing written. Re-run with --write to fill the collection.");
  process.exit(0);
}

const url = process.env.MONGODB_URL?.trim();
if (!url) throw new Error("MONGODB_URL is not set");
await mongoose.connect(url);
const col = mongoose.connection.collection("tatoebasentences");
await col.createIndex({ tokens: 1, hasVi: -1 });
await col.dropIndex("tokens_1").catch(() => {}); // superseded by the compound index
for (let i = 0; i < docs.length; i += 500) {
  await col.bulkWrite(
    docs.slice(i, i + 500).map((d) => ({
      replaceOne: { filter: { _id: d._id }, replacement: d, upsert: true },
    })),
  );
}
console.log(`Wrote ${docs.length} sentences to tatoebasentences.`);
await mongoose.disconnect();
