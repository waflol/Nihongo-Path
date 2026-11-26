import { Module, type DynamicModule } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { buildAuthModule } from "../auth/auth.module.js";
import { Flashcard, FlashcardSchema } from "../flashcards/schemas/card.schema.js";
import { FlashcardDeck, FlashcardDeckSchema } from "../flashcards/schemas/deck.schema.js";
import { AdminFeedbackController } from "./admin-feedback.controller.js";
import { FeedbackController } from "./feedback.controller.js";
import { FeedbackService } from "./feedback.service.js";
import { UserFeedback, UserFeedbackSchema } from "./schemas/user-feedback.schema.js";

/**
 * General learner feedback (P5-FEEDBACK-01/02): one collection with a
 * lifecycle (`OPEN → IN_PROGRESS → RESOLVED/REJECTED`) and an embedded
 * `history` of every admin status change, surfaced at `/admin/feedback`
 * (P5-FEEDBACK-02 inbox). Same graceful-degrade contract as the other
 * feature modules: no `MONGODB_URL` → empty module.
 */
export function buildFeedbackModule(): DynamicModule {
  if (!process.env.MONGODB_URL?.trim()) {
    return { module: FeedbackModule };
  }
  return {
    module: FeedbackModule,
    imports: [
      buildAuthModule(),
      MongooseModule.forFeature([
        { name: UserFeedback.name, schema: UserFeedbackSchema },
        // Read-only: resolve a feedback's card target → deck for the inbox deep link.
        { name: Flashcard.name, schema: FlashcardSchema },
        { name: FlashcardDeck.name, schema: FlashcardDeckSchema },
      ]),
    ],
    controllers: [FeedbackController, AdminFeedbackController],
    providers: [FeedbackService],
  };
}

@Module({})
export class FeedbackModule {}
