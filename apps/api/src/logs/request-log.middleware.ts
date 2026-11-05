import { Injectable, Logger, type NestMiddleware } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import type { NextFunction, Request, Response } from "express";
import type { AuthUser } from "../auth/auth.types.js";
import { normalizeIp } from "./ip-block.service.js";
import { RequestLog } from "./request-log.schema.js";

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
    res.on("finish", () => {
      const path = req.originalUrl.split("?")[0] ?? "";
      if (req.method === "OPTIONS" || SKIP.some((re) => re.test(path))) return;

      const user = (req as Request & { user?: AuthUser }).user;
      const ua = req.headers["user-agent"];
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
        })
        .catch((err: unknown) =>
          this.logger.warn(`request log write failed: ${String(err)}`),
        );
    });
    next();
  }
}
