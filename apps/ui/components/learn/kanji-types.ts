export interface KanjiWord {
  term: string;
  reading: string;
  meaning: string;
  glossEn?: string;
  chars: string[];
  level?: string;
}

export interface KanjiItem {
  char: string;
  level: string;
  rank?: number;
  hanViet: string;
  onyomi: string[];
  kunyomi: string[];
  strokeCount: number;
  strokes?: string[];
  meanings: string[];
  meaningsEn: string[];
  mnemonic: string;
  words: KanjiWord[];
  radicals?: string[];
  status?: "DRAFT" | "PUBLISHED";
}

export interface KanjiPage {
  items: KanjiItem[];
  total: number;
  page: number;
  limit: number;
}

export const KANJI_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;

/** Split a kanji's Hán Việt string ("trường/trưởng" or "trường, trưởng") into distinct readings. */
export function splitHanViet(hanViet: string | string[] | null | undefined): string[] {
  const raw = Array.isArray(hanViet) ? hanViet.join("/") : String(hanViet ?? "");
  return raw
    .split(/[/,;|·、\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
