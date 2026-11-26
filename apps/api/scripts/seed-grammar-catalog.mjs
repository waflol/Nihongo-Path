#!/usr/bin/env node
/** Seed Super Honki grammar textbook/unit catalog and link grammar points. */
import { config as loadDotenv } from "dotenv";
import mongoose from "mongoose";
loadDotenv();
const books = {
  minna: { title: "Minna no Nihongo", subtitle: "みんなの日本語", level: "N5–N4" },
  "shin-n3": { title: "Shin Kanzen Master N3 Bunpou", subtitle: "新完全マスター N3 文法", level: "N3" },
  "shin-n2": { title: "Shin Kanzen Master N2 Bunpou", subtitle: "新完全マスター N2 文法", level: "N2" },
  "shin-n1": { title: "Shin Kanzen Master N1 Bunpou", subtitle: "新完全マスター N1 文法", level: "N1" },
};
if (!process.env.MONGODB_URL) throw new Error("MONGODB_URL is not set");
await mongoose.connect(process.env.MONGODB_URL);
const db = mongoose.connection;
const textbooks = db.collection("textbooks");
const units = db.collection("units");
const grammar = db.collection("grammarpoints");
const now = new Date();
const refs = await grammar.aggregate([{ $match: { sourceProvider: "superhonki" } }, { $unwind: "$textbookRefs" }, { $group: { _id: { book: "$textbookRefs.textbookId", unit: "$textbookRefs.unitId" }, title: { $first: "$label" } } }]).toArray();
const bookIds = new Map();
for (const [id, book] of Object.entries(books)) {
  const result = await textbooks.findOneAndUpdate({ sourceKey: `superhonki:${id}` }, { $set: { title: book.title, subtitle: book.subtitle, level: book.level, lang: "vi", status: "PUBLISHED", updatedAt: now }, $setOnInsert: { sourceKey: `superhonki:${id}`, createdAt: now } }, { upsert: true, returnDocument: "after" });
  bookIds.set(id, result._id);
}
for (const row of refs) {
  const id = String(row._id.book);
  if (!books[id]) continue;
  const unitKey = `superhonki:${id}:${String(row._id.unit)}`;
  await units.findOneAndUpdate({ sourceKey: unitKey }, { $set: { textbook: bookIds.get(id), title: `Bài ${row._id.unit}`, summary: `Mục ngữ pháp ${row._id.unit}`, sortOrder: Number.parseInt(String(row._id.unit), 10) || 0, lang: "vi", status: "PUBLISHED", updatedAt: now }, $setOnInsert: { sourceKey: unitKey, createdAt: now } }, { upsert: true });
}
// Keep GrammarPoint.textbooks compatible with the legacy ObjectId relation.
for (const [id, textbookId] of bookIds) await grammar.updateMany({ sourceProvider: "superhonki", "textbookRefs.textbookId": id }, { $addToSet: { textbooks: textbookId } });
console.log(`Seeded ${bookIds.size} textbooks and ${refs.length} referenced units; linked grammar points.`);
await db.close();
