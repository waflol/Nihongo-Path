import { Test } from "@nestjs/testing";
import { getModelToken } from "@nestjs/mongoose";
import { AiExampleService } from "../ai/ai-example.service.js";
import { AiServicesService } from "../ai/ai-services.service.js";
import { EvalController } from "./eval.controller.js";
import { bundledDatasetPath, EvalService } from "./eval.service.js";

const MODELS = ["EvalDataset", "EvalCase", "EvalRun", "EvalCall", "EvalResult", "EvalReview", "EvalJudgeCache", "EvalSettings"];

describe("EvalModule wiring", () => {
  it("resolves the controller and service with the AI services and eval models", async () => {
    const noop = { updateMany: () => ({ exec: async () => undefined }), exists: async () => true, findOne: () => ({ sort: () => ({ lean: () => ({ exec: async () => null }) }) }) };
    const mod = await Test.createTestingModule({
      controllers: [EvalController],
      providers: [
        EvalService,
        { provide: AiServicesService, useValue: {} },
        { provide: AiExampleService, useValue: {} },
        ...MODELS.map((n) => ({ provide: getModelToken(n), useValue: noop })),
      ],
    }).compile();
    expect(mod.get(EvalController)).toBeInstanceOf(EvalController);
    expect(mod.get(EvalService)).toBeInstanceOf(EvalService);
    await mod.close();
  });

  it("finds the bundled dataset file", () => {
    expect(bundledDatasetPath()).toMatch(/japanese_ai_eval_dataset_v2_1000\.json$/);
  });
});
