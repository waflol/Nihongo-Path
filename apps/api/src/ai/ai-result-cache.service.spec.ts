import { describe, expect, it } from "vitest";
import { resKey } from "./ai-result-cache.service.js";

describe("resKey", () => {
  it("puts word, kind, service and model in the key", () => {
    const k = resKey("a".repeat(40), { term: "犬", kind: "write" }, "Gemini Free", "gemini-2.5-flash");
    expect(k).toBe("ai:res:犬:write:aaaaaaaaaaaa:Gemini_Free:gemini-2.5-flash");
  });

  it("strips separators and glob characters", () => {
    const k = resKey("b".repeat(40), { term: "a:b*c", kind: "translate" });
    expect(k).toBe("ai:res:a_b_c:translate:bbbbbbbbbbbb:-:-");
  });
});
