import { describe, expect, it } from "vitest";
import { isGarbageText, ocrWithRetry, parsePdf, splitVariants, tableFromOcrPages } from "./pdf.js";

describe("isGarbageText", () => {
  it("flags failed-OCR symbol soup", () => {
    expect(
      isGarbageText(
        "EA;SArotfi'f bt 5. +-h Lrsbot\\*=\\*LH+LIi\\*rf\" IJ fuEr\\*v'tt E, ZtLfiri L A 11 \\* f\" rf\\*. E\\#trna",
      ),
    ).toBe(true);
  });
  it("accepts normal vocabulary text", () => {
    expect(isGarbageText("1 愛情 あいじょう tình yêu, tình cảm 2 相変わらず あいかわらず như thường lệ")).toBe(false);
  });
  it("does not judge very short text", () => {
    expect(isGarbageText("a;b")).toBe(false);
  });
});

/** A one-page PDF with no text (a "scan"). */
function blankPdf(): Buffer {
  const objs = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 400]/Contents 4 0 R/Resources<<>>>>",
    "<</Length 36>>\nstream\n1 0 0 rg 50 50 100 100 re f\nendstream",
  ];
  let out = "%PDF-1.4\n";
  const offs: number[] = [];
  objs.forEach((o, i) => {
    offs.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const x = out.length;
  out += "xref\n0 5\n0000000000 65535 f \n" + offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer<</Size 5/Root 1 0 R>>\nstartxref\n${x}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

describe("parsePdf OCR fallback", () => {
  it("OCRs a scan page by page and reports progress", async () => {
    const progress: [number, number][] = [];
    const table = await parsePdf(
      blankPdf(),
      async () => [{ no: "1", word: "愛", reading: "あい", hanViet: "ÁI", meaning: "tình yêu" }],
      (d, t) => progress.push([d, t]),
    );
    expect(table.columns).toContain("Âm Hán Việt");
    expect(table.rows[0]["Từ vựng"]).toBe("愛");
    expect(progress[0]).toEqual([0, 1]);
    expect(progress.at(-1)).toEqual([1, 1]);
  });
  it("without an OCR reader a scan is rejected", async () => {
    await expect(parsePdf(blankPdf())).rejects.toThrow(/no text layer/);
  });
});

describe("OCR retry and page table", () => {
  it("retries a failed page until it is read", async () => {
    let calls = 0;
    const rows = await ocrWithRetry(
      Buffer.alloc(1),
      3,
      async () => (++calls < 3 ? null : [{ no: "1", word: "愛", reading: "あい", meaning: "yêu" }]),
      1,
    );
    expect(calls).toBe(3);
    expect(rows).toHaveLength(1);
  });
  it("gives up after the attempts and reports the page as unreadable", async () => {
    expect(await ocrWithRetry(Buffer.alloc(1), 1, async () => null, 1)).toBeNull();
  });
  it("keeps the page of every row and which pages failed", () => {
    const t = tableFromOcrPages([[{ no: "1", word: "a", reading: "a", meaning: "x" }], null, []]);
    expect(t.rows[0].Trang).toBe("1");
    expect(t.ocr?.pages.map((p) => p === null)).toEqual([false, true, false]);
  });
});

describe("tableFromOcrPages numbering", () => {
  it("keeps the shared number and meaning for variants and unnumbered sub-lines", () => {
    const t = tableFromOcrPages([
      [
        { no: "131", word: "計る", reading: "はかる", meaning: "Đo" },
        { no: "131", word: "測る", reading: "はかる", meaning: "" },
        { no: "", word: "量る", reading: "はかる", meaning: "" },
      ],
      [{ no: "132", word: "次", reading: "つぎ", meaning: "Tiếp" }],
    ]);
    expect(t.rows.map((r) => [r["STT"], r["Nghĩa"]])).toEqual([
      ["131", "Đo"],
      ["131", "Đo"],
      ["131", "Đo"],
      ["132", "Tiếp"],
    ]);
  });
});


describe("splitVariants", () => {
  const row = (word: string, reading = "たたかう") => ({ no: "7", word, reading, hanViet: "CHIẾN", meaning: "Chiến đấu" });
  it("splits two spellings of one word into rows with the same number and meaning", () => {
    for (const w of ["戦う。闘う", "戦う/闘う", "戦う／闘う", "戦う、闘う"]) {
      const out = splitVariants(row(w));
      expect(out.map((r) => r.word)).toEqual(["戦う", "闘う"]);
      expect(out.every((r) => r.no === "7" && r.reading === "たたかう" && r.meaning === "Chiến đấu")).toBe(true);
    }
  });
  it("pairs readings when each variant has its own", () => {
    expect(splitVariants(row("計る/測る", "はかる/はかる")).map((r) => r.reading)).toEqual(["はかる", "はかる"]);
  });
  it("leaves brackets, single words and trailing punctuation alone", () => {
    expect(splitVariants(row("割り合い（に・と）"))).toHaveLength(1);
    expect(splitVariants(row("戦う。"))).toHaveLength(1);
    expect(splitVariants(row("が/は"))).toHaveLength(1);
  });
});
