import { Injectable, Optional } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import type { AiCallLogDocument, AiLogPurpose } from "./ai-call-log.schema.js";

const MAX_TEXT = 20_000;

export interface AiCallRecord {
  purpose: AiLogPurpose;
  serviceId: string;
  serviceLabel: string;
  provider: string;
  modelName: string;
  endpoint: string;
  words: string[];
  request: string;
  response: string;
  ok: boolean;
  status: number;
  ms: number;
}

/** Strip query string / credentials from an endpoint URL. */
function cleanEndpoint(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return "";
  }
}

/** Records and lists the calls made to AI services. Best effort: never throws. */
@Injectable()
export class AiCallLogService {
  constructor(
    @Optional()
    @InjectModel("AiCallLog")
    private readonly model?: Model<AiCallLogDocument>,
  ) {}

  async record(r: Omit<AiCallRecord, "endpoint"> & { url: string }, secret?: string): Promise<void> {
    if (!this.model) return;
    const clip = (t: string) => {
      const s = secret ? t.replaceAll(secret, "<key>") : t;
      return s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}… [cắt bớt]` : s;
    };
    try {
      await this.model.create({
        ...r,
        endpoint: cleanEndpoint(r.url),
        words: r.words.slice(0, 50),
        request: clip(r.request),
        response: clip(r.response),
      });
    } catch {
      /* logging must never break generation */
    }
  }

  async list(opts: { page: number; pageSize: number; serviceId?: string; ok?: boolean; purpose?: string; q?: string }) {
    if (!this.model) return { items: [], total: 0 };
    const filter: Record<string, unknown> = {};
    if (opts.serviceId) filter.serviceId = opts.serviceId;
    if (opts.ok !== undefined) filter.ok = opts.ok;
    // "Tạo ví dụ" covers both batch generation and the per-word activity.
    if (opts.purpose) filter.purpose = opts.purpose === "example" ? { $in: ["example", "vocab"] } : opts.purpose;
    if (opts.q?.trim()) {
      const rx = new RegExp(opts.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ words: rx }, { response: rx }];
    }
    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .select("-request -response")
        .sort({ createdAt: -1 })
        .skip((opts.page - 1) * opts.pageSize)
        .limit(opts.pageSize)
        .lean()
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  async get(id: string) {
    if (!this.model) return null;
    try {
      return await this.model.findById(new Types.ObjectId(id)).lean().exec();
    } catch {
      return null;
    }
  }

  /** Deletes every logged call of one service (prompts and answers of a removed service). */
  async removeByService(serviceId: string): Promise<{ deleted: number }> {
    if (!this.model) return { deleted: 0 };
    const r = await this.model.deleteMany({ serviceId }).exec();
    return { deleted: r.deletedCount ?? 0 };
  }

  async clear(): Promise<{ deleted: number }> {
    if (!this.model) return { deleted: 0 };
    const r = await this.model.deleteMany({}).exec();
    return { deleted: r.deletedCount ?? 0 };
  }

  /** Per-service counts of example calls since `since` (ok / failed / cards covered). */
  async stats(since: Date) {
    if (!this.model) return [];
    const rows = await this.model
      .aggregate<{
        _id: string;
        ok: number;
        failed: number;
        cards: number;
        lastAt: Date;
        lastError: string;
        lastErrorAt: Date | null;
      }>([
        { $match: { purpose: "example", createdAt: { $gte: since } } },
        { $sort: { createdAt: 1 } },
        {
          $group: {
            _id: "$serviceId",
            ok: { $sum: { $cond: ["$ok", 1, 0] } },
            failed: { $sum: { $cond: ["$ok", 0, 1] } },
            cards: { $sum: { $cond: ["$ok", { $size: "$words" }, 0] } },
            lastAt: { $last: "$createdAt" },
            lastError: { $last: { $cond: ["$ok", null, "$response"] } },
            lastErrorAt: { $last: { $cond: ["$ok", null, "$createdAt"] } },
          },
        },
      ])
      .exec();
    return rows;
  }
}
