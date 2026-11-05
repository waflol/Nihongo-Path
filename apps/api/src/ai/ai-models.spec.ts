import { describe, expect, it } from "vitest";
import { suitableForTranslation as ok } from "./ai-models.js";

describe("suitableForTranslation", () => {
  it("keeps general chat models", () => {
    for (const id of [
      "meta-llama/llama-3.3-70b-instruct:free",
      "Meta-Llama-3.3-70B-Instruct",
      "llama-3.3-70b-versatile",
      "google/gemma-4-31b-it",
      "gemini-3.8-flash",
      "mistralai/mistral-large-2-instruct",
      "qwen/qwen3-30b-a3b",
      "openai/gpt-oss-120b",
    ]) expect(ok(id), id).toBe(true);
  });

  it("drops code, vision, safety, reasoning, base, legacy and tiny models", () => {
    for (const id of [
      "mistralai/codestral-22b-instruct-v0.1",
      "meta/codellama-70b",
      "meta/llama-3.2-90b-vision-instruct",
      "nvidia/llama-3.1-nemoguard-8b-content-safety",
      "meta/llama-guard-4-12b",
      "deepseek-ai/deepseek-r1",
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
      "meta/llama2-70b",
      "google/gemma-3-4b-it",
      "google/gemma-2b",
      "google/deplot",
      "nvidia/nemotron-3.5-super-vl:free",
      "nvidia/nemotron-parse",
      "writer/palmyra-med-70b",
      "microsoft/kosmos-2",
      "mistralai/mixtral-8x22b-v0.1",
      "nvidia/nemotron-3.5-bolt-e4b",
      "mistralai/mistral-7b-instruct-v0.3",
      "nvidia/llama3-chatqa-1.5-70b",
      "text-embedding-004",
    ]) expect(ok(id), id).toBe(false);
  });

  it("always keeps dedicated translators, even small ones", () => {
    expect(ok("nvidia/riva-translate-4b-instruct")).toBe(true);
    expect(ok("facebook/nllb-200-3.3b")).toBe(true);
  });
});
