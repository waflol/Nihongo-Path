import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import {
  QUESTION_RIGHTS,
  type QuestionRights,
} from "../../flashcards/schemas/exercise-question.schema.js";
import { type MondaiType } from "../mondai.js";
import {
  type ParsedBlock,
} from "../import/structure.js";

/**
 * The states of an import draft (NP-407 / plan §6 GĐ2). A PDF is NEVER
 * published automatically: `needs_review` → an admin edits + picks the
 * answers → `published`; an unreadable block is `error` (kept, shown to the
 * reviewer); a rejected block is `discarded`.
 */
export const IMPORT_DRAFT_STATUSES = ["needs_review", "error", "published", "discarded"] as const;
export type ImportDraftStatus = (typeof IMPORT_DRAFT_STATUSES)[number];

/**
 * One 問題 block, parsed out of an imported exam PDF (`exam_import_drafts`).
 * The raw block is kept verbatim next to the AI's JSON so a reviewer can see
 * exactly what the model was given and what it produced (plan §11: the AI
 * must not be allowed to invent content — `issues` lists every such flag).
 *
 * Answers are filled in by the HUMAN at review time (`answers`), never by the
 * AI — so a published question is only ever `verified` against a key a person
 * read.
 */
@Schema({ _id: true, timestamps: true, collection: "exam_import_drafts" })
export class ExamImportDraft {
  /** The import job this draft came from. */
  @Prop({ type: String, required: true, index: 1 })
  jobId: string;

  /**
   * The block's position in the segmented paper (0-based). Makes re-running a
   * job idempotent: a block already drafted is skipped, never re-structured.
   */
  @Prop({ type: Number, default: 0, index: 1 })
  blockIndex: number;

  /** The source file name (e.g. `De_Chinh_Thuc_N3.pdf`). */
  @Prop({ type: String, required: true })
  file: string;

  /** The JLPT level the import was declared for. */
  @Prop({ type: String, required: true })
  level: string;

  /** The sitting label the block was found under (e.g. `2010-07`, `Migii 616`). */
  @Prop({ type: String, default: "unknown" })
  sitting: string;

  /** The classified 問題 type; `null` when the form was unrecognised. */
  @Prop({ type: String })
  mondai?: MondaiType | null;

  /** The paper part (`vocab` / `grammar` / `reading` / `listening`). */
  @Prop({ type: String, default: "vocab" })
  section: string;

  /** The 問題's instruction line(s), as printed. */
  @Prop({ type: String, default: "" })
  instruction: string;

  /** The block's raw text (cleaned) — the reviewer's ground truth. */
  @Prop({ type: String, default: "" })
  rawText: string;

  /** The AI-parsed shape (stimuli + questions). */
  @Prop({ type: Object })
  parsed?: ParsedBlock;

  /**
   * The human's answers, 1-based question position → option number (1..4).
   * `0` = still unknown (Mongoose `[Number]` arrays silently drop `null`, so
   * zero is the "no answer" sentinel). A draft cannot be published until every
   * question has a non-zero answer.
   */
  @Prop({ type: [Number], default: [] })
  answers: number[];

  /** How `parsed` was produced: `rules` (read exactly from the layout) or `ai`. */
  @Prop({ type: String, enum: ["rules", "ai"] })
  parsedBy?: "rules" | "ai";

  /** Validation issues (why this block is `error`). */
  @Prop({ type: [String], default: [] })
  issues: string[];

  @Prop({ type: String, enum: IMPORT_DRAFT_STATUSES, default: "needs_review", index: 1 })
  status: ImportDraftStatus;

  /** Content rights — imported material defaults to `reference` (Q-12). */
  @Prop({ type: String, enum: QUESTION_RIGHTS, default: "reference" })
  rights: QuestionRights;

  @Prop({ type: String, required: true })
  createdBy: string;

  createdAt: Date;
  updatedAt: Date;
}

export type ExamImportDraftDocument = HydratedDocument<ExamImportDraft>;

export const ExamImportDraftSchema = SchemaFactory.createForClass(ExamImportDraft);
// The admin review screen lists a job's blocks, by status.
ExamImportDraftSchema.index({ jobId: 1, status: 1 });
ExamImportDraftSchema.index({ file: 1, sitting: 1, mondai: 1 });
