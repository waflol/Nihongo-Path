import { Module, type DynamicModule } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Flashcard, FlashcardSchema } from "../flashcards/schemas/card.schema.js";
import { CardReport, CardReportSchema } from "../flashcards/schemas/card-report.schema.js";
import { FlashcardDeck, FlashcardDeckSchema } from "../flashcards/schemas/deck.schema.js";
import { HanVietCheckLog, HanVietCheckLogSchema } from "../flashcards/schemas/han-viet-check-log.schema.js";
import { PdfJobPage, PdfJobPageSchema, PdfJobRecord, PdfJobRecordSchema } from "../import/schemas/pdf-job.schema.js";
import { AuditLog, AuditLogSchema } from "../logs/audit-log.schema.js";
import { RequestLog, RequestLogSchema } from "../logs/request-log.schema.js";
import { PushSubscription, PushSubscriptionSchema } from "../notifications/schemas/push-subscription.schema.js";
import { UserCardProgress, UserCardProgressSchema } from "../srs/schemas/progress.schema.js";
import { StudySession, StudySessionSchema } from "../srs/schemas/session.schema.js";
import { AccountDeletionService } from "./account-deletion.service.js";
import { buildAuthModule } from "../auth/auth.module.js";
import { AdminUsersController } from "./admin-users.controller.js";
import { AdminUsersService } from "./admin-users.service.js";
import { UsersController } from "./users.controller.js";
import { UsersService } from "./users.service.js";

/**
 * Identity — own-profile read/update surface (P2-USER-01, spec §4.1).
 *
 * `UsersService` injects `@InjectModel(User.name)`, which only exists when
 * `buildAuthModule()` has registered the identity models. That happens only
 * with a `MONGODB_URL`, so this module is built conditionally to keep the
 * graceful-degrade contract: no DB → no users endpoints, and no DI error.
 */
export function buildUsersModule(): DynamicModule {
  if (!process.env.MONGODB_URL?.trim()) {
    return { module: UsersModule };
  }

  return {
    module: UsersModule,
    imports: [
      buildAuthModule(),
      // Models the self-service account deletion has to clean (same schemas
      // other modules register; Mongoose reuses the one compiled model).
      MongooseModule.forFeature([
        { name: FlashcardDeck.name, schema: FlashcardDeckSchema },
        { name: Flashcard.name, schema: FlashcardSchema },
        { name: CardReport.name, schema: CardReportSchema },
        { name: HanVietCheckLog.name, schema: HanVietCheckLogSchema },
        { name: UserCardProgress.name, schema: UserCardProgressSchema },
        { name: StudySession.name, schema: StudySessionSchema },
        { name: PushSubscription.name, schema: PushSubscriptionSchema },
        { name: PdfJobRecord.name, schema: PdfJobRecordSchema },
        { name: PdfJobPage.name, schema: PdfJobPageSchema },
        { name: AuditLog.name, schema: AuditLogSchema },
        { name: RequestLog.name, schema: RequestLogSchema },
      ]),
    ],
    controllers: [UsersController, AdminUsersController],
    providers: [UsersService, AdminUsersService, AccountDeletionService],
  };
}

/** Empty placeholder returned when no `MONGODB_URL` is configured. */
@Module({})
export class UsersModule {}
