#!/usr/bin/env node
/**
 * Import JLPT kanji (plan-kanji §4).
 *
 *   cd apps/api
 *   node scripts/import-kanji.mjs                 # dry run: download + report
 *   node scripts/import-kanji.mjs --write         # upsert into `kanjis`
 *   node scripts/import-kanji.mjs --write --level N5
 *   node scripts/import-kanji.mjs --all           # all 13k chars, not just JLPT
 *
 * Sources are cached under apps/api/data/kanji/ (gitignored). Re-running is
 * safe: only source-owned fields are overwritten; mnemonic, Vietnamese
 * meanings, words[].meaning and status are never touched.
 * Han-Viet: curated table (packages/shared/han-viet.json) wins, then
 * `hanviet-pinyin-words` (via Unihan variants), then Unihan kVietnamese.
 */
import { config as loadDotenv } from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import mongoose from "mongoose";
import { extractStrokePaths, hanVietNorm, parseUnihan, levelForRank, pickKanjiData, rankJoyo, resolveHanViet, wordsByKanji } from "./kanji-lib.mjs";
import { hanvietData } from "hanviet-pinyin-words";

loadDotenv();
const here = dirname(fileURLToPath(import.meta.url));
const CACHE = join(here, "..", "data", "kanji");
const write = process.argv.includes("--write");
const all = process.argv.includes("--all");
const levelArg = process.argv.includes("--level") ? process.argv[process.argv.indexOf("--level") + 1] : null;
const UA = { "User-Agent": "NihongoPath/0.1 (kanji import)" };
mkdirSync(CACHE, { recursive: true });

async function cached(name, url) {
  const file = join(CACHE, name);
  if (!existsSync(file)) {
    console.log(`↓ ${name}`);
    const res = await fetch(url, { headers: UA });
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status} (${url})`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return readFileSync(file);
}

async function latestAsset(repo, re) {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: UA });
  if (!res.ok) throw new Error(`${repo}: release lookup HTTP ${res.status}`);
  const a = (await res.json()).assets.find((x) => re.test(x.name));
  if (!a) throw new Error(`${repo}: no asset matching ${re}`);
  return a;
}

const kanjiData = JSON.parse(
  (await cached("kanji.json", "https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json")).toString("utf8"),
);

const vgAsset = await latestAsset("KanjiVG/kanjivg", /-main\.zip$/);
const vgFiles = unzipSync(new Uint8Array(await cached(vgAsset.name, vgAsset.browser_download_url)));
const svgOf = new Map();
for (const [path, bytes] of Object.entries(vgFiles)) {
  const m = path.match(/kanji\/([0-9a-f]{5})\.svg$/);
  if (m) svgOf.set(String.fromCodePoint(parseInt(m[1], 16)), bytes);
}

const jmAsset = await latestAsset("scriptin/jmdict-simplified", /^jmdict-eng-common-.*\.json\.zip$/);
const jmFiles = unzipSync(new Uint8Array(await cached(jmAsset.name, jmAsset.browser_download_url)));
const jmName = Object.keys(jmFiles).find((n) => n.endsWith(".json"));
const words = wordsByKanji(JSON.parse(Buffer.from(jmFiles[jmName]).toString("utf8")));

const curated = JSON.parse(readFileSync(join(here, "..", "..", "..", "packages", "shared", "han-viet.json"), "utf8"));

const uni = unzipSync(new Uint8Array(await cached("Unihan.zip", "https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip")));
const dec = (n) => Buffer.from(uni[n]).toString("utf8");
const { kTraditionalVariant, kSimplifiedVariant, kZVariant, kJapaneseOldVariant } = parseUnihan(dec("Unihan_Variants.txt"), ["kTraditionalVariant", "kSimplifiedVariant", "kZVariant", "kJapaneseOldVariant"]);
const { kVietnamese } = parseUnihan(dec("Unihan_Readings.txt"), ["kVietnamese"]);
const variants = new Map();
for (const m of [kTraditionalVariant, kSimplifiedVariant, kZVariant, kJapaneseOldVariant]) {
  for (const [c, v] of m) {
    const list = v.split(" ").map((x) => String.fromCodePoint(parseInt(x.replace(/^U\+/, "").split("<")[0], 16)));
    variants.set(c, [...(variants.get(c) ?? []), ...list.filter((x) => x !== c)]);
  }
}
// The 2136 Jōyō kanji (Unihan kJoyoKanji = 2010 list) are the product's scope;
// level comes from rank bands (1-120 N5 … 1201-2136 N1), not from JLPT tags.
const joyo = new Set(
  dec("Unihan_OtherMappings.txt").split("\n")
    .filter((l) => l.includes("\tkJoyoKanji\t2010"))
    .map((l) => String.fromCodePoint(parseInt(l.split("\t")[0].slice(2), 16))),
);
const rankOf = rankJoyo([...joyo].filter((c) => kanjiData[c]), kanjiData);
const hvCtx = { curated, hvData: hanvietData, variants, kViet: kVietnamese };

const docs = [];
for (const [char, raw] of Object.entries(kanjiData)) {
  const rec = pickKanjiData(raw);
  if (!all && !rankOf.has(char)) continue;
  const rank = rankOf.get(char) ?? 0;
  const level = levelForRank(rank);
  if (levelArg && level !== levelArg) continue;
  const svg = svgOf.get(char);
  const strokes = svg ? extractStrokePaths(Buffer.from(svg).toString("utf8")) : [];
  const hanViet = resolveHanViet(char, hvCtx);
  docs.push({
    char, level, rank, hanViet, hanVietNorm: hanVietNorm(hanViet),
    onyomi: rec.readings_on ?? [], kunyomi: rec.readings_kun ?? [],
    strokeCount: rec.strokes ?? strokes.length, strokes,
    meaningsEn: rec.meanings ?? [],
    words: words.get(char) ?? [],
    source: "kanji-data+kanjivg",
    strokeCredit: strokes.length ? "KanjiVG © Ulrich Apel, CC BY-SA 3.0" : "",
  });
}

const count = (f) => docs.filter(f).length;
console.log(`\nKanji: ${docs.length}`);
for (const l of ["N5", "N4", "N3", "N2", "N1"]) console.log(`  ${l}: ${count((d) => d.level === l)}`);
console.log(`Hán Việt: ${count((d) => d.hanViet)} · nét vẽ: ${count((d) => d.strokes.length)} · ≥3 từ: ${count((d) => d.words.length >= 3)}`);
console.log("Thiếu Hán Việt (30 đầu):", docs.filter((d) => !d.hanViet).slice(0, 30).map((d) => d.char).join(" "));

if (!write) {
  console.log("\nDry run — thêm --write để ghi DB.");
  process.exit(0);
}
if (!process.env.MONGODB_URL) throw new Error("MONGODB_URL is not set");
await mongoose.connect(process.env.MONGODB_URL);
const col = mongoose.connection.collection("kanjis");
const now = new Date();
const ops = docs.map((d) => {
  const { words: w, hanViet, hanVietNorm: hn, ...owned } = d;
  return {
    updateOne: {
      filter: { char: d.char },
      update: {
        $set: { ...owned, updatedAt: now },
        // Words: keep any Vietnamese meaning the admin already filled.
        $setOnInsert: { words: w, hanViet, hanVietNorm: hn, meanings: [], mnemonic: "", radicals: [], lang: "vi", status: "DRAFT", createdAt: now },
      },
      upsert: true,
    },
  };
});
for (let i = 0; i < ops.length; i += 500) await col.bulkWrite(ops.slice(i, i + 500));
// Fill Hán Việt only where the admin has not set one.
await col.bulkWrite(
  docs.filter((d) => d.hanViet).map((d) => ({
    updateOne: { filter: { char: d.char, hanViet: "" }, update: { $set: { hanViet: d.hanViet, hanVietNorm: d.hanVietNorm } } },
  })),
);
// Chars outside the Jōyō scope (from the earlier JLPT-tag import): hide them.
const hidden = await col.updateMany(
  { source: "kanji-data+kanjivg", char: { $nin: docs.map((d) => d.char) } },
  { $set: { status: "DRAFT", level: "", rank: 0 } },
);
console.log(`Hidden out-of-scope: ${hidden.modifiedCount}`);
console.log(`Upserted ${ops.length} kanji.`);
await mongoose.disconnect();
