import { Module, type DynamicModule } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { buildDatabaseModule } from "../database/database.module.js";
import {
  ExerciseQuestion,
  ExerciseQuestionSchema,
} from "../flashcards/schemas/exercise-question.schema.js";
import { User, UserSchema } from "../users/schemas/user.schema.js";
import { Exam, ExamSchema } from "./schemas/exam.schema.js";
import { ExamAttempt, ExamAttemptSchema } from "./schemas/attempt.schema.js";
import { ExamStimulus, ExamStimulusSchema } from "./schemas/stimulus.schema.js";
import { buildAiModule } from "../ai/ai.module.js";
import { ExamAudioController } from "./exam-audio.controller.js";
import { ExamAudioService } from "./exam-audio.service.js";
import { ExamAudioAsset, ExamAudioAssetSchema } from "./schemas/audio-asset.schema.js";
import { ExamImportController } from "./exam-import.controller.js";
import { ExamImportService } from "./exam-import.service.js";
import { ExamImportDraft, ExamImportDraftSchema } from "./schemas/import-draft.schema.js";
import {
  ExamImportJob,
  ExamImportJobSchema,
  ExamImportJobPage,
  ExamImportJobPageSchema,
} from "./schemas/import-job.schema.js";
import { ExamsController } from "./exams.controller.js";
import { ExamsService } from "./exams.service.js";
import { StimuliService } from "./stimuli.service.js";

/**
 * Exams (P4-EXAM-01…09). Graceful-degrade like its P3 siblings: no
 * `MONGODB_URL` → empty module, routes absent, no DI error.
 *
 * `ExerciseQuestion` (the P3 question bank) is registered here — as
 * `SrsModule` re-registers `Flashcard` / `User` — because the exam engine
 * grades against the bank and the admin authors standalone rows.
 */
export function buildExamsModule(): DynamicModule {
  if (!process.env.MONGODB_URL?.trim()) {
    return { module: ExamsModule };
  }

  return {
    module: ExamsModule,
    imports: [
      buildDatabaseModule(),
      buildAiModule(),
      MongooseModule.forFeature([
        { name: ExerciseQuestion.name, schema: ExerciseQuestionSchema },
        { name: Exam.name, schema: ExamSchema },
        { name: ExamAttempt.name, schema: ExamAttemptSchema },
        { name: ExamStimulus.name, schema: ExamStimulusSchema },
        { name: ExamImportJob.name, schema: ExamImportJobSchema },
        { name: ExamImportJobPage.name, schema: ExamImportJobPageSchema },
        { name: ExamImportDraft.name, schema: ExamImportDraftSchema },
        { name: ExamAudioAsset.name, schema: ExamAudioAssetSchema },
        { name: User.name, schema: UserSchema },
      ]),
    ],
    controllers: [ExamsController, ExamImportController, ExamAudioController],
    providers: [ExamsService, StimuliService, ExamImportService, ExamAudioService],
  };
}

/** Empty placeholder returned when no `MONGODB_URL` is configured. */
@Module({})
export class ExamsModule {}
