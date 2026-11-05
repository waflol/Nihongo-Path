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
  // An answer asked of "the next service" (earlier ones rejected) is a different task.
  const skip = task.skip?.length ? ["skip", ...[...task.skip].sort()] : [];
  const raw =
    task.kind === "translate"
      ? ["t", n(task.ja), n(task.term), n(task.meaning), ...skip]
      : ["w", n(task.term), n(task.reading), n(task.meaning), n(task.pos), ...skip];
  return createHash("sha1").update(raw.join("\u0001")).digest("hex");
}

/** Keep a key segment readable and free of `:` / glob characters (so SCAN patterns stay exact). */
function seg(s: string | undefined, max = 40): string {
  return (s ?? "").normalize("NFKC").trim().replace(/[\s:*?[\]\\]+/g, "_").slice(0, max) || "-";
}

/**
 * Searchable Redis key of a saved answer:
 * `ai:res:<word>:<kind>:<fingerprint>:<service>:<model>` — so `*犬*` finds a
 * word and `*:Gemini:*` / `*:gemini-2.5-flash` finds what a service or model did.
 */
export function resKey(hash: string, about: { term?: string; kind?: string }, service?: string, model?: string): string {
  return `ai:res:${seg(about.term)}:${seg(about.kind, 10)}:${hash.slice(0, 12)}:${seg(service)}:${seg(model)}`;
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
    // `ai:ref:<fingerprint>` points at the readable `ai:res:…` key.
    const ref = await this.redis?.getJson<string>(`ai:ref:${key}`);
    const hot = ref ? await this.redis?.getJson<AiResult>(ref) : null;
    if (hot) return { ja: hot.ja, vi: hot.vi, matches: hot.matches };
    if (!this.model) return null;
    try {
      const d = await this.model.findOne({ key }).lean().exec();
      if (!d) return null;
      const r = { ja: d.ja, vi: d.vi, matches: d.matches };
      this.putHot(key, { ...r, term: d.term, kind: d.kind, service: d.serviceLabel, model: d.modelName });
      return r;
    } catch {
      return null;
    }
  }

  /** Record which word an old saved answer was about (only when it has none yet). */
  async backfillTerm(key: string, about: { term: string; kind: string }): Promise<void> {
    if (!this.model) return;
    try {
      await this.model
        .updateOne({ key, term: { $in: [null, ""] } }, { $set: { term: about.term, kind: about.kind } })
        .exec();
    } catch {
      /* cosmetic only */
    }
  }

  /**
   * Saved answers about any of these words (admin listing). Only the fields
   * shown to the admin are read — never anything secret.
   */
  async findByTerms(terms: string[]): Promise<
    { term: string; kind: string; ja?: string; vi: string; matches?: boolean; service: string; model?: string; createdAt: Date }[]
  > {
    if (!this.model || terms.length === 0) return [];
    try {
      const docs = await this.model
        .find({ term: { $in: terms } })
        .select("term kind ja vi matches serviceLabel modelName createdAt")
        .sort({ createdAt: -1 })
        .lean()
        .exec();
      return docs.map((d) => ({
        term: d.term ?? "",
        kind: d.kind ?? "",
        ja: d.ja,
        vi: d.vi,
        matches: d.matches,
        service: d.serviceLabel,
        model: d.modelName,
        createdAt: d.createdAt,
      }));
    } catch {
      return [];
    }
  }

  private putHot(
    key: string,
    v: AiResult & { term?: string; kind?: string; service?: string; model?: string },
  ): void {
    if (!this.redis) return;
    const rk = resKey(key, v, v.service, v.model);
    void this.redis.setJson(rk, v, REDIS_TTL_S);
    void this.redis.setJson(`ai:ref:${key}`, rk, REDIS_TTL_S);
  }

  async set(key: string, r: AiResult, serviceLabel = "", about?: { term: string; kind: string }): Promise<void> {
    this.putHot(key, { ...r, ...about, service: r.service || serviceLabel, model: r.model });
    if (!this.model) return;
    try {
      await this.model
        .updateOne(
          { key },
          {
            $setOnInsert: { key, ja: r.ja, vi: r.vi, matches: r.matches, serviceLabel: r.service || serviceLabel, modelName: r.model },
            // `term`/`kind` are also filled in on an answer saved before they existed.
            ...(about ? { $set: { term: about.term, kind: about.kind } } : {}),
          },
          { upsert: true },
        )
        .exec();
    } catch {
      /* a lost cache write only means one repeated call */
    }
  }
}
