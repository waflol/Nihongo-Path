import { describe, expect, it } from "vitest";
import { grammarTextbookFilter } from "./grammar-filter.js";

describe("grammar textbook filter", () => {
  it("matches an imported textbook lesson by slug", () => {
    expect(grammarTextbookFilter("minna", "3")).toEqual({
      textbookRefs: { $elemMatch: { textbookId: "minna", unitId: "3" } },
    });
  });

  it("uses the ObjectId relation for local textbooks", () => {
    expect(Object.keys(grammarTextbookFilter("6b0817685fe8725b34fe6330"))).toEqual(["textbooks"]);
  });

  it("adds nothing without a textbook", () => {
    expect(grammarTextbookFilter(undefined, "3")).toEqual({});
  });
});
