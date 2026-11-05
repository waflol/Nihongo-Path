import { describe, expect, it } from "vitest";
import { nvidiaModels, type NvidiaEndpoint } from "./ai-nvidia.js";

const ep = (id: string, tags: string[], free = true, partner = false): NvidiaEndpoint => ({ id, tags, free, partner });

const catalog: NvidiaEndpoint[] = [
  ep("google/gemma-4-31b-it", ["chat", "text-to-text"], true, true),
  ep("nvidia/riva-translate-4b-instruct-v2", ["text translation"]),
  ep("z-ai/glm-5-3-flash", ["chat"], true, true), // catalog spelling differs from the API id
  ep("moonshotai/kimi-k3_1-pro", ["chat"], false, true), // partner only, not in the API list
  ep("nvidia/kumo-tabular", ["prediction", "tabular models"]), // not a text model
  ep("nvidia/magpie-tts-zeroshot", ["tts"]),
  ep("meta/llama-guard-4-12b", ["chat"]), // safety model → dropped by the suitability filter
  ep("nvidia/nemotron-3.5-bolt-e4b", ["chat"]), // 4B → too small
];
const apiIds = ["google/gemma-4-31b-it", "nvidia/riva-translate-4b-instruct-v2", "z-ai/glm-5.3-flash", "meta/llama-guard-4-12b", "mistralai/old-model-not-in-catalog"];

describe("nvidiaModels", () => {
  const out = nvidiaModels(catalog, apiIds, "google/gemma-4-31b-it");
  const byId = new Map(out.map((m) => [m.id, m]));

  it("keeps only the catalog's text models that suit translation, not API-only legacy models", () => {
    expect(out.map((m) => m.id).sort()).toEqual(
      ["google/gemma-4-31b-it", "moonshotai/kimi-k3_1-pro", "nvidia/riva-translate-4b-instruct-v2", "z-ai/glm-5.3-flash"].sort(),
    );
  });

  it("uses the API's spelling of the id when only the punctuation differs", () => {
    expect(byId.has("z-ai/glm-5.3-flash")).toBe(true);
    expect(byId.has("z-ai/glm-5-3-flash")).toBe(false);
  });

  it("tags free vs partner and flags entries the API does not list", () => {
    expect(byId.get("google/gemma-4-31b-it")).toMatchObject({ tier: "free", basis: "exact", isDefault: true });
    expect(byId.get("google/gemma-4-31b-it")!.note).toContain("Partner");
    const kimi = byId.get("moonshotai/kimi-k3_1-pro")!;
    expect(kimi.tier).toBe("unknown");
    expect(kimi.note).toContain("Partner Endpoint");
    expect(kimi.note).toContain("không có trong API");
  });

  it("lists the default first, then translators, then free, then partner-only", () => {
    expect(out.map((m) => m.id)).toEqual([
      "google/gemma-4-31b-it",
      "nvidia/riva-translate-4b-instruct-v2",
      "z-ai/glm-5.3-flash",
      "moonshotai/kimi-k3_1-pro",
    ]);
  });
});
