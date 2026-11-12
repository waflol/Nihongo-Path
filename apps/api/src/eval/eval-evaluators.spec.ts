import { EVALUATORS, parseItems } from "./eval-evaluators.js";
import { combineScores, judgePrompt, parseJudge } from "./eval-judge.js";
import { namesPattern, posMatches, referenceVariants, sentenceHasPattern } from "./eval-text.js";
import type { GrammarCase, JudgeVerdict, SentenceGenerationCase, TranslationCase, VocabularyCase } from "./eval-types.js";

const base = { level: "N5" as const, evaluation_focus: [], checks: [], case_variant: 1, gold_status: "x" };
const trCase: TranslationCase = { ...base, id: "TR", task: "translation", direction: "ja_to_vi", input: "私は学生です。", reference: "Tôi là học sinh/sinh viên." };
const sgCase: SentenceGenerationCase = {
  ...base, id: "SG", task: "sentence_generation", target_pattern: "～てもいいです", instruction: "Đặt một câu trong bối cảnh học tập.",
  reference_example: "ここで写真を撮ってもいいです。", reference_translation: "Có thể chụp ảnh ở đây.",
};
const vcCase: VocabularyCase = {
  ...base, id: "VC", task: "vocabulary_check", word: "学校", context: "学校へ行きます。",
  expected: { reading: "がっこう", meaning_vi: "trường học", part_of_speech: "danh từ" },
};
const grCase: GrammarCase = {
  ...base, id: "GR", task: "grammar_analysis", sentence: "日本語が話せるようになりました。", target_pattern: "～ようになる", instruction: "Phân tích",
  expected: { meaning_vi: "trở nên có thể", formation: "V khả năng + ようになる", function: "change", sentence_translation: "Tôi đã nói được tiếng Nhật." },
};
const verdict = (scores: Record<string, number>, extra: Partial<JudgeVerdict> = {}): JudgeVerdict => ({ judge: "j", scores, errorTags: [], confidence: 0.9, note: "", ...extra });

describe("text helpers", () => {
  it("resolves slash alternatives in a reference", () => {
    expect(referenceVariants("Tôi là học sinh/sinh viên.")).toEqual(expect.arrayContaining(["Tôi là học sinh/sinh viên."]));
    expect(referenceVariants("Tôi là học sinh/sinh viên.").length).toBeGreaterThan(1);
  });
  it("finds a pattern through conjugation and alternatives", () => {
    expect(sentenceHasPattern("宿題を見てもいいですか。", "～てもいいです")).toBe(true);
    expect(sentenceHasPattern("この本は読みにくい。", "～やすい／にくい")).toBe(true);
    expect(sentenceHasPattern("本を読みます。", "～てもいいです")).toBe(false);
    expect(namesPattern("〜ようになる (biến đổi)", "～ようになる")).toBe(true);
  });
  it("matches parts of speech across Vietnamese / Japanese / English labels", () => {
    expect(posMatches("名詞", "danh từ")).toBe(true);
    expect(posMatches("động từ nhóm 1", "danh từ/する動詞")).toBe(false);
    expect(posMatches("danh từ", "danh từ/する動詞")).toBe(true);
    expect(posMatches("na-adjective", "tính từ な")).toBe(true);
  });
});

describe("translation evaluator", () => {
  const ev = EVALUATORS.translation;
  it("accepts a paraphrase: no exact-match requirement, the judges decide", () => {
    const det = ev.deterministic(trCase, { translation: "Mình là sinh viên." });
    expect(det.fatal).toBeFalsy();
    const c = combineScores(ev, det, [verdict({ meaning: 40, completeness: 20, grammar: 15, naturalness: 13, register: 8 })]);
    expect(c!.total).toBe(96);
  });
  it("scores 0 without judges for an answer in the wrong language or empty", () => {
    expect(ev.deterministic(trCase, { translation: "私は学生です" })).toMatchObject({ fatal: true, flags: ["wrong_language"] });
    const det = ev.deterministic(trCase, { translation: "" });
    expect(combineScores(ev, det, [])).toMatchObject({ total: 0 });
  });
  it("flags for review when close to the reference but judged low", () => {
    const det = ev.deterministic(trCase, { translation: "Tôi là học sinh." });
    const c = combineScores(ev, det, [verdict({ meaning: 10, completeness: 5, grammar: 5, naturalness: 5, register: 5 })]);
    expect(c!.review).toMatch(/gần đáp án tham chiếu/);
  });
});

describe("sentence generation evaluator", () => {
  const ev = EVALUATORS.sentence_generation;
  const full = { pattern: 30, grammar: 25, naturalness: 20, instruction: 15, level: 10 };
  it("gives instruction compliance 0 when the reference example is copied, whatever the judges say", () => {
    const det = ev.deterministic(sgCase, { ja: "ここで写真を撮ってもいいです。", vi: "x" });
    expect(det.flags).toContain("copied_reference");
    expect(combineScores(ev, det, [verdict(full)])!.parts.instruction).toBe(0);
  });
  it("keeps a new valid sentence at full points", () => {
    const det = ev.deterministic(sgCase, { ja: "教室で辞書を使ってもいいです。", vi: "Được dùng từ điển trong lớp." });
    expect(det.checks.patternFound).toBe(true);
    expect(combineScores(ev, det, [verdict(full), verdict(full)])!.total).toBe(100);
  });
  it("rejects a Vietnamese answer", () => {
    expect(ev.deterministic(sgCase, { ja: "Tôi được phép.", vi: "" }).fatal).toBe(true);
  });
});

describe("vocabulary evaluator", () => {
  const ev = EVALUATORS.vocabulary_check;
  it("scores reading and POS by code when they match (katakana reading accepted)", () => {
    const det = ev.deterministic(vcCase, { reading: "ガッコウ", meaning_vi: "trường", part_of_speech: "名詞", usage_note: "" });
    expect(det.points).toEqual({ reading: 20, pos: 20 });
    const c = combineScores(ev, det, [verdict({ reading: 0, meaning: 30, pos: 0, nuance: 20 })]);
    expect(c!.parts).toEqual({ reading: 20, meaning: 30, pos: 20, nuance: 20 });
  });
  it("lets the judges accept another valid reading the code does not know", () => {
    const det = ev.deterministic(vcCase, { reading: "がっこ", meaning_vi: "trường học", part_of_speech: "danh từ", usage_note: "" });
    expect(det.flags).toContain("wrong_reading");
    expect(combineScores(ev, det, [verdict({ reading: 20, meaning: 30, pos: 20, nuance: 30 })])!.parts.reading).toBe(20);
  });
});

describe("grammar evaluator", () => {
  const ev = EVALUATORS.grammar_analysis;
  it("checks the pattern and the breakdown coverage by code", () => {
    const det = ev.deterministic(grCase, {
      pattern: "～ようになる",
      translation: "Tôi đã nói được tiếng Nhật.",
      breakdown: [{ text: "日本語が", role: "" }, { text: "話せる", role: "" }, { text: "ようになりました", role: "" }],
      similar_patterns: [{ pattern: "～ことになる", difference: "" }],
    });
    expect(det.points.pattern).toBe(20);
    expect(det.checks.breakdownCoverage).toBe(1);
    expect(det.flags).toEqual([]);
  });
  it("caps the breakdown when the parts do not cover the sentence", () => {
    const det = ev.deterministic(grCase, { pattern: "～ことにする", translation: "x", breakdown: [{ text: "日本語", role: "" }], similar_patterns: [] });
    expect(det.flags).toEqual(expect.arrayContaining(["pattern_missing", "breakdown_error", "no_confusion_note"]));
    const c = combineScores(ev, det, [verdict({ pattern: 5, meaning: 20, formation: 15, translation: 15, breakdown: 20, confusion: 10 })]);
    expect(c!.parts.breakdown).toBe(10);
    expect(c!.parts.pattern).toBe(5);
  });
});

describe("judges", () => {
  const ev = EVALUATORS.translation;
  const det = ev.deterministic(trCase, { translation: "Tôi là sinh viên." });
  it("averages two judges and flags a large disagreement", () => {
    const a = verdict({ meaning: 40, completeness: 20, grammar: 15, naturalness: 15, register: 10 });
    const b = verdict({ meaning: 10, completeness: 10, grammar: 10, naturalness: 5, register: 5 });
    const c = combineScores(ev, det, [a, b])!;
    expect(c.total).toBe(70);
    expect(c.judgeSpread).toBe(60);
    expect(c.review).toMatch(/lệch/);
  });
  it("returns null (not 0) when no judge answered", () => {
    expect(combineScores(ev, det, [])).toBeNull();
  });
  it("parses and clamps judge scores, keeps only known error tags", () => {
    const v = parseJudge('```json\n{"items":[{"id":1,"scores":{"meaning":99,"completeness":-3},"errorTags":["omission","nonsense"],"confidence":2,"note":"thiếu"}]}\n```', ev.rubric, "J");
    expect(v.get(1)).toMatchObject({ scores: { meaning: 40, completeness: 0 }, errorTags: ["omission"], confidence: 1, error: "3 criteria missing" });
  });
  it("is blind and tells the judge the reference is not the only answer", () => {
    const p = judgePrompt(ev, [{ caseDesc: ev.describeCase(trCase), answer: { translation: "x" } }]);
    expect(p).toContain("NOT the only correct one");
    expect(p).not.toMatch(/gemini|claude|gpt/i);
  });
});

describe("parseItems", () => {
  it("reads items by id from fenced / prefixed JSON and drops unusable rows", () => {
    const m = parseItems('Here:\n```json\n{"items":[{"id":1,"translation":"a"},{"id":2,"translation":""},{"id":"x"}]}\n```', (r) => EVALUATORS.translation.read(r));
    expect([...m.keys()]).toEqual([1]);
  });
  it("returns an empty map for broken JSON", () => {
    expect(parseItems("{not json", (r) => EVALUATORS.translation.read(r)).size).toBe(0);
  });
});
