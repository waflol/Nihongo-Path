import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { isIP } from "node:net";
import { Model } from "mongoose";
import { AllowedIp } from "./allowed-ip.schema.js";
import { BlockedIp } from "./blocked-ip.schema.js";

/** `::ffff:1.2.3.4` → `1.2.3.4`. */
export function normalizeIp(raw: string | undefined): string {
  if (!raw) return "unknown";
  return raw.startsWith("::ffff:") ? raw.slice(7) : raw;
}

/** Loopback / private ranges: never auto-blocked (the UI server proxies from one). */
export function isInternalIp(ip: string): boolean {
  return (
    ip === "::1" ||
    ip === "unknown" ||
    /^127\./.test(ip) ||
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^f[cd]/i.test(ip) ||
    /^fe80:/i.test(ip)
  );
}

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

/**
 * In-memory IP deny-list (synced from Mongo every 30 s so several API
 * instances agree) plus a per-IP fixed-window request counter that auto-blocks
 * floods. Tunables: RATE_BLOCK_MAX (default 300 requests), RATE_BLOCK_WINDOW_SEC
 * (10) and RATE_BLOCK_MINUTES (15).
 */
@Injectable()
export class IpBlockService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IpBlockService.name);
  /** ip → expiry epoch ms (null = permanent). */
  private blocked = new Map<string, number | null>();
  private counters = new Map<string, { start: number; count: number }>();
  private timer?: NodeJS.Timeout;
  /** Never blocked. Env `IP_ALLOWLIST` (comma-separated) + DB rows. */
  private readonly envAllowed = new Set(
    (process.env.IP_ALLOWLIST ?? "").split(",").map((v) => normalizeIp(v.trim())).filter((v) => v !== "unknown"),
  );
  private allowed = new Set<string>(this.envAllowed);

  private readonly max = num(process.env.RATE_BLOCK_MAX, 300);
  private readonly windowMs = num(process.env.RATE_BLOCK_WINDOW_SEC, 10) * 1000;
  private readonly blockMinutes = num(process.env.RATE_BLOCK_MINUTES, 15);

  constructor(
    @InjectModel(BlockedIp.name) private readonly model: Model<BlockedIp>,
    @InjectModel(AllowedIp.name) private readonly allowModel: Model<AllowedIp>,
  ) {}

  async onModuleInit() {
    await this.refresh();
    this.timer = setInterval(() => void this.refresh(), 30_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async refresh() {
    try {
      const rows = await this.model.find({}).lean();
      const next = new Map<string, number | null>();
      for (const r of rows) next.set(r.ip, r.expiresAt ? r.expiresAt.getTime() : null);
      this.blocked = next;
      const allow = await this.allowModel.find({}, { ip: 1 }).lean();
      this.allowed = new Set([...this.envAllowed, ...allow.map((a) => a.ip)]);
      const cutoff = Date.now() - this.windowMs;
      for (const [ip, c] of this.counters) if (c.start < cutoff) this.counters.delete(ip);
    } catch (err) {
      this.logger.warn(`blocklist refresh failed: ${String(err)}`);
    }
  }

  isAllowed(ip: string): boolean {
    return this.allowed.has(ip);
  }

  isBlocked(ip: string): boolean {
    if (this.allowed.has(ip)) return false;
    if (!this.blocked.has(ip)) return false;
    const exp = this.blocked.get(ip);
    if (exp === null || exp === undefined) return true;
    if (exp > Date.now()) return true;
    this.blocked.delete(ip);
    return false;
  }

  /** Fixed-window counter step; true when `ip` just exceeded the limit. */
  private count(map: Map<string, { start: number; count: number }>, ip: string, now: number): boolean {
    const c = map.get(ip);
    if (!c || now - c.start > this.windowMs) {
      map.set(ip, { start: now, count: 1 });
      return false;
    }
    if (++c.count > this.max) {
      map.delete(ip);
      return true;
    }
    return false;
  }

  /** Count a request; auto-blocks the IP when it exceeds the window limit. */
  hit(ip: string): void {
    if (isInternalIp(ip) || this.allowed.has(ip)) return;
    if (this.count(this.counters, ip, Date.now())) {
      void this.block(
        ip,
        `Tự động chặn: >${this.max} request / ${this.windowMs / 1000}s`,
        this.blockMinutes,
        undefined,
        true,
      );
    }
  }

  /** Dry run of the limiter on a scratch map: nothing is blocked or stored. */
  simulate(requests: number, intervalMs: number) {
    const map = new Map<string, { start: number; count: number }>();
    const t0 = Date.now();
    let blockedAt: number | null = null;
    for (let i = 1; i <= requests; i++) {
      if (this.count(map, "203.0.113.1", t0 + (i - 1) * intervalMs)) {
        blockedAt = i;
        break;
      }
    }
    return { requests, intervalMs, blockedAtRequest: blockedAt, ...this.config() };
  }

  config() {
    return {
      maxRequests: this.max,
      windowSec: this.windowMs / 1000,
      blockMinutes: this.blockMinutes,
    };
  }

  /** Live per-IP counters inside the current window (busiest first). */
  live() {
    const now = Date.now();
    const rows = [...this.counters.entries()]
      .filter(([, c]) => now - c.start <= this.windowMs)
      .map(([ip, c]) => ({
        ip,
        count: c.count,
        windowEndsInSec: Math.max(0, Math.round((c.start + this.windowMs - now) / 1000)),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
    return { ...this.config(), blockedCount: this.blocked.size,
      allowedCount: this.allowed.size, counters: rows };
  }

  async block(ip: string, reason: string | undefined, minutes: number | null, by: string | undefined, auto = false) {
    const expiresAt = minutes ? new Date(Date.now() + minutes * 60_000) : undefined;
    this.blocked.set(ip, expiresAt ? expiresAt.getTime() : null);
    try {
      await this.model.updateOne(
        { ip },
        expiresAt
          ? { $set: { reason, auto, createdBy: by, expiresAt } }
          : { $set: { reason, auto, createdBy: by }, $unset: { expiresAt: 1 } },
        { upsert: true },
      );
    } catch (err) {
      this.logger.warn(`could not persist block for ${ip}: ${String(err)}`);
    }
    if (auto) this.logger.warn(`Auto-blocked ${ip} for ${minutes} min (${reason})`);
  }

  async allow(ip: string, note: string | undefined, by: string | undefined) {
    this.allowed.add(ip);
    this.blocked.delete(ip);
    await Promise.all([
      this.allowModel.updateOne({ ip }, { $set: { note, createdBy: by } }, { upsert: true }),
      this.model.deleteOne({ ip }),
    ]);
  }

  async disallow(ip: string) {
    if (this.envAllowed.has(ip)) return false;
    this.allowed.delete(ip);
    await this.allowModel.deleteOne({ ip });
    return true;
  }

  async listAllowed() {
    const rows = await this.allowModel.find({}).sort({ createdAt: -1 }).lean();
    return [
      ...[...this.envAllowed].map((ip) => ({ ip, note: "Cấu hình IP_ALLOWLIST", source: "env" as const, createdAt: null })),
      ...rows.map((r) => ({ ip: r.ip, note: r.note ?? null, source: "admin" as const, createdAt: r.createdAt })),
    ];
  }

  async unblock(ip: string) {
    this.blocked.delete(ip);
    await this.model.deleteOne({ ip });
  }

  async list() {
    const rows = await this.model.find({}).sort({ createdAt: -1 }).lean();
    return rows.map((r) => ({
      ip: r.ip,
      reason: r.reason ?? null,
      auto: r.auto,
      createdBy: r.createdBy ?? null,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt ?? null,
    }));
  }
}

export const isValidIp = (s: string) => isIP(s) !== 0;
