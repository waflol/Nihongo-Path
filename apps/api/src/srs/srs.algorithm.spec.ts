import { describe, expect, it } from "vitest";
import { advanceSrs, SRS_DEFAULT_STATE, type SrsState } from "./srs.algorithm.js";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 1);

describe("advanceSrs (FSRS-4.5)", () => {
  it("first GOOD review graduates to a ~3 day interval", () => {
    const o = advanceSrs({ ...SRS_DEFAULT_STATE }, { grade: "GOOD", now: T0 });
    expect(o.intervalDays).toBe(4);
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
    expect(o.state.algorithm).toBe("fsrs");
    expect(o.intervalDays).toBeGreaterThan(15);
  });

  it("is deterministic", () => {
    const a = advanceSrs({ ...SRS_DEFAULT_STATE }, { grade: "EASY", now: T0 });
    const b = advanceSrs({ ...SRS_DEFAULT_STATE }, { grade: "EASY", now: T0 });
    expect(a).toEqual(b);
  });
});
