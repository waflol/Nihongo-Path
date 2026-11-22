import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import { MONDAI_TYPES, type MondaiType } from "../mondai.js";
import {
  QUESTION_RIGHTS,
  type QuestionRights,
} from "../../flashcards/schemas/exercise-question.schema.js";

/** The shape of a shared reading text (NP-406 / plan §5.3). */
export const STIMULUS_KINDS = ["passage", "cloze", "notice", "pair"] as const;
export type StimulusKind = (typeof STIMULUS_KINDS)[number];

/**
 * One shared reading text / cloze / notice (`exam_stimuli`) that a group of
 * bank questions point at (NP-406). A stimulus is the **unit of drawing** when
 * an exam is generated: the whole passage is picked, and its questions come
 * with it in `groupOrder` — a reading is never split across two sittings.
 *
 * `questionCount` must match the number of bank questions whose `stimulus`
 * points here; the generator filters on it (plan §5.3).
 */
@Schema({ _id: true, timestamps: true, collection: "exam_stimuli" })
export class ExamStimulus {
  @Prop({ type: String, trim: true, default: "" })
  level?: string;

  @Prop({ type: String, enum: MONDAI_TYPES, required: true })
  mondai: MondaiType;

  /** The paper part (`vocab` / `grammar` / `reading` / `listening`). */
  @Prop({ type: String, required: true })
  section: string;

  @Prop({ type: String, enum: STIMULUS_KINDS, required: true })
  kind: StimulusKind;

  /** A short label (e.g. a title from the paper, or an admin note). */
  @Prop({ type: String, trim: true })
  title?: string;

  /** Simple markdown; a cloze keeps its `[1]`…`[n]` blank markers. */
  @Prop({ type: String, required: true })
  body: string;

  /** Second passage, for a `pair` (reading-integrated AとB). */
  @Prop({ type: String })
  bodyB?: string;

  /** A `(注)` annotation block, when the paper has one. */
  @Prop({ type: String })
  notes?: string;

  /** A table-style notice may carry an image; empty when media is pending (P6). */
  @Prop({ type: String })
  imageUrl?: string;

  /** Listening clip shared by the whole group (NP-410). */
  @Prop({ type: Object })
  audio?: { assetId: string; startSec?: number; endSec?: number } | null;

  /** How many bank questions attach to this passage — the generator matches on it. */
  @Prop({ type: Number, required: true })
  questionCount: number;

  // ── Provenance (NP-406) ───────────────────────────────────────────
  @Prop({ type: String, enum: QUESTION_RIGHTS, default: "own" })
  rights: QuestionRights;

  @Prop({ type: Object })
  sourceRef?: { file: string; sitting?: string; no?: string } | null;

  /** Duplicate fingerprint (sha1 of body + bodyB) — cross-source dedup. */
  @Prop({ type: String, index: { unique: true, sparse: true } })
  contentHash?: string;

  @Prop({ type: String, required: true })
  createdBy: string;

  createdAt: Date;
  updatedAt: Date;
}

export type ExamStimulusDocument = HydratedDocument<ExamStimulus>;

export const ExamStimulusSchema = SchemaFactory.createForClass(ExamStimulus);
// The generator draws whole passages by level / type / rights + size.
ExamStimulusSchema.index({ level: 1, mondai: 1, rights: 1, questionCount: 1 });
