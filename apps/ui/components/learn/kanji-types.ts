export interface KanjiWord {
  term: string;
  reading: string;
  meaning: string;
  glossEn?: string;
  chars: string[];
}

export interface KanjiItem {
  char: string;
  level: string;
  hanViet: string;
  onyomi: string[];
  kunyomi: string[];
  strokeCount: number;
  strokes?: string[];
  meanings: string[];
  meaningsEn: string[];
  mnemonic: string;
  words: KanjiWord[];
}

export interface KanjiPage {
  items: KanjiItem[];
  total: number;
  page: number;
  limit: number;
}

export const KANJI_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
