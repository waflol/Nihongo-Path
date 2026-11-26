import { Module, type DynamicModule } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { buildDatabaseModule } from "../database/database.module.js";
import { Flashcard, FlashcardSchema } from "../flashcards/schemas/card.schema.js";
import { GrammarPoint, GrammarPointSchema } from "../content/schemas/grammar-point.schema.js";
import { FlashcardDeck, FlashcardDeckSchema } from "../flashcards/schemas/deck.schema.js";
import { UserCardProgress, UserCardProgressSchema } from "../srs/schemas/progress.schema.js";
import { SrsReviewLog, SrsReviewLogSchema } from "../srs/schemas/review-log.schema.js";
import { StudySession, StudySessionSchema } from "../srs/schemas/session.schema.js";
import { SrsService } from "../srs/srs.service.js";
import { User, UserSchema } from "../users/schemas/user.schema.js";
import { NotificationsController } from "./notifications.controller.js";
import { NotificationsService, readPushConfig } from "./notifications.service.js";
import { PushSubscription, PushSubscriptionSchema } from "./schemas/push-subscription.schema.js";

/**
 * Web Push review reminders (docs/plans/plan-pwa.md, P2).
 *
 * Graceful-degrade like its siblings: no `MONGODB_URL` or no VAPID keys →
 * empty module, the /notifications routes are simply absent (the UI then
 * shows "server has not enabled notifications"). Generate keys with
 * `npx web-push generate-vapid-keys`.
 *
 * SrsService is provided here too (with the models it injects) so the
 * reminder counts due words with exactly the review page's logic.
 */
export function buildNotificationsModule(): DynamicModule {
  if (!process.env.MONGODB_URL?.trim() || !readPushConfig()) {
    return { module: NotificationsModule };
  }

  return {
    module: NotificationsModule,
    imports: [
      buildDatabaseModule(),
      MongooseModule.forFeature([
        { name: PushSubscription.name, schema: PushSubscriptionSchema },
        { name: Flashcard.name, schema: FlashcardSchema },
        { name: GrammarPoint.name, schema: GrammarPointSchema },
        { name: FlashcardDeck.name, schema: FlashcardDeckSchema },
        { name: UserCardProgress.name, schema: UserCardProgressSchema },
        { name: StudySession.name, schema: StudySessionSchema },
        { name: SrsReviewLog.name, schema: SrsReviewLogSchema },
        { name: User.name, schema: UserSchema },
      ]),
    ],
    controllers: [NotificationsController],
    providers: [NotificationsService, SrsService],
  };
}

/** Empty placeholder returned when MongoDB or the VAPID keys are missing. */
@Module({})
export class NotificationsModule {}
