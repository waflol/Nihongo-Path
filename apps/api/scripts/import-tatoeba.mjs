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
 * only Japanese sentences (≤ 40 chars) that have a Vietnamese translation —
 * the same filter the live lookup applies — tokenises each with kuromoji and
 * stores `{ ja, vi, tokens }`. `tokens` are the sentence's dictionary forms,
 * so a card's word is found by one indexed query.
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
const pairs = new Map();
for (const [a, b] of linkRows) {
  const ja = jpn.get(a);
  const vi = vie.get(b);
  if (ja && vi && ja.length <= MAX_LEN && !pairs.has(a)) pairs.set(a, { ja, vi });
}
console.log(`jpn ${jpn.size}, vie ${vie.size}, links ${linkRows.length} → ${pairs.size} usable pairs`);

const dicPath = join(dirname(require.resolve("kuromoji/package.json")), "dict");
const tk = await new Promise((resolve, reject) =>
  kuromoji.builder({ dicPath }).build((e, t) => (e ? reject(e) : resolve(t))),
);

const docs = [...pairs].map(([id, { ja, vi }]) => ({
  _id: Number(id),
  ja,
  vi,
  tokens: [
    ...new Set(
      tk
        .tokenize(ja)
        .filter((t) => t.pos !== "記号")
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
await col.createIndex({ tokens: 1 });
for (let i = 0; i < docs.length; i += 500) {
  await col.bulkWrite(
    docs.slice(i, i + 500).map((d) => ({
      replaceOne: { filter: { _id: d._id }, replacement: d, upsert: true },
    })),
  );
}
console.log(`Wrote ${docs.length} sentences to tatoebasentences.`);
await mongoose.disconnect();
