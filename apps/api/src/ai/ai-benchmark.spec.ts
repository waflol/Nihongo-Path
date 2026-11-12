import { describe, expect, it } from "vitest";
import { bestOf, chrF, rankServices, speedScore, type BenchResult } from "./ai-benchmark.js";

describe("chrF", () => {
  it("is 100 for identical text (ignoring case and punctuation) and 0 for unrelated or empty", () => {
    expect(chrF("Anh ấy là người giữ lời hứa.", "anh ấy là người giữ lời hứa")).toBeCloseTo(100, 5);
    expect(chrF("", "abc")).toBe(0);
    expect(chrF("xyz", "abc")).toBe(0);
  });

  it("scores a close paraphrase well above a wrong sentence", () => {
    const ref = "Hôm nay thời tiết đẹp nên chúng ta đi dạo nhé.";
    const close = chrF("Hôm nay trời đẹp nên chúng ta đi dạo nhé.", ref);
    const wrong = chrF("Tôi muốn ăn một bát phở bò.", ref);
    expect(close).toBeGreaterThan(60);
    expect(wrong).toBeLessThan(close - 25);
  });
});

describe("speedScore (fixed log scale, 2 s → 100, 30 s → 0)", () => {
  it("clips at both ends and is monotonic", () => {
    expect(speedScore(500)).toBe(100);
    expect(speedScore(2000)).toBe(100);
    expect(speedScore(30000)).toBeCloseTo(0, 5);
    expect(speedScore(60000)).toBe(0);
    expect(speedScore(6600)).toBeCloseTo(55.9, 0);
    expect(speedScore(11000)).toBeCloseTo(37.0, 0);
    expect(speedScore(0)).toBe(0);
    expect(speedScore(Number.NaN)).toBe(0);
    const xs = [1000, 2500, 4000, 8000, 15000, 29000].map((ms) => speedScore(ms));
    expect([...xs].sort((a, b) => b - a)).toEqual(xs);
  });
});

describe("rankServices", () => {
  const b = (accuracy: number, ms: number, successRate?: number): Pick<BenchResult, "ok" | "accuracy" | "ms" | "successRate"> => ({ ok: true, accuracy, ms, successRate });
  const live = [
    { id: "gemini", bench: b(92.6, 6600) },
    { id: "cohere", bench: b(92.8, 6900) },
    { id: "groq", bench: b(85.8, 6300) },
    { id: "m2m", bench: b(62.3, 11000) },
  ];

  it("ranks the live data: eligible first by combined score, the one below the bar last", () => {
    const r = rankServices(live, { speedWeight: 0.3 });
    expect(r.map((x) => x.id)).toEqual(["gemini", "cohere", "groq", "m2m"]);
    expect(r.find((x) => x.id === "gemini")!.final).toBeCloseTo(81.6, 0);
    expect(r.find((x) => x.id === "groq")!.final).toBeCloseTo(77.3, 0);
    expect(r.find((x) => x.id === "m2m")).toMatchObject({ eligible: false, pareto: false });
    expect(r.find((x) => x.id === "m2m")!.final).toBeCloseTo(54.7, 0);
  });

  it("a score does not change when another service is added (no pool-relative scale)", () => {
    const before = rankServices(live).find((x) => x.id === "gemini")!;
    const after = rankServices([...live, { id: "tiny", bench: b(80, 800) }]).find((x) => x.id === "gemini")!;
    expect(after.speed).toBe(before.speed);
    expect(after.final).toBe(before.final);
  });

  it("equal latencies give equal speed scores, no NaN", () => {
    const r = rankServices([{ id: "a", bench: b(90, 5000) }, { id: "b", bench: b(80, 5000) }]);
    expect(r[0].speed).toBe(r[1].speed);
    expect(r.every((x) => Number.isFinite(x.final))).toBe(true);
  });

  it("a very slow service is clipped at 0 and does not change the others", () => {
    const base = rankServices(live).find((x) => x.id === "groq")!;
    const withSlow = rankServices([...live, { id: "slow", bench: b(90, 90000) }]);
    expect(withSlow.find((x) => x.id === "slow")!.speed).toBe(0);
    expect(withSlow.find((x) => x.id === "groq")!.final).toBe(base.final);
  });

  it("failed or unmeasured services are absent", () => {
    const r = rankServices([...live, { id: "dead", bench: { ok: false, accuracy: 0, ms: 100 } }, { id: "none", bench: null }, { id: "undef" }]);
    expect(r.map((x) => x.id)).not.toContain("dead");
    expect(r.map((x) => x.id)).not.toContain("none");
    expect(r).toHaveLength(4);
  });

  it("the success rate scales the final score", () => {
    const [full, flaky] = rankServices([{ id: "full", bench: b(90, 4000, 1) }, { id: "flaky", bench: b(90, 4000, 0.5) }]);
    expect(flaky.final).toBeCloseTo(full.final / 2, 0);
    expect(rankServices([{ id: "full", bench: b(90, 4000, 1) }, { id: "flaky", bench: b(90, 4000, 0.5) }])[0].id).toBe("full");
  });

  it("ties keep the input order when accuracy and speed are equal too", () => {
    const t = rankServices([{ id: "a", bench: b(75, 2000) }, { id: "b", bench: b(75, 2000) }], { speedWeight: 0 });
    expect(t.map((x) => x.id)).toEqual(["a", "b"]); // fully equal → input order is kept
  });

  it("clamps the speed weight to 0–1 and honours a custom minimum accuracy", () => {
    const heavy = rankServices([{ id: "x", bench: b(80, 2000) }], { speedWeight: 5 })[0];
    expect(heavy.final).toBe(100);
    const none = rankServices([{ id: "x", bench: b(80, 2000) }], { speedWeight: -1 })[0];
    expect(none.final).toBe(80);
    expect(rankServices([{ id: "x", bench: b(80, 2000) }], { minAccuracy: 85 })[0].eligible).toBe(false);
  });

  it("marks the Pareto frontier among eligible services only", () => {
    const r = rankServices([
      { id: "best", bench: b(95, 3000) },
      { id: "dominated", bench: b(90, 6000) }, // worse on both
      { id: "fast", bench: b(80, 1500) }, // faster, less accurate → still on the frontier
      { id: "cheap-and-bad", bench: b(50, 500) }, // below the bar → never on the frontier
    ]);
    const p = Object.fromEntries(r.map((x) => [x.id, x.pareto]));
    expect(p).toEqual({ best: true, dominated: false, fast: true, "cheap-and-bad": false });
  });
});

describe("bestOf — the four situations", () => {
  const b = (accuracy: number, ms: number) => ({ ok: true, accuracy, ms });
  const ranked = rankServices([
    { id: "A", bench: b(96, 12000) }, // accurate but slow
    { id: "B", bench: b(82, 2500) }, // fast but lower quality
    { id: "C", bench: b(92, 5000) }, // good and medium speed
    { id: "D", bench: b(55, 1000) }, // very fast, below the bar
  ]);
  const best = bestOf(ranked);

  it("C is best overall, A most accurate, B fastest; D is never picked", () => {
    expect(best).toMatchObject({ overall: "C", accuracy: "A", speed: "B" });
    expect(Object.values(best)).not.toContain("D");
    expect(ranked.find((r) => r.id === "D")!.eligible).toBe(false);
    expect(ranked[ranked.length - 1].id).toBe("D");
  });

  it("best value is the fastest strong service on the frontier (within 5 points of the best)", () => {
    expect(best.value).toBe("C");
  });

  it("within one accuracy point the faster service is 'most accurate'", () => {
    const r = rankServices([{ id: "slowTop", bench: b(93, 9000) }, { id: "fastClose", bench: b(92.4, 3000) }]);
    expect(bestOf(r).accuracy).toBe("fastClose");
  });

  it("returns nothing when no service reaches the accuracy bar", () => {
    expect(bestOf(rankServices([{ id: "x", bench: b(50, 1000) }, { id: "y", bench: b(60, 2000) }]))).toEqual({});
    expect(bestOf([])).toEqual({});
  });
});
