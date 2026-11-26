import { createHash } from "node:crypto";

export interface ImportedGrammarExample {
  sentence: string;
  translation: string;
  note?: string;
}

export interface ImportedGrammarPoint {
  sourceKey: string;
  sourceProvider: string;
  sourceUrl?: string;
  sourceVersion?: string;
  sourceHash: string;
  label: string;
  meaning: string;
  pattern?: string;
  coreExplanation?: string;
  forms: string[];
  explanations: string[];
  notes: string[];
  compareWith: { grammarId?: string; label: string; note?: string }[];
  senses: { no: number; label?: string; explanation?: string; examples: ImportedGrammarExample[] }[];
  examples: ImportedGrammarExample[];
  level?: string;
  groupNo?: number;
  groupJa?: string;
  groupVi?: string;
  themeIds: string[];
  contextIds: string[];
  textbookRefs: { textbookId: string; unitId: string; order?: number }[];
  tags: string[];
}

export interface SuperHonkiSource {
  level: string;
  groups?: { n: number; ja?: string; vi?: string }[];
  pats: Record<string, unknown>[];
}

/** Parse only the documented SB.register({...}) wrapper; never execute source code. */
export function parseRegisteredJson(source: string): unknown {
  const trimmed = source.replace(/^﻿/, "").trim();
  const match = /^SB\.register\((\{[\s\S]*\})\);?$/.exec(trimmed);
  if (!match) throw new Error("Unsupported grammar source wrapper");
  return JSON.parse(match[1]);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function examples(value: unknown): ImportedGrammarExample[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const sentence = stringValue(row.ja);
    if (!sentence) return [];
    return [{ sentence, translation: stringValue(row.vi), note: stringValue(row.note) || undefined }];
  });
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean) : [];
}

/** `theme` / `ctx` arrive as string arrays; a bare string is tolerated. */
function ids(value: unknown): string[] {
  return typeof value === "string" ? arrayOfStrings([value]) : arrayOfStrings(value);
}

/** `book` arrives as `[[textbookId, unitId, order], …]`. */
function textbookRefs(value: unknown): ImportedGrammarPoint["textbookRefs"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!Array.isArray(row)) return [];
    const textbookId = stringValue(row[0]);
    const unitId = stringValue(row[1]);
    if (!textbookId || !unitId) return [];
    const order = typeof row[2] === "number" ? row[2] : undefined;
    return [{ textbookId, unitId, order }];
  });
}

/** `cmp` lists look-alike patterns: `{ id, pat, desc }`; `id` is a source key. */
function comparisons(value: unknown): ImportedGrammarPoint["compareWith"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const row = raw as Record<string, unknown>;
    const label = stringValue(row.pat);
    if (!label) return [];
    return [{ grammarId: stringValue(row.id) || undefined, label, note: stringValue(row.desc) || undefined }];
  });
}

/** Map one Super Honki pattern into the storage-neutral import shape. */
export function mapSuperHonkiPattern(
  pattern: Record<string, unknown>,
  source: { level: string; hash: string; version?: string; url?: string },
): ImportedGrammarPoint {
  const id = stringValue(pattern.id);
  if (!id) throw new Error("Grammar pattern has no id");
  const senses = Array.isArray(pattern.senses) ? pattern.senses.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const row = raw as Record<string, unknown>;
    return [{ no: Number(row.n) || index + 1, label: stringValue(row.label) || undefined, explanation: stringValue(row.exp) || undefined, examples: examples(row.ex) }];
  }) : [];
  return {
    sourceKey: id,
    sourceProvider: "superhonki",
    sourceUrl: source.url,
    sourceVersion: source.version,
    sourceHash: source.hash,
    label: stringValue(pattern.pat),
    meaning: stringValue(pattern.mean),
    pattern: stringValue(pattern.pat),
    coreExplanation: stringValue(pattern.core) || undefined,
    forms: arrayOfStrings(pattern.form),
    explanations: arrayOfStrings(pattern.exp),
    notes: arrayOfStrings(pattern.note),
    compareWith: comparisons(pattern.cmp),
    senses,
    examples: senses.flatMap((sense) => sense.examples),
    level: (stringValue(pattern.lv) || source.level).toUpperCase(),
    groupNo: Number(pattern.g) || undefined,
    themeIds: ids(pattern.theme),
    contextIds: ids(pattern.ctx),
    textbookRefs: textbookRefs(pattern.book),
    tags: [],
  };
}

export function mapSuperHonkiSource(sourceText: string, version?: string): ImportedGrammarPoint[] {
  const parsed = parseRegisteredJson(sourceText) as SuperHonkiSource;
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.pats)) throw new Error("Invalid grammar source payload");
  if (parsed.pats.length > 1000) throw new Error("Grammar source contains too many patterns");
  const hash = createHash("sha256").update(sourceText).digest("hex");
  const groups = new Map(
    (Array.isArray(parsed.groups) ? parsed.groups : []).map((g) => [Number(g.n), g]),
  );
  return parsed.pats.map((pattern) => {
    const point = mapSuperHonkiPattern(pattern, { level: stringValue(parsed.level), hash, version });
    const group = groups.get(point.groupNo ?? NaN);
    if (!group) return point;
    return { ...point, groupJa: stringValue(group.ja) || undefined, groupVi: stringValue(group.vi) || undefined };
  });
}
