import { describe, expect, it } from "vitest";
import { isValidCliModel } from "./ai-antigravity-cli.js";
import { normaliseModels } from "./ai-models.js";
import { AI_PROVIDERS, providerById } from "./ai-providers.js";

describe("Cloudflare nonChat guard", () => {
  const re = providerById("cloudflare")!.nonChat!;

  it("rejects task-specific models that cannot hold a chat", () => {
    for (const id of [
      "@cf/openai/whisper",
      "@cf/baai/bge-m3",
      "@cf/black-forest-labs/flux-1-schnell",
      "@cf/myshell-ai/melotts",
    ]) expect(re.test(id), id).toBe(true);
  });

  it("accepts the chat models Cloudflare offers", () => {
    for (const id of [
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      "@cf/google/gemma-3-12b-it",
      "@cf/mistralai/mistral-small-3.1-24b-instruct",
      "@cf/meta/llama-3.1-8b-instruct",
    ]) expect(re.test(id), id).toBe(false);
  });
});

describe("Cloudflare translation task models", () => {
  const cf = providerById("cloudflare")!;

  it("m2m100 is a translator (not rejected as non-chat); indictrans2 cannot do ja→vi", () => {
    expect(cf.translators).toContain("@cf/meta/m2m100-1.2b");
    expect(cf.nonChat!.test("@cf/meta/m2m100-1.2b")).toBe(false);
    expect(cf.notJaVi!.test("@cf/ai4bharat/indictrans2-en-indic-1B")).toBe(true);
    expect(cf.notJaVi!.test("@cf/meta/m2m100-1.2b")).toBe(false);
  });
});

describe("Google AI Pro (Antigravity CLI) preset", () => {
  const p = providerById("antigravity")!;

  it("runs through the CLI: no key, no URL, and the CLI picks the model by default", () => {
    expect(p.kind).toBe("antigravity-cli");
    expect(p.cli).toBe(true);
    expect(p.baseUrl).toBe("");
    expect(p.keyUrl).toBe("");
    expect(p.defaultModel).toBe("default");
    expect(p.staticModels).toContain(p.defaultModel);
  });

  it("offers fallback models, each with a note, and every id is safe for `--model`", () => {
    expect(p.staticModels!.length).toBeGreaterThan(3);
    for (const id of p.staticModels!) {
      expect(p.modelNotes![id], id).toBeTruthy();
      expect(isValidCliModel(id), id).toBe(true);
    }
    expect(isValidCliModel("--yolo")).toBe(false);
    expect(isValidCliModel("a b")).toBe(false);
  });

  it("the picker lists them as unknown-cost (a subscription, not a free key)", () => {
    const list = normaliseModels(p, {});
    expect(list.map((m) => m.id)).toEqual(p.staticModels);
    expect(list.every((m) => m.tier === "unknown")).toBe(true);
    expect(list.find((m) => m.id === "default")).toMatchObject({ isDefault: true });
  });

  it("is the only CLI preset, and the retired Gemini CLI one is gone", () => {
    expect(AI_PROVIDERS.filter((x) => x.cli).map((x) => x.id)).toEqual(["antigravity"]);
    expect(providerById("gemini-cli")).toBeUndefined();
  });
});
