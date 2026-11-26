import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { FeatureConfigDto } from "./entitlements.controller.js";

/** Same options as the global `ValidationPipe` in `main.ts`. */
const errorsFor = (limit: unknown) =>
  validate(plainToInstance(FeatureConfigDto, { limits: [{ plan: "VIP", limit }] }), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

describe("FeatureConfigDto limits", () => {
  it("accepts null (unlimited), zero and a positive integer", async () => {
    for (const limit of [null, 0, 5]) expect(await errorsFor(limit)).toEqual([]);
  });

  it("rejects a missing, negative, fractional or non-numeric limit", async () => {
    for (const limit of [undefined, -1, 1.5, "5"]) {
      expect(await errorsFor(limit)).not.toEqual([]);
    }
  });
});
