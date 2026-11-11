import type { Model } from "mongoose";
import type { KanjiDocument } from "../content/schemas/kanji.schema.js";
import { setKanjiHanViet } from "./han-viet-suggest.js";
import { setKanjiReadings } from "./kanji-reading.js";

/**
 * The kanji admin data (`/admin/kanji`) is the source for judging Hán Việt and
 * readings: its `hanViet` feeds the Hán Việt table (it wins over the bundled JSON,
 * which only fills kanji the admin data lacks) and its `onyomi` / `kunyomi` feed
 * the reading check. Every flow that judges a card calls this first, so the answer
 * never depends on whether something else happened to load the data since startup.
 * Reloaded at most once a minute; a failed load leaves the previous data in place.
 */
let loadedAt = 0;
export async function ensureKanjiTables(kanji: Model<KanjiDocument> | undefined): Promise<void> {
  if (!kanji || Date.now() - loadedAt < 60_000) return;
  try {
    const rows = await kanji.find({}, { char: 1, hanViet: 1, onyomi: 1, kunyomi: 1 }).lean().exec();
    setKanjiHanViet(Object.fromEntries(rows.filter((r) => r.hanViet).map((r) => [r.char, r.hanViet as string])));
    setKanjiReadings(rows);
    loadedAt = Date.now();
  } catch {
    /* keep what is loaded; the bundled JSON table still answers Hán Việt */
  }
}
