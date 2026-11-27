/** Shapes and pure helpers shared by the draft review desk (NP-407). */

export interface ParsedStimulus {
  key: string;
  kind: string;
  title?: string;
  body: string;
  bodyB?: string;
  notes?: string;
}
export interface ParsedQuestion {
  no: number;
  /** The number printed on the paper (55…); `no` is only the position in the block. */
  printedNo?: number;
  prompt: string;
  options: string[];
  stimulusKey?: string;
  /** 聴解: this question's own clip (its own file, or a stretch of the block's). */
  audio?: DraftAudio;
  /** The picture printed with the question, cut from the page (an image id). */
  image?: string;
}
/** A listening clip: an uploaded file and, optionally, the stretch of it to play (seconds). */
export interface DraftAudio {
  assetId: string;
  startSec?: number;
  endSec?: number;
}
export interface Draft {
  _id: string;
  blockIndex: number;
  sitting: string;
  level?: string;
  mondai?: string | null;
  /** Usual number of questions of this 問題 at the paper's level (absent for a practice book). */
  expectedCount?: number;
  /** 聴解: the block's recording (this 問題, or the paper's whole listening part). */
  audio?: DraftAudio | null;
  section: string;
  instruction: string;
  rawText: string;
  pageFrom?: number;
  pageTo?: number;
  parsed?: { stimuli?: ParsedStimulus[]; questions?: ParsedQuestion[] };
  answers: number[];
  issues: string[];
  status: "needs_review" | "error" | "published" | "discarded";
  parsedBy?: "rules" | "ai" | "manual";
}

export const isListening = (mondai?: string | null) => mondai === "listening" || !!mondai?.startsWith("listening-");

/** An option that is only heard (即時応答, 概要理解…) is stored as its own number: show just the number. */
export const isHeardOption = (text: string, i: number) => text.trim() === String(i + 1);

/** What the reviewer sees: a draft still to review is either complete or missing answers. */
export type BlockState = "ready" | "missing" | "error" | "published" | "discarded";

export const STATE_LABEL: Record<BlockState, string> = {
  ready: "Đủ đáp án",
  missing: "Thiếu đáp án",
  error: "Lỗi đọc",
  published: "Đã xuất bản",
  discarded: "Đã loại",
};
/** Text colour per state; fills and borders derive from `currentColor`. */
export const STATE_TEXT: Record<BlockState, string> = {
  ready: "text-[var(--ok)]",
  missing: "text-[var(--warn)]",
  error: "text-[var(--bad)]",
  published: "text-[var(--primary)]",
  discarded: "text-[var(--muted-foreground)]",
};

export const isOpen = (d: Draft) => d.status === "needs_review" || d.status === "error";
export const questionsOf = (d: Draft) => d.parsed?.questions ?? [];
export const missingCount = (d: Draft, answers: number[] | undefined) =>
  questionsOf(d).filter((q) => !((answers?.[q.no - 1] ?? 0) > 0)).length;

/** Every question of the block has a picked answer (and there is at least one question). */
export const isReady = (d: Draft, answers: number[] | undefined) =>
  questionsOf(d).length > 0 && missingCount(d, answers) === 0;

export function stateOf(d: Draft, answers: number[] | undefined): BlockState {
  if (d.status === "published" || d.status === "discarded" || d.status === "error") return d.status;
  return isReady(d, answers) ? "ready" : "missing";
}

export function fillAnswers(d: Draft, answers: number[] | undefined): number[] {
  return Array.from({ length: Math.max(0, ...questionsOf(d).map((q) => q.no)) }, (_, i) => answers?.[i] ?? 0);
}

export async function errorOf(res: Response): Promise<string> {
  const b = (await res.json().catch(() => null)) as { message?: string | string[]; error?: string } | null;
  const m = b?.message ?? b?.error;
  return Array.isArray(m) ? m.join("; ") : (m ?? `Lỗi ${res.status}`);
}

export const deskButton =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--sheet-rule)] bg-[var(--sheet)] px-3 py-1.5 text-sm font-medium text-[var(--sheet-ink)] transition-colors hover:border-[var(--primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-[var(--sheet-rule)]";
export const deskButtonPrimary =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--primary)] px-4 py-1.5 text-sm font-semibold text-[var(--primary-foreground)] transition-colors hover:bg-[var(--primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-45";
