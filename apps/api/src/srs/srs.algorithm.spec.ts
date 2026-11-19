import { describe, expect, it } from "vitest";
import { createEmptyCard, fsrs, generatorParameters } from "ts-fsrs";
import {
  advanceSrs,
  previewIntervals,
  SRS_DEFAULT_STATE,
  type SrsState,
} from "./srs.algorithm.js";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 1);

describe("advanceSrs (FSRS-6)", () => {
  it("first GOOD review graduates to a ~3 day interval", () => {
    const o = advanceSrs({ ...SRS_DEFAULT_STATE }, { grade: "GOOD", now: T0 });
    expect(o.intervalDays).toBe(3); // FSRS-6 default w[2] = 2.3065 → 3 days
    expect(o.state.repetitions).toBe(1);
    expect(o.relearnHours).toBe(0);
  });

  it("orders first intervals AGAIN < HARD < GOOD < EASY", () => {
    const days = (["HARD", "GOOD", "EASY"] as const).map(
      (grade) => advanceSrs({ ...SRS_DEFAULT_STATE }, { grade, now: T0 }).intervalDays,
    );
    expect(days[0]).toBeLessThan(days[1]);
    expect(days[1]).toBeLessThan(days[2]);
  });

  it("a lapse resets repetitions, counts the lapse and relearns in 10 minutes", () => {
    const good = advanceSrs({ ...SRS_DEFAULT_STATE }, { grade: "GOOD", now: T0 }).state;
    const o = advanceSrs(good, { grade: "AGAIN", now: T0 + 4 * DAY });
    expect(o.state.repetitions).toBe(0);
    expect(o.state.lapses).toBe(1);
    expect(o.relearnHours).toBeCloseTo(10 / 60);
    expect(o.state.stability!).toBeLessThan(good.stability!);
  });

  it("intervals grow over successive on-time GOOD reviews", () => {
    let s: SrsState = { ...SRS_DEFAULT_STATE };
    let now = T0;
    let prev = 0;
    for (let i = 0; i < 5; i++) {
      const o = advanceSrs(s, { grade: "GOOD", now });
      expect(o.intervalDays).toBeGreaterThan(prev);
      prev = o.intervalDays;
      s = o.state;
      now += o.intervalDays * DAY;
    }
  });

  it("upgrades a legacy SM-2 row on its next review", () => {
    const legacy: SrsState = {
      schemaVersion: 1,
      algorithm: "sm2",
      ease: 2.5,
      repetitions: 3,
      intervalDays: 15,
      lapses: 0,
    };
    const o = advanceSrs(legacy, { grade: "GOOD", now: T0 });
    expect(o.state.algorithm).toBe("fsrs6");
    expect(o.state.schemaVersion).toBe(3);
    expect(o.intervalDays).toBeGreaterThan(15);
  });

  it("is deterministic", () => {
    const a = advanceSrs({ ...SRS_DEFAULT_STATE }, { grade: "EASY", now: T0 });
    const b = advanceSrs({ ...SRS_DEFAULT_STATE }, { grade: "EASY", now: T0 });
    expect(a).toEqual(b);
  });

  it("matches ts-fsrs directly over a 20-review sequence", () => {
    const lib = fsrs(
      generatorParameters({ enable_fuzz: false, enable_short_term: false, request_retention: 0.9 }),
    );
    const gaps = [0, 1, 3, 10, 30];
    const grades = [1, 2, 3, 4] as const;
    const names = ["AGAIN", "HARD", "GOOD", "EASY"] as const;
    let mine: SrsState = { ...SRS_DEFAULT_STATE };
    let now = T0;
    let card = createEmptyCard(new Date(now));
    for (let i = 0; i < 20; i++) {
      const g = grades[(i * 7 + 2) % 4];
      if (i > 0) now += gaps[i % 5] * DAY;
      const o = advanceSrs(mine, { grade: names[g - 1], now });
      card = lib.repeat(card, new Date(now))[g].card;
      expect(o.state.stability!).toBeCloseTo(card.stability, 2);
      expect(o.state.difficulty!).toBeCloseTo(card.difficulty, 2);
      mine = o.state;
    }
  });

  it("orders button intervals and keeps AGAIN at 10 minutes", () => {
    const s = advanceSrs({ ...SRS_DEFAULT_STATE }, { grade: "GOOD", now: T0 }).state;
    const p = previewIntervals(s, T0 + 3 * DAY);
    expect(p.AGAIN.relearnMinutes).toBeCloseTo(10);
    expect(p.HARD.days).toBeLessThanOrEqual(p.GOOD.days);
    expect(p.GOOD.days).toBeLessThanOrEqual(p.EASY.days);
  });

  it("v2 (FSRS-4.5) state keeps its schedule within ±25% on an on-time GOOD", () => {
    const v2: SrsState = {
      schemaVersion: 2,
      algorithm: "fsrs",
      ease: 2.5,
      repetitions: 5,
      intervalDays: 20,
      lapses: 0,
      stability: 20,
      difficulty: 5,
      lastReviewAt: T0,
    };
    const o = advanceSrs(v2, { grade: "GOOD", now: T0 + 20 * DAY });
    // FSRS-4.5 gave 66 days for the same input (hand-computed); FSRS-6 gives 59 (−11%).
    expect(o.intervalDays).toBeGreaterThanOrEqual(66 * 0.75);
    expect(o.intervalDays).toBeLessThanOrEqual(66 * 1.25);
  });
});
