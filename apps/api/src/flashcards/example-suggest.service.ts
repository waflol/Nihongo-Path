import { Injectable, Logger, Optional } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import type { TatoebaSentenceDocument } from "./schemas/tatoeba.schema.js";
import { AiExampleService } from "../ai/ai-example.service.js";
import {
  ReadingService,
  toHiragana,
  tokenPos,
  type PartOfSpeech,
} from "./reading.service.js";

export interface ExampleSuggestion {
  sentence: string;
  /** Vietnamese translation (Tatoeba contributors, or AI — see `source`). */
  translation: string;
  /**
   * Where it came from: a real Tatoeba pair, a real Tatoeba sentence translated
   * by AI, or a sentence written by AI.
   */
  source?: "tatoeba" | "ai-translated" | "ai";
}

export interface ExampleSuggestInput {
  /** The card's Japanese term (front). */
  term: string;
  /** The card's meaning (back) — the sentence's translation must reflect it. */
  meaning?: string;
  /** Hiragana reading of the card, when known (disambiguates 空 そら/から). */
  reading?: string;
  /** Verb / noun / adjective, when known. */
  partOfSpeech?: PartOfSpeech | "";
}

interface TatoebaSentence {
  text?: string;
  translations?: { lang?: string; text?: string }[][];
}

const UA = "NihongoPath/0.1 (language-learning app; example sentences)";
const HAS_JAPANESE = /[぀-ヿ㐀-鿿]/;

/**
 * Picks ONE short example sentence (with a Vietnamese translation) from the
 * Tatoeba corpus (CC BY 2.0 FR; no API key) — but only a sentence that really
 * uses the card's word in the card's sense:
 *
 *  1. the sentence is tokenised (kuromoji) and must contain the word as its
 *     own token(s) (by dictionary form — 食べます matches 食べる, while 山羊座
 *     does NOT match 山);
 *  2. that token's part of speech must equal the card's (verb/noun/adjective);
 *  3. when the card has a reading, the token's reading must equal it
 *     (空 "そら" never matches 空く "すく/から");
 *  4. when the card has a meaning, the Vietnamese translation must contain
 *     one of its words.
 *
 * No sentence passing all checks → `null` (better no example than a wrong
 * one). Failure-tolerant: any network/parse error also yields `null`, so
 * adding a card is never blocked.
 */
@Injectable()
export class ExampleSuggestService {
  private readonly logger = new Logger(ExampleSuggestService.name);

  constructor(
    private readonly morph: ReadingService,
    @Optional()
    @InjectModel("TatoebaSentence")
    private readonly local?: Model<TatoebaSentenceDocument>,
    @Optional() private readonly ai?: AiExampleService,
  ) {}

  private localReadyAt = 0;
  private localReadyValue = false;

  /** True when the local Tatoeba index is filled (checked at most once a minute). */
  async hasLocalIndex(): Promise<boolean> {
    if (!this.local) return false;
    if (Date.now() - this.localReadyAt < 60_000) return this.localReadyValue;
    try {
      this.localReadyValue = (await this.local.estimatedDocumentCount().exec()) > 0;
    } catch {
      this.localReadyValue = false;
    }
    this.localReadyAt = Date.now();
    return this.localReadyValue;
  }

  async suggest(input: ExampleSuggestInput): Promise<ExampleSuggestion | null> {
    const term = input.term.replace(/[（(][^）)]*[）)]/g, "").trim();
    if (!term || term.length > 30 || !HAS_JAPANESE.test(term)) return null;

    try {
      const termTokens = (await this.morph.tokens(term)).filter(
        (t) => t.pos !== "記号",
      );
      if (termTokens.length === 0) return null;

      // Card facts: given values win, otherwise derived from the word itself.
      const head = termTokens[termTokens.length - 1];
      const pos = input.partOfSpeech || tokenPos(head) || null;
      const reading = (input.reading ?? "").trim();
      const meanings = this.meaningWords(input.meaning ?? "");

      if (await this.hasLocalIndex()) {
        return await this.fromLocal(term, termTokens, pos, reading, meanings);
      }

      // Verbs/adjectives are conjugated (食べる → 食べます): search by the stem
      // too, the token check below keeps it exact.
      const needles = term.length > 1 ? [term, term.slice(0, -1)] : [term];
      const seen = new Set<string>();
      let best: { score: number; value: ExampleSuggestion } | null = null;

      for (const needle of needles) {
        for (const page of [1, 2]) {
          const list = await this.search(needle, page);
          for (const s of list) {
            const sentence = (s.text ?? "").trim();
            if (!sentence || sentence === term || seen.has(sentence)) continue;
            seen.add(sentence);
            if (sentence.length > 40 || !sentence.includes(needle)) continue;
            const vi = (s.translations ?? [])
              .flat()
              .find((t) => t.lang === "vie" && t.text?.trim())?.text;
            if (!vi) continue;
            if (meanings.length > 0 && !this.mentionsMeaning(vi, meanings)) continue;
            if (!(await this.usesWord(sentence, termTokens, pos, reading))) continue;

            let score = -Math.abs(sentence.length - 12);
            if (/[。！？]$/.test(sentence)) score += 2;
            if (sentence.length < 5) score -= 6;
            if (!best || score > best.score) {
              best = { score, value: { sentence, translation: vi.trim() } };
            }
          }
          if (best) break; // a verified sentence from this page is enough
        }
        if (best) break;
      }
      return best?.value ?? null;
    } catch (err) {
      this.logger.warn(`Example suggestion failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Same selection as the live lookup, but over the local index: one indexed
   * query on the sentence's dictionary forms, then the identical checks.
   */
  private async fromLocal(
    term: string,
    termTokens: { surface_form: string; basic_form: string; pos: string }[],
    pos: PartOfSpeech | null,
    reading: string,
    meanings: string[],
  ): Promise<ExampleSuggestion | null> {
    const docs = await this.local!
      .find({ tokens: { $all: this.contentForms(termTokens) }, hasVi: true })
      .limit(60)
      .lean()
      .exec();
    let best: { score: number; value: ExampleSuggestion } | null = null;
    for (const d of docs) {
      const sentence = d.ja.trim();
      if (!sentence || sentence === term || sentence.length > 40) continue;
      if (meanings.length > 0 && !this.mentionsMeaning(d.vi ?? "", meanings)) continue;
      if (!(await this.usesWord(sentence, termTokens, pos, reading))) continue;
      let score = -Math.abs(sentence.length - 12);
      if (/[。！？]$/.test(sentence)) score += 2;
      if (sentence.length < 5) score -= 6;
      if (!best || score > best.score) {
        best = { score, value: { sentence, translation: (d.vi ?? "").trim(), source: "tatoeba" } };
      }
    }
    return best?.value ?? null;
  }

  /**
   * Dictionary forms of a word's content tokens (particles / auxiliaries /
   * symbols dropped) — the same rule `scripts/import-tatoeba.mjs` uses when it
   * builds the `tokens` index.
   */
  private contentForms(
    termTokens: { surface_form: string; basic_form: string; pos: string }[],
  ): string[] {
    const base = (t: { surface_form: string; basic_form: string }) =>
      t.basic_form && t.basic_form !== "*" ? t.basic_form : t.surface_form;
    const skip = new Set(["記号", "助詞", "助動詞"]);
    const kept = termTokens.filter((t) => !skip.has(t.pos));
    return [...new Set((kept.length > 0 ? kept : termTokens).map(base))];
  }

  /**
   * Best-effort example for a card, in three steps (first hit wins):
   *  1. a real Tatoeba pair with a human Vietnamese translation;
   *  2. a real Tatoeba sentence that uses the word, translated by AI;
   *  3. a sentence written by AI, kept only if kuromoji confirms it really
   *     uses the word (same checks as the Tatoeba sentences).
   * Without an AI key, step 2 keeps the Japanese sentence untranslated and
   * step 3 is skipped. Used by the import worker; `suggest` stays the quick
   * path for adding a single card.
   */
  async suggestFull(input: ExampleSuggestInput): Promise<ExampleSuggestion | null> {
    const first = await this.suggest(input);
    if (first || !(await this.hasLocalIndex())) return first;

    const term = input.term.replace(/[（(][^）)]*[）)]/g, "").trim();
    if (!term || term.length > 30 || !HAS_JAPANESE.test(term)) return null;
    try {
      const termTokens = (await this.morph.tokens(term)).filter((t) => t.pos !== "記号");
      if (termTokens.length === 0) return null;
      const pos = input.partOfSpeech || tokenPos(termTokens[termTokens.length - 1]) || null;
      const reading = (input.reading ?? "").trim();
      const meaning = (input.meaning ?? "").trim();

      // 2. a real sentence without a Vietnamese translation.
      const docs = await this.local!
        .find({ tokens: { $all: this.contentForms(termTokens) }, hasVi: { $ne: true } })
        .limit(150)
        .lean()
        .exec();
      let best: { score: number; sentence: string } | null = null;
      for (const d of docs) {
        const sentence = d.ja.trim();
        if (!sentence || sentence === term || sentence.length > 40) continue;
        if (!(await this.usesWord(sentence, termTokens, pos, reading))) continue;
        let score = -Math.abs(sentence.length - 12);
        if (/[。！？]$/.test(sentence)) score += 2;
        if (sentence.length < 5) score -= 6;
        if (!best || score > best.score) best = { score, sentence };
      }
      if (best) {
        if (!this.ai || !(await this.ai.isEnabled())) {
          return { sentence: best.sentence, translation: "", source: "tatoeba" };
        }
        const r = await this.ai.run({ kind: "translate", ja: best.sentence, term, meaning });
        if (r && r.matches !== false) {
          return { sentence: best.sentence, translation: r.vi, source: "ai-translated" };
        }
        // `matches === false` → a different sense of the word: write our own.
      }

      // 3. a sentence written by AI, verified like the others.
      if (this.ai && (await this.ai.isEnabled())) {
        const r = await this.ai.run({ kind: "write", term, reading, meaning, pos: pos ?? "" });
        const sentence = r?.ja?.trim() ?? "";
        if (r && sentence && sentence.length <= 40 && (await this.usesWord(sentence, termTokens, pos, reading))) {
          return { sentence, translation: r.vi, source: "ai" };
        }
      }
      return null;
    } catch (err) {
      this.logger.warn(`Full example suggestion failed: ${(err as Error).message}`);
      return null;
    }
  }

  /** Words of the card's meaning ("ăn (động từ)" → ["ăn"]). */
  private meaningWords(meaning: string): string[] {
    return meaning
      .toLowerCase()
      .replace(/[（(][^）)]*[）)]/g, "")
      .split(/[,;/、]/)
      .map((m) => m.trim())
      .filter((m) => m.length >= 2);
  }

  /** Whole-word match (so "ăn" does not match inside "khăn"). */
  private mentionsMeaning(translation: string, words: string[]): boolean {
    const t = translation.toLowerCase();
    return words.some((w) => {
      const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "u").test(t);
    });
  }

  /** Does `sentence` contain the card's word as the right token(s)? */
  private async usesWord(
    sentence: string,
    termTokens: { surface_form: string; basic_form: string; pos: string }[],
    pos: PartOfSpeech | null,
    reading: string,
  ): Promise<boolean> {
    const tokens = await this.morph.tokens(sentence);
    const base = (t: { surface_form: string; basic_form: string }) =>
      t.basic_form && t.basic_form !== "*" ? t.basic_form : t.surface_form;
    const n = termTokens.length;

    for (let i = 0; i + n <= tokens.length; i++) {
      const window = tokens.slice(i, i + n);
      const sameWord = window.every((t, k) => base(t) === base(termTokens[k]));
      if (!sameWord) continue;
      // Role: the LAST token of the match carries the part of speech.
      const last = window[window.length - 1];
      if (pos && tokenPos(last) !== pos) continue;
      // Reading (single, unconjugated token): must be the same word, not a
      // homograph — 空 "そら" (sky) vs 空く "すく" / 空 "から" (empty).
      if (
        n === 1 &&
        reading &&
        last.reading &&
        last.reading !== "*" &&
        last.surface_form === last.basic_form &&
        toHiragana(last.reading) !== reading
      ) {
        continue;
      }
      return true;
    }
    return false;
  }

  private async search(query: string, page: number): Promise<TatoebaSentence[]> {
    const params = new URLSearchParams({
      from: "jpn",
      to: "vie",
      query,
      sort: "relevance",
      orphans: "no",
      unapproved: "no",
      trans_filter: "limit",
      page: String(page),
    });
    try {
      const res = await fetch(`https://tatoeba.org/en/api_v0/search?${params}`, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { results?: TatoebaSentence[] };
      return data.results ?? [];
    } catch (err) {
      this.logger.warn(`Tatoeba lookup failed: ${(err as Error).message}`);
      return [];
    }
  }
}
