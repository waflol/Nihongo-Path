import { modelVersionOf, usageOf } from "./ai-example.service.js";

describe("usageOf / modelVersionOf", () => {
  it("reads Gemini usageMetadata and modelVersion", () => {
    const d = { usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30, totalTokenCount: 150 }, modelVersion: "gemini-3.8-flash-001" };
    expect(usageOf(d)).toEqual({ inputTokens: 120, outputTokens: 30 });
    expect(modelVersionOf(d)).toBe("gemini-3.8-flash-001");
  });
  it("reads OpenAI-style and Anthropic usage", () => {
    expect(usageOf({ usage: { prompt_tokens: 10, completion_tokens: 5 }, model: "gpt-4o-mini-2024" })).toEqual({ inputTokens: 10, outputTokens: 5 });
    expect(usageOf({ usage: { input_tokens: 7, output_tokens: 3 } })).toEqual({ inputTokens: 7, outputTokens: 3 });
  });
  it("is null when the provider reports nothing", () => {
    expect(usageOf({ choices: [] })).toBeNull();
    expect(usageOf(null)).toBeNull();
    expect(modelVersionOf({})).toBeNull();
  });
});
