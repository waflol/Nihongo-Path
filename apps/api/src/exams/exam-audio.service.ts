import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { createHash } from "node:crypto";
import { mkdir, writeFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Model, isValidObjectId } from "mongoose";
import type { AuthUser } from "../auth/auth.types.js";
import { ExerciseQuestion, type ExerciseQuestionDocument } from "../flashcards/schemas/exercise-question.schema.js";
import { ExamAudioAsset, type ExamAudioAssetDocument, type AudioRef } from "./schemas/audio-asset.schema.js";
import { ExamStimulus, type ExamStimulusDocument } from "./schemas/stimulus.schema.js";

/** An uploaded clip as the admin sees it. */
export interface AudioAssetView {
  _id: string;
  fileName: string;
  mime: string;
  size: number;
  level?: string;
  label?: string;
  duplicate: boolean;
}

export const MAX_AUDIO_BYTES = 40 * 1024 * 1024;

/** Sniff the container from the bytes — never trust the client's MIME. */
export function sniffAudio(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length < 12) return null;
  if (buf.subarray(0, 3).toString("latin1") === "ID3" || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) {
    return { mime: "audio/mpeg", ext: "mp3" };
  }
  if (buf.subarray(4, 8).toString("latin1") === "ftyp") return { mime: "audio/mp4", ext: "m4a" };
  if (buf.subarray(0, 4).toString("latin1") === "OggS") return { mime: "audio/ogg", ext: "ogg" };
  return null;
}

/** A well-formed `[start, end]` stretch: non-negative, finite, end after start. */
export function checkRange(startSec?: number, endSec?: number): void {
  const ok = (n: number | undefined) => n === undefined || (Number.isFinite(n) && n >= 0 && n <= 6 * 3600);
  if (!ok(startSec) || !ok(endSec)) throw new BadRequestException("startSec/endSec không hợp lệ");
  if (startSec !== undefined && endSec !== undefined && endSec <= startSec) {
    throw new BadRequestException("endSec phải lớn hơn startSec");
  }
}

/** Listening clips of the exam bank: upload, serve, and attach to a question / passage. */
@Injectable()
export class ExamAudioService {
  private readonly dir = resolve(process.env.EXAM_AUDIO_DIR?.trim() || join(process.cwd(), "storage", "exam-audio"));

  constructor(
    @InjectModel(ExamAudioAsset.name) private readonly assets: Model<ExamAudioAssetDocument>,
    @InjectModel(ExerciseQuestion.name) private readonly bank: Model<ExerciseQuestionDocument>,
    @InjectModel(ExamStimulus.name) private readonly stimuli: Model<ExamStimulusDocument>,
  ) {}

  async upload(caller: AuthUser, file: { originalname: string; buffer: Buffer }, meta: { level?: string; label?: string }): Promise<AudioAssetView> {
    if (file.buffer.length > MAX_AUDIO_BYTES) throw new UnprocessableEntityException("File âm thanh quá lớn (tối đa 40 MB)");
    const kind = sniffAudio(file.buffer);
    if (!kind) throw new UnprocessableEntityException("Chỉ nhận mp3 / m4a / ogg");
    const sha256 = createHash("sha256").update(file.buffer).digest("hex");
    const existing = await this.assets.findOne({ sha256 }).lean().exec();
    const view = (a: { _id: unknown; fileName: string; mime: string; size: number; level?: string; label?: string }, duplicate: boolean): AudioAssetView => ({
      _id: String(a._id),
      fileName: a.fileName,
      mime: a.mime,
      size: a.size,
      level: a.level,
      label: a.label,
      duplicate,
    });
    if (existing) return view(existing, true);
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, `${sha256}.${kind.ext}`), file.buffer);
    const doc = await this.assets.create({
      fileName: file.originalname.slice(0, 200),
      mime: kind.mime,
      size: file.buffer.length,
      sha256,
      ext: kind.ext,
      level: meta.level ?? "",
      label: (meta.label ?? "").slice(0, 200),
      uploadedBy: caller.sub,
    });
    return view(doc, false);
  }

  list(): Promise<unknown[]> {
    return this.assets.find().sort({ createdAt: -1 }).limit(200).lean().exec();
  }

  /** The on-disk file for streaming (Express `sendFile` adds Range support). */
  async fileOf(id: string): Promise<{ path: string; mime: string }> {
    if (!isValidObjectId(id)) throw new NotFoundException("Audio not found");
    const a = await this.assets.findById(id).lean().exec();
    if (!a) throw new NotFoundException("Audio not found");
    const path = join(this.dir, `${a.sha256}.${a.ext}`);
    await access(path).catch(() => {
      throw new NotFoundException("File âm thanh đã mất trên máy chủ");
    });
    return { path, mime: a.mime };
  }

  /**
   * Point a question or a shared passage at a clip (or clear it with
   * `assetId: null`). The stretch [startSec, endSec] cuts one question out
   * of a long 聴解 track.
   */
  async attach(
    target: "question" | "stimulus",
    id: string,
    body: { assetId: string | null; startSec?: number; endSec?: number },
  ): Promise<{ audio: AudioRef | null }> {
    if (!isValidObjectId(id)) throw new BadRequestException("id không hợp lệ");
    checkRange(body.startSec, body.endSec);
    let audio: AudioRef | null = null;
    if (body.assetId) {
      if (!isValidObjectId(body.assetId) || !(await this.assets.exists({ _id: body.assetId }))) {
        throw new NotFoundException("Audio not found");
      }
      audio = { assetId: body.assetId };
      if (body.startSec !== undefined) audio.startSec = body.startSec;
      if (body.endSec !== undefined) audio.endSec = body.endSec;
    }
    const model = (target === "question" ? this.bank : this.stimuli) as Model<ExerciseQuestionDocument | ExamStimulusDocument>;
    const r = await model.updateOne({ _id: id }, audio ? { $set: { audio } } : { $unset: { audio: 1 } }).exec();
    if (r.matchedCount === 0) throw new NotFoundException(target === "question" ? "Question not found" : "Stimulus not found");
    return { audio };
  }
}
