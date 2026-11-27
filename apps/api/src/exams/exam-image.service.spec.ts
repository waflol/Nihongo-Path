import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ExamImageService } from "./exam-image.service.js";

describe("ExamImageService", () => {
  const dirs: string[] = [];
  afterAll(async () => {
    for (const d of dirs) await rm(d, { recursive: true, force: true });
  });

  it("cuts a region out of a page image, stores it once by its hash, and finds it again", async () => {
    const dir = await mkdtemp(join(tmpdir(), "exam-images-"));
    dirs.push(dir);
    process.env.EXAM_IMAGE_DIR = dir;
    const images = new ExamImageService();
    const { createCanvas, loadImage } = await import("@napi-rs/canvas");
    const page = createCanvas(200, 100);
    const ctx = page.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 200, 100);
    ctx.fillStyle = "#000";
    ctx.fillRect(100, 0, 100, 50); // the "picture": top-right quarter
    const cut = await images.crop(page.toBuffer("image/png"), { x: 0.5, y: 0, w: 0.5, h: 0.5 });
    const img = await loadImage(cut);
    expect([img.width, img.height]).toEqual([100, 50]);

    const id = await images.save(cut);
    expect(id).toMatch(/^[a-f0-9]{64}$/);
    expect(await images.save(cut)).toBe(id);
    expect(await images.pathOf(id)).toBe(join(dir, `${id}.png`));
    await expect(images.pathOf("../etc/passwd")).rejects.toThrow(/Không có hình/);
    await expect(images.crop(cut, { x: 0, y: 0, w: 0, h: 0.5 })).rejects.toThrow(/Vùng cắt không hợp lệ/);
  });
});
