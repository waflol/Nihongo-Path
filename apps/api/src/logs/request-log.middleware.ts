import { Injectable, Logger, type NestMiddleware } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import type { NextFunction, Request, Response } from "express";
import type { AuthUser } from "../auth/auth.types.js";
import { normalizeIp } from "./ip-block.service.js";
import { RequestLog } from "./request-log.schema.js";
import { scrub } from "./scrub.js";

/** Max response bytes buffered per request for the log. */
const RES_CAP = 64 * 1024;

/** Parse a captured JSON body into a scrubbed value, or a short note. */
function pack(raw: string | undefined, contentType: unknown, truncated: boolean): unknown {
  if (raw === undefined || raw === "") return undefined;
  if (typeof contentType !== "string" || !contentType.includes("json")) {
    return `[${typeof contentType === "string" ? contentType.split(";")[0] : "unknown"} — not logged]`;
  }
  if (truncated) return `[truncated, >${RES_CAP / 1024} KB — not logged]`;
  try {
    return scrub(JSON.parse(raw));
  } catch {
    return "[invalid JSON]";
  }
}

/** Paths that would only add noise (probes, the log viewer itself, docs). */
const SKIP = [/^\/health/, /^\/admin\/logs/, /^\/api\/docs/];

/**
 * Records every finished request. Runs as Express middleware (not an
 * interceptor) so guard rejections (401/403) and validation errors are
 * captured too. `request.user` is set by `AuthGuard` before `finish` fires.
 */
@Injectable()
export class RequestLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestLogMiddleware.name);

  constructor(
    @InjectModel(RequestLog.name) private readonly model: Model<RequestLog>,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const started = process.hrtime.bigint();
    // Tee the response body (JSON only, capped) so the detail view can show it.
    const chunks: Buffer[] = [];
    let size = 0;
    let truncated = false;
    const origWrite = res.write.bind(res) as (...a: unknown[]) => boolean;
    const origEnd = res.end.bind(res) as (...a: unknown[]) => Response;
    const keep = (chunk: unknown) => {
      if (truncated || chunk == null || typeof chunk === "function") return;
      const buf = Buffer.isBuffer(chunk) ? chunk : typeof chunk === "string" ? Buffer.from(chunk) : null;
      if (!buf) return;
      size += buf.length;
      if (size > RES_CAP) truncated = true;
      else chunks.push(buf);
    };
    res.write = ((chunk: unknown, ...rest: unknown[]) => {
      keep(chunk);
      return origWrite(chunk, ...rest);
    }) as typeof res.write;
    res.end = ((chunk?: unknown, ...rest: unknown[]) => {
      keep(chunk);
      return origEnd(chunk, ...rest);
    }) as typeof res.end;
    res.on("finish", () => {
      const path = req.originalUrl.split("?")[0] ?? "";
      if (req.method === "OPTIONS" || SKIP.some((re) => re.test(path))) return;

      const user = (req as Request & { user?: AuthUser }).user;
      const ua = req.headers["user-agent"];
      const resType = res.getHeader("content-type");
      const reqBody =
        req.body && typeof req.body === "object" && Object.keys(req.body as object).length > 0
          ? scrub(req.body)
          : undefined;
      void this.model
        .create({
          method: req.method,
          path: path.slice(0, 300),
          status: res.statusCode,
          durationMs: Math.round(Number(process.hrtime.bigint() - started) / 1e6),
          user: user && Types.ObjectId.isValid(user.sub) ? new Types.ObjectId(user.sub) : undefined,
          role: user?.role,
          ip: normalizeIp(req.ip),
          userAgent: typeof ua === "string" ? ua.slice(0, 200) : undefined,
          error:
            typeof res.locals.errorMessage === "string" ? res.locals.errorMessage : undefined,
          query: Object.keys(req.query).length > 0 ? (scrub(req.query) as Record<string, unknown>) : undefined,
          reqHeaders: scrub(req.headers) as Record<string, unknown>,
          reqBody,
          resHeaders: scrub(res.getHeaders()) as Record<string, unknown>,
          resBody: pack(Buffer.concat(chunks).toString("utf8"), resType, truncated),
        })
        .catch((err: unknown) =>
          this.logger.warn(`request log write failed: ${String(err)}`),
        );
    });
    next();
  }
}
