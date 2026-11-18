import { normalizeWord, toHiragana } from "./normalize-word.js";

/**
 * Vocabulary lists write a collocation and its explanation in one cell:
 * `成績が上がる(=よくなる高くなる)`, and PDF text often loses the brackets
 * (`腕を上げる上手になる`, `例をあげる示す)`). The card's own reading column
 * is clean (せいせきがあがる), so it marks where the word ends: the prefix of
 * the cell that reads exactly like the reading is the word, the rest is the note.
 */
export interface WordNote {
  /** The collocation alone. */
  word: string;
  /** The explanation that followed it (no brackets / `=`), "" when there was none. */
  note: string;
  /** Why a person should look at the card — the cell was left as it was. */
  review?: string;
}

/** Hiragana reading of a kuromoji token list (unknown words read as they are written). */
export function readingOfTokens(tokens: readonly { surface_form: string; reading?: string }[]): string {
  return tokens.map((t) => toHiragana(t.reading && t.reading !== "*" ? t.reading : t.surface_form)).join("");
}

const squash = (s: string) => toHiragana(s).replace(/[\s　・･]/g, "");
const BRACKET = /[(（]/;

export async function splitWordNote(front: string, reading: string, readingOf: (text: string) => Promise<string>): Promise<WordNote> {
  const w = normalizeWord(front);
  const r = squash(normalizeWord(reading));
  const keep = (review: string): WordNote => ({ word: w, note: "", review });
  if (!w || !r) return { word: w, note: "" };
  // Two forms in one cell (味がつく・味をつける: the reading has ・ too) or a note inside the reading: not for a machine to guess.
  // A ・ only in the cell is just punctuation of the note (声をかける呼ぶ・誘う).
  if (/[・･]/.test(reading) && !/^[\p{Script=Katakana}ー・･\s]+$/u.test(normalizeWord(reading))) return keep("nhiều dạng trong một ô (dấu ・), cần tách thẻ thủ công");
  if (/[()（）=＝]/.test(reading)) return keep("cách đọc còn dính ghi chú, cần sửa thủ công");

  const same = async (p: string) => squash(await readingOf(p)) === r;
  const cut = w.search(BRACKET);
  let end = -1;
  if (cut > 0 && (await same(w.slice(0, cut)))) end = cut;
  else if (await same(w.replace(/[(（].*$/, ""))) end = w.replace(/[(（].*$/, "").length;
  else {
    // Brackets lost: the shortest prefix that reads like the card's reading.
    for (let len = 2; len <= w.length; len++) {
      if (await same(w.slice(0, len))) {
        end = len;
        break;
      }
    }
  }
  // No bracket and nothing matches: an ordinary word the analyser reads differently from the card (人気 = ひとけ) — leave it, no warning.
  if (end < 0) return BRACKET.test(w) ? keep("không tách được từ và ghi chú (cách đọc không khớp)") : { word: w, note: "" };
  const word = w.slice(0, end).trim();
  const note = w
    .slice(end)
    .replace(/^[\s(（=＝]+/, "")
    .replace(/[=＝]/g, "")
    .replace(/[()（）]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return { word, note };
}

/** Split at `・` outside brackets: `味がつく(=加わる)・味をつける(=加える)` → two parts. */
function splitTopLevel(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (/[(（]/.test(ch)) depth++;
    else if (/[)）]/.test(ch)) depth = Math.max(0, depth - 1);
    if ((ch === "・" || ch === "･") && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((p) => p.trim()).filter(Boolean);
}

/**
 * A cell holding several words or phrases (`味がつく・味をつける`) becomes one
 * entry each, when the reading column is split the same way. Each part's reading
 * loses its own `(=…)` note. `null` = a single word, or the two columns disagree.
 */
export function splitVariants(front: string, reading: string): { front: string; reading: string }[] | null {
  const f = normalizeWord(front);
  if (/^[\p{Script=Katakana}ー・･\s]+$/u.test(f)) return null; // アイス・クリーム is one word
  const fs = splitTopLevel(f);
  const rs = splitTopLevel(normalizeWord(reading));
  if (fs.length < 2 || fs.length !== rs.length) return null;
  return fs.map((p, i) => ({ front: p, reading: rs[i].replace(/[(（].*$/, "").trim() }));
}
