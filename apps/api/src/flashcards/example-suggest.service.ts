import { Injectable, Logger, Optional } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import type { TatoebaSentenceDocument } from "./schemas/tatoeba.schema.js";
import { AiExampleService } from "../ai/ai-example.service.js";
import { AiCallLogService } from "../ai/ai-call-log.service.js";
import {
  ReadingService,
  readingVariants,
  toHiragana,
  tokenPos,
  type PartOfSpeech,
} from "./reading.service.js";
import { sentenceUsesForm } from "./japanese-forms.js";

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
/** At most this many AI services are asked, one after another, for one card. */
const MAX_AI_TRIES = 6;
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
    @Optional() private readonly callLog?: AiCallLogService,
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

  /** Write one per-word entry to the admin call history ("Hoạt động ví dụ"). */
  private logActivity(
    input: ExampleSuggestInput,
    hit: ExampleSuggestion | null,
    t0: number,
    via: string,
  ): void {
    const label = hit
      ? { tatoeba: "Tatoeba", "ai-translated": "Tatoeba + AI dịch", ai: "AI viết" }[hit.source ?? "tatoeba"]
      : "Không tìm được ví dụ";
    void this.callLog?.record({
      purpose: "vocab",
      serviceId: "",
      serviceLabel: `${via} · ${label}`,
      provider: "activity",
      modelName: hit?.source ?? "none",
      url: "",
      words: [input.term],
      request: JSON.stringify(
        { term: input.term, meaning: input.meaning, reading: input.reading, partOfSpeech: input.partOfSpeech },
        null,
        2,
      ),
      response: hit ? `${hit.sentence}\n${hit.translation}` : "Không có câu nào đạt kiểm tra.",
      ok: !!hit,
      status: 0,
      ms: Date.now() - t0,
    });
  }

  async suggest(input: ExampleSuggestInput, log = true): Promise<ExampleSuggestion | null> {
    const t0 = Date.now();
    const hit = await this.suggestInner(input);
    if (log) this.logActivity(input, hit, t0, "Thêm thẻ");
    return hit;
  }

  private async suggestInner(input: ExampleSuggestInput): Promise<ExampleSuggestion | null> {
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
    const t0 = Date.now();
    const hit = await this.suggestFullInner(input);
    this.logActivity(input, hit, t0, "Import");
    return hit;
  }

  private async suggestFullInner(input: ExampleSuggestInput): Promise<ExampleSuggestion | null> {
    const first = await this.suggestInner(input);
    if (first) return first;
    const hasLocal = await this.hasLocalIndex();

    const term = input.term.replace(/[（(][^）)]*[）)]/g, "").trim();
    if (!term || term.length > 30 || !HAS_JAPANESE.test(term)) return null;
    try {
      const termTokens = (await this.morph.tokens(term)).filter((t) => t.pos !== "記号");
      if (termTokens.length === 0) return null;
      const pos = input.partOfSpeech || tokenPos(termTokens[termTokens.length - 1]) || null;
      const reading = (input.reading ?? "").trim();
      const meaning = (input.meaning ?? "").trim();

      // 2. a real sentence without a Vietnamese translation.
      // (needs the local index; without it, go straight to the AI-written sentence)
      const docs = hasLocal
        ? await this.local!
            .find({ tokens: { $all: this.contentForms(termTokens) }, hasVi: { $ne: true } })
            .limit(150)
            .lean()
            .exec()
        : [];
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
        // Ask the AI services one after another: if the first one says the word
        // has another sense here (`matches === false`), the next ready service
        // is asked, and so on. None agrees → write our own sentence below.
        const tried: string[] = [];
        for (let i = 0; i < MAX_AI_TRIES; i++) {
          const r = await this.ai.run({ kind: "translate", ja: best.sentence, term, meaning, skip: [...tried] });
          if (!r) break; // no further service can answer
          if (r.matches !== false) {
            return { sentence: best.sentence, translation: r.vi, source: "ai-translated" };
          }
          if (!r.service) break;
          tried.push(r.service);
        }
      }

      // 3. a sentence written by AI. The first service's sentence is checked;
      // if it is not suitable the next ready service is asked, then the next…
      // If none gives a suitable one the card stays empty.
      // The AI was given this exact word, reading and meaning, so the card's
      // own part of speech / reading (often typo'd in the source book) is not
      // held against it: the word (or one of its written forms / readings)
      // just has to be in the sentence.
      if (this.ai && (await this.ai.isEnabled())) {
        const tried: string[] = [];
        for (let i = 0; i < MAX_AI_TRIES; i++) {
          const r = await this.ai.run({ kind: "write", term, reading, meaning, pos: pos ?? "", skip: [...tried] });
          if (!r) break; // no further service can answer
          const sentence = r.ja?.trim() ?? "";
          if ((await this.checkAiSentence(term, input.reading, sentence)).ok) {
            return { sentence, translation: r.vi, source: "ai" };
          }
          if (!r.service) break;
          tried.push(r.service);
        }
      }
      return null;
    } catch (err) {
      this.logger.warn(`Full example suggestion failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Does a sentence the AI wrote suit the card, and if not, why? Shared by the
   * generator (accepts or asks the next service) and the admin listing of saved
   * AI answers that never reached a card (shows the reason).
   */
  async checkAiSentence(
    rawTerm: string,
    reading: string | undefined,
    sentence: string,
  ): Promise<{ ok: boolean; reason: string }> {
    const term = rawTerm.replace(/[（(][^）)]*[）)]/g, "").trim();
    const s = sentence.trim();
    if (!s) return { ok: false, reason: "AI không trả về câu tiếng Nhật" };
    if ([...s].length > 40) return { ok: false, reason: `Câu quá dài (${[...s].length} ký tự, tối đa 40)` };
    if (this.wordForms(term, reading).some((f) => s.includes(f))) return { ok: true, reason: "" };
    // Passive / causative / potential / adverbial … forms of the word.
    if (this.wordVariants(term).some((v) => sentenceUsesForm(s, v, null))) return { ok: true, reason: "" };
    try {
      const termTokens = (await this.morph.tokens(term)).filter((t) => t.pos !== "記号");
      if (termTokens.length > 0 && (await this.usesWord(s, termTokens, null, ""))) return { ok: true, reason: "" };
    } catch {
      /* analyser unavailable → judged by the text alone */
    }
    return {
      ok: false,
      reason: `Câu không chứa từ “${term}” (AI dùng từ đồng nghĩa hoặc viết bằng kana)`,
    };
  }

  /**
   * Every way the word may appear in a sentence: the front as written, each
   * variant when the book lists several (`寄附／寄付`), and its hiragana
   * reading(s). Forms of one character are ignored (too common to prove anything).
   */
  private wordForms(term: string, reading?: string): string[] {
    const parts = term.split(/[／/・、,\s]+/).filter(Boolean);
    const forms = new Set<string>([term, ...parts, ...readingVariants(reading)]);
    return [...forms].filter((f) => [...f].length >= 2 || f === term);
  }

  /** The separate written variants of a front (`寄附／寄付` → both). */
  private wordVariants(term: string): string[] {
    return term.split(/[／/・、,\s]+/).filter(Boolean);
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
    // The card's reading as a book wrote it (`【かくべつ】`, `げんぞん/げんそん`) → plain hiragana variants.
    const readings = readingVariants(reading);

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
        readings.length > 0 &&
        last.reading &&
        last.reading !== "*" &&
        last.surface_form === last.basic_form &&
        !readings.includes(toHiragana(last.reading))
      ) {
        continue;
      }
      return true;
    }
    // The analyser lemmatises most inflection (passive, causative, adverbial く),
    // but not all of it (potential 書ける is its own entry): fall back to the
    // grammar-generated forms for verbs and い-adjectives.
    if (pos === "verb" || pos === "adjective") {
      const term = termTokens.map((t) => t.surface_form).join("");
      if (sentenceUsesForm(sentence, term, pos)) return true;
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
