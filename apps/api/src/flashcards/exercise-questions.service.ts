import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { createHash } from "node:crypto";
import { Model, Types } from "mongoose";
import type { AuthUser } from "../auth/auth.types.js";
import { FlashcardsService } from "./flashcards.service.js";
import {
  EXERCISE_KINDS,
  type ExerciseKind,
  type ExerciseQuestionDocument,
} from "./schemas/exercise-question.schema.js";

/** A question as the exercises UI sends it for saving. */
export interface QuestionInput {
  cardId: string;
  kind: string;
  prompt: string;
  sub?: string;
  options: string[];
  answer: string;
  explain?: string;
  source?: string;
}

const MAX_TEXT = 400;

/** Fingerprint of a question: same card/kind/answer/options (in any order) → same key. */
export function questionKey(deck: string, card: string, kind: string, answer: string, options: string[]): string {
  return createHash("sha1")
    .update([deck, card, kind, answer, ...[...options].sort()].join("\u0001"))
    .digest("hex");
}

/**
 * The question bank behind the exercises: every question shown to a learner is
 * kept (once), to be reused by the JLPT / Nattest practice later. Nothing here
 * is trusted blindly — the card must belong to a deck the caller may read, the
 * options must be four distinct strings containing the answer, and the answer
 * is checked against the card wherever the card can vouch for it.
 */
@Injectable()
export class ExerciseQuestionsService {
  constructor(
    @InjectModel("ExerciseQuestion")
    private readonly questions: Model<ExerciseQuestionDocument>,
    private readonly flashcards: FlashcardsService,
  ) {}

  /** Save new questions; returns how many were new / already known / rejected. */
  async saveMany(
    caller: AuthUser,
    deckId: string,
    items: QuestionInput[],
  ): Promise<{ saved: number; existing: number; rejected: number }> {
    const deck = await this.flashcards.getDeck(caller, deckId);
    const cards = new Map(
      (await this.flashcards.listCards(caller, deckId, 500)).map((c) => [String(c._id), c]),
    );
    const ops: Parameters<Model<ExerciseQuestionDocument>["bulkWrite"]>[0] = [];
    let rejected = 0;
    for (const it of items) {
      const card = cards.get(it.cardId);
      const options = (it.options ?? []).map((o) => String(o).trim());
      const answer = String(it.answer ?? "").trim();
      const prompt = String(it.prompt ?? "").trim();
      if (
        !card ||
        !(EXERCISE_KINDS as readonly string[]).includes(it.kind) ||
        !prompt ||
        options.length !== 4 ||
        new Set(options).size !== 4 ||
        options.some((o) => !o || o.length > MAX_TEXT) ||
        !options.includes(answer) ||
        prompt.length > MAX_TEXT
      ) {
        rejected++;
        continue;
      }
      const kind = it.kind as ExerciseKind;
      // What the card itself says the right answer is, per kind (null = cannot be checked).
      const truth: string[] | null =
        kind === "kanji-pick"
          ? [card.front]
          : kind === "reading-pick"
            ? [card.reading ?? ""]
            : kind === "meaning-pick"
              ? [card.back]
              : kind === "sentence-pick"
                ? (card.examples ?? []).map((e) => e.sentence)
                : kind === "context-pick"
                  ? // the blank must be in the stem and the answer is the card's word
                    prompt.includes("＿") ? [card.front] : []
                  : kind === "formation-pick"
                    ? // the stem is the word with one kanji hidden; the answer is that kanji
                      prompt.includes("＿") && prompt.replace("＿", answer) === card.front
                        ? [answer]
                        : []
                    : null;
      if (truth && !truth.includes(answer)) {
        rejected++;
        continue;
      }
      const key = questionKey(deckId, it.cardId, kind, answer, options);
      ops.push({
        updateOne: {
          filter: { dedupeKey: key },
          update: {
            $setOnInsert: {
              deck: new Types.ObjectId(deckId),
              card: new Types.ObjectId(it.cardId),
              kind,
              prompt,
              sub: String(it.sub ?? "").slice(0, MAX_TEXT),
              options,
              answer,
              explain: String(it.explain ?? "").slice(0, MAX_TEXT),
              source: it.source === "ai" ? "ai" : "local",
              verified: truth !== null,
              level: deck.level ?? "",
              createdBy: caller.sub,
              dedupeKey: key,
            },
          },
          upsert: true,
        },
      });
    }
    if (ops.length === 0) return { saved: 0, existing: 0, rejected };
    const res = await this.questions.bulkWrite(ops, { ordered: false });
    const saved = res.upsertedCount;
    return { saved, existing: ops.length - saved, rejected };
  }
}
