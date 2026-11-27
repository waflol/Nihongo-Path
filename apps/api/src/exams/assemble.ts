import { type QuestionRights } from "../flashcards/schemas/exercise-question.schema.js";
import { JLPT_STRUCTURE, MONDAI_NAME_JA, type JlptPart } from "./jlpt-structure.js";
import { isMondaiType, MONDAI_TYPES, SECTION_OF, type MondaiType, type SectionKey } from "./mondai.js";

/**
 * Assembling an exam from its published import drafts (plan-exam-by-source D2–D5).
 * Pure: the same drafts always give the same exam, so publishing can rebuild it
 * as many times as it likes.
 */

/** The shortest time a part with missing 問題 gets. */
const MIN_PART_MINUTES = 5;

export interface AssembleDraft {
  jobId: string;
  /** When the draft's job was created: of two imports covering the same 問題, the newer one wins. */
  jobCreatedAt: number;
  blockIndex: number;
  mondai?: string | null;
  /** The paper part the importer found the block under — used when `mondai` is unknown. */
  section: string;
  /** The published bank rows, in printed order. */
  questionIds: string[];
  rights: QuestionRights;
}

export interface AssembledSection {
  key: JlptPart["key"];
  title: string;
  timeLimitMin: number;
  /** An admin set the time by hand: rebuilding keeps it. */
  timeLocked?: boolean;
  questions: string[];
}

export interface AssembledExam {
  kind: "full" | "section";
  sections: AssembledSection[];
  /** Every section's questions, in order (what flat-exam code reads). */
  questions: string[];
  rights: QuestionRights;
  /** For the reviewer; never blocks publishing. */
  warnings: string[];
}

const normalizeName = (s: string): string =>
  s.normalize("NFKC").replaceAll("|", " ").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Which exam a sitting belongs to: level + the name of the collection + the
 * sitting. `null` while the set or the sitting has no name — such a paper
 * cannot be told apart from another one.
 */
export function examKeyOf(level: string, setName: string, sitting: string): string | null {
  const set = normalizeName(setName);
  const label = normalizeName(sitting);
  if (!set || !label || label === "unknown") return null;
  return `${level.toUpperCase()}|${set}|${label}`;
}

function structureOf(level: string) {
  const found = JLPT_STRUCTURE.find((s) => s.level === level.toUpperCase());
  if (!found) throw new Error(`Unknown JLPT level: ${level}`);
  return found;
}

const sectionOf = (mondai: MondaiType | null, section: string): SectionKey =>
  mondai ? SECTION_OF[mondai] : (section as SectionKey);

/** The timed part of the level's paper a block belongs to. */
export function partOf(level: string, mondai: string | null | undefined, section: string): JlptPart["key"] {
  const { parts } = structureOf(level);
  const type = isMondaiType(mondai) ? mondai : null;
  const listed = type && parts.find((p) => p.mondai.some((m) => m.mondai === type));
  if (listed) return listed.key;
  // A form this level does not usually print: go by the paper section.
  const wanted = sectionOf(type, section);
  const bySection = parts.find((p) => p.mondai.some((m) => m.section === wanted));
  return (bySection ?? parts[0]).key;
}

/** Where a block sits inside its part: the printed 問題 order of the level. */
function rankIn(part: JlptPart, mondai: MondaiType | null, section: string): number {
  const listed = part.mondai.findIndex((m) => m.mondai === mondai);
  if (listed >= 0) return listed;
  if (mondai) {
    const at = MONDAI_TYPES.indexOf(mondai);
    return part.mondai.filter((m) => MONDAI_TYPES.indexOf(m.mondai) < at).length - 0.5;
  }
  const last = part.mondai.findLastIndex((m) => m.section === section);
  return last >= 0 ? last + 0.5 : part.mondai.length;
}

/** The blocks that count: per 問題, only the newest job's. */
function newestPerMondai(drafts: AssembleDraft[]): AssembleDraft[] {
  const slotOf = (d: AssembleDraft) => (isMondaiType(d.mondai) ? d.mondai : `?${d.section}`);
  const winners = new Map<string, AssembleDraft>();
  for (const d of drafts) {
    const best = winners.get(slotOf(d));
    if (!best || d.jobCreatedAt > best.jobCreatedAt || (d.jobCreatedAt === best.jobCreatedAt && d.jobId > best.jobId)) {
      winners.set(slotOf(d), d);
    }
  }
  return drafts.filter((d) => winners.get(slotOf(d))!.jobId === d.jobId);
}

function weakestRights(rights: QuestionRights[]): QuestionRights {
  if (rights.length === 0 || rights.includes("reference")) return "reference";
  return rights.includes("licensed") ? "licensed" : "own";
}

export function assembleExam(
  level: string,
  drafts: AssembleDraft[],
  previous: Pick<AssembledSection, "key" | "timeLimitMin" | "timeLocked">[] = [],
): AssembledExam {
  const { parts } = structureOf(level);
  const used = newestPerMondai(drafts.filter((d) => d.questionIds.length > 0));

  const sections: AssembledSection[] = [];
  const warnings: string[] = [];
  const taken = new Set<string>();
  let complete = true;

  for (const part of parts) {
    const blocks = used
      .filter((d) => partOf(level, d.mondai, d.section) === part.key)
      .map((d) => ({ d, mondai: isMondaiType(d.mondai) ? d.mondai : null }))
      .sort(
        (a, b) =>
          rankIn(part, a.mondai, a.d.section) - rankIn(part, b.mondai, b.d.section) ||
          a.d.jobCreatedAt - b.d.jobCreatedAt ||
          a.d.blockIndex - b.d.blockIndex,
      );
    const questions: string[] = [];
    for (const { d } of blocks) {
      for (const id of d.questionIds) {
        if (taken.has(id)) continue;
        taken.add(id);
        questions.push(id);
      }
    }
    if (questions.length === 0) {
      complete = false;
      warnings.push(`Chưa có phần ${part.titleJa}`);
      continue;
    }

    // N1/N2 print 文字・語彙, 文法 and 読解 as ONE timed part: it is only whole with all three.
    const have = new Set(blocks.map(({ d, mondai }) => sectionOf(mondai, d.section)));
    if (part.mondai.some((m) => !have.has(m.section))) complete = false;

    let missing = false;
    for (const m of part.mondai) {
      const count = blocks.filter((b) => b.mondai === m.mondai).reduce((n, b) => n + b.d.questionIds.length, 0);
      if (count === 0) missing = true;
      if (count < m.count) {
        warnings.push(`${part.titleJa} · ${MONDAI_NAME_JA[m.mondai]}: ${count}/${m.count} câu (số câu thường gặp)`);
      }
    }

    const kept = previous.find((s) => s.key === part.key && s.timeLocked);
    const share = Math.ceil((part.timeMin * questions.length) / part.questions);
    sections.push({
      key: part.key,
      title: part.titleJa,
      timeLimitMin: kept?.timeLimitMin ?? (missing ? Math.min(part.timeMin, Math.max(MIN_PART_MINUTES, share)) : part.timeMin),
      ...(kept ? { timeLocked: true } : {}),
      questions,
    });
  }

  return {
    kind: complete ? "full" : "section",
    sections,
    questions: sections.flatMap((s) => s.questions),
    rights: weakestRights(used.map((d) => d.rights)),
    warnings,
  };
}
