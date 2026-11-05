import { Injectable, Logger } from "@nestjs/common";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import kuromoji from "kuromoji";

export const PARTS_OF_SPEECH = ["verb", "noun", "adjective"] as const;
export type PartOfSpeech = (typeof PARTS_OF_SPEECH)[number];

export interface ReadingResult {
  /** Hiragana reading; `""` when the text has no kanji (pure kana / katakana). */
  reading: string;
  /** Best-guess part of speech (verb / noun / adjective) or `null`. */
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
    const text = rawText.replace(/[（(][^）)]*[）)]/g, "").trim();
    if (text === "") return { reading: "", partOfSpeech: null };

    const tk = await this.getTokenizer();
    const tokens = tk.tokenize(text);

    // Part of speech: judged from the LAST content token — in Japanese the
    // head of a word comes last (勉強する → する = verb, 静かだ → adjective).
    const content = tokens.filter(
      (t) => t.pos !== "記号" && t.pos !== "助詞" && t.pos !== "助動詞",
    );
    const head = content[content.length - 1];
    const partOfSpeech: PartOfSpeech | null = head ? tokenPos(head) : null;

    if (!KANJI_RE.test(text)) return { reading: "", partOfSpeech };

    const reading = tokens
      .map((t) => {
        if (!KANJI_RE.test(t.surface_form)) return toHiragana(t.surface_form);
        const r = t.reading && t.reading !== "*" ? t.reading : t.surface_form;
        return toHiragana(r);
      })
      .join("");
    return { reading, partOfSpeech };
  }
}
