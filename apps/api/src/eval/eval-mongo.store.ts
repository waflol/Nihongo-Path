import type { Model } from "mongoose";
import type { PriceTable } from "./eval-cost.js";
import { filterCases } from "./eval-dataset.js";
import { EVENTS_LIMIT, resultKey, type CallRow, type EvalStore, type ResultRow, type RunDoc, type RunEvent } from "./eval-store.js";
import type { CaseFilter, JudgeVerdict, LoadedCase } from "./eval-types.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface EvalModels {
  dataset: Model<any>;
  case: Model<any>;
  run: Model<any>;
  call: Model<any>;
  result: Model<any>;
  review: Model<any>;
  judgeCache: Model<any>;
  settings: Model<any>;
}

export const runFromDoc = (d: any): RunDoc => {
  const { _id, __v, ...rest } = d;
  return { ...rest, id: String(_id) } as RunDoc;
};

/** `EvalStore` on the `eval_*` collections; reads are lean and projected, results are streamed with a cursor. */
export class MongoEvalStore implements EvalStore {
  constructor(private readonly m: EvalModels) {}

  async getRun(id: string): Promise<RunDoc | null> {
    if (!/^[0-9a-f]{24}$/i.test(id)) return null;
    const d = await this.m.run.findById(id).lean().exec();
    return d ? runFromDoc(d) : null;
  }

  async updateRun(id: string, patch: Partial<RunDoc>): Promise<void> {
    const { id: _id, ...rest } = patch;
    const set: Record<string, unknown> = {};
    const unset: Record<string, 1> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v === undefined) unset[k] = 1;
      else set[k] = v;
    }
    await this.m.run.updateOne({ _id: id }, { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) }).exec();
  }

  async pushEvent(id: string, event: RunEvent): Promise<void> {
    await this.m.run.updateOne({ _id: id }, { $push: { events: { $each: [event], $slice: -EVENTS_LIMIT } } }).exec();
  }

  async listCases(datasetKey: string, filter: CaseFilter): Promise<LoadedCase[]> {
    const q: Record<string, unknown> = { datasetKey };
    if (filter.tasks?.length) q.task = { $in: filter.tasks };
    if (filter.levels?.length) q.level = { $in: filter.levels };
    if (filter.splits?.length) q.split = { $in: filter.splits };
    if (filter.goldStatus?.length) q.goldStatus = { $in: filter.goldStatus };
    if (filter.caseIds?.length) q.caseId = { $in: filter.caseIds };
    const docs = await this.m.case.find(q, { _id: 0, datasetKey: 0, __v: 0 }).lean().exec();
    return filterCases(docs as unknown as LoadedCase[], filter);
  }

  async doneKeys(runId: string): Promise<Set<string>> {
    const docs = await this.m.result.find({ runId }, { _id: 0, candidate: 1, caseId: 1, repeat: 1 }).lean().exec();
    return new Set(docs.map((d: any) => resultKey(d)));
  }

  async insertCall(row: CallRow): Promise<string> {
    const d = await this.m.call.create(row);
    return String(d._id);
  }

  async saveResults(rows: ResultRow[]): Promise<void> {
    if (!rows.length) return;
    await this.m.result.bulkWrite(
      rows.map((r) => ({
        replaceOne: { filter: { runId: r.runId, candidate: r.candidate, caseId: r.caseId, repeat: r.repeat }, replacement: r, upsert: true },
      })),
    );
  }

  async judgeCacheGet(keys: string[]): Promise<Map<string, JudgeVerdict>> {
    if (!keys.length) return new Map();
    const docs = await this.m.judgeCache.find({ key: { $in: keys } }, { _id: 0, key: 1, verdict: 1 }).lean().exec();
    return new Map(docs.map((d: any) => [d.key, d.verdict as JudgeVerdict]));
  }

  async judgeCacheSet(key: string, verdict: JudgeVerdict): Promise<void> {
    await this.m.judgeCache.updateOne({ key }, { $setOnInsert: { key, verdict } }, { upsert: true }).exec();
  }

  async prices(): Promise<PriceTable> {
    const d = await this.m.settings.findById("settings").lean().exec();
    return ((d as any)?.prices as PriceTable) ?? {};
  }

  async *results(runId: string): AsyncIterable<ResultRow> {
    const cursor = this.m.result
      .find({ runId }, { parsed: 0, verdicts: 0, deterministic: 0, parts: 0, error: 0 })
      .lean()
      .cursor({ batchSize: 500 });
    for await (const d of cursor) yield d as unknown as ResultRow;
  }

  async *calls(runId: string): AsyncIterable<CallRow> {
    const cursor = this.m.call.find({ runId }, { prompt: 0, raw: 0, caseIds: 0 }).lean().cursor({ batchSize: 500 });
    for await (const d of cursor) yield d as unknown as CallRow;
  }
}
