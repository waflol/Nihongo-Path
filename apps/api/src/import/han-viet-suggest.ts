import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Hán Việt suggestion for a word whose Hán Việt cell is blank: the curated
 * kanji table (`packages/shared/han-viet.json`, the same one the UI uses) is
 * looked up kanji by kanji. Best effort — an unreadable table just means no
 * suggestion.
 */
let table: Record<string, string> | null = null;

function load(): Record<string, string> {
  if (table) return table;
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(process.cwd(), "..", "..", "packages", "shared", "han-viet.json"),
    join(process.cwd(), "packages", "shared", "han-viet.json"),
    join(here, "..", "..", "..", "..", "packages", "shared", "han-viet.json"),
    join(here, "..", "..", "..", "..", "..", "packages", "shared", "han-viet.json"),
  ];
  for (const p of candidates) {
    try {
      if (existsSync(p)) return (table = JSON.parse(readFileSync(p, "utf8")) as Record<string, string>);
    } catch {
      /* try the next candidate */
    }
  }
  return (table = {});
}

/** "洗練（する）" → "TẨY LUYỆN"; "" unless every kanji of the text is in the table. */
export function suggestHanViet(text: string): string {
  const t = load();
  const out: string[] = [];
  for (const ch of text) {
    const v = t[ch];
    if (v) out.push(v.toLocaleUpperCase("vi"));
    else if (/[\u4e00-\u9fff]/.test(ch)) return ""; // an unknown kanji: a partial reading would mislead
  }
  return out.join(" ");
}

const norm = (x: string) =>
  x
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim();

/**
 * Does a given Hán Việt cell fit the word's kanji? `null` = cannot tell (a kanji
 * missing from the table, or no kanji); otherwise a Vietnamese reason when the
 * cell disagrees with the table (wrong syllable, or a different syllable count).
 */
export function checkHanViet(front: string, given: string): string | null {
  const t = load();
  const kanji = [...front.replace(/[（(][^）)]*[）)]/g, "")].filter((c) => /[\u4e00-\u9fff]/.test(c));
  if (kanji.length === 0 || !given.trim()) return null;
  if (kanji.some((k) => !t[k])) return null;
  const tokens = given.trim().split(/\s+/).map(norm);
  if (tokens.length !== kanji.length) return `Hán Việt “${given}” có ${tokens.length} âm nhưng từ có ${kanji.length} chữ Hán`;
  for (let i = 0; i < kanji.length; i++) {
    const ok = t[kanji[i]].split("/").map(norm);
    if (!ok.includes(tokens[i])) return `Hán Việt “${given}” khác bảng tra (${kanji[i]} = ${t[kanji[i]].toLocaleUpperCase("vi")})`;
  }
  return null;
}

/** Why a meaning cell looks wrong (typo / OCR noise / wrong language), or null. */
export function checkMeaning(back: string): string | null {
  const m = back.trim();
  if (!m) return null;
  if (/[\u3040-\u30ff\u4e00-\u9fff]/.test(m)) return "nghĩa chứa chữ Nhật";
  if (/[�?]|\d{2,}/.test(m)) return "nghĩa chứa ký tự lạ";
  // f / j / w / z never occur in Vietnamese words: a typo or an OCR slip.
  const bad = m.split(/[\s,;.]+/).find((w) => /[fjwz]/i.test(w));
  if (bad) return `nghĩa có từ nghi sai chính tả “${bad}”`;
  // a stray consonant glued to a word start (đsao, hoanf): "đ"+consonant
  const odd = m.split(/[\s,;.]+/).find((w) => /^đ[bcdghklmnpqrstvx]/i.test(w) || /[bcdghklmnpqrstvx]{3,}$/i.test(w) && !/(ng|nh|ch)$/i.test(w));
  if (odd) return `nghĩa có từ nghi sai chính tả “${odd}”`;
  return null;
}
