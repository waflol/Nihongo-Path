/**
 * Japanese is written without spaces, but PDF text layers and OCR put them
 * between characters (`人 見 知 り`, `会 う （ 人 ）`). `normalizeWord` removes
 * that spacing from a vocabulary word while leaving real spaces between
 * Latin words (`a lot`) alone.
 */
// Kana, CJK ideographs, full-width forms, long mark, iteration mark.
const JA = "\\u3000-\\u30ff\\u3400-\\u9fff\\uff00-\\uffef\\u30fc\\u3005";
// Bracket / punctuation ASCII chars that sit next to Japanese text.
const GLUE = "()\\[\\]~/,.\\-";
const SPACE = "[\\s\\u00a0\\u200b-\\u200d\\ufeff]";

const between = new RegExp(`(?<=[${JA}])${SPACE}+(?=[${JA}${GLUE}])|(?<=[${GLUE}])${SPACE}+(?=[${JA}])`, "g");
// A bracket's own inside: "( 人 )" → "(人)"
const afterOpen = new RegExp(`(?<=[(（\\[])${SPACE}+`, "g");
const beforeClose = new RegExp(`${SPACE}+(?=[)）\\]])`, "g");

/** A な-adjective is stored without its な: `静かな` / `静か(な)` → `静か`. */
export function stripNa(word: string): string {
  const w = word.replace(/[(（]\s*な\s*[)）]$/, "");
  return [...w].length > 1 && w.endsWith("な") ? w.slice(0, -1) : w;
}

/** The same for a reading: `フレッシュな` / `しずかな/しづかな` → `フレッシュ` / `しずか/しづか`. */
export function stripNaReading(reading: string): string {
  return reading.replace(/(?<=[\p{Script=Hiragana}\p{Script=Katakana}ー])な(?=\s*(?:[/／、,;・]|$))/gu, "").replace(/[(（]\s*な\s*[)）]/g, "");
}

/** A word written only in katakana (ラッキー, アイス・クリーム). */
export const isKatakanaWord = (word: string) => /^[\p{Script=Katakana}ー・\s]+$/u.test(word);

/** Hiragana → katakana, other characters untouched: `らっきー` → `ラッキー`. */
export function toKatakana(text: string): string {
  return text.replace(/[\u3041-\u3096]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

/** A word written only in hiragana, no kanji and no katakana (ありがとう, きれい). */
export const isHiraganaWord = (word: string) => /^[\p{Script=Hiragana}ー・\s]+$/u.test(word) && /\p{Script=Hiragana}/u.test(word);

/** Katakana → hiragana, other characters untouched: `キレイ` → `きれい`. */
export function toHiragana(text: string): string {
  return text.replace(/[\u30A1-\u30F6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

export function normalizeWord(word: string): string {
  const w = word
    .normalize("NFC")
    .replace(/[​-‍﻿]/g, "")
    .replace(/　/g, " ")
    .trim();
  if (!w) return "";
  return w
    .replace(between, "")
    .replace(afterOpen, "")
    .replace(beforeClose, "")
    .replace(/\s{2,}/g, " ");
}
