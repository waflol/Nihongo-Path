import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model, Types } from "mongoose";
import { FlashcardDeck, type FlashcardDeckDocument } from "./schemas/deck.schema.js";
import { Flashcard, type FlashcardDocument } from "./schemas/card.schema.js";
import { GrammarPoint, type GrammarPointDocument } from "../content/schemas/grammar-point.schema.js";
import { Kanji, type KanjiDocument } from "../content/schemas/kanji.schema.js";

const LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;

/**
 * Idempotently provisions and syncs the 10 default system decks:
 * - `Ngữ pháp N5`..`Ngữ pháp N1` (`systemKey: "grammar:N5"`..`"grammar:N1"`, `pillar: "grammar"`)
 * - `Kanji N5`..`Kanji N1` (`systemKey: "kanji:N5"`..`"kanji:N1"`, `pillar: "kanji"`)
 *
 * Updating a card preserves its existing `_id` so learner `UserCardProgress` is
 * never lost. Cards are matched by the content entry they wrap (`kanji` /
 * `grammar`), not by `dedupeKey`: the startup re-key in `FlashcardsService`
 * rewrites that key.
 */
@Injectable()
export class SystemDecksService implements OnModuleInit {
  private readonly logger = new Logger(SystemDecksService.name);

  constructor(
    @InjectModel(FlashcardDeck.name)
    private readonly deckModel: Model<FlashcardDeckDocument>,
    @InjectModel(Flashcard.name)
    private readonly cardModel: Model<FlashcardDocument>,
    @InjectModel(GrammarPoint.name)
    private readonly grammarModel: Model<GrammarPointDocument>,
    @InjectModel(Kanji.name)
    private readonly kanjiModel: Model<KanjiDocument>,
  ) {}

  onModuleInit(): void {
    // Run asynchronously so startup is never blocked; log errors without crashing.
    void this.syncAll().catch((err) => {
      this.logger.warn(`System decks sync failed on startup: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  async syncAll(): Promise<{ grammarCards: number; kanjiCards: number }> {
    const [grammarCards, kanjiCards] = await Promise.all([
      this.syncGrammarDecks(),
      this.syncKanjiDecks(),
    ]);
    return { grammarCards, kanjiCards };
  }

  private async ensureSystemDeck(opts: {
    systemKey: string;
    title: string;
    summary: string;
    level: string;
    pillar: "grammar" | "kanji";
    category: string;
  }): Promise<Types.ObjectId> {
    const deck = await this.deckModel
      .findOneAndUpdate(
        { systemKey: opts.systemKey },
        {
          $setOnInsert: {
            systemKey: opts.systemKey,
            user: null,
            shared: true,
            status: "PUBLISHED",
            lang: "vi",
          },
          $set: {
            title: opts.title,
            summary: opts.summary,
            level: opts.level,
            pillar: opts.pillar,
            category: opts.category,
          },
        },
        { upsert: true, new: true },
      )
      .lean();
    return deck._id;
  }

  /**
   * Where each entry's card upsert should land: the oldest card the deck already
   * has for it, else a new card keyed `<field>:<entryId>`.
   */
  private async cardMatcher(deckId: Types.ObjectId, field: "grammar" | "kanji") {
    const cards = await this.cardModel
      .find({ deck: deckId }, { [field]: 1 })
      .sort({ _id: 1 })
      .lean();
    const existing = new Map<string, Types.ObjectId>();
    for (const c of cards) {
      const entry = c[field] ? String(c[field]) : "";
      if (entry && !existing.has(entry)) existing.set(entry, c._id);
    }
    return (entryId: unknown) => {
      const dedupeKey = `${field}:${String(entryId)}`;
      const _id = existing.get(String(entryId));
      return {
        filter: _id ? { _id } : { deck: deckId, dedupeKey },
        insertKey: { dedupeKey },
      };
    };
  }

  async syncGrammarDecks(): Promise<number> {
    let total = 0;
    for (const level of LEVELS) {
      const deckId = await this.ensureSystemDeck({
        systemKey: `grammar:${level}`,
        title: `Ngữ pháp ${level}`,
        summary: `Bộ thẻ mặc định toàn bộ mẫu ngữ pháp ${level} đã xuất bản.`,
        level,
        pillar: "grammar",
        category: "Ngữ pháp",
      });

      const points = await this.grammarModel
        .find({ status: "PUBLISHED", level })
        .sort({ sortOrder: 1, _id: 1 })
        .lean();

      if (points.length === 0) continue;

      const match = await this.cardMatcher(deckId, "grammar");
      const ops = points.map((gp, idx) => {
        const { filter, insertKey } = match(gp._id);
        const meaning = (gp as { summary?: string; meaning?: string }).summary
          || (gp as { meaning?: string }).meaning
          || gp.label;
        const firstExample = Array.isArray((gp as { examples?: Array<{ sentence: string; translation?: string }> }).examples)
          ? (gp as { examples: Array<{ sentence: string; translation?: string }> }).examples[0]
          : undefined;
        return {
          updateOne: {
            filter,
            update: {
              $setOnInsert: {
                deck: deckId,
                ...insertKey,
                kind: "GRAMMAR" as const,
                origin: "import" as const,
              },
              $set: {
                grammar: gp._id,
                front: gp.label,
                back: meaning,
                order: idx + 1,
                tags: [level],
                examples: firstExample ? [{ sentence: firstExample.sentence, translation: firstExample.translation ?? "" }] : [],
              },
            },
            upsert: true,
          },
        };
      });

      await this.cardModel.bulkWrite(ops, { ordered: false });
      total += ops.length;
    }
    return total;
  }

  async syncKanjiDecks(): Promise<number> {
    let total = 0;
    for (const level of LEVELS) {
      const deckId = await this.ensureSystemDeck({
        systemKey: `kanji:${level}`,
        title: `Kanji ${level}`,
        summary: `Bộ thẻ mặc định toàn bộ chữ Kanji ${level} đã xuất bản.`,
        level,
        pillar: "kanji",
        category: "Kanji",
      });

      const kanjis = await this.kanjiModel
        .find({ status: "PUBLISHED", level })
        .sort({ rank: 1, _id: 1 })
        .lean();

      if (kanjis.length === 0) continue;

      const match = await this.cardMatcher(deckId, "kanji");
      const ops = kanjis.map((k, idx) => {
        const { filter, insertKey } = match(k._id);
        const meanings = Array.isArray(k.meanings) && k.meanings.length > 0 ? k.meanings.join(", ") : "";
        const backParts = [k.hanViet ? `[${k.hanViet}]` : "", meanings].filter(Boolean);
        const readingParts = [
          ...(Array.isArray(k.onyomi) ? k.onyomi.slice(0, 2) : []),
          ...(Array.isArray(k.kunyomi) ? k.kunyomi.slice(0, 2) : []),
        ];
        return {
          updateOne: {
            filter,
            update: {
              $setOnInsert: {
                deck: deckId,
                ...insertKey,
                kind: "KANJI" as const,
                origin: "import" as const,
              },
              $set: {
                kanji: k._id,
                front: k.char,
                back: backParts.join(" — ") || k.char,
                reading: readingParts.join(" · "),
                hanViet: k.hanViet || "",
                order: k.rank || idx + 1,
                tags: [level],
              },
            },
            upsert: true,
          },
        };
      });

      await this.cardModel.bulkWrite(ops, { ordered: false });
      total += ops.length;
    }
    return total;
  }
}
