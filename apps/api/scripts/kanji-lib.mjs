/**
 * Pure helpers for import-kanji.mjs (plan-kanji §4) — no network, no DB, so
 * they can be unit-tested. Two hard constraints live here:
 *  - only whitelisted KANJIDIC-derived fields are read from kanji-data;
 *    WaniKani (`wk_*`) fields are licence-forbidden (plan §2.1);
 *  - KanjiVG stroke `d` strings are copied verbatim (CC BY-SA, plan §10.3).
 */

/** The only kanji-data fields we read (all EDRDG/KANJIDIC origin). */
export const SAFE_KANJI_DATA_FIELDS = [
  "strokes",
  "grade",
  "freq",
  "jlpt_new",
  "readings_on",
  "readings_kun",
  "meanings",
];

export function pickKanjiData(rec) {
  const out = {};
  for (const k of SAFE_KANJI_DATA_FIELDS) if (k in rec) out[k] = rec[k];
  return out;
}

/** Per-stroke path data from a KanjiVG SVG, in stroke order, `d` untouched. */
export function extractStrokePaths(svg) {
  const paths = [];
  const re = /<path\b[^>]*>/g;
  for (const m of svg.matchAll(re)) {
    const tag = m[0];
    if (!/\bid="kvg:[^"]*-s\d+"/.test(tag)) continue;
    const d = tag.match(/\sd="([^"]*)"/);
    if (d) paths.push(d[1]);
  }
  return paths;
}

const isKanji = (c) => /[㐀-䶿一-鿿]/.test(c);

/** Map kanji → up to `max` common JMdict words that contain it. */
export function wordsByKanji(jmdict, max = 5) {
  const out = new Map();
  for (const w of jmdict.words ?? []) {
    const k = (w.kanji ?? []).find((x) => x.common && !(x.tags ?? []).some((t) => /^(sK|oK|iK|rK)$/.test(t)));
    if (!k || [...k.text].length > 6) continue;
    const reading = w.kana?.[0]?.text ?? "";
    const glossEn = (w.sense?.[0]?.gloss ?? []).map((g) => g.text).slice(0, 3).join("; ");
    const chars = [...k.text].filter(isKanji);
    for (const ch of new Set(chars)) {
      const list = out.get(ch) ?? [];
      list.push({ term: k.text, reading, meaning: "", glossEn, chars: [...k.text] });
      out.set(ch, list);
    }
  }
  for (const [ch, list] of out) {
    // Prefer short words that start with the kanji, then shorter overall.
    list.sort((a, b) => Number(b.term.startsWith(ch)) - Number(a.term.startsWith(ch)) || a.term.length - b.term.length);
    out.set(ch, list.slice(0, max));
  }
  return out;
}

/** Same rule as server-side `hanVietNorm` (kept in sync by hand). */
export function hanVietNorm(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().trim();
}

/** Unique readings of one `hanvietData` entry ({pinyin|'*': [reading]}). */
export function readingsOf(entry) {
  if (!entry) return [];
  return [...new Set(Object.values(entry).flat())];
}

/**
 * Hán Việt for a kanji. Priority (plan §2.2): curated table → hanvietData
 * (direct, then via Unihan traditional/simplified variants) → Unihan
 * kVietnamese. Several readings are joined with "/".
 */
export function resolveHanViet(ch, { curated, hvData, variants, kViet }) {
  if (curated[ch]) return curated[ch];
  for (const c of [ch, ...(variants.get(ch) ?? [])]) {
    const r = readingsOf(hvData[c]);
    if (r.length) return r.slice(0, 2).join("/");
  }
  for (const c of [ch, ...(variants.get(ch) ?? [])]) {
    if (kViet.get(c)) return kViet.get(c).split(" ")[0];
  }
  return "";
}

/** Parse Unihan_Variants.txt / Unihan_Readings.txt lines into maps. */
export function parseUnihan(text, fields) {
  const out = Object.fromEntries(fields.map((f) => [f, new Map()]));
  for (const line of text.split("\n")) {
    if (line.startsWith("#") || !line.includes("\t")) continue;
    const [cp, field, value] = line.split("\t");
    if (!out[field]) continue;
    out[field].set(String.fromCodePoint(parseInt(cp.slice(2), 16)), value);
  }
  return out;
}

/** Level bands over the 1-based rank of the 2136 Jōyō kanji (user spec). */
export const LEVEL_BANDS = [
  ["N5", 1, 120],
  ["N4", 121, 320],
  ["N3", 321, 720],
  ["N2", 721, 1200],
  ["N1", 1201, 2136],
];

export function levelForRank(rank) {
  return LEVEL_BANDS.find(([, from, to]) => rank >= from && rank <= to)?.[0] ?? "";
}

/**
 * Learning order: chars already in JLPT N5→N1 first, then the rest; inside a
 * group by newspaper frequency (rank 1 = most common), then fewer strokes.
 * Returns a Map char → 1-based rank.
 */
export function rankJoyo(chars, data) {
  const key = (c) => {
    const r = data[c] ?? {};
    return [r.jlpt_new ? 6 - r.jlpt_new : 9, r.freq ?? 99999, r.strokes ?? 99];
  };
  const sorted = [...chars].sort((a, b) => {
    const ka = key(a), kb = key(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2] || a.codePointAt(0) - b.codePointAt(0);
  });
  return new Map(sorted.map((c, i) => [c, i + 1]));
}
