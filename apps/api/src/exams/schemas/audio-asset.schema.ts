import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

/**
 * A listening clip (`exam_audio_assets`). One file may serve many questions
 * (a whole 聴解 track cut by `startSec`/`endSec`), or one question each — a
 * question / passage only stores an `AudioRef` to it. The bytes live on local
 * disk (`EXAM_AUDIO_DIR`), named by their sha256 so the same file is stored
 * once; the media phase (P6) can swap the storage without touching the refs.
 */
@Schema({ collection: "exam_audio_assets", timestamps: true })
export class ExamAudioAsset {
  @Prop({ type: String, required: true })
  fileName: string;

  @Prop({ type: String, required: true })
  mime: string;

  @Prop({ type: Number, required: true })
  size: number;

  /** sha256 of the bytes — also the on-disk file name; unique (dedup). */
  @Prop({ type: String, required: true, unique: true })
  sha256: string;

  /** File extension on disk (`mp3` / `m4a` / `ogg`). */
  @Prop({ type: String, required: true })
  ext: string;

  @Prop({ type: String, default: "" })
  level?: string;

  /** Free label, e.g. "N3 7/2010 — 聴解". */
  @Prop({ type: String, default: "" })
  label?: string;

  @Prop({ type: String, required: true })
  uploadedBy: string;

  declare createdAt?: Date;
}
export type ExamAudioAssetDocument = HydratedDocument<ExamAudioAsset>;
export const ExamAudioAssetSchema = SchemaFactory.createForClass(ExamAudioAsset);

/** A question's / passage's listening clip: which asset, and which stretch of it. */
export interface AudioRef {
  assetId: string;
  /** Start offset in seconds (default 0). */
  startSec?: number;
  /** End offset in seconds (default: to the end of the file). */
  endSec?: number;
}
