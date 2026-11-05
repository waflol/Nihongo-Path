import { Injectable, Optional } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { createHash } from "node:crypto";
import type { Model } from "mongoose";
import type { AiResultCacheDocument } from "./ai-result-cache.schema.js";
import type { AiResult, AiTask } from "./ai-example.service.js";
import { RedisService } from "../redis/redis.service.js";

/** How long an answer stays in the fast Redis layer. */
const REDIS_TTL_S = 7 * 24 * 3600;

/** Stable fingerprint of a task: same word / sentence + meaning → same key. */
/** What the task was about — shown next to the key in the admin Redis page. */
export function taskTerm(task: AiTask): { term: string; kind: AiTask["kind"] } {
  return { term: task.term, kind: task.kind };
}

export function taskKey(task: AiTask): string {
  const n = (s: string) => s.normalize("NFKC").trim().toLowerCase();
  const raw =
    task.kind === "translate"
      ? ["t", n(task.ja), n(task.term), n(task.meaning)]
      : ["w", n(task.term), n(task.reading), n(task.meaning), n(task.pos)];
  return createHash("sha1").update(raw.join("\u0001")).digest("hex");
}

/** Saved AI answers. Best effort: without a database it simply never hits. */
@Injectable()
export class AiResultCacheService {
  constructor(
    @Optional()
    @InjectModel("AiResultCache")
    private readonly model?: Model<AiResultCacheDocument>,
    @Optional() private readonly redis?: RedisService,
  ) {}

  /** Redis first (fast, shared), then the database (permanent); a database hit refills Redis. */
  async get(key: string): Promise<AiResult | null> {
    const hot = await this.redis?.getJson<AiResult>(`ai:res:${key}`);
    if (hot) return { ja: hot.ja, vi: hot.vi, matches: hot.matches };
    if (!this.model) return null;
    try {
      const d = await this.model.findOne({ key }).lean().exec();
      if (!d) return null;
      const r = { ja: d.ja, vi: d.vi, matches: d.matches };
      void this.redis?.setJson(`ai:res:${key}`, { ...r, term: d.term, kind: d.kind }, REDIS_TTL_S);
      return r;
    } catch {
      return null;
    }
  }

  async set(key: string, r: AiResult, serviceLabel = "", about?: { term: string; kind: string }): Promise<void> {
    void this.redis?.setJson(`ai:res:${key}`, { ...r, ...about }, REDIS_TTL_S);
    if (!this.model) return;
    try {
      await this.model
        .updateOne({ key }, { $setOnInsert: { key, ja: r.ja, vi: r.vi, matches: r.matches, serviceLabel, term: about?.term, kind: about?.kind } }, { upsert: true })
        .exec();
    } catch {
      /* a lost cache write only means one repeated call */
    }
  }
}
