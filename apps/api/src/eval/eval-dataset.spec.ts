import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { contentHashOf, DatasetValidationError, filterCases, loadDataset, seedKeyOf, splitOf } from "./eval-dataset.js";
import type { EvalCase } from "./eval-types.js";

const tr = (id: string, extra: Partial<EvalCase> = {}) => ({
  id,
  task: "translation",
  level: "N5",
  direction: "ja_to_vi",
  input: "私は学生です。",
  reference: "Tôi là học sinh/sinh viên.",
  evaluation_focus: ["copula"],
  checks: ["Preserve meaning"],
  case_variant: 1,
  gold_status: "curated_seed_expansion_needs_review",
  ...extra,
});
const file = (cases: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ dataset_name: "Test", version: "1.0.0", case_count: cases.length, cases, ...extra });

describe("loadDataset", () => {
  it("loads valid JSON, derives seed / split / hash and the checksum", () => {
    const ds = loadDataset(file([tr("TR-1"), tr("TR-2", { input: "毎朝六時に起きます。", reference: "Tôi dậy lúc 6 giờ." })]), "json");
    expect(ds.meta).toMatchObject({ name: "Test", version: "1.0.0", caseCount: 2 });
    expect(ds.meta.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(ds.cases[0]).toMatchObject({ caseId: "TR-1", task: "translation", level: "N5" });
    expect(["dev", "val", "test"]).toContain(ds.cases[0].split);
    expect(ds.warnings).toEqual([]);
  });

  it("rejects duplicate ids, missing fields, bad levels and a wrong case_count — all listed", () => {
    const bad = file([tr("TR-1"), tr("TR-1"), tr("TR-3", { level: "N6" as never }), { ...tr("TR-4"), reference: "" }], { case_count: 9 });
    try {
      loadDataset(bad, "json");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(DatasetValidationError);
      const p = (e as DatasetValidationError).problems.join("\n");
      expect(p).toContain("TR-1: duplicate id");
      expect(p).toContain("TR-3: level must be N5–N1");
      expect(p).toContain("TR-4: missing reference");
      expect(p).toContain("case_count says 9");
    }
  });

  it("checks each task's own required fields", () => {
    const vc = { id: "VC-1", task: "vocabulary_check", level: "N5", word: "学校", context: "学校へ行きます。", expected: { reading: "がっこう", meaning_vi: "" }, evaluation_focus: [], checks: [], gold_status: "x" };
    expect(() => loadDataset(file([vc]), "json")).toThrow(/expected\.meaning_vi/);
  });

  it("reads JSONL with a header line, and warns about exact duplicate content", () => {
    const text = [JSON.stringify({ dataset: { dataset_name: "L", version: "2" } }), JSON.stringify(tr("A")), JSON.stringify(tr("B"))].join("\n");
    const ds = loadDataset(text, "jsonl");
    expect(ds.meta.name).toBe("L");
    expect(ds.cases).toHaveLength(2);
    expect(ds.warnings).toEqual(["B: same content as A"]);
  });

  it("rejects a JSONL line that is not JSON with its line number", () => {
    expect(() => loadDataset(`${JSON.stringify(tr("A"))}\n{oops`, "jsonl", { name: "x", version: "1" })).toThrow(/line 2/);
  });

  it("never mutates the parsed cases it returns from the source", () => {
    const src = file([tr("TR-1")]);
    const ds = loadDataset(src, "json");
    ds.cases[0].payload.level = "N1";
    expect(loadDataset(src, "json").cases[0].payload.level).toBe("N5");
  });
});

describe("seed split", () => {
  it("puts ja→vi and vi→ja of one sentence in the same split", () => {
    const a = tr("A") as unknown as EvalCase;
    const b = tr("B", { direction: "vi_to_ja", input: "Tôi là học sinh.", reference: "私は学生です。" } as never) as unknown as EvalCase;
    expect(seedKeyOf(a)).toBe(seedKeyOf(b));
    expect(splitOf(seedKeyOf(a))).toBe(splitOf(seedKeyOf(b)));
  });

  it("content hash ignores id and variant", () => {
    expect(contentHashOf(tr("A") as never)).toBe(contentHashOf(tr("B", { case_variant: 3 }) as never));
  });
});

describe("filterCases", () => {
  const ds = loadDataset(
    file([
      tr("TR-2"),
      tr("TR-1"),
      tr("TR-3", { level: "N4", input: "x", reference: "y" }),
      tr("TR-4", { level: "N4", input: "z", reference: "w" }),
    ]),
    "json",
  );
  it("filters by level, sorts by id, dedupes and caps per task × level", () => {
    expect(filterCases(ds.cases, { levels: ["N5"] }).map((c) => c.caseId)).toEqual(["TR-1", "TR-2"]);
    expect(filterCases(ds.cases, { dedupe: true }).map((c) => c.caseId)).toEqual(["TR-1", "TR-3", "TR-4"]);
    expect(filterCases(ds.cases, { perTaskLevel: 1 }).map((c) => c.caseId)).toEqual(["TR-1", "TR-3"]);
    expect(filterCases(ds.cases, { caseIds: ["TR-4"] }).map((c) => c.caseId)).toEqual(["TR-4"]);
  });
});

describe("bundled dataset v2", () => {
  const ds = loadDataset(readFileSync(resolve(__dirname, "../../eval-data/japanese_ai_eval_dataset_v2_1000.json")), "json");
  it("is valid: 1000 cases, 250 per task, 200 per level", () => {
    expect(ds.meta.caseCount).toBe(1000);
    const count = (k: "task" | "level") => ds.cases.reduce<Record<string, number>>((a, c) => ({ ...a, [c[k]]: (a[c[k]] ?? 0) + 1 }), {});
    expect(Object.values(count("task"))).toEqual([250, 250, 250, 250]);
    expect(Object.values(count("level"))).toEqual([200, 200, 200, 200, 200]);
  });
  it("keeps every seed in one split and uses all three splits", () => {
    const bySeed = new Map<string, Set<string>>();
    for (const c of ds.cases) bySeed.set(c.seedKey, (bySeed.get(c.seedKey) ?? new Set()).add(c.split));
    expect([...bySeed.values()].every((s) => s.size === 1)).toBe(true);
    expect(new Set(ds.cases.map((c) => c.split))).toEqual(new Set(["dev", "val", "test"]));
  });
});
