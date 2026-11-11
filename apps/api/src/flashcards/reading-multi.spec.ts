import { describe, expect, it } from "vitest";
import { ReadingService } from "./reading.service.js";

describe("ReadingService: several readings per word", () => {
  it("keeps every reading a person confirmed (人気 = にんき and ひとけ)", async () => {
    const svc = new ReadingService();
    await svc.learn("人気", "にんき");
    await svc.learn("人気", "ひとけ");
    const r = await svc.analyze("人気");
    expect(r.readings).toEqual(expect.arrayContaining(["にんき", "ひとけ"]));
    expect(await svc.isKnownReading("人気", "ひとけ")).toBe(true);
    expect(await svc.isKnownReading("人気", "にんき")).toBe(true);
    expect(await svc.isKnownReading("人気", "じんき")).toBe(false);
  });

  it("forgets one reading and keeps the others", async () => {
    const svc = new ReadingService();
    await svc.learn("人気", "にんき");
    await svc.learn("人気", "ひとけ");
    await svc.forget("人気", "ひとけ");
    expect((await svc.analyze("人気")).readings).not.toContain("ひとけ");
    expect(await svc.isKnownReading("人気", "にんき")).toBe(true);
  });

  it("returns no readings for kana-only text", async () => {
    expect((await new ReadingService().analyze("ありがとう")).readings).toEqual([]);
  });
});
