import type { PartTag } from "./parts-of-speech.js";

/** What Mazii (javi dictionary) knows about one word. */
export interface MaziiWord {
  word: string;
  /** Every reading of the entries for this word, in hiragana / katakana as Mazii gives them. */
  readings: string[];
  /** Vietnamese meanings (`mean-word`), one per sense. */
  means: string[];
  /** Parts of speech (`type-word`) mapped to the app's tags, in Mazii's order. */
  parts: PartTag[];
  /** Hán Việt as Mazii gives it, if any. */
  han: string;
  /** The entry's own spelling (有難い for a search of ありがたい). */
  headword?: string;
}

interface MaziiEntry {
  word?: string;
  phonetic?: string;
  han?: string;
  pronunciation?: { kana?: string }[];
  synsets?: { pos?: string; base_form?: string }[];
  means?: { mean?: string; kind?: string }[];
}

const KANA_ONLY = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u;

/** One JMdict tag (`v5u`, `adj-na`, `vs`, `exp`…) as the app's tags. */
function tagToParts(tag: string): PartTag[] {
  const t = tag.trim().toLowerCase();
  if (!t) return [];
  if (t === "vs") return ["noun", "noun-suru"];
  if (/^v(1|5|k|z|n|r|s-[isc])/.test(t)) return ["verb"];
  if (t === "adj-i" || t === "adj-ix") return ["adjective"];
  if (t === "adj-na") return ["adjective-na"];
  if (/^(n|n-adv|n-t|n-suf|n-pref|pn|num|ctr)$/.test(t)) return ["noun"];
  if (/^adv(-to)?$/.test(t)) return ["adverb"];
  if (t === "exp" || t === "id") return ["phrase"];
  return [];
}

/**
 * Pick the entries of a Mazii search answer that are exactly `word` and read
 * them. `null` when Mazii found nothing for that exact word (its search is
 * fuzzy: a different word coming back is "not found").
 */
export function parseMaziiWord(word: string, json: unknown): MaziiWord | null {
  const data = (json as { found?: boolean; data?: MaziiEntry[] } | null)?.data;
  if (!Array.isArray(data)) return null;
  let same = data.filter((e) => e.word === word || e.synsets?.some((s) => s.base_form === word));
  // A card written in kana (ありがたい) is an entry whose headword is the kanji (有難い) and whose reading is that kana.
  if (same.length === 0 && KANA_ONLY.test(word)) {
    same = data.filter((e) => e.phonetic === word || e.pronunciation?.some((p) => p.kana === word)).slice(0, 3);
  }
  if (same.length === 0) return null;
  const out: MaziiWord = { word, readings: [], means: [], parts: [], han: "", headword: same[0]?.word };
  const add = <T,>(list: T[], v: T) => {
    if (v && !list.includes(v)) list.push(v);
  };
  for (const e of same) {
    add(out.readings, (e.phonetic ?? "").trim());
    for (const p of e.pronunciation ?? []) add(out.readings, (p.kana ?? "").trim());
    if (!out.han && e.han) out.han = e.han.trim();
    for (const m of e.means ?? []) {
      // "để thanh toán; để (thì) có lợi" is one sense line: keep it whole.
      add(out.means, (m.mean ?? "").trim());
      for (const k of (m.kind ?? "").split(/[,\s]+/)) for (const p of tagToParts(k)) add(out.parts, p);
    }
  }
  // A word whose senses carry no tag at all: fall back to the entry's own part of speech.
  if (out.parts.length === 0) {
    for (const e of same) for (const s of e.synsets ?? []) {
      const p = s.pos === "verb" ? "verb" : s.pos === "noun" ? "noun" : s.pos === "adjective" ? "adjective" : "";
      if (p) add(out.parts, p as PartTag);
    }
  }
  // する-noun without its noun (a bare `vs` already adds both).
  if (out.parts.includes("noun-suru") && !out.parts.includes("noun")) out.parts.unshift("noun");
  return out;
}

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const PAGE_URL = "https://mazii.net/vi-VN/search/word/javi/";

function decodeEntities(t: string): string {
  return t
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
const text = (h: string) => decodeEntities(h.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

/** The label Mazii shows in `.type-word` ("Danh từ", "Tính từ đuôi な", "Danh từ, Danh động từ") as the app's tags. */
export function labelToParts(label: string): PartTag[] {
  const out: PartTag[] = [];
  const add = (...t: PartTag[]) => t.forEach((x) => !out.includes(x) && out.push(x));
  for (const raw of label.split(/[,;/、]+/)) {
    const v = raw.trim().toLowerCase();
    if (!v) continue;
    if (/danh\s*động\s*từ/.test(v)) add("noun", "noun-suru");
    // "Động từ suru - cổ, tự động từ" (接する) is a verb that conjugates like する, not a する-noun.
    else if (/động\s*từ.*(suru|する)/.test(v)) add("verb");
    else if (/suru|する|サ変/.test(v)) add("noun", "noun-suru");
    else if (/tính\s*từ/.test(v)) add(/(đuôi\s*|\b)(na|な)\b|な/.test(v) ? "adjective-na" : "adjective");
    else if (/động\s*từ/.test(v)) add("verb");
    else if (/trạng\s*từ|phó\s*từ/.test(v)) add("adverb");
    else if (/danh\s*từ|đại\s*từ|số\s*từ|hậu\s*tố|tiền\s*tố/.test(v)) add("noun");
    else if (/cụm|thành\s*ngữ|quán\s*dụng|câu\s*nói/.test(v)) add("phrase");
  }
  return out;
}

/**
 * Read a server-rendered Mazii word page: the headword (`h1.main-word`), the reading
 * (`.phonetic-word`), the part of speech of each sense block (`.type-word`) and its meanings (`.mean-word`).
 * `undefined` = the page is only the empty app shell (Mazii renders some words in the browser only);
 * `null` = rendered, but for another word / without senses.
 */
export function parseMaziiWordHtml(word: string, html: string): MaziiWord | null | undefined {
  const h1 = /<h1\b[^>]*class="[^"]*\bmain-word\b[^"]*"[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (!h1) return undefined;
  const out: MaziiWord = { word, readings: [], means: [], parts: [], han: "", headword: text(h1[1]) };
  const push = <T,>(list: T[], v: T) => {
    if (v && !list.includes(v)) list.push(v);
  };
  const re = /<[^>]*class="[^"]*\bphonetic-word\b[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) push(out.readings, text(m[1]));
  // A word with several readings (年月: としつき / ねんげつ) lists them in the result box next to the page.
  for (const g of html.split(/class="content-item-word\b/).slice(1)) {
    const head = /class="[^"]*\btxt-word\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(g);
    if (!head || text(head[1]) !== text(h1[1])) continue;
    const ri = /<button\b[^>]*class="[^"]*\bphonetic-item\b[^"]*"[^>]*>([\s\S]*?)<\/button>/gi;
    for (let m = ri.exec(g); m; m = ri.exec(g)) push(out.readings, text(m[1]));
  }
  // Searching a kana word opens its kanji entry (ありがたい → 有難い): the page counts when it reads as the word.
  if (text(h1[1]) !== word && !(KANA_ONLY.test(word) && out.readings.includes(word))) return null;
  const hv = /<p\b[^>]*class="[^"]*\bhan-viet-word\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(html);
  if (hv) out.han = text(hv[1]);
  for (const block of html.split(/class="mean-detail-range\b/).slice(1)) {
    const type = /<div\b[^>]*class="type-word"[^>]*>([\s\S]*?)<\/div>/i.exec(block);
    if (type) for (const p of labelToParts(text(type[1]))) push(out.parts, p);
    const mr = /<h4\b[^>]*class="[^"]*\bmean-word\b[^"]*"[^>]*>([\s\S]*?)<\/h4>/gi;
    for (let m = mr.exec(block); m; m = mr.exec(block)) push(out.means, text(m[1]));
  }
  return out.means.length === 0 && out.parts.length === 0 && out.readings.length === 0 ? null : out;
}

async function retry<T>(fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw last instanceof Error ? last : new Error("Mazii lỗi");
}

/**
 * Look a word up on Mazii, like the kanji sync does: fetch
 * https://mazii.net/vi-VN/search/word/javi/<word> and read `.type-word` / `.mean-word` from the HTML.
 * Mazii only server-renders part of its words; for the rest the page is an empty shell, and the
 * same data is read from the search API behind that page. `null` = Mazii has no such word;
 * throws when Mazii cannot be reached.
 */
export async function fetchMaziiWord(word: string): Promise<MaziiWord | null> {
  const hit = await fetchMaziiExact(word);
  if (hit) return hit;
  // バカにする: Mazii spells it 馬鹿にする and reads it ばかにする. A word of katakana and hiragana is looked up in hiragana.
  if (/\p{Script=Katakana}/u.test(word) && /\p{Script=Hiragana}/u.test(word) && KANA_ONLY.test(word)) {
    const hira = word.replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
    const again = await fetchMaziiExact(hira);
    if (again) return { ...again, word };
  }
  return null;
}

async function fetchMaziiExact(word: string): Promise<MaziiWord | null> {
  const page = await retry(async () => {
    const res = await fetch(PAGE_URL + encodeURIComponent(word), {
      headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "vi-VN,vi;q=0.9" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Mazii HTTP ${res.status}`);
    return parseMaziiWordHtml(word, await res.text());
  });
  if (page) return page;
  // An empty app shell, or a page that did not match: the search behind the page has the last word.
  return retry(async () => {
    const res = await fetch("https://mazii.net/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ dict: "javi", type: "word", query: word, limit: 10, page: 1 }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`Mazii HTTP ${res.status}`);
    return parseMaziiWord(word, await res.json());
  });
}
