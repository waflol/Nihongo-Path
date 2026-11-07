import { describe, expect, it } from "vitest";
import { questionKey } from "./exercise-questions.service.js";

describe("questionKey", () => {
  it("ignores the order of the options", () => {
    const a = questionKey("d", "c", "kanji-pick", "肥料", ["肥料", "肥糧", "把料", "肥科"]);
    const b = questionKey("d", "c", "kanji-pick", "肥料", ["肥科", "肥料", "肥糧", "把料"]);
    expect(a).toBe(b);
  });

  it("keeps a different set of distractors as a different question", () => {
    const a = questionKey("d", "c", "kanji-pick", "肥料", ["肥料", "肥糧", "把料", "肥科"]);
    const b = questionKey("d", "c", "kanji-pick", "肥料", ["肥料", "肥粮", "把料", "肥科"]);
    expect(a).not.toBe(b);
  });

  it("separates cards and kinds", () => {
    const opts = ["a", "b", "c", "d"];
    expect(questionKey("d", "c1", "kanji-pick", "a", opts)).not.toBe(questionKey("d", "c2", "kanji-pick", "a", opts));
    expect(questionKey("d", "c1", "kanji-pick", "a", opts)).not.toBe(questionKey("d", "c1", "reading-pick", "a", opts));
  });
});
