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
  kind: Flashcard["kind"];
  /** `new` = never reviewed; `due` = progress past due (label refines it). */
  bucket: "new" | "due";
  /** For due cards: `hard` | `mastered` | `normal` (from the SRS state). */
  label?: "hard" | "mastered" | "normal";
  dueDay?: string;
  ease?: number;
  repetitions?: number;
}

export interface StudyQueue {
  deckId: string;
  /** The caller's local date the queue was computed for (`YYYY-MM-DD`). */
  today: string;
  newCards: CardQueueItem[];
  dueCards: CardQueueItem[];
  /** Counts across the whole deck, independent of `limit`. */
  counts: { new: number; due: number; hard: number; mastered: number };
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
  ): Promise<StudyQueue> {
    await this.resolveAccessibleDeck(caller, deckId);
    const timezone = await this.resolveTimezone(caller, tz);
    const today = localDayKey(Date.now(), timezone);

    const cards = await this.card
      .find({ deck: new Types.ObjectId(deckId) })
      .sort({ _id: 1 })
      .exec();

    // The caller's progress for exactly these cards — one lookup.
    const progressDocs = await this.progress
      .find({
        user: new Types.ObjectId(caller.sub),
        card: cards.map((c) => c._id),
      })
      .exec();
    const byCard = new Map<string, UserCardProgressDocument>();
    for (const p of progressDocs) byCard.set(String(p.card), p);

    const newCards: CardQueueItem[] = [];
    const dueCards: CardQueueItem[] = [];
    let hardCount = 0;
    let masteredCount = 0;

    for (const c of cards) {
      const p = byCard.get(String(c._id));
      if (!p) {
        newCards.push({
          id: String(c._id),
          front: c.front,
          back: c.back,
          kind: c.kind,
          bucket: "new",
        });
        continue;
      }
      // `YYYY-MM-DD` strings compare lexicographically = chronologically.
      if (p.dueDay > today) continue;

      const label = this.dueLabel(p.state);
      if (label === "hard") hardCount += 1;
      if (label === "mastered") masteredCount += 1;
      dueCards.push({
        id: String(c._id),
        front: c.front,
        back: c.back,
        kind: c.kind,
        bucket: "due",
        label,
        dueDay: p.dueDay,
        ease: p.state.ease,
        repetitions: p.state.repetitions,
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
      newCards: newCards.slice(0, limit),
      dueCards: dueCards.slice(0, limit),
      counts: {
        new: newCards.length,
        due: dueCards.length,
        hard: hardCount,
        mastered: masteredCount,
      },
      limit,
    };
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
    const cardByDeck = new Map<string, Set<string>>();
    for (const c of cards) {
      const key = String(c.deck);
      const set = cardByDeck.get(key) ?? new Set<string>();
      set.add(String(c._id));
      cardByDeck.set(key, set);
    }

    const progressDocs = await this.progress
      .find({
        user: new Types.ObjectId(caller.sub),
        card: Array.from(new Set([...cardByDeck.values()].flatMap((s) => [...s]))),
      })
      .select("card dueDay")
      .exec();
    const reviewedCards = new Set(progressDocs.map((p) => String(p.card)));
    const dueCards = new Set(
      progressDocs.filter((p) => p.dueDay <= today).map((p) => String(p.card)),
    );

    for (const [deckKey, ids] of cardByDeck.entries()) {
      if (!allowed.has(deckKey)) continue;
      for (const id of ids) {
        if (reviewedCards.has(id)) {
          if (dueCards.has(id)) out[deckKey].due += 1;
        } else {
          out[deckKey].new += 1;
        }
      }
    }
    return out;
  }

  private dueLabel(state: SrsState): "hard" | "mastered" | "normal" {
    if (state.lapses >= 2 || state.ease < 1.8) return "hard";
    if (state.repetitions >= 2 && state.intervalDays >= 21) return "mastered";
    return "normal";
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
    let cardDoc: FlashcardDocument | null;
    try {
      cardDoc = await this.card
        .findById(new Types.ObjectId(input.cardId))
        .exec();
    } catch {
      throw new NotFoundException("Card not found");
    }
    if (!cardDoc) throw new NotFoundException("Card not found");

    // The review must be on a deck the caller may access (mirrors getQueue).
    await this.resolveAccessibleDeck(caller, String(cardDoc.deck));
    const timezone = await this.resolveTimezone(caller, input.tz);

    const now = Date.now();
    const keyUser = new Types.ObjectId(caller.sub);
    const keyCard = cardDoc._id;

    const existing = await this.progress
      .findOne({ user: keyUser, card: keyCard })
      .exec();
    const prev: SrsState = existing?.state ?? { ...SRS_DEFAULT_STATE };
    const outcome = advanceSm2(prev, { grade: input.grade, now });

    // Compose the absolute due instant from the zone-anchored offset.
    const dueAtMs =
      outcome.relearnHours > 0
        ? now + outcome.relearnHours * 3_600_000
        : localStartOfDay(now, timezone) + outcome.intervalDays * DAY_MS;
    const dueDay = localDayKey(dueAtMs, timezone);

    // One document per (user, card): upsert, last write wins (P3-SRS-06).
    await this.progress
      .updateOne(
        { user: keyUser, card: keyCard },
        {
          $set: {
            state: outcome.state,
            dueAt: new Date(dueAtMs),
            dueDay,
            lastReviewedAtMs: now,
          },
          $inc: { seenCount: 1 },
        },
        { upsert: true },
      )
      .exec();

    // Aggregate into today's session for the deck (P3-SRS-04 / P3-UI-03).
    const sessionDay = localDayKey(now, timezone);
    const device = detectDevice(input.userAgent);
    await this.session
      .updateOne(
        { user: keyUser, deck: cardDoc.deck, day: sessionDay },
        {
          $inc: { cardsReviewed: 1, [`grades.${input.grade}`]: 1 },
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

    return {
      cardId: input.cardId,
      grade: input.grade,
      state: outcome.state,
      dueAt: new Date(dueAtMs).toISOString(),
      dueDay,
      relearn: outcome.relearnHours > 0,
    };
  }
}

/** Light user-agent heuristic for the session's `device` field (spec §4.4). */
function detectDevice(userAgent?: string): StudySession["device"] {
  if (!userAgent) return "unknown";
  return /mobile|android|iphone|ipad/i.test(userAgent)
    ? "mobile"
    : "web";
}
