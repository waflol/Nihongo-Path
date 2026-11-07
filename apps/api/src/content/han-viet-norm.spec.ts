import { describe, expect, it } from "vitest";
import { hanVietNorm } from "./han-viet-norm.js";

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
});
