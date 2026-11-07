import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema } from "mongoose";

export const PDF_JOB_STATUSES = ["running", "done", "error"] as const;

/**
 * A background PDF reading job. Persisted so the progress (and every page
 * already read) survives an API restart; the PDF itself lives on disk.
 */
@Schema({ collection: "pdfjobs", timestamps: true })
export class PdfJobRecord {
  @Prop({ type: String, required: true, index: true }) user: string;
  @Prop({ type: String, required: true }) deck: string;
  @Prop({ type: String, required: true }) fileName: string;
  /** sha256 of the file = key of the parsed table cache. */
  @Prop({ type: String, required: true }) key: string;
  @Prop({ type: String, default: "" }) filePath: string;
  /** Table files read from a PDF: the PDF page each review block shows. */
  @Prop({ type: [Number], default: undefined }) pageMap?: number[];
  /** `pdf`: scanned PDF read page by page (with page images); `table`: any other file, rows grouped in blocks. */
  @Prop({ type: String, enum: ["pdf", "table"], default: "pdf" }) kind: string;
  /** A review made at preview time, not yet confirmed: only its author sees it. */
  @Prop({ type: Boolean, default: false }) draft: boolean;
  /** Table files: the original column names, in file order. */
  @Prop({ type: [String], default: undefined }) columns?: string[];
  @Prop({ type: String, enum: PDF_JOB_STATUSES, default: "running", index: true }) status: string;
  @Prop({ type: Number, default: 0 }) done: number;
  @Prop({ type: Number, default: 0 }) total: number;
  @Prop({ type: Number }) rows?: number;
  @Prop({ type: String }) error?: string;
  @Prop({ type: Date }) finishedAt?: Date;
  /** Per-page summary (rows, ok, lost kanji) once the job is done. */
  @Prop({ type: MongooseSchema.Types.Mixed }) pages?: unknown;
  /** Pages being read again in the background (remaining queue + progress). */
  @Prop({ type: MongooseSchema.Types.Mixed }) retry?: unknown;
  /** Rows the last confirmed import rejected (row, card no., front/back, reason). */
  @Prop({ type: MongooseSchema.Types.Mixed }) importErrors?: unknown;
  declare createdAt?: Date;
}
export type PdfJobRecordDocument = HydratedDocument<PdfJobRecord>;
export const PdfJobRecordSchema = SchemaFactory.createForClass(PdfJobRecord);

/** What one page of a job yielded — written the moment the page is read. */
@Schema({ collection: "pdfjobpages", timestamps: true })
export class PdfJobPage {
  @Prop({ type: String, required: true }) job: string;
  @Prop({ type: Number, required: true }) n: number;
  @Prop({ type: MongooseSchema.Types.Mixed, required: true }) rows: unknown;
  /** Table files: the block's rows exactly as in the file (column name → cell). */
  @Prop({ type: MongooseSchema.Types.Mixed }) raw?: unknown;
}
export type PdfJobPageDocument = HydratedDocument<PdfJobPage>;
export const PdfJobPageSchema = SchemaFactory.createForClass(PdfJobPage);
PdfJobPageSchema.index({ job: 1, n: 1 }, { unique: true });
