import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { assembleExam } from "./assemble.js";
import { Exam, type ExamDocument } from "./schemas/exam.schema.js";
import { ExamImportDraft, type ExamImportDraftDocument } from "./schemas/import-draft.schema.js";

export interface ExamTarget {
  key: string;
  level: string;
  setName: string;
  sitting: string;
}

export interface SyncedExam {
  examId: string;
  questions: number;
  warnings: string[];
}

/**
 * Keeps an imported exam equal to its published drafts (plan-exam-by-source D4):
 * every publish rebuilds it, so a run that failed half-way is repaired by the next.
 */
@Injectable()
export class ExamSyncService {
  /** The rebuild in flight per exam: two publishes must not write over each other. */
  private readonly chains = new Map<string, Promise<unknown>>();

  constructor(
    @InjectModel(ExamImportDraft.name) private readonly drafts: Model<ExamImportDraftDocument>,
    @InjectModel(Exam.name) private readonly exams: Model<ExamDocument>,
  ) {}

  sync(target: ExamTarget, createdBy: string): Promise<SyncedExam> {
    return this.exclusive(target.key, () => this.rebuild(target, createdBy));
  }

  /** Runs `task` after whatever else is writing the exam of this key. */
  exclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
    const run = (this.chains.get(key) ?? Promise.resolve()).then(task);
    const settled: Promise<unknown> = run
      .catch(() => undefined)
      .finally(() => {
        if (this.chains.get(key) === settled) this.chains.delete(key);
      });
    this.chains.set(key, settled);
    return run;
  }

  private async rebuild(target: ExamTarget, createdBy: string): Promise<SyncedExam> {
    const drafts = await this.drafts
      .find({ examKey: target.key, status: "published" })
      .select("jobId jobCreatedAt blockIndex mondai section questionIds rights")
      .lean()
      .exec();
    const previous = await this.exams.findOne({ "origin.key": target.key }).select("sections").lean().exec();
    const built = assembleExam(
      target.level,
      drafts.map((d) => ({
        jobId: d.jobId,
        jobCreatedAt: d.jobCreatedAt?.getTime() ?? 0,
        blockIndex: d.blockIndex,
        mondai: d.mondai,
        section: d.section,
        questionIds: (d.questionIds ?? []).map(String),
        rights: d.rights,
      })),
      (previous?.sections ?? []).map((s) => ({
        key: s.key as "language",
        timeLimitMin: s.timeLimitMin ?? 0,
        timeLocked: s.timeLocked,
      })),
    );
    const oid = (id: string) => new Types.ObjectId(id);
    // Title, status and shuffle are the admin's once the exam exists.
    const exam = await this.exams
      .findOneAndUpdate(
        { "origin.key": target.key },
        {
          $set: {
            kind: built.kind,
            rights: built.rights,
            warnings: built.warnings,
            sections: built.sections.map((s) => ({ ...s, questions: s.questions.map(oid) })),
            questions: built.questions.map(oid),
            timeLimitMin: built.sections.reduce((n, s) => n + s.timeLimitMin, 0),
            "origin.jobIds": [...new Set(drafts.map((d) => d.jobId))].sort(),
          },
          $setOnInsert: {
            "origin.setName": target.setName,
            "origin.sitting": target.sitting,
            title: `JLPT ${target.level} · ${target.sitting} — ${target.setName}`.slice(0, 200),
            level: target.level,
            status: "DRAFT",
            // The paper's own order (D: nothing is shuffled).
            shuffle: { questions: false, options: false },
            createdBy,
          },
        },
        { upsert: true, new: true },
      )
      .select("_id")
      .lean()
      .exec();
    return { examId: String(exam!._id), questions: built.questions.length, warnings: built.warnings };
  }
}
