import { Module, type DynamicModule } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { buildAiModule } from "../ai/ai.module.js";
import { buildDatabaseModule } from "../database/database.module.js";
import { EvalController } from "./eval.controller.js";
import {
  EvalCallSchema,
  EvalCaseSchema,
  EvalDatasetSchema,
  EvalJudgeCacheSchema,
  EvalResultSchema,
  EvalReviewSchema,
  EvalRunSchema,
  EvalSettingsSchema,
} from "./eval.schemas.js";
import { EvalService } from "./eval.service.js";

/**
 * Japanese AI evaluation benchmark (admin). Uses the shared AI module to call
 * services; stores everything in its own `eval_*` collections. No
 * `MONGODB_URL` → empty module.
 */
export function buildEvalModule(): DynamicModule {
  if (!process.env.MONGODB_URL?.trim()) return { module: EvalModule };
  return {
    module: EvalModule,
    imports: [
      buildDatabaseModule(),
      buildAiModule(),
      MongooseModule.forFeature([
        { name: "EvalDataset", schema: EvalDatasetSchema },
        { name: "EvalCase", schema: EvalCaseSchema },
        { name: "EvalRun", schema: EvalRunSchema },
        { name: "EvalCall", schema: EvalCallSchema },
        { name: "EvalResult", schema: EvalResultSchema },
        { name: "EvalReview", schema: EvalReviewSchema },
        { name: "EvalJudgeCache", schema: EvalJudgeCacheSchema },
        { name: "EvalSettings", schema: EvalSettingsSchema },
      ]),
    ],
    controllers: [EvalController],
    providers: [EvalService],
  };
}

@Module({})
export class EvalModule {}
