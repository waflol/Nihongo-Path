/**
 * Sino-Vietnamese (âm Hán Việt) readings of common kanji — JLPT N5–N3 and
 * frequent extras. Hand-curated: the Unihan `kVietnamese` field was checked
 * and rejected (it lists plain quốc ngữ readings such as 強 "càng" and misses
 * 食/学/国/北/犬/猫/静). Kanji not listed simply show no reading.
 *
 * The table lives in `packages/shared/han-viet.json` so the api import script
 * reads the very same data (one source, two consumers).
 *
 * Format: `<kanji><reading>` pairs; when a kanji has multiple readings they
 * are joined with "/" (e.g. 長 trường/trưởng, 行 hành/hạnh/hàng/hạng).
 */
import table from "../../../packages/shared/han-viet.json";

export const HAN_VIET: Record<string, string> = table;

/** All curated Hán Việt readings of a single kanji character (lowercase). */
export function hanVietReadings(char: string): string[] {
  const raw = HAN_VIET[char.trim()];
  if (!raw) return [];
  return raw
    .split(/[/,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Hán Việt of every kanji in `text`, upper-cased and space separated:
 * "山" → "SƠN", "日本" → "NHẬT BẢN", "食べる" → "THỰC". `""` when no kanji of
 * the text is known (kana-only words, rare kanji).
 * For multi-kanji words, the primary reading (first before "/") is used.
 */
export function hanViet(text: string): string {
  const clean = text.replace(/[（(][^）)]*[）)]?/g, "");
  const chars = [...clean].filter((ch) => HAN_VIET[ch]);
  const singleKanji = chars.length === 1 && [...clean.trim()].length === 1;
  const out: string[] = [];
  for (const ch of clean) {
    const v = HAN_VIET[ch];
    if (v) {
      const shown = singleKanji ? v : v.split("/")[0];
      out.push(shown.toLocaleUpperCase("vi"));
    }
  }
  return out.join(" ");
}
