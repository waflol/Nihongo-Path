/**
 * Does a word's reading fit the on/kun readings of its kanji (the admin kanji
 * table)? A positive answer settles a reading locally, so the AI is not asked.
 * Only ever used to confirm: "no fit" just means "ask someone else".
 */
let readings = new Map<string, string[]>();

const kataToHira = (s: string) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** Replace the readings used by `readingFitsKanji` (`char → onyomi + kunyomi`, any script / dictionary notation). */
export function setKanjiReadings(rows: { char: string; onyomi?: string[]; kunyomi?: string[] }[]): void {
  const next = new Map<string, string[]>();
  for (const r of rows) {
    const set = new Set<string>();
    for (const raw of [...(r.onyomi ?? []), ...(r.kunyomi ?? [])]) {
      const full = kataToHira(raw.normalize("NFKC")).replace(/[-‐ー]/g, (m) => (m === "ー" ? "ー" : ""));
      const stem = full.split(".")[0] ?? "";
      for (const s of [stem, full.replace(/\./g, "")]) if (s) set.add(s);
    }
    if (set.size > 0) next.set(r.char, [...set]);
  }
  readings = next;
}

const VOICED: Record<string, string[]> = {
  か: ["が"], き: ["ぎ"], く: ["ぐ"], け: ["げ"], こ: ["ご"],
  さ: ["ざ"], し: ["じ"], す: ["ず"], せ: ["ぜ"], そ: ["ぞ"],
  た: ["だ"], ち: ["ぢ", "じ"], つ: ["づ", "ず"], て: ["で"], と: ["ど"],
  は: ["ば", "ぱ"], ひ: ["び", "ぴ"], ふ: ["ぶ", "ぷ"], へ: ["べ", "ぺ"], ほ: ["ぼ", "ぽ"],
};

/** A reading with its sound changes: rendaku / semi-voicing of the first kana, gemination of a final き く ち つ. */
function forms(base: string): string[] {
  const out = new Set([base]);
  const heads = [base, ...(VOICED[base[0]!] ?? []).map((v) => v + base.slice(1))];
  for (const h of heads) {
    out.add(h);
    if (h.length >= 2 && /[きくちつ]$/.test(h)) {
      out.add(h.slice(0, -1) + "っ");
      out.add(h.slice(0, -1)); // clipped on'yomi: 日本 = に + ほん, 十 = じゅ
    }
  }
  return [...out];
}

const isKanji = (ch: string) => /[㐀-鿿々〆]/.test(ch);

/** True when `reading` can be built from the word's own kana and the table readings of its kanji, in order. */
export function readingFitsKanji(front: string, reading: string): boolean {
  const word = [...kataToHira(front.normalize("NFKC").replace(/[（(][^）)]*[）)]?/g, "").replace(/\s+/g, ""))];
  const target = kataToHira(reading.normalize("NFKC").replace(/\s+/g, ""));
  if (word.length === 0 || !target || !word.some((c) => isKanji(c))) return false;
  const memo = new Map<number, boolean>();
  const go = (i: number, j: number): boolean => {
    if (i === word.length) return j === target.length;
    const key = i * 1000 + j;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const ch = word[i]!;
    let ok = false;
    if (!isKanji(ch)) {
      ok = target[j] === ch && go(i + 1, j + 1);
    } else {
      const char = ch === "々" ? word[i - 1] : ch;
      const cands = char ? readings.get(char) : undefined;
      for (const base of cands ?? []) {
        for (const f of forms(base)) {
          if (target.startsWith(f, j) && go(i + 1, j + f.length)) {
            ok = true;
            break;
          }
        }
        if (ok) break;
      }
    }
    memo.set(key, ok);
    return ok;
  };
  return go(0, 0);
}
