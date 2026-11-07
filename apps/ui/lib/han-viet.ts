/**
 * Sino-Vietnamese (âm Hán Việt) readings of common kanji — JLPT N5–N3 and
 * frequent extras. Hand-curated: the Unihan `kVietnamese` field was checked
 * and rejected (it lists plain quốc ngữ readings such as 強 "càng" and misses
 * 食/学/国/北/犬/猫/静). Kanji not listed simply show no reading.
 *
 * The table lives in `packages/shared/han-viet.json` so the api import script
 * reads the very same data (one source, two consumers).
 *
 * Format: `<kanji><reading>` pairs separated by whitespace; when a kanji has
 * two common readings they are joined with "/" (e.g. 長 trường/trưởng).
 */
import table from "../../../packages/shared/han-viet.json";

export const HAN_VIET: Record<string, string> = table;

/**
 * Hán Việt of every kanji in `text`, upper-cased and space separated:
 * "山" → "SƠN", "日本" → "NHẬT BẢN", "食べる" → "THỰC". `""` when no kanji of
 * the text is known (kana-only words, rare kanji).
 */
export function hanViet(text: string): string {
  const out: string[] = [];
  for (const ch of text) {
    const v = HAN_VIET[ch];
    if (v) out.push(v.toLocaleUpperCase("vi"));
  }
  return out.join(" ");
}
