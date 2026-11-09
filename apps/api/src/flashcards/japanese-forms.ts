/**
 * Surface forms a word can take in a sentence, written from Japanese grammar
 * (not from a dictionary), so an example sentence is judged by the word it
 * really uses and not by whether the card's front appears letter for letter.
 *
 * Verbs  – polite/negative/past/て/たい…, passive (書かれる), causative
 *          (書かせる), causative-passive (書かせられる/書かされる), potential
 *          (書ける, 食べられる, 食べれる), conditional ば, volitional, imperative,
 *          and the irregular する / 来る / 行く.
 * Adjectives – い-adj: adverbial く, て-form くて, past かった, negative くない,
 *          conditional ければ, nominal さ/み, そう/すぎ/げ, 良い→よく.
 *          な-adj: に (adverb), な (before a noun), だ/で/の… — the stem is the
 *          card's front itself, so a plain substring match already covers them.
 *
 * Over-generation is deliberate and harmless: a form only counts when it
 * actually appears in the sentence, and every form keeps the word's own stem.
 */

/** Godan endings → [a, i, e, o] bases and the te/ta sound-change base. */
const GODAN: Record<string, { a: string; i: string; e: string; o: string; euph: string; voiced: boolean }> = {
  う: { a: "わ", i: "い", e: "え", o: "お", euph: "っ", voiced: false },
  く: { a: "か", i: "き", e: "け", o: "こ", euph: "い", voiced: false },
  ぐ: { a: "が", i: "ぎ", e: "げ", o: "ご", euph: "い", voiced: true },
  す: { a: "さ", i: "し", e: "せ", o: "そ", euph: "し", voiced: false },
  つ: { a: "た", i: "ち", e: "て", o: "と", euph: "っ", voiced: false },
  ぬ: { a: "な", i: "に", e: "ね", o: "の", euph: "ん", voiced: true },
  ぶ: { a: "ば", i: "び", e: "べ", o: "ぼ", euph: "ん", voiced: true },
  む: { a: "ま", i: "み", e: "め", o: "も", euph: "ん", voiced: true },
  る: { a: "ら", i: "り", e: "れ", o: "ろ", euph: "っ", voiced: false },
};

// What may follow each base (prefixes; anything may continue after them).
const A_SUFFIX = ["ない", "なかっ", "なけれ", "れ", "せ", "ず", "ぬ", "ん"]; // + passive れる, causative せる, せられる
const I_SUFFIX = ["ます", "まし", "ませ", "たい", "たく", "たかっ", "ながら", "そう", "すぎ", "なさ", "つつ"];
const E_SUFFIX = ["る", "ない", "なかっ", "ます", "まし", "ませ", "ば", "て", "た", "と"]; // potential, imperative+
const O_SUFFIX = ["う"];
const ICHIDAN_SUFFIX = [
  "る", "ない", "なかっ", "なけれ", "ます", "まし", "ませ", "ましょ", "たい", "たく", "たかっ",
  "て", "た", "れば", "ろ", "よ", "よう", "られ", "させ", "れ", "ず", "ぬ", "ながら", "そう", "すぎ",
];
const I_ADJ_SUFFIX = ["い", "く", "かっ", "けれ", "さ", "そう", "すぎ", "み", "げ", "ない", "かろ"];
const SURU_FORMS: [string, string[]][] = [
  ["し", ["ます", "まし", "ませ", "ない", "なかっ", "て", "た", "たい", "たく", "たかっ", "よう", "ろ", "ながら", "そう", "すぎ"]],
  ["さ", ["れ", "せ", "ない"]],
  ["せ", ["ず", "ぬ", "よ"]],
  ["すれ", ["ば"]],
  ["でき", ["る", "ない", "ます", "まし", "ませ", "た", "て", "れば"]],
  ["す", ["る"]],
];
const KURU_STEMS: [string, string[]][] = [
  ["き", ["ます", "まし", "ませ", "て", "た", "たい", "たく", "たかっ", "ながら"]],
  ["こ", ["ない", "なかっ", "られ", "させ", "よう", "い"]],
  ["く", ["る", "れば"]],
];

const withSuffixes = (stem: string, suffixes: string[]): string[] => suffixes.map((s) => stem + s);

/** Forms of a dictionary-form verb (`食べる`, `書く`, `勉強する`, `持って来る`, `行く`). */
export function verbForms(term: string): string[] {
  const out = new Set<string>([term]);
  const chars = [...term];
  const last = chars[chars.length - 1];
  if (!last) return [];
  const head = chars.slice(0, -1).join("");

  // する-verbs (勉強する) and the plain する.
  if (term.endsWith("する")) {
    const base = term.slice(0, -2);
    for (const [stem, sfx] of SURU_FORMS) withSuffixes(base + stem, sfx).forEach((f) => out.add(f));
    return [...out];
  }
  // 来る / くる (持って来る, 出てくる)
  if (/(来る|くる)$/.test(term) && [...term].length >= 2) {
    const kanji = term.endsWith("来る");
    const base = term.slice(0, -2);
    const stemOf = (kana: string) => (kanji ? base + "来" : base + kana);
    // 来 is read き/こ/く; the kana spelling replaces the whole stem.
    for (const [kana, sfx] of KURU_STEMS) withSuffixes(stemOf(kana), sfx).forEach((f) => out.add(f));
    return [...out];
  }
  if (last !== "る" && !(last in GODAN)) return [...out];
  if (head === "") return [...out];

  // Ichidan (食べる, 見る): drop る. Also tried for every る-verb — a godan 帰る
  // would give 帰 + て = 帰て which never occurs in real text, so it is harmless.
  if (last === "る") withSuffixes(head, ICHIDAN_SUFFIX).forEach((f) => out.add(f));

  // Godan.
  const g = GODAN[last];
  withSuffixes(head + g.a, A_SUFFIX).forEach((f) => out.add(f));
  withSuffixes(head + g.i, I_SUFFIX).forEach((f) => out.add(f));
  withSuffixes(head + g.e, E_SUFFIX).forEach((f) => out.add(f));
  withSuffixes(head + g.o, O_SUFFIX).forEach((f) => out.add(f));
  // て / た (and で / だ after ぐ ぬ ぶ む); 行く is the one irregular (行って).
  const euph = term.endsWith("行く") ? "っ" : g.euph;
  const voiced = term.endsWith("行く") ? false : g.voiced;
  const te = voiced ? ["で", "だ"] : ["て", "た"];
  te.forEach((f) => out.add(head + euph + f));
  return [...out];
}

/** Forms of an い-adjective (`美味しい` → 美味しく, 美味しかった, 美味しさ…). */
export function iAdjectiveForms(term: string): string[] {
  const out = new Set<string>([term]);
  if (!term.endsWith("い") || [...term].length < 2) return [...out];
  const stems = [term.slice(0, -1)];
  // いい / 良い are conjugated from よ- (よく, よかった).
  if (term.endsWith("いい") && [...term].length === 2) stems.push("よ");
  else if (term.endsWith("良い")) stems.push(term.slice(0, -2) + "良", term.slice(0, -2) + "よ");
  for (const stem of stems) withSuffixes(stem, I_ADJ_SUFFIX).forEach((f) => out.add(f));
  return [...out];
}

/**
 * Every surface form worth looking for. `pos` narrows the grammar (the card's
 * part of speech); when unknown, both verb and adjective forms are tried.
 * Nouns and な-adjectives return only the word itself.
 */
export function conjugatedForms(term: string, pos: "verb" | "noun" | "adjective" | "phrase" | null): string[] {
  const t = term.trim();
  if (!t) return [];
  if (pos === "verb") return verbForms(t);
  if (pos === "adjective") return iAdjectiveForms(t);
  if (pos === "noun") return [t];
  return [...new Set([...verbForms(t), ...iAdjectiveForms(t)])];
}

/** True when `sentence` contains the word in any grammatical form (long enough to mean something). */
export function sentenceUsesForm(sentence: string, term: string, pos: "verb" | "noun" | "adjective" | "phrase" | null): boolean {
  return conjugatedForms(term, pos).some((f) => [...f].length >= 2 && sentence.includes(f));
}
