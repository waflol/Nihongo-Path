import { formatHanViet } from "./han-viet-norm.js";

export interface MaziiKanjiReadings {
  hanViet: string;
  onyomi: string[];
  kunyomi: string[];
}

const MAZII_PAGE_URL = "https://mazii.net/vi-VN/search/kanji/javi/";
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Read Hán Việt (`<p class="han-viet-word">`), on'yomi and kun'yomi
 * (`txt-item txt-on` / `txt-kun` spans) out of the server-rendered Mazii
 * kanji page HTML. `null` when the page (checked via its `<h1>`) is not for `char`.
 */
export function parseMaziiKanjiHtml(char: string, html: string): MaziiKanjiReadings | null {
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (!h1) return null;
  const title = decodeEntities(h1[1].replace(/<[^>]*>/g, "")).trim();
  if (!title.startsWith(char)) return null;
  const hv = /<p\b[^>]*class="[^"]*\bhan-viet-word\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(html);
  const hanViet = formatHanViet(hv ? decodeEntities(hv[1].replace(/<[^>]*>/g, "")).trim() : "");

  const onyomi: string[] = [];
  const kunyomi: string[] = [];
  const re = /<span\b[^>]*class="[^"]*\btxt-item\b[^"]*\btxt-(on|kun)\b[^"]*"[^>]*>([^<]*)<\/span>/g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const reading = decodeEntities(m[2]).trim();
    const list = m[1] === "on" ? onyomi : kunyomi;
    if (reading && !list.includes(reading)) list.push(reading);
  }
  if (!hanViet && onyomi.length === 0 && kunyomi.length === 0) return null;
  return { hanViet, onyomi, kunyomi };
}

/** Fetch and parse the Mazii kanji page for one character. `null` when Mazii has no entry. */
export async function fetchMaziiKanji(char: string): Promise<MaziiKanjiReadings | null> {
  const res = await fetch(MAZII_PAGE_URL + encodeURIComponent(char), {
    headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "vi-VN,vi;q=0.9" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Mazii HTTP ${res.status}`);
  return parseMaziiKanjiHtml(char, await res.text());
}
