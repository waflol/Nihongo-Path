#!/usr/bin/env node
/**
 * Crawl and persist all Super Honki Bunpou grammar data.
 *
 * Dry run: pnpm -C apps/api grammar:import
 * Write DB: pnpm -C apps/api grammar:import -- --write
 * One level: pnpm -C apps/api grammar:import -- --write --level n5
 *
 * Imported records are DRAFT by default. Re-running is idempotent by
 * (sourceProvider, sourceKey); source-owned fields are refreshed while status
 * remains unchanged for existing records.
 */
import { config as loadDotenv } from "dotenv";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { mapSuperHonkiSource } from "../dist/content/grammar-source.js";

loadDotenv();
const here = dirname(fileURLToPath(import.meta.url));
const cacheDir = join(here, "..", "data", "grammar", "superhonki");
mkdirSync(cacheDir, { recursive: true });
const base = "https://www.superhonki.com/bunpou/data";
const levels = ["n5", "n4", "n3", "n2", "n1"];
const selected = process.argv.includes("--level")
  ? [process.argv[process.argv.indexOf("--level") + 1]]
  : levels;
const write = process.argv.includes("--write");
const version = "20261123";
const headers = { "User-Agent": "NihongoPath grammar importer" };

if (selected.some((level) => !levels.includes(level))) {
  throw new Error(`Invalid level; use one of ${levels.join(", ")}`);
}

async function getSource(level) {
  const file = join(cacheDir, `gram-${level}.js`);
  if (!existsSync(file)) {
    const response = await fetch(`${base}/gram-${level}.js?v=${version}`, { headers });
    if (!response.ok) throw new Error(`${level}: HTTP ${response.status}`);
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > 2_000_000) throw new Error(`${level}: source exceeds 2 MB limit`);
    writeFileSync(file, body);
  }
  return readFileSync(file, "utf8");
}

const points = [];
for (const level of selected) {
  const source = await getSource(level);
  const mapped = mapSuperHonkiSource(source, version);
  if (mapped.length === 0) throw new Error(`${level}: no grammar records`);
  points.push(...mapped);
  console.log(`${level}: ${mapped.length} grammar points`);
}
const keys = new Set(points.map((point) => `${point.sourceProvider}:${point.sourceKey}`));
if (keys.size !== points.length) throw new Error("Duplicate source keys in crawl result");
console.log(`Total crawled: ${points.length}`);
if (!write) {
  console.log("Dry run; add --write to persist records in MongoDB as DRAFT.");
  process.exit(0);
}
if (!process.env.MONGODB_URL) throw new Error("MONGODB_URL is not set");
await mongoose.connect(process.env.MONGODB_URL);
const collection = mongoose.connection.collection("grammarpoints");

// Self-heal an index created by the earlier schema version. MongoDB rejects
// compound indexes containing both array fields (parallel arrays). The index
// name is deterministic, but inspect metadata too for deployments that used
// a custom name.
const badIndexName = "status_1_level_1_themeIds_1_contextIds_1";
const indexes = await collection.indexes().catch(() => []);
for (const index of indexes) {
  const keys = Object.keys(index.key ?? {});
  if (index.name === badIndexName || (keys.includes("themeIds") && keys.includes("contextIds"))) {
    await collection.dropIndex(index.name);
    console.log(`Dropped incompatible grammar index: ${index.name}`);
  }
}
await collection.createIndex({ status: 1, level: 1, themeIds: 1 }, { name: "status_1_level_1_themeIds_1" });
await collection.createIndex({ status: 1, level: 1, contextIds: 1 }, { name: "status_1_level_1_contextIds_1" });
const now = new Date();
// Points an admin has edited keep their content.
const edited = new Set(
  (await collection.find({ editedAt: { $exists: true } }, { projection: { sourceKey: 1 } }).toArray()).map((d) => d.sourceKey),
);
const writable = points.filter((point) => !edited.has(point.sourceKey));
if (edited.size) console.log(`Skipping ${points.length - writable.length} admin-edited records.`);
const operations = writable.map((point) => ({
  updateOne: {
    filter: { sourceProvider: point.sourceProvider, sourceKey: point.sourceKey },
    update: {
      // `tags`, `textbooks`, status and sortOrder are local/editorial fields.
      // Keep them out of $set so an importer rerun never overwrites admin work.
      $set: {
        ...Object.fromEntries(Object.entries(point).filter(([key]) => key !== "tags")),
        sourceImportedAt: now,
        updatedAt: now,
      },
      $setOnInsert: {
        status: "DRAFT",
        lang: "vi",
        tags: [],
        textbooks: [],
        sortOrder: Number.parseInt(point.sourceKey.split("-").at(-1) ?? "0", 10) || 0,
        createdAt: now,
      },
    },
    upsert: true,
  },
}));
for (let i = 0; i < operations.length; i += 500) {
  await collection.bulkWrite(operations.slice(i, i + 500), { ordered: false });
}
console.log(`Persisted ${operations.length} grammar points as DRAFT/upserted.`);
await mongoose.disconnect();
