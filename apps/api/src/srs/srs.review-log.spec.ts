import { describe, expect, it } from "vitest";
import {
  MAX_BACKDATE_MS,
  MAX_FUTURE_MS,
  orderReviews,
  resolveReviewedAt,
} from "./srs.review-log.js";

const NOW = Date.UTC(2026, 10, 19, 12);

describe("resolveReviewedAt", () => {
  it("uses server time when the client sends none", () => {
    expect(resolveReviewedAt(undefined, NOW)).toEqual({ at: NOW, clockAdjusted: false });
  });
  it("accepts a plausible client time", () => {
    expect(resolveReviewedAt(NOW - 3600_000, NOW)).toEqual({ at: NOW - 3600_000, clockAdjusted: false });
  });
  it("rejects too old / future times and flags them", () => {
    expect(resolveReviewedAt(NOW - MAX_BACKDATE_MS - 1, NOW)).toEqual({ at: NOW, clockAdjusted: true });
    expect(resolveReviewedAt(NOW + MAX_FUTURE_MS + 1, NOW)).toEqual({ at: NOW, clockAdjusted: true });
    expect(resolveReviewedAt(Number.NaN, NOW).clockAdjusted).toBe(true);
  });
  it("rejects a time before the card's previous review", () => {
    expect(resolveReviewedAt(NOW - 2000, NOW, NOW - 1000).clockAdjusted).toBe(true);
  });
});

describe("orderReviews", () => {
  it("orders by reviewedAt, keeping arrival order for ties and missing times", () => {
    const out = orderReviews([
      { id: "c", reviewedAt: 30 },
      { id: "a", reviewedAt: 10 },
      { id: "x" },
      { id: "b", reviewedAt: 10 },
    ]).map((r) => r.id);
    expect(out).toEqual(["a", "b", "c", "x"]);
  });
});
