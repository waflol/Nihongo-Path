import {
  type CallHandler,
  type ExecutionContext,
  HttpException,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { catchError, type Observable, tap, throwError } from "rxjs";
import { REQUIRED_ROLES } from "../auth/guards/guards.constants.js";
import { AuditLog } from "./audit-log.schema.js";
import { type AuditRequest } from "./audit-note.js";
import { clientIpv4, normalizeIp } from "./ip-block.service.js";
import { scrub } from "./scrub.js";

/** Role-protected routes whose calls are not worth auditing. */
const SKIP = [/^\/admin\/logs\/simulate/];

/**
 * Audits every non-GET call to a role-protected (admin) route — the route's
 * own `@Roles` metadata decides, so new admin endpoints are covered
 * automatically. Failed attempts are recorded too.
 *
 * P5-ADMIN-03: when the action's controller/service called
 * `attachAuditNote(req, …)` (role / status / password writes, …) the record
 * also carries `before` / `after` snapshots of the target document's fields
 * plus a short `summary` (e.g. `role: USER → ADMIN`).
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel(AuditLog.name) private readonly model: Model<AuditLog>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();
    const req = context.switchToHttp().getRequest<AuditRequest>();
    const roles = this.reflector.getAllAndOverride<string[] | undefined>(REQUIRED_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    const path = req.originalUrl.split("?")[0] ?? "";
    if (!roles?.length || ["GET", "HEAD", "OPTIONS"].includes(req.method) || SKIP.some((re) => re.test(path))) {
      return next.handle();
    }
    return next.handle().pipe(
      tap(() => this.record(req, path, true)),
      catchError((err: unknown) => {
        this.record(req, path, false, err instanceof HttpException ? err.getStatus() : 500);
        return throwError(() => err);
      }),
    );
  }

  private record(req: AuditRequest, path: string, ok: boolean, status?: number) {
    const u = req.user;
    const body = req.body && typeof req.body === "object" ? (scrub(req.body) as Record<string, unknown>) : undefined;
    void this.model
      .create({
        actor: u && Types.ObjectId.isValid(u.sub) ? new Types.ObjectId(u.sub) : undefined,
        role: u?.role,
        method: req.method,
        path: path.slice(0, 300),
        ok,
        status,
        ip: normalizeIp(req.ip),
        ipv4: clientIpv4(req),
        body: body && JSON.stringify(body).length <= 4000 ? body : undefined,
        before: req.auditNote?.before,
        after: req.auditNote?.after,
        summary: req.auditNote?.summary,
      })
      .catch(() => undefined);
  }
}
