/**
 * A word can belong to several parts of speech (乱暴 = な-adjective, noun and a
 * noun that takes する; 売り買い = noun and a noun that takes する). `noun-suru`
 * is not a part of speech of its own but a use of a noun, so it always comes
 * with `noun`. The first non-する entry is the card's primary part of speech.
 */
export const PART_TAGS = ["verb", "noun", "noun-suru", "adjective", "adjective-na", "adverb", "phrase"] as const;
export type PartTag = (typeof PART_TAGS)[number];
export type PrimaryPos = "verb" | "noun" | "adjective" | "adjective-na" | "adverb" | "phrase" | "";

// A noun used with する — checked before the plain verb / noun labels.
const SURU = /(suru|する|サ変|サ変名詞|danh\s*động\s*từ|động\s*danh\s*từ|danh\s*dong\s*tu)/i;

function labelToTags(label: string): PartTag[] | null {
  const v = label.trim().toLowerCase();
  if (!v) return null;
  if (SURU.test(v)) return ["noun", "noun-suru"];
  if (/^(verb|v|động từ|dong tu|động|動詞)$/.test(v)) return ["verb"];
  if (/^(noun|n|danh từ|danh tu|danh|名詞)$/.test(v)) return ["noun"];
  if (/^(adjective-na|na-adjective|adj-na|na|tính từ な|tính từ đuôi な|tính từ đuôi na|tính từ na|tính từ -na|tinh tu na|形容動詞)$/.test(v)) return ["adjective-na"];
  if (/^(adjective|adjective-i|i-adjective|adj-i|adj|a|i|tính từ|tính từ い|tính từ đuôi い|tính từ đuôi i|tính từ i|tinh tu|tính|形容詞)$/.test(v)) return ["adjective"];
  if (/^(adverb|adv|adv-to|trạng từ|trang tu|phó từ|pho tu|副詞)$/.test(v)) return ["adverb"];
  if (/^(phrase|expr|expression|idiom|cụm từ|cum tu|cụm|thành ngữ|慣用句|連語|句)$/.test(v)) return ["phrase"];
  return null;
}

/** "Tính từ な, Danh từ + する" → `["adjective-na", "noun", "noun-suru"]`; labels it cannot read go to `unknown`. */
export function parsePartsOfSpeech(raw: string | undefined | null): { parts: PartTag[]; unknown: string[] } {
  const parts: PartTag[] = [];
  const unknown: string[] = [];
  for (const label of (raw ?? "").split(/[,、，/／・;；|｜\r\n]+/)) {
    if (!label.trim()) continue;
    const tags = labelToTags(label);
    if (!tags) {
      unknown.push(label.trim());
      continue;
    }
    for (const t of tags) if (!parts.includes(t)) parts.push(t);
  }
  return { parts, unknown };
}

/** The card's main part of speech: the first entry that is not the する flag. */
export function primaryPos(parts: readonly string[] | undefined | null): PrimaryPos {
  const first = (parts ?? []).find((p) => p !== "noun-suru");
  return (first ?? "") as PrimaryPos;
}

/**
 * Parts of speech a word has beyond the one stored, from the analyser's tokens:
 * a kanji word that is one noun token and takes する (サ変接続: 乱暴, 勉強) gains
 * `noun-suru`; one that is also a な-adjective stem gains `adjective-na`.
 * `null` = nothing new to add (the caller keeps the card as it is).
 */
export function derivePartsOfSpeech(
  word: string,
  pos: string,
  tokens: readonly { pos: string; pos_detail_1: string }[],
): PartTag[] | null {
  const w = word.replace(/[（(][^）)]*[）)]/g, "").replace(/\s+/g, "");
  if (!/^[㐀-鿿々]{2,}$/.test(w)) return null;
  if (tokens.length !== 1 || tokens[0].pos !== "名詞") return null;
  const parts: PartTag[] = pos && (PART_TAGS as readonly string[]).includes(pos) ? [pos as PartTag] : [];
  const naNew = tokens[0].pos_detail_1 === "形容動詞語幹" && pos !== "adjective-na";
  if (naNew) parts.push("adjective-na");
  if (!parts.includes("noun")) parts.push("noun");
  const suru = tokens[0].pos_detail_1 === "サ変接続";
  if (suru) parts.push("noun-suru");
  return naNew || suru ? parts : null;
}
