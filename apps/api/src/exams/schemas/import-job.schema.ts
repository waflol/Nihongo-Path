import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export const EXAM_IMPORT_JOB_STATUSES = ["running", "done", "error", "cancelled"] as const;

/**
 * A background JLPT exam-PDF import job (NP-407). Persisted so the progress
 * and every page already read survive an API restart; the PDF bytes are NOT
 * stored (4 GB VPS, plan §10 — pages checkpoint instead). Each page yields a
 * plain text layer (or a vision-OCR read of a scan) that is cleaned +
 * segmented into 問題 blocks, and each block becomes an `exam_import_drafts`
 * row for the admin to review.
 */
@Schema({ collection: "exam_import_jobs", timestamps: true })
export class ExamImportJob {
  @Prop({ type: String, required: true, index: 1 })
  user: string;

  @Prop({ type: String, required: true })
  fileName: string;

  /** The declared JLPT level (N1…N5) the import targets. */
  @Prop({ type: String, required: true })
  level: string;

  /** Content rights of the imported material (default `reference`, Q-12). */
  @Prop({ type: String, default: "reference" })
  rights: string;

  @Prop({ type: Number, required: true })
  numPages: number;

  @Prop({ type: Number, default: 0 })
  pagesDone: number;

  @Prop({ type: Number, default: 0 })
  blocksFound: number;

  @Prop({ type: Number, default: 0 })
  blocksOk: number;

  @Prop({ type: Number, default: 0 })
  blocksError: number;

  @Prop({ type: String, enum: EXAM_IMPORT_JOB_STATUSES, default: "running", index: 1 })
  status: string;

  @Prop({ type: String })
  error?: string;

  /** What the job is doing now: `reading` pages → `structuring` blocks. */
  @Prop({ type: String, default: "reading" })
  phase: string;

  /** Capped event log (newest last) for the admin to check what happened. */
  @Prop({ type: [Object], default: [] })
  log: { at: Date; level: "info" | "warn" | "error"; msg: string }[];

  @Prop({ type: Date })
  finishedAt?: Date;

  declare createdAt?: Date;
}
export type ExamImportJobDocument = HydratedDocument<ExamImportJob>;
export const ExamImportJobSchema = SchemaFactory.createForClass(ExamImportJob);

/**
 * What one page of a job yielded — written the moment the page is read, so a
 * restart re-reads only the pages still missing (never the whole PDF again).
 */
@Schema({ collection: "exam_import_job_pages", timestamps: true })
export class ExamImportJobPage {
  @Prop({ type: String, required: true })
  job: string;

  /** 1-based PDF page number. */
  @Prop({ type: Number, required: true })
  n: number;

  /** The page's text (text layer, or the vision-OCR read). */
  @Prop({ type: String, default: "" })
  text: string;

  /** `text` came from the embedded layer; `ocr` = read off a rendered image. */
  @Prop({ type: String, enum: ["text", "ocr"], default: "text" })
  source: string;

  /** 1-based block numbers that started on this page (for review linking). */
  @Prop({ type: [Number], default: [] })
  blocks: number[];

  declare createdAt?: Date;
}
export type ExamImportJobPageDocument = HydratedDocument<ExamImportJobPage>;
export const ExamImportJobPageSchema = SchemaFactory.createForClass(ExamImportJobPage);
ExamImportJobPageSchema.index({ job: 1, n: 1 }, { unique: true });
