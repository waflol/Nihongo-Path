import { Module, type DynamicModule } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { buildDatabaseModule } from "../database/database.module.js";
import { Flashcard, FlashcardSchema } from "../flashcards/schemas/card.schema.js";
import { FlashcardDeck, FlashcardDeckSchema } from "../flashcards/schemas/deck.schema.js";
import { UserCardProgress, UserCardProgressSchema } from "./schemas/progress.schema.js";
import { StudySession, StudySessionSchema } from "./schemas/session.schema.js";
import { User, UserSchema } from "../users/schemas/user.schema.js";
import { SrsController } from "./srs.controller.js";
import { SrsService } from "./srs.service.js";

/**
 * SRS scheduling + review queue (P3-SRS-02..06).
 *
 * Graceful-degrade as its siblings: no `MONGODB_URL` → empty module. The deck
 * and card models are registered here (as in `FlashcardsModule`) because the
 * queue resolves a deck, reads its cards, and cross-references the caller's
 * progress (P3-SRS-04). `User` is registered for the profile-timezone
 * fallback (P3-SRS-05).
 */
export function buildSrsModule(): DynamicModule {
  if (!process.env.MONGODB_URL?.trim()) {
    return { module: SrsModule };
  }

  return {
    module: SrsModule,
    imports: [
      buildDatabaseModule(),
      MongooseModule.forFeature([
        { name: Flashcard.name, schema: FlashcardSchema },
        { name: FlashcardDeck.name, schema: FlashcardDeckSchema },
        { name: UserCardProgress.name, schema: UserCardProgressSchema },
        { name: StudySession.name, schema: StudySessionSchema },
        { name: User.name, schema: UserSchema },
      ]),
    ],
    controllers: [SrsController],
    providers: [SrsService],
  };
}

/** Empty placeholder returned when no `MONGODB_URL` is configured. */
@Module({})
export class SrsModule {}
