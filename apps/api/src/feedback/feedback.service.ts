import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { FilterQuery, Model, Types } from "mongoose";
import type { AuthUser } from "../auth/auth.types.js";
import { Flashcard, type FlashcardDocument } from "../flashcards/schemas/card.schema.js";
import { FlashcardDeck, type FlashcardDeckDocument } from "../flashcards/schemas/deck.schema.js";
import type { UserFeedbackDocument, FeedbackStatus } from "./schemas/user-feedback.schema.js";
import { FEEDBACK_SOURCES, FEEDBACK_STATUSES, UserFeedback } from "./schemas/user-feedback.schema.js";

/** Max open general feedbacks one user may file per day (anti-spam, like card reports). */
const DAILY_LIMIT = 30;

/**
 * What a feedback's `targetId` points at, resolved for the admin inbox so the
 * admin can jump straight to the thing to fix (today: a flashcard → its deck).
 */
export type FeedbackTarget = {
  kind: "card";
  cardId: string;
  front: string;
  deckId: string;
  deckTitle: string;
  /** `false` → the learner's own personal deck, not admin content. */
  shared: boolean;
};

/** Populated `history.by` → display name / email; a dangling ref → its id. */
function adminName(by: unknown): string | null {
  if (!by) return null;
  const u = by as { email?: string; displayName?: string; _id?: unknown };
  if (u.displayName || u.email) return (u.displayName || u.email) as string;
  return String(u._id ?? by);
}

@Injectable()
export class FeedbackService {
  constructor(
    @InjectModel(UserFeedback.name) private readonly feedbacks: Model<UserFeedbackDocument>,
    @InjectModel(Flashcard.name) private readonly cards?: Model<FlashcardDocument>,
    @InjectModel(FlashcardDeck.name) private readonly decks?: Model<FlashcardDeckDocument>,
  ) {}

  /**
   * Batch-resolve `targetId`s to their card + deck (2 queries for a whole
   * page). Unknown / non-card ids simply have no entry — the inbox then shows
   * the raw id as before.
   */
  async resolveTargets(targetIds: (string | null | undefined)[]): Promise<Map<string, FeedbackTarget>> {
    const out = new Map<string, FeedbackTarget>();
    const ids = [...new Set(targetIds.filter((t): t is string => !!t && Types.ObjectId.isValid(t) && String(new Types.ObjectId(t)) === t))];
    if (!ids.length || !this.cards || !this.decks) return out;
    const cards = await this.cards
      .find({ _id: { $in: ids.map((i) => new Types.ObjectId(i)) } })
      .select("deck front")
      .lean()
      .exec();
    if (!cards.length) return out;
    const deckIds = [...new Set(cards.map((c) => String(c.deck)))];
    const decks = await this.decks
      .find({ _id: { $in: deckIds.map((i) => new Types.ObjectId(i)) } })
      .select("title shared")
      .lean()
      .exec();
    const deckById = new Map(decks.map((d) => [String(d._id), d]));
    for (const c of cards) {
      const d = deckById.get(String(c.deck));
      if (!d) continue;
      out.set(String(c._id), {
        kind: "card",
        cardId: String(c._id),
        front: c.front,
        deckId: String(d._id),
        deckTitle: d.title,
        shared: d.shared === true,
      });
    }
    return out;
  }

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
      .lean()
      .exec();
    return docs.map((d) => FeedbackService.shapeMine(d));
  }

  /**
   * Learner view of one thread: own content + status + the processing
   * timeline (status changes and admin notes, newest last). Never exposes
   * *which* admin acted — only that the team did.
   */
  static shapeMine(d: Record<string, unknown>) {
    const history = (Array.isArray(d.history) ? d.history : []) as Array<{
      from?: string;
      to: string;
      note?: string;
      at: Date;
    }>;
    return {
      id: String(d._id),
      source: d.source,
      targetId: (d.targetId as string) ?? null,
      context: (d.context as string) ?? null,
      message: d.message,
      suggestion: (d.suggestion as string) ?? null,
      status: d.status,
      history: history.map((h) => ({ from: h.from ?? null, to: h.to, note: h.note ?? null, at: h.at })),
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    };
  }

  /**
   * Admin inbox: filter by status / source, newest first. `counts` is the
   * per-status total under the same source filter, so every status tab can
   * show its number, not only the one being viewed.
   */
  async adminList(opts: { status?: string; source?: string; page?: number; limit?: number }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
    const bySource: FilterQuery<UserFeedback> = {};
    if (opts.source && (FEEDBACK_SOURCES as readonly string[]).includes(opts.source)) bySource.source = opts.source;
    const filter: FilterQuery<UserFeedback> = { ...bySource };
    if (opts.status && (FEEDBACK_STATUSES as readonly string[]).includes(opts.status)) filter.status = opts.status;
    const [docs, total, grouped] = await Promise.all([
      this.feedbacks.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate("user", "email displayName").lean(),
      this.feedbacks.countDocuments(filter),
      this.feedbacks.aggregate<{ _id: string; n: number }>([{ $match: bySource }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
    ]);
    const counts = Object.fromEntries(FEEDBACK_STATUSES.map((st) => [st, 0])) as Record<string, number>;
    for (const g of grouped) counts[g._id] = g.n;
    const targets = await this.resolveTargets(docs.map((d) => d.targetId));
    const items = docs.map((d) => ({ ...this.shape(d), target: (d.targetId && targets.get(d.targetId)) || null }));
    return { page, limit, total, counts, items };
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
    const doc = await this.feedbacks
      .findById(id)
      .populate("user", "email displayName")
      .populate("history.by", "email displayName")
      .lean()
      .exec();
    if (!doc) throw new NotFoundException("Góp ý không tồn tại");
    const u = (doc.user as unknown as { email?: string; displayName?: string } | null) ?? null;
    const targets = await this.resolveTargets([doc.targetId]);
    return {
      ...this.shape(doc),
      target: (doc.targetId && targets.get(doc.targetId)) || null,
      reporter: u?.displayName || u?.email || "—",
      history: (doc.history ?? []).map((h) => ({
        from: h.from ?? null,
        to: h.to,
        by: adminName(h.by),
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
