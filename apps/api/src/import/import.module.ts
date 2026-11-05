import { Module, type DynamicModule } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { buildDatabaseModule } from "../database/database.module.js";
import { Flashcard, FlashcardSchema } from "../flashcards/schemas/card.schema.js";
import { FlashcardDeck, FlashcardDeckSchema } from "../flashcards/schemas/deck.schema.js";
import { ImportController } from "./import.controller.js";
import { ImportService } from "./import.service.js";
import { ExampleSuggestService } from "../flashcards/example-suggest.service.js";
import { ReadingModule } from "../flashcards/reading.module.js";

/**
 * Bulk flashcard import (P3-IMPORT-01..04): CSV/XLSX → parse → map → preview
 * → idempotent confirm.
 *
 * Graceful-degrade as its siblings: no `MONGODB_URL` → empty module. The
 * import only ever writes into `Flashcard` and reads the target `FlashcardDeck`
 * to check ownership (P3-IMPORT-03/04); the deck's cards are the dedupe
 * source of truth.
 */
export function buildImportModule(): DynamicModule {
  if (!process.env.MONGODB_URL?.trim()) {
    return { module: ImportModule };
  }

  return {
    module: ImportModule,
    imports: [
      buildDatabaseModule(),
      ReadingModule,
      MongooseModule.forFeature([
        { name: Flashcard.name, schema: FlashcardSchema },
        { name: FlashcardDeck.name, schema: FlashcardDeckSchema },
      ]),
    ],
    controllers: [ImportController],
    providers: [ImportService, ExampleSuggestService],
  };
}

/** Empty placeholder returned when no `MONGODB_URL` is configured. */
@Module({})
export class ImportModule {}
