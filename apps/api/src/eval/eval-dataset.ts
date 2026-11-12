import { createHash } from "node:crypto";
import {
  EVAL_TASKS,
  JLPT_LEVELS,
  type CaseFilter,
  type DatasetMeta,
  type EvalCase,
  type EvalSplit,
  type EvalTask,
  type LoadedCase,
  type LoadedDataset,
} from "./eval-types.js";

/** Thrown with every problem found, each prefixed by the case id or line. */
export class DatasetValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(`Dataset is invalid (${problems.length} problem${problems.length === 1 ? "" : "s"}): ${problems.slice(0, 5).join("; ")}`);
  }
}

const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isStrList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** Required string fields of each task, top level and inside `expected`. */
const REQUIRED: Record<EvalTask, { top: string[]; expected?: string[] }> = {
  translation: { top: ["direction", "input", "reference"] },
  sentence_generation: { top: ["target_pattern", "instruction", "reference_example", "reference_translation"] },
  vocabulary_check: { top: ["word", "context"], expected: ["reading", "meaning_vi", "part_of_speech"] },
  grammar_analysis: { top: ["sentence", "target_pattern", "instruction"], expected: ["meaning_vi", "formation", "function", "sentence_translation"] },
};

/** Problems with one raw case (empty = valid). */
export function validateCase(raw: unknown, where: string): string[] {
  const out: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [`${where}: not an object`];
  const c = raw as Record<string, unknown>;
  const at = isStr(c.id) ? c.id : where;
  if (!isStr(c.id)) out.push(`${where}: missing id`);
  if (!EVAL_TASKS.includes(c.task as EvalTask)) {
    out.push(`${at}: unknown task ${JSON.stringify(c.task)}`);
    return out;
  }
  if (!JLPT_LEVELS.includes(c.level as never)) out.push(`${at}: level must be N5–N1, got ${JSON.stringify(c.level)}`);
  if (!isStrList(c.evaluation_focus)) out.push(`${at}: evaluation_focus must be a list of strings`);
  if (!isStrList(c.checks)) out.push(`${at}: checks must be a list of strings`);
  if (!isStr(c.gold_status)) out.push(`${at}: missing gold_status`);
  if (c.case_variant !== undefined && !Number.isInteger(c.case_variant)) out.push(`${at}: case_variant must be an integer`);
  const req = REQUIRED[c.task as EvalTask];
  for (const f of req.top) if (!isStr(c[f])) out.push(`${at}: missing ${f}`);
  if (req.expected) {
    const e = c.expected as Record<string, unknown> | undefined;
    if (!e || typeof e !== "object") out.push(`${at}: missing expected`);
    else for (const f of req.expected) if (!isStr(e[f])) out.push(`${at}: missing expected.${f}`);
  }
  if (c.task === "translation" && c.direction !== "ja_to_vi" && c.direction !== "vi_to_ja") {
    out.push(`${at}: direction must be ja_to_vi or vi_to_ja`);
  }
  return out;
}

/** Folded text for seed keys: NFKC, no spaces / punctuation, lower-case. */
const fold = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");

/**
 * The seed a case was expanded from. Variants of one seed must stay in one
 * split, or near-duplicates leak from dev into test. Translation uses the
 * Japanese side, so ja→vi and vi→ja of one sentence share a seed.
 */
export function seedKeyOf(c: EvalCase): string {
  switch (c.task) {
    case "translation":
      return `ja:${fold(c.direction === "ja_to_vi" ? c.input : c.reference)}`;
    case "sentence_generation":
    case "grammar_analysis":
      return `pattern:${fold(c.target_pattern)}`;
    case "vocabulary_check":
      return `word:${fold(c.word)}`;
  }
}

/** Stable 60 / 20 / 20 dev / val / test split from the seed key. */
export function splitOf(seedKey: string): EvalSplit {
  const n = parseInt(sha256(seedKey).slice(0, 8), 16) % 100;
  return n < 60 ? "dev" : n < 80 ? "val" : "test";
}

/** Hash of everything that is asked or expected (not the id / variant number). */
export function contentHashOf(c: EvalCase): string {
  const { id: _id, case_variant: _v, ...rest } = c as EvalCase & Record<string, unknown>;
  const sorted = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v;
  return sha256(JSON.stringify(sorted(rest))).slice(0, 16);
}

/** Parse JSON (`{…, cases: []}`) or JSONL (one case per line; optional first line `{"dataset": {...meta}}`). */
function parseSource(text: string, format: "json" | "jsonl"): { header: Record<string, unknown>; rawCases: unknown[] } {
  if (format === "json") {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new DatasetValidationError([`not valid JSON: ${(e as Error).message}`]);
    }
    if (Array.isArray(data)) return { header: {}, rawCases: data };
    const obj = data as Record<string, unknown>;
    if (!obj || !Array.isArray(obj.cases)) throw new DatasetValidationError(["JSON must be an object with a `cases` array (or an array of cases)"]);
    const { cases, ...header } = obj;
    return { header, rawCases: cases as unknown[] };
  }
  const rawCases: unknown[] = [];
  let header: Record<string, unknown> = {};
  const problems: string[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    try {
      const v = JSON.parse(line) as Record<string, unknown>;
      if (v && typeof v === "object" && v.dataset && typeof v.dataset === "object" && !("task" in v)) header = v.dataset as Record<string, unknown>;
      else rawCases.push(v);
    } catch (e) {
      problems.push(`line ${i + 1}: not valid JSON (${(e as Error).message})`);
    }
  });
  if (problems.length) throw new DatasetValidationError(problems);
  return { header, rawCases };
}

/**
 * Read and validate a dataset file. Rejects (with every problem listed):
 * invalid JSON, a case with a missing / wrong field, a duplicate id, and a
 * `case_count` that does not match. Exact duplicate content is only a warning.
 * `fallback` names a JSONL file that carries no header line.
 */
export function loadDataset(
  source: string | Buffer,
  format: "json" | "jsonl",
  fallback: { name?: string; version?: string } = {},
): LoadedDataset {
  const text = typeof source === "string" ? source : source.toString("utf8");
  const { header, rawCases } = parseSource(text, format);
  const problems: string[] = [];
  const seen = new Set<string>();
  rawCases.forEach((raw, i) => {
    problems.push(...validateCase(raw, `case #${i + 1}`));
    const id = (raw as { id?: unknown })?.id;
    if (typeof id === "string") {
      if (seen.has(id)) problems.push(`${id}: duplicate id`);
      seen.add(id);
    }
  });
  const name = isStr(header.dataset_name) ? header.dataset_name : fallback.name;
  const version = isStr(header.version) ? header.version : fallback.version;
  if (!name) problems.push("dataset name missing (dataset_name)");
  if (!version) problems.push("dataset version missing (version)");
  else if (!/^[0-9A-Za-z.+-]{1,40}$/.test(version)) problems.push(`version ${JSON.stringify(version)} has unsupported characters`);
  if (header.case_count !== undefined && header.case_count !== rawCases.length) {
    problems.push(`case_count says ${JSON.stringify(header.case_count)} but the file has ${rawCases.length} cases`);
  }
  if (rawCases.length === 0) problems.push("no cases");
  if (problems.length) throw new DatasetValidationError(problems);

  const warnings: string[] = [];
  const byHash = new Map<string, string>();
  const cases: LoadedCase[] = (rawCases as EvalCase[]).map((c) => {
    const seedKey = seedKeyOf(c);
    const contentHash = contentHashOf(c);
    const first = byHash.get(contentHash);
    if (first) warnings.push(`${c.id}: same content as ${first}`);
    else byHash.set(contentHash, c.id);
    return { caseId: c.id, task: c.task, level: c.level, seedKey, split: splitOf(seedKey), contentHash, goldStatus: c.gold_status, payload: c };
  });
  const meta: DatasetMeta = {
    name: name!,
    version: version!,
    languagePair: isStrList(header.language_pair) ? header.language_pair : ["ja", "vi"],
    status: isStr(header.dataset_status) ? header.dataset_status : "unreviewed",
    qualityNotice: isStr(header.quality_notice) ? header.quality_notice : "",
    evaluationPolicy: isStrList(header.evaluation_policy) ? header.evaluation_policy : [],
    caseCount: cases.length,
    checksum: sha256(typeof source === "string" ? Buffer.from(source, "utf8") : source),
  };
  return { meta, cases, warnings };
}

/** `name@version` — the key every stored case and run refers to. */
export const datasetKey = (m: Pick<DatasetMeta, "name" | "version">) => `${m.name}@${m.version}`;

/** Apply a run's filter, in id order. */
export function filterCases<T extends Pick<LoadedCase, "caseId" | "task" | "level" | "split" | "goldStatus" | "contentHash">>(cases: readonly T[], f: CaseFilter): T[] {
  const ids = f.caseIds?.length ? new Set(f.caseIds) : null;
  let out = cases.filter(
    (c) =>
      (!f.tasks?.length || f.tasks.includes(c.task)) &&
      (!f.levels?.length || f.levels.includes(c.level)) &&
      (!f.splits?.length || f.splits.includes(c.split)) &&
      (!f.goldStatus?.length || f.goldStatus.includes(c.goldStatus)) &&
      (!ids || ids.has(c.caseId)),
  );
  out = [...out].sort((a, b) => a.caseId.localeCompare(b.caseId));
  if (f.dedupe) {
    const seen = new Set<string>();
    out = out.filter((c) => (seen.has(c.contentHash) ? false : (seen.add(c.contentHash), true)));
  }
  if (f.perTaskLevel && f.perTaskLevel > 0) {
    const count = new Map<string, number>();
    out = out.filter((c) => {
      const k = `${c.task}|${c.level}`;
      const n = count.get(k) ?? 0;
      count.set(k, n + 1);
      return n < f.perTaskLevel!;
    });
  }
  return out;
}
