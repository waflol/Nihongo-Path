/**
 * Align a reading with the kanji it belongs to, so each furigana sits over its
 * own kanji run (迫る + せまる → 迫[せま]る). Falls back to one ruby over the whole
 * word when the kana in the word cannot be matched in the reading.
 */
export interface FuriganaPart {
  text: string;
  rt?: string;
}

const KANJI = /[一-鿿々ヶ]/;
const kataToHira = (s: string) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Drop whitespace that sits between two Japanese characters. */
export const squeezeJa = (s: string) => s.replace(/(?<=[\u3000-\u30ff\u4e00-\u9fff\uff00-\uffef])\s+(?=[\u3000-\u30ff\u4e00-\u9fff\uff00-\uffef])/g, "");

export type KanjiReadings = Record<string, { on: string[]; kun: string[] }>;

export function furiganaParts(front: string, reading: string, dict?: KanjiReadings): FuriganaPart[] {
  // PDF imports leave spaces between the characters (人 見 知 り): they are not part of the word.
  front = squeezeJa(front);
  // A bracketed note after the word ("予期（する）") stays plain text after the ruby.
  const m = /^([^（(]*?)\s*([（(].*)?$/.exec(front.trim());
  const base = (m?.[1] ?? front).trim();
  const tail = m?.[2] ?? "";
  const plain: FuriganaPart[] = [{ text: front }];
  if (!base || !KANJI.test(base)) return plain;

  // First reading only: notes in brackets and alternatives are dropped.
  const first = reading
    .replace(/[（(][^）)]*[）)]/g, " ")
    .split(/[、,，/／・;；]/)[0]
    .replace(/\s+/g, "")
    .trim();
  if (!first) return plain;

  const runs = base.match(/[一-鿿々ヶ]+|[^一-鿿々ヶ]+/g) ?? [];
  const hira = kataToHira(first);
  const pattern = runs.map((r) => (KANJI.test(r[0]) ? "(.+?)" : `(${esc(kataToHira(r))})`)).join("");
  const hit = new RegExp(`^${pattern}$`).exec(hira);
  const parts: FuriganaPart[] = [];
  if (hit) {
    let pos = 0;
    runs.forEach((r, i) => {
      const g = hit[i + 1];
      if (KANJI.test(r[0])) {
        const rt = first.slice(pos, pos + g.length);
        const split = dict ? splitRun(r, kataToHira(rt), dict) : null;
        if (split) split.forEach((x) => parts.push(x));
        else parts.push({ text: r, rt });
      }
      else parts.push({ text: r });
      pos += g.length;
    });
  } else {
    parts.push({ text: base, rt: first });
  }
  if (tail) parts.push({ text: tail });
  return parts;
}

const VOICED: Record<string, string> = {
  か: "が", き: "ぎ", く: "ぐ", け: "げ", こ: "ご", さ: "ざ", し: "じ", す: "ず", せ: "ぜ", そ: "ぞ",
  た: "だ", ち: "ぢ", つ: "づ", て: "で", と: "ど", は: "ば", ひ: "び", ふ: "ぶ", へ: "べ", ほ: "ぼ",
};
const HALF: Record<string, string> = { は: "ぱ", ひ: "ぴ", ふ: "ぷ", へ: "ぺ", ほ: "ぽ" };

/** The readings one kanji can take inside a word (on/kun stems, rendaku, sokuon). */
function candidates(c: string, dict: KanjiReadings, prev: string): string[] {
  if (c === "々") return prev ? [prev, ...(VOICED[prev[0]] ? [VOICED[prev[0]] + prev.slice(1)] : [])] : [];
  const e = dict[c];
  if (!e) return [];
  const base = new Set<string>();
  for (const r of [...e.on, ...e.kun]) {
    const h = kataToHira(r.split(".")[0].replace(/[-\s]/g, ""));
    if (h) base.add(h);
  }
  const out = new Set<string>(base);
  for (const h of base) {
    if (VOICED[h[0]]) out.add(VOICED[h[0]] + h.slice(1));
    if (HALF[h[0]]) out.add(HALF[h[0]] + h.slice(1));
    if (h.length >= 2 && /[つちくき]$/.test(h)) out.add(h.slice(0, -1) + "っ");
    if (h.length >= 2 && /[つち]$/.test(h)) out.add(h.slice(0, -1)); // 日 = にち → に (日本)
  }
  return [...out].sort((a, b) => b.length - a.length);
}

/** Split a kanji run's reading over its characters, or null when the readings do not allow it. */
function splitRun(run: string, reading: string, dict: KanjiReadings): FuriganaPart[] | null {
  const chars = [...run];
  if (chars.length < 2) return null;
  if (!chars.every((c) => c === "々" || dict[c])) return null;
  const memo = new Map<string, string[] | null>();
  const go = (i: number, pos: number, prev: string): string[] | null => {
    if (i === chars.length) return pos === reading.length ? [] : null;
    const key = `${i}:${pos}`;
    if (memo.has(key)) return memo.get(key)!;
    let res: string[] | null = null;
    for (const cand of candidates(chars[i], dict, prev)) {
      if (!reading.startsWith(cand, pos)) continue;
      const rest = go(i + 1, pos + cand.length, cand);
      if (rest) {
        res = [cand, ...rest];
        break;
      }
    }
    memo.set(key, res);
    return res;
  };
  const got = go(0, 0, "");
  return got ? chars.map((c, i) => ({ text: c, rt: got[i] })) : null;
}
