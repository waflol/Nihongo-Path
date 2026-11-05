import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";

/** Everything the app itself writes lives under this prefix. */
export const REDIS_PREFIX = "np:";

export interface RedisKeyInfo {
  key: string;
  type: string;
  /** Seconds left; -1 = no expiry. */
  ttl: number;
  /** Elements / bytes depending on the type. */
  size: number;
  /** What the key means for the app: running task, waiting queue, finished result, other. */
  state: "running" | "waiting" | "done" | "other";
  /** Readable summary (word, service…) for the app's own keys. */
  label?: string;
}

export interface RedisStatus {
  configured: boolean;
  connected: boolean;
  /** Server address with the password hidden. */
  target: string;
  version?: string;
  usedMemory?: string;
  keys?: number;
  uptimeSeconds?: number;
  error?: string;
}

const MAX_VALUE_CHARS = 20_000;

/** running = a request in flight, waiting = cards queued, done = a saved answer. */
export function classify(key: string): RedisKeyInfo["state"] {
  if (key.startsWith(`${REDIS_PREFIX}ai:task:`)) return "running";
  if (key === `${REDIS_PREFIX}ai:queue`) return "waiting";
  if (key.startsWith(`${REDIS_PREFIX}ai:res:`)) return "done";
  return "other";
}

function describeValue(state: RedisKeyInfo["state"], v: Record<string, unknown> | null): string | undefined {
  if (!v) return undefined;
  if (state === "running") {
    const words = Array.isArray(v.words) ? (v.words as string[]).slice(0, 3).join("、") : "";
    return `${v.service ?? "?"} · ${words}${Number(v.items) > 3 ? ` +${Number(v.items) - 3}` : ""}`;
  }
  if (state === "waiting") {
    const words = Array.isArray(v.words) ? (v.words as string[]).slice(0, 5).join("、") : "";
    return `${v.count ?? 0} thẻ đang đợi · ${words}`;
  }
  const vi = typeof v.vi === "string" ? v.vi : "";
  return v.term ? `${v.term} → ${vi}` : vi || undefined;
}

/** `redis://:secret@host:6379/0` → `redis://***@host:6379/0`. */
export function maskRedisUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username || u.password ? "***@" : ""}${u.host}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return "(không đọc được REDIS_URL)";
  }
}

/**
 * Optional Redis connection (`REDIS_URL`). Without it every call is a quiet
 * no-op, so the app behaves as before. App helpers (`setJson`/`getJson`/`del`)
 * never throw: a Redis outage only means a cache miss. The admin helpers
 * (`status`, `scan`, `inspect`, …) report errors so the admin can see them.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private lastError = "";
  /** Test hook: use this client instead of connecting to REDIS_URL. */
  private injected: Redis | null = null;

  private get url(): string {
    return process.env.REDIS_URL?.trim() ?? "";
  }

  get enabled(): boolean {
    return this.injected !== null || this.url !== "";
  }

  /** Test hook. */
  useClient(client: Redis): void {
    this.injected = client;
  }

  private async conn(): Promise<Redis | null> {
    if (this.injected) return this.injected;
    if (!this.url) return null;
    if (!this.client) {
      this.client = new Redis(this.url, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: 3000,
        retryStrategy: (n) => Math.min(n * 500, 5000),
      });
      this.client.on("error", (e: Error) => {
        this.lastError = e.message;
      });
    }
    if (this.client.status === "wait" || this.client.status === "end") {
      try {
        await this.client.connect();
        this.lastError = "";
      } catch (e) {
        this.lastError = (e as Error).message;
        return null;
      }
    }
    return this.client.status === "ready" ? this.client : null;
  }

  async onModuleDestroy(): Promise<void> {
    this.client?.disconnect();
  }

  // ── App helpers (never throw) ───────────────────────────────────────

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      const c = await this.conn();
      await c?.set(REDIS_PREFIX + key, JSON.stringify(value), "EX", ttlSeconds);
    } catch (e) {
      this.logger.debug(`redis set failed: ${(e as Error).message}`);
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    try {
      const c = await this.conn();
      const raw = await c?.get(REDIS_PREFIX + key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  async del(key: string): Promise<void> {
    try {
      const c = await this.conn();
      await c?.del(REDIS_PREFIX + key);
    } catch {
      /* ignore */
    }
  }

  // ── Admin helpers ───────────────────────────────────────────────────

  async status(): Promise<RedisStatus> {
    if (!this.enabled) {
      return { configured: false, connected: false, target: "" };
    }
    const target = this.injected ? "(client được cấp sẵn)" : maskRedisUrl(this.url);
    const c = await this.conn();
    if (!c) return { configured: true, connected: false, target, error: this.lastError || "không kết nối được" };
    try {
      const [info, keys] = await Promise.all([c.info(), c.dbsize()]);
      const pick = (name: string) => new RegExp(`^${name}:(.*)$`, "m").exec(info)?.[1]?.trim();
      return {
        configured: true,
        connected: true,
        target,
        version: pick("redis_version"),
        usedMemory: pick("used_memory_human"),
        uptimeSeconds: Number(pick("uptime_in_seconds")) || undefined,
        keys,
      };
    } catch (e) {
      return { configured: true, connected: false, target, error: (e as Error).message };
    }
  }

  private async need(): Promise<Redis> {
    const c = await this.conn();
    if (!c) throw new Error(this.enabled ? this.lastError || "Redis không kết nối được" : "Chưa cấu hình REDIS_URL");
    return c;
  }

  /** One SCAN step (cursor "0" starts; returned cursor "0" = done). */
  async scan(match: string, cursor: string, count: number): Promise<{ cursor: string; keys: RedisKeyInfo[] }> {
    const c = await this.need();
    const [next, found] = await c.scan(cursor, "MATCH", match || "*", "COUNT", Math.min(1000, Math.max(10, count)));
    const keys = [...new Set(found)].slice(0, 500);
    const pipe = c.pipeline();
    for (const k of keys) {
      pipe.type(k);
      pipe.ttl(k);
    }
    const res = (await pipe.exec()) ?? [];
    const infos: RedisKeyInfo[] = keys.map((key, i) => ({
      key,
      type: String(res[i * 2]?.[1] ?? "none"),
      ttl: Number(res[i * 2 + 1]?.[1] ?? -1),
      size: 0,
      state: "other" as const,
    }));
    const sizeCmd: Record<string, "strlen" | "hlen" | "llen" | "scard" | "zcard" | "xlen"> = {
      string: "strlen",
      hash: "hlen",
      list: "llen",
      set: "scard",
      zset: "zcard",
      stream: "xlen",
    };
    const sp = c.pipeline();
    for (const k of infos) {
      const cmd = sizeCmd[k.type];
      if (cmd) sp[cmd](k.key);
      else sp.exists(k.key);
    }
    const sizes = (await sp.exec()) ?? [];
    infos.forEach((k, i) => (k.size = Number(sizes[i]?.[1] ?? 0)));

    // Name the app's own keys: what is running, waiting, or already finished.
    const own = infos.filter((k) => k.type === "string" && classify(k.key) !== "other");
    if (own.length > 0) {
      const vals = await c.mget(...own.map((k) => k.key));
      own.forEach((k, i) => {
        k.state = classify(k.key);
        try {
          k.label = describeValue(k.state, vals[i] ? (JSON.parse(vals[i]!) as Record<string, unknown>) : null);
        } catch {
          /* keep the key as its own name */
        }
      });
    }
    return { cursor: next, keys: infos };
  }

  async inspect(key: string): Promise<{ key: string; type: string; ttl: number; size: number; value: unknown; truncated: boolean }> {
    const c = await this.need();
    const type = await c.type(key);
    const ttl = await c.ttl(key);
    let value: unknown = null;
    let size = 0;
    switch (type) {
      case "string": {
        const v = (await c.get(key)) ?? "";
        size = v.length;
        value = v;
        break;
      }
      case "hash": {
        size = await c.hlen(key);
        value = await c.hgetall(key);
        break;
      }
      case "list": {
        size = await c.llen(key);
        value = await c.lrange(key, 0, 99);
        break;
      }
      case "set": {
        size = await c.scard(key);
        value = (await c.sscan(key, "0", "COUNT", 100))[1];
        break;
      }
      case "zset": {
        size = await c.zcard(key);
        value = await c.zrange(key, "0", "99", "WITHSCORES");
        break;
      }
      default:
        value = null;
    }
    let text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    let truncated = false;
    if (text && text.length > MAX_VALUE_CHARS) {
      text = `${text.slice(0, MAX_VALUE_CHARS)}…`;
      truncated = true;
    }
    // Pretty-print JSON strings.
    if (type === "string" && !truncated) {
      try {
        text = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* plain text */
      }
    }
    return { key, type, ttl, size, value: text ?? "", truncated };
  }

  async deleteKey(key: string): Promise<number> {
    return (await this.need()).del(key);
  }

  /** Delete every key matching `match` (SCAN + UNLINK in chunks). Returns how many. */
  async deletePattern(match: string): Promise<number> {
    const c = await this.need();
    let cursor = "0";
    let deleted = 0;
    do {
      const [next, found] = await c.scan(cursor, "MATCH", match, "COUNT", 500);
      cursor = next;
      if (found.length > 0) deleted += await c.unlink(...new Set(found));
    } while (cursor !== "0");
    return deleted;
  }

  /** Empty the selected Redis database. */
  async flush(): Promise<void> {
    await (await this.need()).flushdb();
  }

  private async countKeys(c: Redis, match: string, cap = 100_000): Promise<number> {
    let cursor = "0";
    let n = 0;
    do {
      const [next, found] = await c.scan(cursor, "MATCH", match, "COUNT", 1000);
      cursor = next;
      n += found.length;
    } while (cursor !== "0" && n < cap);
    return n;
  }

  /** How many tasks are running, how many cards wait, how many answers are saved. */
  async summary(): Promise<{ running: number; waiting: number; done: number }> {
    const c = await this.need();
    const [running, done, q] = await Promise.all([
      this.countKeys(c, `${REDIS_PREFIX}ai:task:*`),
      this.countKeys(c, `${REDIS_PREFIX}ai:res:*`),
      c.get(`${REDIS_PREFIX}ai:queue`),
    ]);
    let waiting = 0;
    try {
      waiting = q ? Number((JSON.parse(q) as { count?: number }).count) || 0 : 0;
    } catch {
      /* ignore */
    }
    return { running, waiting, done };
  }

  /** Tasks the app is running right now (`np:ai:task:*`). */
  async runningTasks(): Promise<unknown[]> {
    const c = await this.need();
    let cursor = "0";
    const keys: string[] = [];
    do {
      const [next, found] = await c.scan(cursor, "MATCH", `${REDIS_PREFIX}ai:task:*`, "COUNT", 200);
      cursor = next;
      keys.push(...found);
    } while (cursor !== "0" && keys.length < 200);
    if (keys.length === 0) return [];
    const vals = await c.mget(...keys);
    return vals.flatMap((v) => {
      try {
        return v ? [JSON.parse(v) as unknown] : [];
      } catch {
        return [];
      }
    });
  }
}
