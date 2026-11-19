import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import type { AuthUser } from "../auth/auth.types.js";
import {
  ExerciseQuestion,
  type ExerciseQuestionDocument,
} from "../flashcards/schemas/exercise-question.schema.js";
import {
  ExamStimulus,
  type ExamStimulusDocument,
  STIMULUS_KINDS,
} from "./schemas/stimulus.schema.js";
import { contentHashOf, isMondaiType } from "./mondai.js";

/**
 * Admin CRUD for the shared-reading collection `exam_stimuli` (NP-406).
 * A stimulus is a passage/cloze/notice a group of bank questions points at;
 * its `questionCount` is kept consistent with the live rows so the generator
 * (NP-408) can draw whole passages of a known size.
 */
@Injectable()
export class StimuliService {
  constructor(
    @InjectModel(ExamStimulus.name)
    private readonly stimuli: Model<ExamStimulusDocument>,
    @InjectModel(ExerciseQuestion.name)
    private readonly bank: Model<ExerciseQuestionDocument>,
  ) {}

  /** Count of live bank questions pointing at a set of stimulus ids. */
  private async linkedCounts(ids: string[]): Promise<Map<string, number>> {
    const rows = await this.bank
      .find({ stimulus: { $in: ids.map((id) => new Types.ObjectId(id)) } }, { stimulus: 1 })
      .lean()
      .exec();
    const counts = new Map<string, number>();
    for (const r of rows) {
      const k = String(r.stimulus);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return counts;
  }

  /** List passages (?level, ?mondai, ?limit), with their live question counts. */
  async list(query: { level?: string; mondai?: string; limit?: number }) {
    const filter: Record<string, unknown> = {};
    if (query.level) filter.level = query.level;
    if (query.mondai && isMondaiType(query.mondai)) filter.mondai = query.mondai;
    const limit = Math.max(1, Math.min(query.limit ?? 200, 500));
    const rows = await this.stimuli.find(filter).sort({ createdAt: -1 }).limit(limit).lean().exec();
    const counts = await this.linkedCounts(rows.map((r) => String(r._id)));
    return rows.map((r) => ({
      _id: String(r._id),
      level: r.level || undefined,
      mondai: r.mondai,
      section: r.section,
      kind: r.kind,
      title: r.title || undefined,
      questionCount: r.questionCount,
      liveQuestionCount: counts.get(String(r._id)) ?? 0,
      rights: r.rights,
      sourceRef: r.sourceRef,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
    }));
  }

  /** One passage, full body — admin review only (the sit payload serves it answer-free). */
  async get(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException("Stimulus not found");
    const doc = await this.stimuli.findById(id).lean().exec();
    if (!doc) throw new NotFoundException("Stimulus not found");
    const counts = await this.linkedCounts([id]);
    return {
      _id: String(doc._id),
      level: doc.level || undefined,
      mondai: doc.mondai,
      section: doc.section,
      kind: doc.kind,
      title: doc.title || undefined,
      body: doc.body,
      bodyB: doc.bodyB || undefined,
      notes: doc.notes || undefined,
      imageUrl: doc.imageUrl || undefined,
      questionCount: doc.questionCount,
      liveQuestionCount: counts.get(id) ?? 0,
      rights: doc.rights,
      sourceRef: doc.sourceRef ?? null,
      contentHash: doc.contentHash || undefined,
      createdBy: doc.createdBy,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async create(caller: AuthUser, input: {
    level?: string;
    mondai?: string;
    section: string;
    kind: string;
    title?: string;
    body: string;
    bodyB?: string;
    notes?: string;
    imageUrl?: string;
    questionCount: number;
    rights?: string;
    sourceRef?: { file: string; sitting?: string; no?: string };
  }) {
    this.validate(input);
    const doc = await this.stimuli.create({
      level: String(input.level ?? "").slice(0, 8) || undefined,
      mondai: input.mondai,
      section: input.section,
      kind: input.kind,
      title: String(input.title ?? "").trim().slice(0, 200) || undefined,
      body: String(input.body).slice(0, 20_000),
      bodyB: String(input.bodyB ?? "").slice(0, 20_000) || undefined,
      notes: String(input.notes ?? "").slice(0, 4_000) || undefined,
      imageUrl: String(input.imageUrl ?? "").slice(0, 1_000) || undefined,
      questionCount: input.questionCount,
      rights: input.rights ?? "own",
      sourceRef: input.sourceRef ?? null,
      contentHash: contentHashOf(input.body, [input.bodyB ?? ""]),
      createdBy: caller.sub,
    });
    return { id: String(doc._id), saved: true };
  }

  /**
   * Edit a passage. When `body`/`bodyB` change the `contentHash` is recomputed
   * (a duplicate contentHash never overwrites an existing different row —
   * Mongo's unique sparse index rejects it, reported as 409-like 400).
   */
  async update(caller: AuthUser, id: string, input: Partial<{
    level?: string;
    mondai?: string;
    section: string;
    kind: string;
    title?: string;
    body: string;
    bodyB?: string;
    notes?: string;
    imageUrl?: string;
    questionCount: number;
    rights?: string;
    sourceRef?: { file: string; sitting?: string; no?: string };
  }>) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException("Stimulus not found");
    const doc = await this.stimuli.findById(id).lean().exec();
    if (!doc) throw new NotFoundException("Stimulus not found");
    const next = { ...doc, ...input };
    this.validate(next);
    const set: Record<string, unknown> = {
      level: String(next.level ?? "").slice(0, 8) || undefined,
      mondai: next.mondai,
      section: next.section,
      kind: next.kind,
      title: String(next.title ?? "").trim().slice(0, 200) || undefined,
      body: String(next.body).slice(0, 20_000),
      bodyB: String(next.bodyB ?? "").slice(0, 20_000) || undefined,
      notes: String(next.notes ?? "").slice(0, 4_000) || undefined,
      imageUrl: String(next.imageUrl ?? "").slice(0, 1_000) || undefined,
      questionCount: next.questionCount,
      rights: next.rights ?? "own",
      sourceRef: next.sourceRef ?? null,
    };
    try {
      if (next.body !== doc.body || next.bodyB !== doc.bodyB) {
        set.contentHash = contentHashOf(next.body, [next.bodyB ?? ""]);
      }
      await this.stimuli.updateOne({ _id: doc._id }, { $set: set }).exec();
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw new BadRequestException("Nội dung trùng với một bài đọc khác (contentHash)");
      }
      throw err;
    }
    return { id, saved: true };
  }

  /**
   * Delete a passage. The live bank questions pointing at it are NOT deleted
   * (they become orphaned and the generator drops them by count) — the caller
   * is told how many, and `hard` optionally clears their `stimulus` ref.
   */
  async remove(id: string, hard = false) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException("Stimulus not found");
    const res = await this.stimuli.deleteOne({ _id: new Types.ObjectId(id) }).exec();
    if (res.deletedCount === 0) throw new NotFoundException("Stimulus not found");
    let linked = 0;
    if (hard) {
      linked = await this.countLinked(id);
      await this.bank.updateMany({ stimulus: new Types.ObjectId(id) }, { $set: { stimulus: null } }).exec();
    }
    return { id, deleted: true, linkedQuestions: hard ? linked : await this.countLinked(id) };
  }

  private async countLinked(id: string): Promise<number> {
    const n = await this.bank.countDocuments({ stimulus: new Types.ObjectId(id) });
    return n;
  }

  private validate(input: {
    mondai?: string;
    section: string;
    kind: string;
    body: string;
    questionCount?: number;
  }) {
    if (!input.mondai || !isMondaiType(input.mondai)) {
      throw new BadRequestException(`Dạng mondai không hợp lệ (${input.mondai ?? "thiếu"})`);
    }
    if (!["vocab", "grammar", "reading", "listening"].includes(input.section)) {
      throw new BadRequestException(`Phần (section) không hợp lệ: ${input.section}`);
    }
    if (!(STIMULUS_KINDS as readonly string[]).includes(input.kind)) {
      throw new BadRequestException(`Loại bài đọc không hợp lệ: ${input.kind}`);
    }
    if (!input.body?.trim()) throw new BadRequestException("Thiếu nội dung bài đọc (body)");
    if (!Number.isInteger(input.questionCount) || (input.questionCount ?? 0) < 0) {
      throw new BadRequestException("questionCount phải là số nguyên ≥ 0");
    }
  }
}
