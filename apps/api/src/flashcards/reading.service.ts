import { Injectable, Logger, Optional } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection } from "mongoose";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import kuromoji from "kuromoji";

export const PARTS_OF_SPEECH = ["verb", "noun", "adjective", "phrase"] as const;
export type PartOfSpeech = (typeof PARTS_OF_SPEECH)[number];

export interface ReadingResult {
  /** Hiragana reading; `""` when the text has no kanji (pure kana / katakana). */
  reading: string;
  /**
   * Every reading known for the text: the ones a person confirmed (a word like 人気 has
   * にんき and ひとけ) plus the analyser's own guess. Empty for kana-only text.
   */
  readings: string[];
  /** Meanings a person tied to a reading when confirming it (人気: にんき → 人気, ひとけ → 人の気配). */
  readingMeanings?: { reading: string; meaning: string }[];
  /** Best-guess part of speech (verb / noun / adjective / phrase) or `null`. */
  partOfSpeech: PartOfSpeech | null;
}

/** Map an IPADIC token to the three parts of speech the app distinguishes. */
export function tokenPos(t: kuromoji.IpadicFeatures): PartOfSpeech | null {
  if (t.pos === "動詞") return "verb";
  if (t.pos === "形容詞" || t.pos_detail_1 === "形容動詞語幹") return "adjective";
  if (t.pos === "名詞" || t.pos === "副詞") return "noun";
  return null;
}

export const KANJI_RE = /[㐀-䶿一-鿿豈-﫿々〆ヶ]/;

/**
 * The hiragana reading(s) written in a card's `reading` field, however a book
 * decorates them: `【かくべつ】`, `（かくべつ）`, `げんぞん/げんそん`,
 * `しんちゅう／しんじゅう`, `せ、そ`… Brackets are dropped, the text is split
 * on `/ ／ 、 , ; ・ ･ 、` and whitespace, katakana is folded to hiragana.
 * Empty when nothing usable is left.
 */
export function readingVariants(raw: string | undefined | null): string[] {
  const cleaned = (raw ?? "")
    .normalize("NFKC")
    .replace(/[【】\[\]「」『』()（）〈〉<>]/g, " ")
    .replace(/[~〜～*＊・･]/g, "");
  const parts = cleaned
    .split(/[\s/／、,;；-]+/)
    .map((p) => toHiragana(p.trim()))
    .filter(Boolean);
  return [...new Set(parts)];
}

/** A bracketed note after a word — "予期（する）", "着々［と］" — that is not part of the word itself. */
export const WORD_NOTE_RE = /[（(［[][^）)］\]]*[）)］\]]/g;

/**
 * Split a reading cell into the reading proper and the words that do not belong
 * in it. A PDF import can let the end of a wrapped Vietnamese meaning slip into
 * the reading column ("chãi, ổn ちゃくちゃく"): every whitespace-separated piece
 * with a Latin letter in it is such a stray word. `stray` is "" when the cell is
 * clean, and then `kana` is the cell unchanged.
 */
export function splitStrayReading(raw: string | undefined | null): { kana: string; stray: string } {
  const text = (raw ?? "").trim();
  if (!/\p{Script=Latin}/u.test(text)) return { kana: text, stray: "" };
  // "ổnちゃく" (no space): cut where Latin text meets kana, and the other way round.
  const spaced = text
    .replace(/([\p{Script=Latin}\p{P}])(?=[\p{Script=Hiragana}\p{Script=Katakana}ー])/gu, "$1 ")
    .replace(/([\p{Script=Hiragana}\p{Script=Katakana}ー])(?=\p{Script=Latin})/gu, "$1 ");
  const keep: string[] = [];
  const drop: string[] = [];
  for (const piece of spaced.split(/\s+/).filter(Boolean)) (/\p{Script=Latin}/u.test(piece) ? drop : keep).push(piece);
  const kana = keep.join(" ").replace(/^[\s,，、/／;；]+|[\s,，、/／;；]+$/g, "");
  return { kana, stray: drop.join(" ") };
}

/** Katakana → hiragana (leaves ー and everything else alone). */
export function toHiragana(text: string): string {
  return text.replace(/[ァ-ヶ]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0x60),
  );
}

/**
 * Hiragana readings for kanji text, via the kuromoji morphological analyser
 * (IPADIC dictionary shipped with the package, built once and reused).
 *
 * Rule: text with **no kanji** (hiragana-only or katakana) returns an empty
 * reading — nothing to annotate. Otherwise every token's reading is joined,
 * kana inside the word are kept (食べる → たべる).
 */
@Injectable()
export class ReadingService {
  private readonly logger = new Logger(ReadingService.name);
  private tokenizer: Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> | null = null;

  constructor(@Optional() @InjectConnection() private readonly conn?: Connection) {}

  /** Readings a person confirmed against the analyser (word → hiragana list, oldest first), loaded on first use. */
  private overrides: Promise<Map<string, string[]>> | null = null;
  /** The meaning a person tied to each confirmed reading (word → [{ reading, meaning }]). */
  private readonly meanings = new Map<string, { reading: string; meaning: string }[]>();

  private loadOverrides(): Promise<Map<string, string[]>> {
    this.overrides ??= (async () => {
      const m = new Map<string, string[]>();
      try {
        const rows = await this.conn?.collection("reading_overrides").find({}).toArray();
        for (const r of rows ?? []) {
          const list: string[] = Array.isArray(r.readings) ? r.readings.map(String) : r.reading ? [String(r.reading)] : [];
          if (r.word && list.length > 0) m.set(String(r.word), [...new Set(list)]);
          if (r.word && Array.isArray(r.readingMeanings)) {
            const rm = (r.readingMeanings as { reading?: unknown; meaning?: unknown }[])
              .filter((x) => typeof x?.reading === "string" && typeof x?.meaning === "string" && x.meaning)
              .map((x) => ({ reading: String(x.reading), meaning: String(x.meaning) }));
            if (rm.length > 0) this.meanings.set(String(r.word), rm);
          }
        }
      } catch (e) {
        this.logger.warn(`reading overrides not loaded: ${(e as Error).message}`);
      }
      return m;
    })();
    return this.overrides;
  }

  /** Every word a person fixed the reading of, newest first (admin list). */
  async listOverrides(): Promise<{ word: string; reading: string; readings: string[]; updatedAt?: Date }[]> {
    const rows = await this.conn?.collection("reading_overrides").find({}).sort({ updatedAt: -1 }).toArray();
    const m = await this.loadOverrides();
    return (rows ?? []).map((r) => {
      const readings = m.get(String(r.word)) ?? (r.reading ? [String(r.reading)] : []);
      return { word: String(r.word), reading: readings[0] ?? "", readings, updatedAt: r.updatedAt as Date | undefined };
    });
  }

  /**
   * Take a learned reading back: the analyser reads the word its own way again.
   * With `reading`, only that one goes (a word may keep its other readings).
   */
  async forget(word: string, reading?: string): Promise<boolean> {
    const m = await this.loadOverrides();
    const left = reading ? (m.get(word) ?? []).filter((r) => r !== toHiragana(reading.trim())) : [];
    if (left.length > 0) {
      m.set(word, left);
      const rm = (this.meanings.get(word) ?? []).filter((x) => left.includes(x.reading));
      if (rm.length > 0) this.meanings.set(word, rm);
      else this.meanings.delete(word);
      const res = await this.conn?.collection("reading_overrides").updateOne({ word }, { $set: { reading: left[0], readings: left, readingMeanings: rm, updatedAt: new Date() } });
      return (res?.matchedCount ?? 0) > 0;
    }
    m.delete(word);
    this.meanings.delete(word);
    const res = await this.conn?.collection("reading_overrides").deleteOne({ word });
    return (res?.deletedCount ?? 0) > 0;
  }

  /**
   * The analyser got this word wrong, or the word has several readings, and a person kept
   * the card's reading ("Bỏ qua" on the warning): remember it. A word keeps ALL the readings
   * confirmed for it (人気 = にんき and ひとけ), so confirming one never overwrites another.
   */
  async learn(rawWord: string, reading: string, meaning?: string): Promise<void> {
    const word = rawWord.replace(WORD_NOTE_RE, "").trim();
    const r = toHiragana(reading.trim());
    // A reading with Vietnamese / Latin words in it is never a reading to remember ("Bỏ qua" on such a warning).
    if (!word || !r || !KANJI_RE.test(word) || /\p{Script=Latin}/u.test(r)) return;
    const m = await this.loadOverrides();
    const list = [...new Set([...(m.get(word) ?? []), r])];
    m.set(word, list);
    // Remember which meaning this reading goes with (a word with several readings may have a meaning for each).
    const mean = (meaning ?? "").trim().slice(0, 200);
    const rm = this.meanings.get(word) ?? [];
    if (mean && !rm.some((x) => x.reading === r && x.meaning === mean)) {
      rm.push({ reading: r, meaning: mean });
      this.meanings.set(word, rm);
    }
    try {
      await this.conn?.collection("reading_overrides").updateOne({ word }, { $set: { word, reading: list[0], readings: list, readingMeanings: rm, updatedAt: new Date() } }, { upsert: true });
    } catch (e) {
      this.logger.warn(`reading override not saved: ${(e as Error).message}`);
    }
  }

  private getTokenizer() {
    if (!this.tokenizer) {
      const require = createRequire(import.meta.url);
      const dicPath = join(dirname(require.resolve("kuromoji/package.json")), "dict");
      this.tokenizer = new Promise((resolve, reject) => {
        kuromoji.builder({ dicPath }).build((err, tk) => {
          if (err) {
            this.logger.error(`kuromoji dictionary failed to load: ${err.message}`);
            this.tokenizer = null; // retry on next call
            reject(err);
          } else {
            resolve(tk);
          }
        });
      });
    }
    return this.tokenizer;
  }

  /** Raw kuromoji tokens (used to verify a word's role inside a sentence). */
  async tokens(text: string): Promise<kuromoji.IpadicFeatures[]> {
    return (await this.getTokenizer()).tokenize(text);
  }

  async analyze(rawText: string): Promise<ReadingResult> {
    // Drop an existing "(ねこ)" annotation — the reading is derived, not typed.
    const text = rawText.replace(WORD_NOTE_RE, "").trim();
    if (text === "") return { reading: "", readings: [], partOfSpeech: null };
    await this.loadOverrides();

    const tk = await this.getTokenizer();
    const tokens = tk.tokenize(text);

    // Part of speech: judged from the LAST content token — in Japanese the
    // head of a word comes last (勉強する → する = verb, 静かだ → adjective).
    const content = tokens.filter(
      (t) => t.pos !== "記号" && t.pos !== "助詞" && t.pos !== "助動詞",
    );
    const head = content[content.length - 1];
    // A particle between two words (心が狭い, 気を付ける) makes it a set phrase, not a single part of speech.
    const inner = tokens.findIndex((t, i) => t.pos === "助詞" && i > 0 && i < tokens.length - 1);
    const partOfSpeech: PartOfSpeech | null = inner > 0 ? "phrase" : head ? tokenPos(head) : null;

    if (!KANJI_RE.test(text)) return { reading: "", readings: [], partOfSpeech };

    const reading = tokens
      .map((t) => {
        if (!KANJI_RE.test(t.surface_form)) return toHiragana(t.surface_form);
        const r = t.reading && t.reading !== "*" ? t.reading : t.surface_form;
        return toHiragana(r);
      })
      .join("");
    const known = (await this.loadOverrides()).get(text) ?? [];
    return { reading: known[0] ?? reading, readings: [...new Set([...known, reading])], readingMeanings: this.meanings.get(text) ?? [], partOfSpeech };
  }

  /** Readings a person confirmed for this word (fixed by hand or kept on a warning); [] when none. */
  async confirmedReadings(rawWord: string): Promise<string[]> {
    const m = await this.loadOverrides();
    return m.get(rawWord.replace(WORD_NOTE_RE, "").trim()) ?? [];
  }

  /** Meanings people tied to each confirmed reading of a word (from the overrides only; no analysis). */
  async readingMeanings(rawWord: string): Promise<{ reading: string; meaning: string }[]> {
    await this.loadOverrides();
    return this.meanings.get(rawWord.replace(WORD_NOTE_RE, "").trim()) ?? [];
  }

  /** Does the card's own reading text hold a reading this word is known to have? */
  async isKnownReading(rawWord: string, cardReading: string): Promise<boolean> {
    const have = readingVariants(cardReading);
    if (have.length === 0) return false;
    const { readings } = await this.analyze(rawWord);
    return readings.some((r) => have.includes(r));
  }
}
