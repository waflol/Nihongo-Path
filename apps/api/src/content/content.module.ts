import { Module, type DynamicModule } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { buildDatabaseModule } from "../database/database.module.js";
import { ContentController } from "./content.controller.js";
import { ContentService } from "./content.service.js";
import {
  GrammarPoint,
  GrammarPointSchema,
} from "./schemas/grammar-point.schema.js";
import { Textbook, TextbookSchema } from "./schemas/textbook.schema.js";
import { Unit, UnitSchema } from "./schemas/unit.schema.js";
import { Vocabulary, VocabularySchema } from "./schemas/vocabulary.schema.js";

/**
 * Learning-content module (P2-CONTENT-01..05).
 *
 * Built through `buildContentModule()` to keep the graceful-degrade contract:
 * no `MONGODB_URL` → empty module (routes absent, no DI error). The global
 * `AuthGuard`/`RolesGuard` (registered once in `AuthModule`) enforce
 * `@IsPublic()` / `@ContentAdmin()` on these routes — no per-module guard
 * wiring needed here. Content models are registered in this module because
 * it owns `textbooks`, `units`, `vocabulary`, `grammar_points`
 * (database.md §2).
 */
export function buildContentModule(): DynamicModule {
  if (!process.env.MONGODB_URL?.trim()) {
    return { module: ContentModule };
  }

  return {
    module: ContentModule,
    imports: [
      buildDatabaseModule(),
      MongooseModule.forFeature([
        { name: Textbook.name, schema: TextbookSchema },
        { name: Unit.name, schema: UnitSchema },
        { name: Vocabulary.name, schema: VocabularySchema },
        { name: GrammarPoint.name, schema: GrammarPointSchema },
      ]),
    ],
    controllers: [ContentController],
    providers: [ContentService],
  };
}

/** Empty placeholder returned when no `MONGODB_URL` is configured. */
@Module({})
export class ContentModule {}
