import { describe, expect, it } from "vitest";
import { layoutFromText, picturesOfBlock, type PageLayout } from "./pictures.js";

// Self-authored layouts in the shape of a typed 聴解 booklet (595 x 842 pt pages).
const W = 595;
const H = 842;
const t = (str: string, x: number, y: number) => ({ str, x, y });

describe("layoutFromText", () => {
  it("finds the N番 labels (number in its own item or not, side by side) and the 問題 headings", () => {
    const l = layoutFromText(
      W,
      H,
      [
        t("問題", 72, 121),
        t(" ", 100, 121),
        t("1", 104, 121),
        t("1", 72, 196),
        t(" ", 80, 196),
        t("番", 83, 196),
        t("2 番", 72, 416),
        t("1 番", 91, 600),
        t("2 番", 312, 600),
        t("４", 72, 450),
        t(" かばんを持って行く", 86, 450), // かばん holds ばん: not a label
        t("1 1 番の自転車", 72, 700), // an option: not a label
        t("2", 72, 720),
        t("2 番の自転車", 89, 720), // the same, split into items
        t("3", 72, 760),
        t("番", 83, 760),
        t("まず話を聞いてください。", 100, 760), // a label with its own instruction after it
      ],
      [],
    );
    expect(l.headings).toEqual([{ no: 1, y: 121 }]);
    expect(l.labels.map((x) => [x.no, x.x, x.y])).toEqual([
      [1, 72, 196],
      [2, 72, 416],
      [1, 91, 600],
      [2, 312, 600],
      [3, 72, 760],
    ]);
  });
});

describe("picturesOfBlock", () => {
  const layouts = new Map<number, PageLayout>([
    [
      14,
      {
        width: W,
        height: H,
        headings: [{ no: 1, y: 149 }],
        labels: [
          { no: 1, x: 72, y: 196 },
          { no: 2, x: 72, y: 416 },
        ],
        images: [
          { x: 194, y: 203, w: 240, h: 185 }, // under 1番
          { x: 0, y: 0, w: W, h: H }, // a scan of the whole page: not a picture
        ],
      },
    ],
    [
      18,
      {
        width: W,
        height: H,
        headings: [{ no: 5, y: 499 }],
        labels: [
          { no: 1, x: 77, y: 85 },
          { no: 2, x: 298, y: 85 },
          { no: 3, x: 77, y: 264 },
          { no: 4, x: 298, y: 264 },
        ],
        images: [
          { x: 92, y: 88, w: 193, h: 153 },
          { x: 313, y: 91, w: 188, h: 148 },
          { x: 92, y: 269, w: 190, h: 148 },
          { x: 313, y: 270, w: 187, h: 147 },
          { x: 100, y: 560, w: 100, h: 100 }, // under the next 問題's heading: not this block's
        ],
      },
    ],
  ]);

  it("gives each picture to the label above it, in its column", () => {
    const task = picturesOfBlock(layouts, { pageFrom: 14, pageTo: 14, mondaiNo: 1 });
    expect([...task.keys()]).toEqual([1]);
    expect(task.get(1)!.page).toBe(14);
    expect(task.get(1)!.rect.x).toBeCloseTo((194 - 4) / W);
    expect(task.get(1)!.rect.w).toBeCloseTo((240 + 8) / W);

    const scenes = picturesOfBlock(layouts, { pageFrom: 17, pageTo: 18, mondaiNo: 4 });
    expect([...scenes].map(([no, c]) => [no, c.page, Math.round(c.rect.x * W) + 4, Math.round(c.rect.y * H) + 4])).toEqual([
      [1, 18, 92, 88],
      [2, 18, 313, 91],
      [3, 18, 92, 269],
      [4, 18, 313, 270],
    ]);
  });

  it("finds nothing on a scanned page", () => {
    const scan = new Map<number, PageLayout>([[3, { width: W, height: H, headings: [], labels: [{ no: 1, x: 72, y: 100 }], images: [{ x: 0, y: 0, w: W, h: H }] }]]);
    expect(picturesOfBlock(scan, { pageFrom: 3, pageTo: 3, mondaiNo: 1 }).size).toBe(0);
  });
});
