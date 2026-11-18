import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { SystemSample } from "./system-sample.schema.js";
import { SystemService } from "./system.service.js";

export const HISTORY_RANGES = ["1h", "6h", "day", "week", "month", "year"] as const;
export type HistoryRange = (typeof HISTORY_RANGES)[number];

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Window and bucket size per range → at most ~170 points each. */
const RANGE: Record<HistoryRange, { windowMs: number; bucketMs: number }> = {
  "1h": { windowMs: HOUR, bucketMs: 5 * MIN },
  "6h": { windowMs: 6 * HOUR, bucketMs: 5 * MIN },
  day: { windowMs: DAY, bucketMs: 15 * MIN },
  week: { windowMs: 7 * DAY, bucketMs: HOUR },
  month: { windowMs: 30 * DAY, bucketMs: 6 * HOUR },
  year: { windowMs: 365 * DAY, bucketMs: 3 * DAY },
};

/** A sample every 5 minutes ≈ 105k small documents a year. */
export const SAMPLE_INTERVAL_MS = 5 * MIN;

export interface HistoryPoint {
  t: number;
  cpu: number;
  ram: number;
  disk: number | null;
}

/** Records host samples and serves them averaged into buckets. */
@Injectable()
export class SystemHistoryService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(SystemHistoryService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectModel(SystemSample.name) private readonly model: Model<SystemSample>,
    private readonly system: SystemService,
  ) {}

  onModuleInit() {
    void this.record();
    this.timer = setInterval(() => void this.record(), SAMPLE_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async record() {
    try {
      const s = await this.system.sample();
      await this.model.create({ at: new Date(), ...s });
    } catch (e) {
      this.log.warn(`Không ghi được mẫu hệ thống: ${(e as Error).message}`);
    }
  }

  async history(range: HistoryRange): Promise<{ range: HistoryRange; bucketMs: number; points: HistoryPoint[] }> {
    const { windowMs, bucketMs } = RANGE[range];
    const from = new Date(Date.now() - windowMs);
    const rows = await this.model.aggregate<{ _id: number; cpu: number; ram: number; disk: number | null }>([
      { $match: { at: { $gte: from } } },
      {
        $group: {
          _id: { $floor: { $divide: [{ $toLong: "$at" }, bucketMs] } },
          cpu: { $avg: "$cpu" },
          ram: { $avg: "$ram" },
          disk: { $avg: "$disk" },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    const r1 = (n: number) => Math.round(n * 10) / 10;
    return {
      range,
      bucketMs,
      points: rows.map((r) => ({ t: r._id * bucketMs, cpu: r1(r.cpu), ram: r1(r.ram), disk: r.disk == null ? null : r1(r.disk) })),
    };
  }
}
