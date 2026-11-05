import { describe, expect, it } from "vitest";
import {
  aggregateRuns,
  BENCH_ITEMS,
  bestOf,
  chrF,
  completenessScore,
  latencyStats,
  rankServices,
  scoreBenchmark,
  speedScore,
  terminologyScore,
  type BenchAttempt,
  type BenchResult,
} from "./ai-benchmark.js";
import type { AiResult } from "./ai-example.service.js";

/** A perfect answer sheet built from the reference data. */
function perfect(): Map<number, AiResult> {
  const m = new Map<number, AiResult>();
  BENCH_ITEMS.forEach((it, i) => {
    m.set(
      i + 1,
      it.task.kind === "translate"
        ? { vi: it.ref!, matches: it.expectMatch }
        : { ja: `${it.stem}です。`, vi: "câu ví dụ" },
    );
  });
  return m;
}

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

describe("terminologyScore / completenessScore", () => {
  it("terminology: 100 when any accepted rendering is present (diacritics and case aware), else 0", () => {
    expect(terminologyScore("Anh ấy luôn giữ lời hứa.", ["hứa"])).toBe(100);
    expect(terminologyScore("Cô ấy đang NỖ LỰC học tập.", ["hết sức", "nỗ lực"])).toBe(100);
    expect(terminologyScore("Anh ấy luôn giữ lời hua.", ["hứa"])).toBe(0);
    expect(terminologyScore("", ["hứa"])).toBe(0);
  });

  it("completeness: 100 in 0.7–1.4× of the reference length, falling to 0 at 0.3× and 2.2×", () => {
    const ref = "một hai ba bốn năm sáu bảy tám chín mười"; // 10 words
    const n = (k: number) => Array.from({ length: k }, () => "từ").join(" ");
    expect(completenessScore(n(10), ref)).toBe(100);
    expect(completenessScore(n(7), ref)).toBe(100);
    expect(completenessScore(n(14), ref)).toBe(100);
    expect(completenessScore(n(5), ref)).toBeCloseTo(50, 5);
    expect(completenessScore(n(3), ref)).toBe(0);
    expect(completenessScore(n(18), ref)).toBeCloseTo(50, 5);
    expect(completenessScore(n(30), ref)).toBe(0);
    expect(completenessScore("", ref)).toBe(0);
  });
});

describe("scoreBenchmark (one run)", () => {
  it("gives a perfect sheet 100 everywhere", () => {
    const r = scoreBenchmark(perfect(), 1500);
    expect(r).toMatchObject({ ok: true, accuracy: 100, chrf: 100, terminology: 100, completeness: 100, matchAcc: 100, writeScore: 100, answered: BENCH_ITEMS.length, ms: 1500 });
  });

  it("penalises missing answers, wrong verdicts, a missing term and a sentence without the word", () => {
    const a = perfect();
    a.delete(1); // unanswered translation
    a.set(2, { vi: "Hôm nay thời tiết đẹp nên chúng ta ra ngoài nhé.", matches: true }); // term "đi dạo" not rendered
    a.set(9, { vi: "Anh ấy nóng tính.", matches: true }); // should have rejected the wrong sense
    a.set(11, { ja: "今日は寒いです。", vi: "Hôm nay lạnh." }); // lacks 勉強
    const r = scoreBenchmark(a, 900);
    expect(r.chrf).toBeLessThan(100);
    expect(r.matchAcc).toBe(80);
    expect(r.writeScore).toBe(75);
    expect(r.terminology).toBeCloseTo((6 / 8) * 100, 1); // items 1 and 2 of the 8 correct-sense items fail
    expect(r.accuracy).toBeLessThan(90);
  });

  it("records a per-item breakdown with the model's answers and each item's score", () => {
    const a = perfect();
    a.delete(1);
    a.set(9, { vi: "Anh ấy nóng tính.", matches: true });
    const r = scoreBenchmark(a, 500, '{"items":[]}');
    expect(r.details).toHaveLength(BENCH_ITEMS.length);
    expect(r.raw).toBe('{"items":[]}');
    const [d1, d2, , , , , , , d9, , d11] = r.details!;
    expect(d1).toMatchObject({ id: 1, kind: "translate", answered: false, chrf: 0, completeness: 0, terminology: 0, matchOk: false, source: "彼は約束を守る人だ。" });
    expect(d2).toMatchObject({ terminology: 100, completeness: 100 });
    expect(d9).toMatchObject({ id: 9, answered: true, matches: true, expectMatch: false, matchOk: false });
    expect(d9.terminology).toBeUndefined(); // wrong-sense traps have no terminology check
    expect(d11).toMatchObject({ kind: "write", ja: "勉強です。", writeScore: 100, expected: "勉強" });
  });

  it("scores a translate-only model on translation alone (chrF + terminology + completeness, re-normalised)", () => {
    const sheet = new Map([...perfect()].filter(([id]) => id <= 10).map(([id, r]) => [id, { vi: r.vi }]));
    const r = scoreBenchmark(sheet, 800, undefined, true);
    expect(r).toMatchObject({ translateOnly: true, accuracy: 100, items: 10 });
    expect(r.details!.every((d) => d.kind === "translate")).toBe(true);
    const bad = new Map([...sheet].map(([id]) => [id, { vi: "x" }]));
    expect(scoreBenchmark(bad, 800, undefined, true).accuracy).toBeLessThan(5);
  });

  it("marks an empty answer sheet as not ok", () => {
    expect(scoreBenchmark(new Map(), 100)).toMatchObject({ ok: false, accuracy: 0 });
  });
});

describe("latencyStats", () => {
  it("computes mean, median, stdev and cv; p95 only from 5 runs", () => {
    const s = latencyStats([1000, 2000, 3000]);
    expect(s).toMatchObject({ mean: 2000, median: 2000, min: 1000, max: 3000 });
    expect(s.stdev).toBeCloseTo(816, 0);
    expect(s.cv).toBeCloseTo(0.408, 2);
    expect(s.p95).toBeUndefined();
    expect(latencyStats([1, 2, 3, 4, 100]).p95).toBe(100);
  });

  it("a single run has zero spread", () => {
    expect(latencyStats([4200])).toMatchObject({ mean: 4200, median: 4200, stdev: 0, cv: 0 });
  });

  it("the median ignores one wild run", () => {
    expect(latencyStats([2100, 2300, 60000]).median).toBe(2300);
  });
});

describe("aggregateRuns", () => {
  const run = (ms: number, accuracy: number): BenchAttempt => ({ ok: true, result: { ...scoreBenchmark(perfect(), ms), accuracy } });
  const fail = (error: string): BenchAttempt => ({ ok: false, at: "2026-01-01T00:00:00Z", ms: 60000, error });

  it("uses the median latency and mean accuracy, and keeps the failure on record", () => {
    const r = aggregateRuns([run(2000, 90), fail("timeout"), run(4000, 94)]);
    expect(r).toMatchObject({ ok: true, ms: 3000, accuracy: 92, successRate: 0.667 });
    expect(r.runs).toHaveLength(3);
    expect(r.runs![1]).toMatchObject({ ok: false, error: "timeout" });
    expect(r.latency).toMatchObject({ median: 3000, min: 2000, max: 4000 });
    expect(r.details).toHaveLength(BENCH_ITEMS.length);
  });

  it("a single run has cv 0 and rate 1", () => {
    expect(aggregateRuns([run(5000, 88)])).toMatchObject({ ms: 5000, accuracy: 88, successRate: 1, latency: { cv: 0 } });
  });

  it("all runs failing gives ok:false with the last error, and every failure recorded", () => {
    const r = aggregateRuns([fail("429"), fail("timeout")]);
    expect(r).toMatchObject({ ok: false, error: "timeout", successRate: 0 });
    expect(r.runs).toHaveLength(2);
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
