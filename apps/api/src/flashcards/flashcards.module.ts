import { Module, type DynamicModule } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { buildDatabaseModule } from "../database/database.module.js";
import { FlashcardDeck, FlashcardDeckSchema } from "./schemas/deck.schema.js";
import { Flashcard, FlashcardSchema } from "./schemas/card.schema.js";
import { UserCardProgress, UserCardProgressSchema } from "../srs/schemas/progress.schema.js";
import {
  Vocabulary,
  VocabularySchema,
} from "../content/schemas/vocabulary.schema.js";
import {
  GrammarPoint,
  GrammarPointSchema,
} from "../content/schemas/grammar-point.schema.js";
import { FlashcardsController } from "./flashcards.controller.js";
import { FlashcardsService } from "./flashcards.service.js";
import { TatoebaSentenceSchema } from "./schemas/tatoeba.schema.js";
import { ReadingModule } from "./reading.module.js";
import { ImageSuggestService } from "./image-suggest.service.js";
import { buildAiModule } from "../ai/ai.module.js";
import { ReadingOverridesController } from "./reading-overrides.controller.js";
import { ExampleSuggestService } from "./example-suggest.service.js";
import { ExerciseQuestion, ExerciseQuestionSchema } from "./schemas/exercise-question.schema.js";
import { ExerciseQuestionsService } from "./exercise-questions.service.js";
import { CardReport, CardReportSchema } from "./schemas/card-report.schema.js";
import { CardReportsService } from "./card-reports.service.js";

/**
 * Personal-deck + save-a-word surface (P3-CARD-01..04).
 *
 * `buildFlashcardsModule()` keeps the graceful-degrade contract: no
 * `MONGODB_URL` → empty module, routes absent, no DI error. The content
 * models are registered here (as in `ContentModule`) because the save-a-word
 * path reads a `Vocabulary`/`GrammarPoint` entry to snapshot it onto a card
 * (P3-CARD-04); progress model is registered here so the deck-delete cascade
 * can drop the caller's `(user, card)` rows (T-P3-10).
 */
export function buildFlashcardsModule(): DynamicModule {
  if (!process.env.MONGODB_URL?.trim()) {
    return { module: FlashcardsModule };
  }

  return {
    module: FlashcardsModule,
    imports: [
      buildDatabaseModule(),
      ReadingModule,
      buildAiModule(),
      MongooseModule.forFeature([
        { name: FlashcardDeck.name, schema: FlashcardDeckSchema },
        { name: Flashcard.name, schema: FlashcardSchema },
        { name: UserCardProgress.name, schema: UserCardProgressSchema },
        { name: Vocabulary.name, schema: VocabularySchema },
        { name: GrammarPoint.name, schema: GrammarPointSchema },
        { name: "TatoebaSentence", schema: TatoebaSentenceSchema },
        { name: ExerciseQuestion.name, schema: ExerciseQuestionSchema },
        { name: CardReport.name, schema: CardReportSchema },
      ]),
    ],
    controllers: [FlashcardsController, ReadingOverridesController],
    providers: [
      FlashcardsService,
      ImageSuggestService,
      ExampleSuggestService,
      ExerciseQuestionsService,
      CardReportsService,
    ],
  };
}

/** Empty placeholder returned when no `MONGODB_URL` is configured. */
@Module({})
export class FlashcardsModule {}
