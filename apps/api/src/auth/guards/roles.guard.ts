import {
  CanActivate,
  ForbiddenException,
  type ExecutionContext,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Role } from "../../common/roles.js";
import type { AuthUser } from "../auth.types.js";
import { REQUIRED_ROLES } from "./guards.constants.js";

interface RequestWithUser {
  user?: AuthUser;
}

/**
 * `RolesGuard` (P2-AUTH-06) — global, runs after `AuthGuard` (fixed order,
 * architecture §4.3). Enforces `@Roles(...)` when present:
 *
 * - No `@Roles` metadata → pass-through (authenticated callers only, since
 *   `AuthGuard` already gated the route).
 * - Metadata present and caller's role not in the list → 403 (T-P2-04).
 *
 * Role is the ADMINISTRATION axis; it must never double as the entitlement
 * check (spec §4.1, §6.2, T-P2-05) — that is `EntitlementGuard` in P5.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<readonly Role[]>(
      REQUIRED_ROLES,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException("Insufficient role");
    }
    return true;
  }
}
