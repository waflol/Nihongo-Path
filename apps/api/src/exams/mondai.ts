import { createHash } from "node:crypto";

/**
 * JLPT question-type (mondai) taxonomy (NP-406 / plan-jlpt-question-bank §5.1).
 *
 * A 問題 in a JLPT paper is identified by its **instruction** (lời dẫn), not by
 * its printed number — the same format appears under different 問題 numbers
 * across sources (D3). `classifyInstruction` maps a normalised instruction to a
 * standard `MondaiType` code so a question bank can be organised by
 * `level × mondai` regardless of which paper it came from.
 *
 * The matching rules are data (marker strings per type) so each form is easy to
 * extend and to unit-test with self-authored instructions (the repo is public —
 * no real exam content in fixtures).
 */

export const SECTION_KEYS = ["vocab", "grammar", "reading", "listening"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const MONDAI_TYPES = [
  "kanji-reading",
  "orthography",
  "word-formation",
  "context",
  "paraphrase",
  "usage",
  "grammar-form",
  "star-order",
  "text-grammar",
  "reading-short",
  "reading-mid",
  "reading-long",
  "reading-integrated",
  "reading-thematic",
  "info-retrieval",
  "listening",
] as const;
export type MondaiType = (typeof MONDAI_TYPES)[number];

/** Which part of the paper a type belongs to. */
export const SECTION_OF: Record<MondaiType, SectionKey> = {
  "kanji-reading": "vocab",
  orthography: "vocab",
  "word-formation": "vocab",
  context: "vocab",
  paraphrase: "vocab",
  usage: "vocab",
  "grammar-form": "grammar",
  "star-order": "grammar",
  "text-grammar": "grammar",
  "reading-short": "reading",
  "reading-mid": "reading",
  "reading-long": "reading",
  "reading-integrated": "reading",
  "reading-thematic": "reading",
  "info-retrieval": "reading",
  listening: "listening",
};

/** Types whose questions attach to a shared `exam_stimuli` row (a passage). */
export const USES_STIMULUS: Record<MondaiType, boolean> = {
  "kanji-reading": false,
  orthography: false,
  "word-formation": false,
  context: false,
  paraphrase: false,
  usage: false,
  "grammar-form": false,
  "star-order": false,
  "text-grammar": true,
  "reading-short": true,
  "reading-mid": true,
  "reading-long": true,
  "reading-integrated": true,
  "reading-thematic": true,
  "info-retrieval": true,
  listening: true,
};

/**
 * Allowed option counts for a type: 4 for every printed JLPT type; 3 or 4 for
 * listening (out of scope, schema reserves the space). Legacy / untyped
 * questions default to exactly 4.
 */
export function optionCountsOf(mondai?: string | null): number[] {
  if (mondai === "listening" || mondai?.startsWith("listening")) return [3, 4];
  return [4];
}

export const isMondaiType = (v: unknown): v is MondaiType =>
  typeof v === "string" && (MONDAI_TYPES as readonly string[]).includes(v);

const isN1N2 = (level?: string): boolean => {
  const l = level?.trim().toUpperCase();
  return l === "N1" || l === "N2";
};

/**
 * Normalise an instruction for matching (plan §5.1: "NFKC + bỏ khoảng trắng
 * trước khi so"). NFKC unifies unicode lookalikes; fullwidth digits/parens are
 * mapped to their ASCII forms and all whitespace is stripped, so a marker
 * written as `（1）` or `(1)` or `( 1 )` all reduce to `(1)`.
 */
export function normalizeInstruction(s: string): string {
  let t = (s ?? "").normalize("NFKC");
  t = t
    .replace(/０/g, "0").replace(/１/g, "1").replace(/２/g, "2")
    .replace(/３/g, "3").replace(/４/g, "4")
    .replace(/（/g, "(").replace(/）/g, ")")
    .replace(/［/g, "[").replace(/］/g, "]");
  return t.replace(/\s+/g, "");
}

export interface ClassifyContext {
  /** The block the 問題 belongs to (文字・語彙 → vocab, 文法 → grammar, 読解 → reading). */
  section?: SectionKey;
}

/**
 * Identify a type from its instruction + the level + the block it was found in.
 * `null` when no rule matches — the caller then falls back to a manual guess /
 * an `error` draft. Deterministic and total (no throws).
 */
export function classifyInstruction(
  text: string,
  level: string | undefined,
  ctx: ClassifyContext = {},
): MondaiType | null {
  const n = normalizeInstruction(text);
  if (n.length === 0) return null;
  const sec = ctx.section;

  // Global, unambiguous markers that hold in ANY section: a 音声 instruction is
  // listening, and the cloze marker 「全体の内容を考えて」 is text-grammar even
  // when the 問題 sits under a vocab block (Migii model tests).
  if (n.includes("音声")) return "listening";
  if (n.includes("全体の内容を考えて")) return "text-grammar";

  // No block hint: try the families in a fixed priority (reading → grammar → vocab).
  if (sec === undefined || sec === null) {
    return classifyReading(n, level) ?? classifyGrammar(n, level) ?? classifyVocab(n, level);
  }
  if (sec === "listening") return "listening";
  const primary = sec === "vocab" ? classifyVocab : sec === "grammar" ? classifyGrammar : classifyReading;
  const hit = primary(n, level);
  if (hit) return hit;
  // The block hint didn't decide (the 問題 is really another family's form):
  // fall through to the cross-family markers rather than `null`.
  return classifyReading(n, level) ?? classifyGrammar(n, level) ?? classifyVocab(n, level);
}

function classifyVocab(n: string, level: string | undefined): MondaiType | null {
  if (n.includes("読み方として")) return "kanji-reading";
  if (n.includes("漢字で書くとき")) return "orthography";
  if (n.includes("意味が最も近いもの")) return "paraphrase";
  if (n.includes("使い方として")) return "usage";
  // "context" (表現 / most-appropriate-to-fill) carries the full `（）に入れるのに
  // 最もよいもの` phrase — check it before the bare word-formation blank-fill.
  if (n.includes("に入れるのに最もよいもの") || n.includes("に入るのはどれか") && n.includes("最も")) return "context";
  if (n.includes("語形成") || (isN1N2(level) && n.includes("()に入れる"))) return "word-formation";
  return null;
}

function classifyGrammar(n: string, _level: string | undefined): MondaiType | null {
  // A star question: one sentence with four ＿＿ blanks, one marked ★.
  if (n.includes("★") && (n.includes("最もよいもの") || n.includes("最も適している"))) return "star-order";
  // A cloze across a whole passage (文章全体 / 文全体).
  if (n.includes("全体の内容を考えて")) return "text-grammar";
  // A single sentence's blank.
  if (n.includes("次の文の()に入れる") || n.includes("次の文の()に入る")) return "grammar-form";
  return null;
}

function classifyReading(n: string, level: string | undefined): MondaiType | null {
  // Two passages AとB read together.
  if (n.includes("AとB") || (n.includes("(A)") && n.includes("(B)"))) return "reading-integrated";
  // A notice / info page.
  if (
    n.includes("次のページは") ||
    n.includes("右のページ") ||
    n.includes("次の掲示") ||
    n.includes("次の表")
  ) {
    return "info-retrieval";
  }
  // A long argumentative essay (N1/N2).
  if (isN1N2(level) && (n.includes("次の文を読んで") || n.includes("次の長文を読んで"))) return "reading-thematic";
  // One passage, questions keyed (1)..(n).
  if (n.includes("次の文章を読んで")) return "reading-long";
  // Multiple short passages, questions grouped (1)-(2)/(3).
  if (n.includes("(1)から(3)") || n.includes("(1)から(2)") || (n.includes("(1)と(2)") && !n.includes("から"))) return "reading-mid";
  // Short passages, questions (1)-(4)/(5).
  if (n.includes("(1)から(4)") || n.includes("(1)から(5)")) return "reading-short";
  return null;
}

/** Exam text may carry `<b>` `<i>` `<u>` from the draft editor; strip them to compare the words. */
export const stripFormat = (s: string): string => s.replace(/<\/?[biu]>/g, "");

/**
 * Cross-source duplicate fingerprint (plan §5.2): same prompt + same option set
 * → same hash, so a question re-imported from a second source is recognised as
 * already present. Normalised so full/half-width and spacing differences do not
 * break dedup.
 */
export function contentHashOf(prompt: string, options: string[]): string {
  // Bold / underline added by an editor does not make it a different question.
  const norm = (s: string) => normalizeInstruction(stripFormat(s));
  const p = norm(prompt);
  const o = [...options].map(norm).sort().join("\u0001");
  return createHash("sha1").update(`${p}\u0001${o}`).digest("hex");
}
