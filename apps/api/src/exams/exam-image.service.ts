import { createHash } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

/** A region of a page, as fractions of its width and height (0–1). */
export interface FractionRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Pictures of the exam bank (NP-407): the drawings of a 聴解 question cut from the paper's page.
 * PNG files on local disk named by their sha256 (`EXAM_IMAGE_DIR`), so the same picture is
 * stored once and a name never changes what it shows.
 */
@Injectable()
export class ExamImageService {
  private readonly dir = resolve(process.env.EXAM_IMAGE_DIR?.trim() || join(process.cwd(), "storage", "exam-images"));

  /** Store a PNG; its id (the sha256). */
  async save(png: Buffer): Promise<string> {
    const id = createHash("sha256").update(png).digest("hex");
    await mkdir(this.dir, { recursive: true });
    const path = join(this.dir, `${id}.png`);
    if (!(await access(path).then(() => true, () => false))) await writeFile(path, png);
    return id;
  }

  /** The file of a stored picture. */
  async pathOf(id: string): Promise<string> {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new NotFoundException("Không có hình này");
    const path = join(this.dir, `${id}.png`);
    if (!(await access(path).then(() => true, () => false))) throw new NotFoundException("Không có hình này");
    return path;
  }

  /** Cut a region out of a page image (PNG); the region is clamped to the page. */
  async crop(page: Buffer, rect: FractionRect): Promise<Buffer> {
    const ok = [rect.x, rect.y, rect.w, rect.h].every((v) => Number.isFinite(v) && v >= 0 && v <= 1);
    if (!ok || rect.w < 0.01 || rect.h < 0.01) throw new BadRequestException("Vùng cắt không hợp lệ");
    const { createCanvas, loadImage } = await import("@napi-rs/canvas");
    const img = await loadImage(page);
    const sx = Math.floor(rect.x * img.width);
    const sy = Math.floor(rect.y * img.height);
    const sw = Math.max(1, Math.min(img.width - sx, Math.round(rect.w * img.width)));
    const sh = Math.max(1, Math.min(img.height - sy, Math.round(rect.h * img.height)));
    const canvas = createCanvas(sw, sh);
    try {
      canvas.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      return canvas.toBuffer("image/png");
    } finally {
      canvas.width = 1;
      canvas.height = 1;
    }
  }
}
