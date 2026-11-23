import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { FilterQuery, Model, Types } from "mongoose";
import type { AuthUser } from "../auth/auth.types.js";
import type { UserFeedbackDocument, FeedbackStatus } from "./schemas/user-feedback.schema.js";
import { FEEDBACK_SOURCES, FEEDBACK_STATUSES, UserFeedback } from "./schemas/user-feedback.schema.js";

/** Max open general feedbacks one user may file per day (anti-spam, like card reports). */
const DAILY_LIMIT = 30;

@Injectable()
export class FeedbackService {
  constructor(@InjectModel(UserFeedback.name) private readonly feedbacks: Model<UserFeedbackDocument>) {}

  async create(caller: AuthUser, input: { source?: string; targetId?: string; context?: string; message?: string; suggestion?: string }) {
    const source = (input.source ?? "general") as string;
    if (!(FEEDBACK_SOURCES as readonly string[]).includes(source)) {
      throw new BadRequestException("Nguồn phản hồi không hợp lệ");
    }
    const message = (input.message ?? "").trim();
    if (!message) throw new BadRequestException("Hãy nhập nội dung góp ý");
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const recent = await this.feedbacks.countDocuments({
      user: new Types.ObjectId(caller.sub),
      createdAt: { $gte: since },
    });
    if (recent >= DAILY_LIMIT) {
      throw new ForbiddenException("Bạn đã gửi quá nhiều góp ý hôm nay");
    }
    const doc = await this.feedbacks.create({
      source,
      user: new Types.ObjectId(caller.sub),
      targetId: input.targetId?.trim() || undefined,
      context: (input.context ?? "").trim().slice(0, 500) || undefined,
      message: message.slice(0, 4000),
      suggestion: (input.suggestion ?? "").trim().slice(0, 4000) || undefined,
    });
    return { id: String(doc._id) };
  }

  /** The learner's own feedback threads (their history / processing status). */
  async myList(caller: AuthUser, status?: string) {
    const filter: FilterQuery<UserFeedback> = { user: new Types.ObjectId(caller.sub) };
    if (status && (FEEDBACK_STATUSES as readonly string[]).includes(status)) filter.status = status;
    const docs = await this.feedbacks
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("user", "email displayName")
      .lean()
      .exec();
    return docs.map((d) => this.shape(d));
  }

  /** Admin inbox: filter by status / source, newest first. */
  async adminList(opts: { status?: string; source?: string; page?: number; limit?: number }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
    const filter: FilterQuery<UserFeedback> = {};
    if (opts.status && (FEEDBACK_STATUSES as readonly string[]).includes(opts.status)) filter.status = opts.status;
    if (opts.source && (FEEDBACK_SOURCES as readonly string[]).includes(opts.source)) filter.source = opts.source;
    const [docs, total] = await Promise.all([
      this.feedbacks.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate("user", "email displayName").lean(),
      this.feedbacks.countDocuments(filter),
    ]);
    return { page, limit, total, items: docs.map((d) => this.shape(d)) };
  }

  /**
   * Admin status change (P5-FEEDBACK-02): every change is recorded in the
   * document's `history` (who / from → to / note / when), so the inbox shows
   * the full processing trail, not just the current state.
   */
  async adminSetStatus(caller: AuthUser, id: string, status: string, note?: string) {
    if (!(FEEDBACK_STATUSES as readonly string[]).includes(status)) {
      throw new BadRequestException("Trạng thái không hợp lệ");
    }
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException("Góp ý không tồn tại");
    const doc = await this.feedbacks.findById(id).exec();
    if (!doc) throw new NotFoundException("Góp ý không tồn tại");
    const from = doc.status;
    doc.status = status as FeedbackStatus;
    doc.history = doc.history ?? [];
    doc.history.push({
      from: from === status ? undefined : from,
      to: status as FeedbackStatus,
      by: new Types.ObjectId(caller.sub),
      note: note?.trim().slice(0, 1000) || undefined,
      at: new Date(),
    });
    await doc.save();
    return { id: String(doc._id), status: doc.status, history: doc.history.length };
  }

  /** One feedback with its reporter + full history (admin detail view). */
  async adminDetail(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException("Góp ý không tồn tại");
    const doc = await this.feedbacks.findById(id).populate("user", "email displayName").lean().exec();
    if (!doc) throw new NotFoundException("Góp ý không tồn tại");
    const u = (doc.user as unknown as { email?: string; displayName?: string } | null) ?? null;
    return {
      ...this.shape(doc),
      reporter: u?.displayName || u?.email || "—",
      history: (doc.history ?? []).map((h) => ({
        from: h.from ?? null,
        to: h.to,
        by: h.by ? String(h.by) : null,
        note: h.note ?? null,
        at: h.at,
      })),
    };
  }

  private shape(d: Record<string, unknown>) {
    const u = d.user as unknown as { email?: string; displayName?: string } | null;
    return {
      id: String(d._id),
      source: d.source,
      targetId: (d.targetId as string) ?? null,
      context: (d.context as string) ?? null,
      message: d.message,
      suggestion: (d.suggestion as string) ?? null,
      status: d.status,
      reporter: u?.displayName || u?.email || "—",
      historyCount: Array.isArray(d.history) ? d.history.length : 0,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    };
  }
}
