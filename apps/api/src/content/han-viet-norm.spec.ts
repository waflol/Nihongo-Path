import { describe, expect, it } from "vitest";
import { formatHanViet, hanVietList, hanVietNorm } from "./han-viet-norm.js";

describe("hanVietNorm", () => {
  it("strips tone marks and case", () => {
    expect(hanVietNorm("HỌC")).toBe("hoc");
    expect(hanVietNorm("học")).toBe("hoc");
    expect(hanVietNorm("nhật")).toBe("nhat");
  });
  it("maps đ to d", () => {
    expect(hanVietNorm("Đại")).toBe("dai");
    expect(hanVietNorm("điền")).toBe("dien");
  });
  it("treats both tone placements as equal", () => {
    expect(hanVietNorm("hoà")).toBe(hanVietNorm("hòa"));
  });
  it("keeps slash-joined alternatives", () => {
    expect(hanVietNorm("trường/trưởng")).toBe("truong/truong");
  });
  it("normalises comma/array multiple readings into slash-separated tokens", () => {
    expect(hanVietNorm("trường, trưởng")).toBe("truong/truong");
    expect(hanVietNorm(["hành", "hạnh", "hàng"])).toBe("hanh/hanh/hang");
  });
  it("splits and deduplicates multi-readings while preserving distinct tones", () => {
    expect(hanVietList("TRƯỜNG, trưởng / trường")).toEqual(["trường", "trưởng"]);
    expect(hanVietList("thủy / thuỷ")).toEqual(["thủy"]);
    expect(formatHanViet(["Hành", "Hạnh", "Hàng", "Hạng"])).toBe("hành/hạnh/hàng/hạng");
  });
});
