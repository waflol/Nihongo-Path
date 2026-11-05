import {
  type ArgumentsHost,
  Catch,
  ConsoleLogger,
  HttpException,
} from "@nestjs/common";
import { BaseExceptionFilter, HttpAdapterHost } from "@nestjs/core";
import type { Request, Response } from "express";
import type { AuthUser } from "../auth/auth.types.js";
import { DbLogger } from "./db-logger.js";
import { scrub } from "./scrub.js";

/** 4xx that are pure noise (scans, expired sessions) unless LOG_4XX_ALL=true. */
const QUIET_4XX = new Set([401, 403, 404, 429]);

/**
 * Captures every exception: the error message is attached to the request log
 * (`res.locals.errorMessage`), and 5xx / non-HTTP (and most 4xx) exceptions are persisted to
 * `app_logs` with stack, request, user and error details (4xx as `warn`,
 * except noisy 401/403/404/429 unless `LOG_4XX_ALL=true`). Then Nest's default
 * handling builds the response, so clients see the usual JSON error body.
 */
@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  private readonly console = new ConsoleLogger("Exception");

  constructor(host: HttpAdapterHost) {
    super(host.httpAdapter);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() === "http") {
      try {
        this.record(exception, host);
      } catch {
        // logging must never mask the real error
      }
    }
    super.catch(exception, host);
  }

  private record(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest<Request & { user?: AuthUser }>();
    const res = http.getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const err = exception instanceof Error ? exception : new Error(String(exception));
    res.locals.errorMessage = err.message.slice(0, 500);
    if (status < 400) return;
    if (status < 500 && QUIET_4XX.has(status) && process.env.LOG_4XX_ALL !== "true") return;

    const request = `${req.method} ${req.originalUrl.split("?")[0]}`;
    const details: Record<string, unknown> = {};
    if (exception instanceof HttpException) details.response = scrub(exception.getResponse());
    const extra = exception as { code?: unknown; codeName?: unknown; keyValue?: unknown };
    if (extra.code !== undefined) details.code = extra.code;
    if (extra.codeName !== undefined) details.codeName = extra.codeName;
    if (extra.keyValue !== undefined) details.keyValue = scrub(extra.keyValue);
    if (err.cause !== undefined) {
      details.cause = err.cause instanceof Error ? (err.cause.stack ?? err.cause.message) : String(err.cause);
    }

    const level = status >= 500 ? "error" : "warn";
    this.console[level](`${request} → ${status}: ${err.message}`, err.stack);
    DbLogger.sink?.({
      level,
      context: "Exception",
      message: `${request} → ${status}: ${err.message}`.slice(0, 2000),
      stack: err.stack?.slice(0, 8000),
      exception: err.name,
      status,
      request,
      user: req.user ? `${req.user.sub} (${req.user.role})` : undefined,
      ip: req.ip,
      details: Object.keys(details).length ? details : undefined,
    });
  }
}
