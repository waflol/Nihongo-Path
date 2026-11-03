import {
  CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthUser } from "../auth.types.js";
import { TokenService } from "../token.service.js";
import { IS_PUBLIC } from "./guards.constants.js";

/**
 * The Express request surface `AuthGuard` touches. Modelled narrowly so the
 * guard does not depend on a concrete HTTP-adapter type — only the two
 * fields it actually reads.
 */
interface RequestWithUser {
  user?: AuthUser;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * `AuthGuard` (P2-AUTH-06) — global, runs first.
 *
 * - Public routes (`@IsPublic()`) pass through untouched.
 * - Otherwise a Bearer access token is required; it is verified (HMAC + exp)
 *   and the payload is attached to `request.user`. Missing/invalid/expired →
 *   a generic 401 (T-P2-03), never a 200 and no detail leak.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const header = this.bearer(request.headers.authorization);
    if (!header) {
      throw new UnauthorizedException("Authentication required");
    }

    const payload = this.tokens.verifyAccessToken(header);
    request.user = {
      sub: payload.sub,
      role: payload.role,
      lang: payload.lang,
    };
    return true;
  }

  private bearer(raw: string | string[] | undefined): string | null {
    if (!raw || Array.isArray(raw)) {
      return null;
    }
    const scheme = raw.slice(0, 7).toLowerCase();
    if (scheme !== "bearer ") {
      return null;
    }
    const token = raw.slice(7).trim();
    return token.length > 0 ? token : null;
  }
}
