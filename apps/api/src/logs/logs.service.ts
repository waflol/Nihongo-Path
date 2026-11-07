import { Injectable, NotFoundException, type OnModuleInit } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types, type FilterQuery } from "mongoose";
import type { ExportQuery, ListAppLogsQuery, ListAuditQuery, ListLogsQuery, Range } from "./logs.dto.js";
import { AppLog } from "./app-log.schema.js";
import { AuditLog } from "./audit-log.schema.js";
import { DbLogger, type LogEntry } from "./db-logger.js";
import { RequestLog } from "./request-log.schema.js";
import { User } from "../users/schemas/user.schema.js";

const DAY_MS = 24 * 3600 * 1000;
const TZ = "Asia/Ho_Chi_Minh";

/**
 * Time window for a query: a specific local day (`date`, UTC+7 — Vietnam has
 * no DST), else the last day/week/month, else unbounded.
 */
function windowOf(q: { range?: Range; date?: string }): { from?: Date; to?: Date } {
  if (q.date) {
    const from = new Date(`${q.date}T00:00:00+07:00`);
    if (!Number.isNaN(from.getTime())) return { from, to: new Date(from.getTime() + DAY_MS) };
  }
  if (q.range) {
    return { from: new Date(Date.now() - { day: 1, week: 7, month: 30 }[q.range] * DAY_MS) };
  }
  return {};
}

const createdAtFilter = (w: { from?: Date; to?: Date }) =>
  w.from ? { $gte: w.from, ...(w.to ? { $lt: w.to } : {}) } : undefined;

/** One CSV field; neutralises spreadsheet formulas (`=`, `+`, `-`, `@`). */
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let t = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

@Injectable()
export class LogsService implements OnModuleInit {
  constructor(
    @InjectModel(RequestLog.name) private readonly logs: Model<RequestLog>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(AppLog.name) private readonly appLogs: Model<AppLog>,
    @InjectModel(AuditLog.name) private readonly audits: Model<AuditLog>,
  ) {}

  onModuleInit() {
    DbLogger.sink = (entry: LogEntry) => {
      void this.appLogs.create(entry).catch(() => undefined);
    };
  }

  async listAudit(query: ListAuditQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const filter: FilterQuery<AuditLog> = {};
    const createdAt = createdAtFilter(windowOf(query));
    if (createdAt) filter.createdAt = createdAt;
    if (query.q) filter.path = { $regex: escapeRegex(query.q), $options: "i" };
    if (query.method) filter.method = query.method;

    const [rows, total] = await Promise.all([
      this.audits.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.audits.countDocuments(filter),
    ]);
    const ids = [...new Set(rows.map((r) => r.actor?.toString()).filter(Boolean))];
    const owners = ids.length
      ? await this.users.find({ _id: { $in: ids } }, { email: 1, displayName: 1 }).lean()
      : [];
    const label = new Map(
      owners.map((u) => [u._id.toString(), u.email ?? u.displayName ?? u._id.toString()]),
    );
    return {
      page,
      limit,
      total,
      items: rows.map((r) => ({
        id: r._id.toString(),
        actor: r.actor ? (label.get(r.actor.toString()) ?? r.actor.toString()) : null,
        role: r.role ?? null,
        method: r.method,
        path: r.path,
        ok: r.ok,
        status: r.status ?? null,
        ip: r.ip ?? null,
        ipv4: r.ipv4 ?? null,
        body: r.body ?? null,
        createdAt: r.createdAt,
      })),
    };
  }

  /** CSV (UTF-8 BOM, CRLF) of up to 10 000 rows matching the current filters. */
  async exportCsv(query: ExportQuery): Promise<string> {
    const base = { page: 1, limit: 10_000, range: query.range, date: query.date, q: query.q };
    let header: string[];
    let rows: unknown[][];
    if (query.type === "requests") {
      const d = await this.list({ ...base, method: query.method, statusClass: query.statusClass });
      header = ["time", "method", "path", "status", "durationMs", "user", "role", "ip", "error"];
      rows = d.items.map((r) => [r.createdAt, r.method, r.path, r.status, r.durationMs, r.user, r.role, r.ip, r.error]);
    } else if (query.type === "app") {
      const d = await this.listApp({ ...base, level: query.level });
      header = ["time", "level", "context", "message", "exception", "status", "request", "user", "ip", "details", "stack"];
      rows = d.items.map((r) => [r.createdAt, r.level, r.context, r.message, r.exception, r.status, r.request, r.user, r.ip, r.details && JSON.stringify(r.details), r.stack]);
    } else {
      const d = await this.listAudit({ ...base, method: query.method });
      header = ["time", "actor", "role", "method", "path", "ok", "status", "ip", "body"];
      rows = d.items.map((r) => [r.createdAt, r.actor, r.role, r.method, r.path, r.ok, r.status, r.ip, r.body && JSON.stringify(r.body)]);
    }
    return "\uFEFF" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
  }

  async listApp(query: ListAppLogsQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const filter: FilterQuery<AppLog> = {};
    const createdAt = createdAtFilter(windowOf(query));
    if (createdAt) filter.createdAt = createdAt;
    if (query.level) filter.level = query.level;
    if (query.q) {
      const re = { $regex: escapeRegex(query.q), $options: "i" };
      filter.$or = [{ message: re }, { context: re }, { request: re }];
    }
    const [rows, total] = await Promise.all([
      this.appLogs
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.appLogs.countDocuments(filter),
    ]);
    return {
      page,
      limit,
      total,
      items: rows.map((r) => ({
        id: r._id.toString(),
        level: r.level,
        context: r.context ?? null,
        message: r.message,
        stack: r.stack ?? null,
        exception: r.exception ?? null,
        status: r.status ?? null,
        request: r.request ?? null,
        user: r.user ?? null,
        ip: r.ip ?? null,
        details: r.details ?? null,
        createdAt: r.createdAt,
      })),
    };
  }

  async list(query: ListLogsQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const filter: FilterQuery<RequestLog> = {};
    const createdAt = createdAtFilter(windowOf(query));
    if (createdAt) filter.createdAt = createdAt;
    if (query.q) filter.path = { $regex: escapeRegex(query.q), $options: "i" };
    if (query.method) filter.method = query.method;
    if (query.statusClass) {
      const base = Number(query.statusClass[0]) * 100;
      filter.status = { $gte: base, $lt: base + 100 };
    }

    const [rows, total] = await Promise.all([
      this.logs
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.logs.countDocuments(filter),
    ]);

    const ids = [...new Set(rows.map((r) => r.user?.toString()).filter(Boolean))];
    const owners = ids.length
      ? await this.users.find({ _id: { $in: ids } }, { email: 1, displayName: 1 }).lean()
      : [];
    const label = new Map(
      owners.map((u) => [u._id.toString(), u.email ?? u.displayName ?? u._id.toString()]),
    );

    return {
      page,
      limit,
      total,
      items: rows.map((r) => ({
        id: r._id.toString(),
        method: r.method,
        path: r.path,
        status: r.status,
        durationMs: r.durationMs,
        user: r.user ? (label.get(r.user.toString()) ?? r.user.toString()) : null,
        role: r.role ?? null,
        ip: r.ip ?? null,
        ipv4: r.ipv4 ?? null,
        userAgent: r.userAgent ?? null,
        error: r.error ?? null,
        createdAt: r.createdAt,
      })),
    };
  }

  /** Full detail of one logged request (headers + bodies, already scrubbed). */
  async detail(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException("Request log not found");
    const r = await this.logs.findById(id).lean();
    if (!r) throw new NotFoundException("Request log not found");
    return {
      id: r._id.toString(),
      method: r.method,
      path: r.path,
      status: r.status,
      durationMs: r.durationMs,
      ip: r.ip ?? null,
      ipv4: r.ipv4 ?? null,
      userAgent: r.userAgent ?? null,
      error: r.error ?? null,
      createdAt: r.createdAt,
      query: r.query ?? null,
      request: { headers: r.reqHeaders ?? null, body: r.reqBody ?? null },
      response: { headers: r.resHeaders ?? null, body: r.resBody ?? null },
    };
  }

  /** Traffic for the range: top IPs, unique IP count and an hourly series. */
  async traffic(q: { range?: Range; date?: string }) {
    const w = windowOf(q.date ? q : { range: q.range ?? "day" });
    const createdAt = createdAtFilter(w);
    const byHour = Boolean(q.date) || (q.range ?? "day") === "day";
    const [ips, hourly] = await Promise.all([
      this.logs.aggregate<{ _id: string; n: number; errors: number; last: Date }>([
        { $match: { createdAt, ip: { $exists: true } } },
        {
          $group: {
            _id: "$ip",
            n: { $sum: 1 },
            errors: { $sum: { $cond: [{ $gte: ["$status", 400] }, 1, 0] } },
            last: { $max: "$createdAt" },
          },
        },
        { $sort: { n: -1 } },
        { $limit: 1000 },
      ]),
      this.logs.aggregate<{ _id: Date; n: number; errors: number }>([
        { $match: { createdAt } },
        {
          $group: {
            _id: { $dateTrunc: { date: "$createdAt", unit: byHour ? "hour" : "day", timezone: TZ } },
            n: { $sum: 1 },
            errors: { $sum: { $cond: [{ $gte: ["$status", 400] }, 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);
    return {
      uniqueIps: ips.length,
      topIps: ips.slice(0, 20).map((r) => ({
        ip: r._id,
        requests: r.n,
        errors: r.errors,
        lastSeen: r.last,
      })),
      hourly: hourly.map((h) => ({ hour: h._id, requests: h.n, errors: h.errors })),
    };
  }

  /** Counts by status class over the range. */
  async summary(q: { range?: Range; date?: string }) {
    const createdAt = createdAtFilter(windowOf(q.date ? q : { range: q.range ?? "day" }));
    const rows = await this.logs.aggregate<{ _id: number; n: number; avg: number }>([
      { $match: { createdAt } },
      {
        $group: {
          _id: { $floor: { $divide: ["$status", 100] } },
          n: { $sum: 1 },
          avg: { $avg: "$durationMs" },
        },
      },
    ]);
    const count = (c: number) => rows.find((r) => r._id === c)?.n ?? 0;
    const total = rows.reduce((s, r) => s + r.n, 0);
    const avgMs = total
      ? Math.round(rows.reduce((s, r) => s + r.avg * r.n, 0) / total)
      : 0;
    return {
      total,
      ok: count(2) + count(3),
      clientErrors: count(4),
      serverErrors: count(5),
      avgMs,
    };
  }
}
