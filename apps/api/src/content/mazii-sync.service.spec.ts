import { describe, expect, it } from "vitest";
import { MaziiSyncService } from "./mazii-sync.service.js";
import type { KanjiService } from "./kanji.service.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fake = (fail = "") =>
  ({
    syncFromMazii: async (c: string) => {
      if (c === fail) throw new Error("Mazii không có chữ");
      return { hanViet: "x", onyomi: ["ガク"], kunyomi: [] };
    },
  }) as unknown as KanjiService;

describe("MaziiSyncService", () => {
  it("runs, logs successes and failures, then finishes", async () => {
    const s = new MaziiSyncService(fake("b"));
    s.start(["a", "b"]);
    await sleep(1200);
    const j = s.current()!;
    expect(j.status).toBe("done");
    expect([j.done, j.ok, j.failed]).toEqual([2, 1, 1]);
    expect(j.log.map((l) => l.ok)).toEqual([true, false]);
  });

  it("pauses, resumes and cancels", async () => {
    const s = new MaziiSyncService(fake());
    s.start(["a", "b", "c", "d"]);
    s.pause();
    await sleep(900);
    const frozen = s.current()!.done;
    await sleep(600);
    expect(s.current()!.done).toBe(frozen);
    expect(s.current()!.status).toBe("paused");
    s.resume();
    await sleep(500);
    s.cancel();
    await sleep(900);
    expect(s.current()!.status).toBe("cancelled");
    expect(s.current()!.done).toBeLessThan(4);
  });

  it("rejects a second run while one is active", () => {
    const s = new MaziiSyncService(fake());
    s.start(["a", "b"]);
    expect(() => s.start(["c"])).toThrow();
    s.cancel();
  });
});
