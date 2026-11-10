import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import type {
  Flashcard,
  FlashcardDocument,
} from "../flashcards/schemas/card.schema.js";
import type {
  FlashcardDeckDocument,
} from "../flashcards/schemas/deck.schema.js";
import type { AuthUser } from "../auth/auth.types.js";
import {
  type UserCardProgressDocument,
} from "./schemas/progress.schema.js";
import { User, type UserDocument } from "../users/schemas/user.schema.js";
import {
  StudySession,
  type StudySessionDocument,
} from "./schemas/session.schema.js";
import {
  advanceSm2,
  SRS_DEFAULT_STATE,
  type ReviewGrade,
  type SrsState,
} from "./srs.algorithm.js";
import { DAY_MS, localDayKey, localStartOfDay } from "./srs.days.js";

/** A card in the review queue, with a computed bucket + SRS snapshot. */
export interface CardQueueItem {
  id: string;
  front: string;
  back: string;
  reading?: string;
  image?: string;
  imageCredit?: string;
  partOfSpeech?: string;
  /** Âm Hán Việt stored on the card (else the UI derives it). */
  hanViet?: string;
  examples?: { sentence: string; translation?: string }[];
  kind: Flashcard["kind"];
  /** `new` = never reviewed; `due` = progress past due (label refines it). */
  bucket: "new" | "due";
  /** For due cards: `hard` | `mastered` | `normal` (from the SRS state). */
  label?: "hard" | "mastered" | "normal";
  dueDay?: string;
  /**
   * The card's current SM-2 state (default state for new cards). Returned so
   * the study screen can mirror the scheduler locally between batched
   * server syncs — grading stays instant, the state is reconciled in one
   * batched request at the end of the sitting.
   */
  state: SrsState;
}

export interface StudyQueue {
  deckId: string;
  /** The caller's local date the queue was computed for (`YYYY-MM-DD`). */
  today: string;
  newCards: CardQueueItem[];
  dueCards: CardQueueItem[];
  /** Daily cap on brand-new cards, new cards still unseen in the deck, and
   *  how many were introduced today (counts.new = what is left for today). */
  newPerDay: number;
  newTotal: number;
  newToday: number;
  /** Counts across the whole deck, independent of `limit`. */
  counts: { new: number; due: number; hard: number; mastered: number };
  /** Cards in the deck, whether or not they are queued today. */
  total: number;
  /** How the deck's already-learned cards break down by recall quality
   *  (inferred from the SM-2 state; the last grade itself is not stored). */
  grades: { AGAIN: number; HARD: number; GOOD: number; EASY: number };
  /** Learned-but-not-yet-"thuộc" cards that are not due today, so the
   *  learner can drill just the weak ones again ("học lại phiên này"). */
  reviewAhead: CardQueueItem[];
  /** Earliest future due day (`YYYY-MM-DD`) when nothing is queued now. */
  nextDueDay?: string;
  limit: number;
}

export interface ReviewResult {
  cardId: string;
  grade: ReviewGrade;
  state: SrsState;
  /** UTC instant the card is next due. */
  dueAt: string;
  /** The caller's local date the card is due on. */
  dueDay: string;
  /** `true` when the card just lapsed and relearns inside this sitting. */
  relearn: boolean;
}

/**
 * SRS scheduling + review queue (P3-SRS-03/04/05/06).
 *
 * Every read is scoped to the caller's user id — the queue only ever mixes
 * the caller's progress with the cards of a deck the caller may access,
 * never another user's progress (T-P3-04/07). A review upserts the single
 * `(user, card)` progress document, so two devices reviewing the same card
 * both write the same document and the later write wins deterministically
 * (P3-SRS-06, "ghi sau thắng theo quy tắc rõ").
 */
@Injectable()
export class SrsService {
  constructor(
    @InjectModel("Flashcard")
    private readonly card: Model<FlashcardDocument>,
    @InjectModel("FlashcardDeck")
    private readonly deck: Model<FlashcardDeckDocument>,
    @InjectModel("UserCardProgress")
    private readonly progress: Model<UserCardProgressDocument>,
    @InjectModel("StudySession")
    private readonly session: Model<StudySessionDocument>,
    @InjectModel(User.name)
    private readonly user: Model<UserDocument>,
  ) {}

  /**
   * Resolve the IANA zone a sitting runs in: the explicit `tz` param wins
   * (travelling reviewer), otherwise the caller's profile timezone — the
   * default set on the profile, so existing users are never on UTC (P3-SRS-05).
   */
  private async resolveTimezone(
    caller: AuthUser,
    tz?: string,
  ): Promise<string> {
    const zone = tz && tz.trim().length > 0 ? tz.trim() : await this.profileTimezone(caller);
    // Reject an unknown zone with 400 rather than letting Intl throw a
    // 500 deep in the schedule (T-P3-05 — "the same instant in two zones").
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: zone });
    } catch {
      throw new BadRequestException(`Unknown time zone: ${zone}`);
    }
    return zone;
  }

  private async profileTimezone(caller: AuthUser): Promise<string> {
    const doc = await this.user
      .findById(new Types.ObjectId(caller.sub))
      .select("timezone")
      .exec();
    return doc?.timezone ?? "Asia/Ho_Chi_Minh";
  }

  /**
   * Resolve a deck the caller may study. A shared deck must be PUBLISHED; a
   * personal deck must belong to the caller (T-P3-07: one user cannot read
   * another's personal deck).
   */
  private async resolveAccessibleDeck(
    caller: AuthUser,
    deckId: string,
  ): Promise<FlashcardDeckDocument> {
    let doc: FlashcardDeckDocument | null;
    try {
      doc = await this.deck.findById(new Types.ObjectId(deckId)).exec();
    } catch {
      throw new NotFoundException("Deck not found");
    }
    if (!doc) throw new NotFoundException("Deck not found");

    if (doc.shared) {
      if (doc.status !== "PUBLISHED") {
        // Draft shared decks are admin-work-in-progress — invisible to learners.
        throw new NotFoundException("Deck not available");
      }
      return doc; // any signed-in user reads a published shared deck
    }
    if (!doc.user || String(doc.user) !== caller.sub) {
      throw new ForbiddenException("Cannot study another user's deck");
    }
    return doc;
  }

  /**
   * Build the caller's review queue for a deck (P3-SRS-04). Buckets:
   * - `newCards` — deck cards with no progress for this user.
   * - `dueCards` — progress whose local due day is on/before today.
   *
   * `hard`/`mastered` refine a due card from its SM-2 state. All grouping is
   * the caller's own progress; the deck is checked accessible first.
   */
  async getQueue(
    caller: AuthUser,
    deckId: string,
    tz?: string,
    limit = 20,
    mode: "learn" | "review" = "review",
  ): Promise<StudyQueue> {
    // `all` = the review hub: every card the caller has already learned, from
    // any deck they can read — no new cards, no deck distinction.
    const reviewAll = deckId === "all";
    // learn = a deck's new words only; review (SRS) = due words only, for "all" or one deck.
    const learn = mode === "learn" && !reviewAll;
    if (!reviewAll) await this.resolveAccessibleDeck(caller, deckId);
    const timezone = await this.resolveTimezone(caller, tz);
    const today = localDayKey(Date.now(), timezone);
    const userId = new Types.ObjectId(caller.sub);

    let cards: FlashcardDocument[];
    let progressDocs: UserCardProgressDocument[];
    if (reviewAll) {
      progressDocs = await this.progress.find({ user: userId }).exec();
      const decks = await this.deck
        .find({ $or: [{ user: userId }, { shared: true, status: "PUBLISHED" }] }, { _id: 1 })
        .lean()
        .exec();
      cards = await this.card
        .find({
          _id: { $in: progressDocs.map((p) => p.card) },
          deck: { $in: decks.map((d) => d._id) },
        })
        .sort({ order: 1, _id: 1 })
        .exec();
      // The same word in several decks counts as one card: keep the copy
      // reviewed most recently (its state is the freshest).
      const lastMs = new Map(progressDocs.map((p) => [String(p.card), p.lastReviewedAtMs ?? 0]));
      const best = new Map<string, FlashcardDocument>();
      for (const c of cards) {
        const k = cardDupKey(c.front, c.reading);
        const cur = best.get(k);
        if (!cur || (lastMs.get(String(c._id)) ?? 0) > (lastMs.get(String(cur._id)) ?? 0)) {
          best.set(k, c);
        }
      }
      const keep = new Set([...best.values()].map((c) => String(c._id)));
      cards = cards.filter((c) => keep.has(String(c._id)));
    } else {
      cards = await this.card
        .find({ deck: new Types.ObjectId(deckId) })
        .sort({ order: 1, _id: 1 })
        .exec();
      // The caller's progress for exactly these cards — one lookup.
      progressDocs = await this.progress
        .find({ user: userId, card: cards.map((c) => c._id) })
        .exec();
    }
    const byCard = new Map<string, UserCardProgressDocument>();
    for (const p of progressDocs) byCard.set(String(p.card), p);

    const newCards: CardQueueItem[] = [];
    const dueCards: CardQueueItem[] = [];
    const newPerDay = await this.newCardsPerDay(caller);
    // Cards first introduced today in this deck use up today's allowance.
    const introducedToday = await this.progress.countDocuments({
      user: userId,
      card: { $in: cards.map((c) => c._id) },
      createdAt: { $gte: new Date(localStartOfDay(Date.now(), timezone)) },
    });
    const newAllowed = reviewAll ? 0 : Math.max(0, newPerDay - introducedToday);
    let hardCount = 0;
    let masteredCount = 0;
    let nextDueDay: string | undefined;
    const grades = { AGAIN: 0, HARD: 0, GOOD: 0, EASY: 0 };
    const reviewAhead: CardQueueItem[] = [];

    for (const c of cards) {
      const p = byCard.get(String(c._id));
      if (!p) {
        newCards.push({
          id: String(c._id),
          front: c.front,
          back: c.back,
          reading: c.reading || undefined,
          image: c.image || undefined,
          imageCredit: c.imageCredit || undefined,
          partOfSpeech: c.partOfSpeech || undefined,
          hanViet: c.hanViet || undefined,
          examples: c.examples?.length ? c.examples.map((e) => ({ sentence: e.sentence, translation: e.translation })) : undefined,
          kind: c.kind,
          bucket: "new",
          state: { ...SRS_DEFAULT_STATE },
        });
        continue;
      }
      // Classify by SM-2 state: a lapse leaves repetitions at 0; otherwise
      // the ease drifts down on HARD/GOOD and up on EASY.
      const cls: "AGAIN" | "HARD" | "GOOD" | "EASY" =
        p.state.repetitions === 0
          ? "AGAIN"
          : p.state.ease < 2.27
            ? "HARD"
            : p.state.ease < 2.5
              ? "GOOD"
              : "EASY";
      grades[cls] += 1;
      // `YYYY-MM-DD` strings compare lexicographically = chronologically.
      if (p.dueDay > today) {
        if (!nextDueDay || p.dueDay < nextDueDay) nextDueDay = p.dueDay;
        if (cls !== "EASY") {
          reviewAhead.push({
            id: String(c._id),
            front: c.front,
            back: c.back,
            reading: c.reading || undefined,
            image: c.image || undefined,
            imageCredit: c.imageCredit || undefined,
            partOfSpeech: c.partOfSpeech || undefined,
          hanViet: c.hanViet || undefined,
            examples: c.examples?.length ? c.examples.map((e) => ({ sentence: e.sentence, translation: e.translation })) : undefined,
            kind: c.kind,
            bucket: "due",
            label: this.dueLabel(p.state),
            dueDay: p.dueDay,
            state: p.state,
          });
        }
        continue;
      }

      const label = this.dueLabel(p.state);
      if (label === "hard") hardCount += 1;
      if (label === "mastered") masteredCount += 1;
      dueCards.push({
        id: String(c._id),
        front: c.front,
        back: c.back,
        reading: c.reading || undefined,
        image: c.image || undefined,
        imageCredit: c.imageCredit || undefined,
        partOfSpeech: c.partOfSpeech || undefined,
          hanViet: c.hanViet || undefined,
        examples: c.examples?.length ? c.examples.map((e) => ({ sentence: e.sentence, translation: e.translation })) : undefined,
        kind: c.kind,
        bucket: "due",
        label,
        dueDay: p.dueDay,
        state: p.state,
      });
    }

    dueCards.sort(
      (a, b) =>
        (a.dueDay ?? "").localeCompare(b.dueDay ?? "") ||
        a.id.localeCompare(b.id),
    );

    return {
      deckId,
      today,
      newCards: learn ? newCards.slice(0, Math.min(limit, newAllowed)) : [],
      dueCards: learn ? [] : dueCards.slice(0, limit),
      newPerDay,
      newTotal: newCards.length,
      newToday: introducedToday,
      counts: {
        new: Math.min(newCards.length, newAllowed),
        due: dueCards.length,
        hard: hardCount,
        mastered: masteredCount,
      },
      total: cards.length,
      grades,
      reviewAhead,
      nextDueDay,
      limit,
    };
  }

  /**
   * What the exercises should drill first, per deck: the words first learned
   * today (in deck order), then the words due today. Ids only.
   */
  async exercisePriority(
    caller: AuthUser,
    tz?: string,
  ): Promise<Record<string, { today: string[]; due: string[] }>> {
    const timezone = await this.resolveTimezone(caller, tz);
    const today = localDayKey(Date.now(), timezone);
    const startOfDay = new Date(localStartOfDay(Date.now(), timezone));
    const userId = new Types.ObjectId(caller.sub);
    const docs = await this.progress
      .find({ user: userId, $or: [{ createdAt: { $gte: startOfDay } }, { dueDay: { $lte: today } }] })
      .exec();
    if (docs.length === 0) return {};
    const cards = await this.card
      .find({ _id: { $in: docs.map((d) => d.card) } })
      .select("deck order")
      .sort({ order: 1, _id: 1 })
      .lean()
      .exec();
    const isNew = new Map(docs.map((d) => [String(d.card), d.createdAt >= startOfDay]));
    const out: Record<string, { today: string[]; due: string[] }> = {};
    for (const c of cards) {
      const bucket = (out[String(c.deck)] ??= { today: [], due: [] });
      (isNew.get(String(c._id)) ? bucket.today : bucket.due).push(String(c._id));
    }
    return out;
  }

  /** Per-deck progress snapshot for the deck list screen (P3-UI-03). */
  async deckProgress(
    caller: AuthUser,
    deckIds: string[],
    tz?: string,
  ): Promise<Record<string, { new: number; due: number }>> {
    const timezone = await this.resolveTimezone(caller, tz);
    const out: Record<string, { new: number; due: number }> = {};
    for (const id of deckIds) out[id] = { new: 0, due: 0 };
    if (deckIds.length === 0) return out;

    const today = localDayKey(Date.now(), timezone);
    const decks = await this.deck
      .find({ _id: deckIds.map((d) => new Types.ObjectId(d)) })
      .exec();
    const allowed = new Set(decks.map((d) => String(d._id)));

    const cards = await this.card
      .find({ deck: decks.map((d) => d._id) }, { _id: 1, deck: 1 })
      .exec();
    // Card ids per deck, kept as ObjectIds for the progress lookup below
    // (a plain array of strings does not match the `card` ObjectId field —
    // the query has to be an explicit `$in` over real ObjectIds).
    const cardByDeck = new Map<string, Types.ObjectId[]>();
    for (const c of cards) {
      const key = String(c.deck);
      const set = cardByDeck.get(key) ?? [];
      set.push(c._id);
      cardByDeck.set(key, set);
    }

    const allCardIds = [...new Set([...cardByDeck.values()].flat())];
    const progressDocs = allCardIds.length
      ? await this.progress
          .find({
            user: new Types.ObjectId(caller.sub),
            card: { $in: allCardIds },
          })
          .select("card dueDay")
          .exec()
      : [];
    const reviewedCards = new Set(progressDocs.map((p) => String(p.card)));
    const dueCards = new Set(
      progressDocs.filter((p) => p.dueDay <= today).map((p) => String(p.card)),
    );

    for (const [deckKey, ids] of cardByDeck.entries()) {
      if (!allowed.has(deckKey)) continue;
      for (const id of ids) {
        const key = String(id);
        if (reviewedCards.has(key)) {
          if (dueCards.has(key)) out[deckKey].due += 1;
        } else {
          out[deckKey].new += 1;
        }
      }
    }
    return out;
  }

  private async newCardsPerDay(caller: AuthUser): Promise<number> {
    const u = await this.user.findById(caller.sub, { newCardsPerDay: 1 }).exec();
    return u?.newCardsPerDay ?? 20;
  }

  async getSettings(caller: AuthUser): Promise<{ newCardsPerDay: number }> {
    return { newCardsPerDay: await this.newCardsPerDay(caller) };
  }

  async updateSettings(
    caller: AuthUser,
    input: { newCardsPerDay: number },
  ): Promise<{ newCardsPerDay: number }> {
    await this.user
      .updateOne({ _id: caller.sub }, { $set: { newCardsPerDay: input.newCardsPerDay } })
      .exec();
    return { newCardsPerDay: input.newCardsPerDay };
  }

  /**
   * Mastery distribution of the caller's learned cards across every deck
   * (optionally one deck), grouped by SM-2 interval, for the progress chart.
   */
  async masteryStats(
    caller: AuthUser,
    deckId?: string,
    range: "week" | "month" | "year" | "all" = "all",
    offset = 0,
  ): Promise<{
    label: string;
    offset: number;
    total: number;
    unseen: number;
    levels: { key: string; count: number }[];
    newToday: number;
    newPerDay: number;
    range: string;
    /** Reviews + newly learned cards per day (week/month) or per month (year). */
    series: { key: string; reviews: number; newCards: number }[];
    reviewsInRange: number;
    newInRange: number;
    /** Only for range "all": study habit overview (heatmap, streaks, totals). */
    overview?: {
      heatmap: { key: string; reviews: number }[];
      streak: number;
      bestStreak: number;
      totalReviews: number;
      studyDays: number;
    };
  }> {
    const timezone = await this.resolveTimezone(caller);
    const userId = new Types.ObjectId(caller.sub);
    if (deckId) await this.resolveAccessibleDeck(caller, deckId);

    // Calendar periods (week = Mon–Sun, month, year) shifted by `offset`
    // (0 = current, -1 = previous…). Daily buckets for week/month, monthly for year.
    const now = Date.now();
    const fmt = (d: Date): string =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    const [ty, tm, td] = localDayKey(now, timezone).split("-").map(Number);
    const bucketKeys: string[] = [];
    let label = "Tất cả";
    if (range === "week") {
      const dow = new Date(Date.UTC(ty, tm - 1, td)).getUTCDay();
      const monday = td - ((dow + 6) % 7) + offset * 7;
      for (let i = 0; i < 7; i++) bucketKeys.push(fmt(new Date(Date.UTC(ty, tm - 1, monday + i))));
      const dm = (k: string) => `${k.slice(8)}/${k.slice(5, 7)}`;
      label = `${dm(bucketKeys[0])} – ${dm(bucketKeys[6])}/${bucketKeys[6].slice(0, 4)}`;
    } else if (range === "month") {
      const first = new Date(Date.UTC(ty, tm - 1 + offset, 1));
      const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
      for (let i = 1; i <= days; i++) {
        bucketKeys.push(fmt(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), i))));
      }
      label = `Tháng ${first.getUTCMonth() + 1}/${first.getUTCFullYear()}`;
    } else if (range === "year") {
      const y = ty + offset;
      for (let m = 1; m <= 12; m++) bucketKeys.push(`${y}-${String(m).padStart(2, "0")}`);
      label = `Năm ${y}`;
    }
    const series = new Map(bucketKeys.map((k) => [k, { key: k, reviews: 0, newCards: 0 }]));
    const first = bucketKeys[0];
    const last = bucketKeys[bucketKeys.length - 1];
    const dayFmt = range === "year" ? "%Y-%m" : "%Y-%m-%d";
    const startOfToday = new Date(localStartOfDay(now, timezone));

    // Which cards count: one deck, or every deck the caller can read.
    const deckObjId = deckId ? new Types.ObjectId(deckId) : null;
    const deckFilterP: Promise<Record<string, unknown>> = deckObjId
      ? Promise.resolve({ deck: deckObjId })
      : this.deck
          .find({ $or: [{ user: userId }, { shared: true, status: "PUBLISHED" }] }, { _id: 1 })
          .lean()
          .exec()
          .then((ds) => ({ deck: { $in: ds.map((d) => d._id) } }));
    const deckFilter = await deckFilterP;

    // A single deck needs its card ids; "all decks" matches progress by user
    // alone (index prefix) so no big `$in` list is built.
    const cardMatch: Record<string, unknown> = deckObjId
      ? {
          card: {
            $in: (await this.card.find(deckFilter, { _id: 1 }).lean().exec()).map((c) => c._id),
          },
        }
      : {};
    const bucketOfField = (field: unknown) => ({
      $dateToString: { format: dayFmt, date: field, timezone },
    });
    const inPeriod = bucketKeys.length > 0 ? { $in: [bucketOfField({ $toDate: "$lastReviewedAtMs" }), bucketKeys] } : { $literal: true };

    const [agg, totalCards, sessions, perDay] = await Promise.all([
      this.progress
        .aggregate<{
          levels: { _id: string; n: number }[];
          created: { _id: string; n: number }[];
          total: { n: number }[];
          today: { n: number }[];
        }>([
          { $match: { user: userId, ...cardMatch } },
          {
            $facet: {
              levels: [
                { $match: { $expr: inPeriod } },
                {
                  $group: {
                    _id: {
                      $switch: {
                        branches: [
                          {
                            case: {
                              $or: [
                                { $gte: ["$state.lapses", 2] },
                                { $lt: ["$state.ease", 1.8] },
                                { $eq: ["$state.repetitions", 0] },
                              ],
                            },
                            then: "hard",
                          },
                          { case: { $gte: ["$state.intervalDays", 60] }, then: "mastered" },
                          { case: { $gte: ["$state.intervalDays", 21] }, then: "known" },
                          { case: { $gte: ["$state.intervalDays", 7] }, then: "young" },
                        ],
                        default: "learning",
                      },
                    },
                    n: { $sum: 1 },
                  },
                },
              ],
              created:
                bucketKeys.length > 0
                  ? [
                      { $group: { _id: bucketOfField("$createdAt"), n: { $sum: 1 } } },
                      { $match: { _id: { $in: bucketKeys } } },
                    ]
                  : [{ $match: { $expr: { $literal: false } } }],
              total: [{ $count: "n" }],
              today: [{ $match: { createdAt: { $gte: startOfToday } } }, { $count: "n" }],
            },
          },
        ])
        .exec(),
      this.card.countDocuments(deckFilter).exec(),
      bucketKeys.length > 0
        ? this.session
            .find({
              user: userId,
              day:
                range === "year"
                  ? { $gte: `${first}-01`, $lte: `${last}-31` }
                  : { $gte: first, $lte: last },
              ...(deckObjId ? { deck: deckObjId } : {}),
            })
            .lean()
            .exec()
        : Promise.resolve([]),
      this.newCardsPerDay(caller),
    ]);

    const overview =
      range === "all" ? await this.studyOverview(userId, deckObjId, localDayKey(now, timezone)) : undefined;
    for (const ss of sessions) {
      const b = series.get(range === "year" ? ss.day.slice(0, 7) : ss.day);
      if (b) b.reviews += ss.cardsReviewed;
    }
    const r = agg[0];
    for (const c of r?.created ?? []) {
      const b = series.get(c._id);
      if (b) b.newCards += c.n;
    }
    const keys = ["hard", "learning", "young", "known", "mastered"] as const;
    const counts = new Map((r?.levels ?? []).map((l) => [l._id, l.n]));
    const learned = r?.total[0]?.n ?? 0;
    return {
      range,
      label,
      offset,
      series: [...series.values()],
      reviewsInRange: [...series.values()].reduce((a, b) => a + b.reviews, 0),
      newInRange: [...series.values()].reduce((a, b) => a + b.newCards, 0),
      total: totalCards,
      unseen: Math.max(0, totalCards - learned),
      levels: keys.map((key) => ({ key, count: counts.get(key) ?? 0 })),
      newToday: r?.today[0]?.n ?? 0,
      newPerDay: perDay,
      overview,
    };
  }

  /** Heatmap of the last 26 weeks + streaks, from the per-day session tallies. */
  private async studyOverview(
    userId: Types.ObjectId,
    deckId: Types.ObjectId | null,
    todayKey: string,
  ): Promise<NonNullable<Awaited<ReturnType<SrsService["masteryStats"]>>["overview"]>> {
    const rows = await this.session
      .aggregate<{ _id: string; n: number }>([
        { $match: { user: userId, ...(deckId ? { deck: deckId } : {}) } },
        { $group: { _id: "$day", n: { $sum: "$cardsReviewed" } } },
      ])
      .exec();
    const byDay = new Map(rows.filter((r) => r.n > 0).map((r) => [r._id, r.n]));
    const fmt = (d: Date): string =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    const [y, m, d] = todayKey.split("-").map(Number);
    const today = Date.UTC(y, m - 1, d);

    // Heatmap: whole weeks (Mon–Sun) ending with the current one, up to today.
    const dow = new Date(today).getUTCDay();
    const start = today - (((dow + 6) % 7) + 25 * 7) * DAY_MS;
    const heatmap: { key: string; reviews: number }[] = [];
    for (let t = start; t <= today; t += DAY_MS) {
      const key = fmt(new Date(t));
      heatmap.push({ key, reviews: byDay.get(key) ?? 0 });
    }

    // Current streak: consecutive study days ending today (or yesterday).
    let streak = 0;
    let t = byDay.has(todayKey) ? today : today - DAY_MS;
    while (byDay.has(fmt(new Date(t)))) {
      streak += 1;
      t -= DAY_MS;
    }
    // Best streak over the whole history.
    let bestStreak = 0;
    let run = 0;
    let prev = 0;
    for (const key of [...byDay.keys()].sort()) {
      const [ky, km, kd] = key.split("-").map(Number);
      const cur = Date.UTC(ky, km - 1, kd);
      run = prev && cur - prev === DAY_MS ? run + 1 : 1;
      prev = cur;
      bestStreak = Math.max(bestStreak, run);
    }
    return {
      heatmap,
      streak,
      bestStreak,
      totalReviews: [...byDay.values()].reduce((a, b) => a + b, 0),
      studyDays: byDay.size,
    };
  }

  private dueLabel(state: SrsState): "hard" | "mastered" | "normal" {
    if (state.lapses >= 2 || state.ease < 1.8) return "hard";
    if (state.repetitions >= 2 && state.intervalDays >= 21) return "mastered";
    return "normal";
  }

  /**
   * Reset the caller's progress on a deck (P3-UI-06 "đặt lại bộ thẻ").
   *
   * Every progress row for the deck's cards is dropped, so all its cards
   * become **new** again (no due dates, default SM-2 state) — the deck's
   * cards and content are untouched, only the caller's personal learning
   * schedule is cleared.
   *
   * The day's session stats for that deck are cleared too, so the deck's
   * "đã học hôm nay" counters go back to zero instead of showing reviews
   * that no longer exist.
   */
  async resetDeck(
    caller: AuthUser,
    deckId: string,
  ): Promise<{ deckId: string; cleared: number }> {
    await this.resolveAccessibleDeck(caller, deckId);
    const userId = new Types.ObjectId(caller.sub);

    const cards = await this.card
      .find({ deck: new Types.ObjectId(deckId) }, { _id: 1 })
      .exec();
    const cardIds = cards.map((c) => c._id);
    if (cardIds.length === 0) return { deckId, cleared: 0 };

    const res = await this.progress
      .deleteMany({ user: userId, card: { $in: cardIds } })
      .exec();

    await this.session.deleteMany({ user: userId, deck: new Types.ObjectId(deckId) }).exec();

    return { deckId, cleared: res.deletedCount ?? 0 };
  }

  /**
   * Record one review of a card for the caller (P3-SRS-03/05/06).
   *
   * Advances the SM-2 state, composes a timezone-anchored due instant
   * (midnight of today in the caller's zone, P3-SRS-05), and upserts the
   * single `(user, card)` progress record. A lapse relearns 10 minutes later
   * *within* the sitting rather than the next local day.
   */
  async review(
    caller: AuthUser,
    input: {
      cardId: string;
      grade: ReviewGrade;
      tz?: string;
      userAgent?: string;
    },
  ): Promise<ReviewResult> {
    const results = await this.reviewBatch(caller, {
      reviews: [{ cardId: input.cardId, grade: input.grade }],
      tz: input.tz,
      userAgent: input.userAgent,
    });
    return results[0];
  }

  /**
   * Record MANY reviews in one round-trip (P3-UI-01 — the study screen used
   * to POST once per card, which made flipping feel laggy).
   *
   * Semantics are identical to calling `review()` per card, but:
   * - the caller's timezone is resolved **once** for the whole batch,
   * - the existing progress rows are read in **one** query,
   * - the writes are batched per deck (one `updateOne` per card, one
   *   session update per deck).
   *
   * Reviews for the same card inside one batch are applied **in order**
   * (the later one sees the earlier one's state), so a client that grades
   * the same card twice in a batch gets the same result as two sequential
   * calls.
   */
  async reviewBatch(
    caller: AuthUser,
    input: {
      reviews: { cardId: string; grade: ReviewGrade }[];
      tz?: string;
      userAgent?: string;
    },
  ): Promise<ReviewResult[]> {
    if (input.reviews.length === 0) return [];

    const timezone = await this.resolveTimezone(caller, input.tz);
    const keyUser = new Types.ObjectId(caller.sub);
    const now = Date.now();

    // A malformed id is a client error (404), not a 500 — validate before
    // handing them to Mongo.
    const seen = new Set<string>();
    for (const r of input.reviews) {
      if (!Types.ObjectId.isValid(r.cardId)) {
        throw new NotFoundException("Card not found");
      }
      seen.add(r.cardId);
    }
    const cardIds = [...seen];
    const cards = await this.card
      .find({ _id: cardIds.map((id) => new Types.ObjectId(id)) })
      .exec();
    const byId = new Map(cards.map((c) => [String(c._id), c]));

    // Every deck touched must be accessible to the caller.
    const deckIds = [...new Set(cards.map((c) => String(c.deck)))];
    for (const deckId of deckIds) {
      await this.resolveAccessibleDeck(caller, deckId);
    }

    // Existing progress for the touched cards, in ONE query.
    const existing = await this.progress
      .find({
        user: keyUser,
        card: cards.map((c) => c._id),
      })
      .exec();
    const stateByCard = new Map<string, SrsState>();
    for (const p of existing) {
      stateByCard.set(String(p.card), p.state);
    }

    // Apply the reviews in order (same card twice → sequential states).
    const results: ReviewResult[] = [];
    const writes = new Map<
      string,
      { dueAt: Date; dueDay: string; state: SrsState; times: number }
    >();
    /** Per-deck tally for the session document: grade histogram + review count. */
    const sessionTallies = new Map<string, { cardsReviewed: number; grades: Record<string, number> }>();

    for (const r of input.reviews) {
      const cardDoc = byId.get(r.cardId);
      if (!cardDoc) throw new NotFoundException("Card not found");

      const prev: SrsState = stateByCard.get(r.cardId) ?? { ...SRS_DEFAULT_STATE };
      const outcome = advanceSm2(prev, { grade: r.grade, now });
      stateByCard.set(r.cardId, outcome.state);

      const dueAtMs =
        outcome.relearnHours > 0
          ? now + outcome.relearnHours * 3_600_000
          : localStartOfDay(now, timezone) + outcome.intervalDays * DAY_MS;
      const dueDay = localDayKey(dueAtMs, timezone);

      writes.set(r.cardId, {
        dueAt: new Date(dueAtMs),
        dueDay,
        state: outcome.state,
        times: (writes.get(r.cardId)?.times ?? 0) + 1,
      });

      const deckKey = String(cardDoc.deck);
      const tally = sessionTallies.get(deckKey) ?? { cardsReviewed: 0, grades: {} };
      tally.cardsReviewed += 1;
      tally.grades[r.grade] = (tally.grades[r.grade] ?? 0) + 1;
      sessionTallies.set(deckKey, tally);

      results.push({
        cardId: r.cardId,
        grade: r.grade,
        state: outcome.state,
        dueAt: new Date(dueAtMs).toISOString(),
        dueDay,
        relearn: outcome.relearnHours > 0,
      });
    }

    // Persist the progress rows (one write per card — the unique
    // `(user, card)` index keeps it to exactly one document each).
    await Promise.all(
      [...writes.entries()].map(([cardId, w]) =>
        this.progress
          .updateOne(
            { user: keyUser, card: new Types.ObjectId(cardId) },
            {
              $set: {
                state: w.state,
                dueAt: w.dueAt,
                dueDay: w.dueDay,
                lastReviewedAtMs: now,
              },
              $inc: { seenCount: w.times },
            },
            { upsert: true },
          )
          .exec(),
      ),
    );

    // The same word in another deck is the same word: mirror the new state
    // onto the caller's existing progress of its duplicates (no new rows).
    const keyOf = (id: string): string | undefined => {
      const c = byId.get(id);
      return c ? cardDupKey(c.front, c.reading) : undefined;
    };
    const wanted = new Map<string, string>(); // dupKey → reviewed cardId
    for (const id of writes.keys()) {
      const k = keyOf(id);
      if (k) wanted.set(k, id);
    }
    if (wanted.size > 0) {
      const fronts = [...new Set([...writes.keys()].map((id) => byId.get(id)?.front).filter((f): f is string => !!f))];
      const twins = await this.card.find({ front: { $in: fronts } }, { _id: 1, front: 1, reading: 1 }).lean().exec();
      await Promise.all(
        twins.flatMap((t) => {
          const src = wanted.get(cardDupKey(t.front, t.reading));
          if (!src || writes.has(String(t._id))) return [];
          const w = writes.get(src);
          if (!w) return [];
          return [
            this.progress
              .updateOne(
                { user: keyUser, card: t._id },
                { $set: { state: w.state, dueAt: w.dueAt, dueDay: w.dueDay, lastReviewedAtMs: now } },
              )
              .exec(),
          ];
        }),
      );
    }

    // Aggregate into today's session, once per deck (P3-SRS-04 / P3-UI-03).
    const sessionDay = localDayKey(now, timezone);
    const device = detectDevice(input.userAgent);
    await Promise.all(
      [...sessionTallies.entries()].map(([deckKey, tally]) => {
        const inc: Record<string, number> = {
          cardsReviewed: tally.cardsReviewed,
        };
        for (const [grade, count] of Object.entries(tally.grades)) {
          inc[`grades.${grade}`] = count;
        }
        return this.session
          .updateOne(
            { user: keyUser, deck: new Types.ObjectId(deckKey), day: sessionDay },
            {
              $inc: inc,
              $max: { endedAtMs: now },
              // Required fields are supplied only on insert: two concurrent
              // sessions for the same day merge into one document.
              $setOnInsert: {
                startedAtMs: now,
                timezone,
                device,
              },
            },
            { upsert: true },
          )
          .exec();
      }),
    );

    return results;
  }
}

/**
 * Identity of a word across decks: kanji words match on written form + reading;
 * kana-only words (empty reading) match on the kana itself, so hiragana and
 * katakana spellings stay distinct.
 */
function cardDupKey(front: string, reading?: string): string {
  const f = front.trim();
  const r = (reading ?? "").trim();
  return r && r !== f ? `${f}|${r}` : f;
}

/** Light user-agent heuristic for the session's `device` field (spec §4.4). */
function detectDevice(userAgent?: string): StudySession["device"] {
  if (!userAgent) return "unknown";
  return /mobile|android|iphone|ipad/i.test(userAgent)
    ? "mobile"
    : "web";
}
