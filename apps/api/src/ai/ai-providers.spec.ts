import { describe, expect, it } from "vitest";
import { providerById } from "./ai-providers.js";

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
