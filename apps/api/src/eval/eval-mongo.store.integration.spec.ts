import mongoose from "mongoose";
import { loadDataset } from "./eval-dataset.js";
import { MongoEvalStore, type EvalModels } from "./eval-mongo.store.js";
import {
  EvalCallSchema,
  EvalCaseSchema,
  EvalDatasetSchema,
  EvalJudgeCacheSchema,
  EvalResultSchema,
  EvalReviewSchema,
  EvalRunSchema,
  EvalSettingsSchema,
} from "./eval.schemas.js";
import type { ResultRow } from "./eval-store.js";

/**
 * The Mongo store against a real database. Opt-in: set EVAL_TEST_MONGODB_URL
 * to a THROWAWAY database (it is dropped at the end), e.g.
 * `EVAL_TEST_MONGODB_URL=mongodb://localhost:27017/nihongo_eval_test`.
 */
const URL = process.env.EVAL_TEST_MONGODB_URL;

describe.skipIf(!URL)("MongoEvalStore (real MongoDB)", () => {
  let conn: mongoose.Connection;
  let store: MongoEvalStore;
  let m: EvalModels;

  beforeAll(async () => {
    conn = await mongoose.createConnection(URL!).asPromise();
    m = {
      dataset: conn.model("EvalDataset", EvalDatasetSchema),
      case: conn.model("EvalCase", EvalCaseSchema),
      run: conn.model("EvalRun", EvalRunSchema),
      call: conn.model("EvalCall", EvalCallSchema),
      result: conn.model("EvalResult", EvalResultSchema),
      review: conn.model("EvalReview", EvalReviewSchema),
      judgeCache: conn.model("EvalJudgeCache", EvalJudgeCacheSchema),
      settings: conn.model("EvalSettings", EvalSettingsSchema),
    };
    await Promise.all(Object.values(m).map((x) => x.syncIndexes()));
    store = new MongoEvalStore(m);
  });

  afterAll(async () => {
    await conn?.dropDatabase();
    await conn?.close();
  });

  it("filters cases, upserts results by key, streams them, caches verdicts and updates runs", async () => {
    const tr = (id: string, level: string) => ({ id, task: "translation", level, direction: "ja_to_vi", input: `文${id}`, reference: "x", evaluation_focus: [], checks: [], gold_status: "g" });
    const ds = loadDataset(JSON.stringify({ dataset_name: "T", version: "1", cases: [tr("A", "N5"), tr("B", "N4")] }), "json");
    await m.case.insertMany(ds.cases.map((c) => ({ ...c, datasetKey: "T@1" })));
    expect((await store.listCases("T@1", { levels: ["N4"] })).map((c) => c.caseId)).toEqual(["B"]);
    await expect(m.case.create({ ...ds.cases[0], datasetKey: "T@1" })).rejects.toThrow(/duplicate key/);

    const run = await m.run.create({ datasetKey: "T@1", status: "queued", progress: { total: 2, done: 0, errors: 0 } });
    const id = String(run._id);
    await store.updateRun(id, { status: "running", error: undefined });
    expect((await store.getRun(id))!.status).toBe("running");

    const row: ResultRow = {
      runId: id, candidate: 0, caseId: "A", task: "translation", level: "N5", focus: [], repeat: 1, status: "scored", total: 50,
      errorTags: [], needsReview: false, callMs: 1, itemMs: 1, inputTokens: 1, outputTokens: 1, costUsd: 0, judgeCostUsd: 0,
    };
    await store.saveResults([row]);
    await store.saveResults([{ ...row, total: 80 }]);
    const got: ResultRow[] = [];
    for await (const r of store.results(id)) got.push(r);
    expect(got).toHaveLength(1);
    expect(got[0].total).toBe(80);
    expect(await store.doneKeys(id)).toEqual(new Set(["0|A|1"]));

    const v = { judge: "j", scores: { meaning: 40 }, errorTags: [], confidence: 1, note: "" };
    await store.judgeCacheSet("k", v);
    await store.judgeCacheSet("k", { ...v, note: "second write is ignored" });
    expect((await store.judgeCacheGet(["k", "missing"])).get("k")!.note).toBe("");
  });
});
