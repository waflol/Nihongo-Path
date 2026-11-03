import {
  CanActivate,
  HttpException,
  HttpStatus,
  type ExecutionContext,
  Injectable,
} from "@nestjs/common";
import { RateLimiterService } from "../../common/rate-limiter.service.js";

interface RequestLike {
  ip: string;
}

/**
 * Fixed-window limiter for sign-in endpoints (P2-AUTH-08, T-P2-07). Keyed by
 * client IP — the best single-axis proxy for "this caller is hammering
 * login". Exceeding the window throws 429 with a `retryAfterSeconds` hint in
 * the body.
 *
 * Process-local (see `RateLimiterService`): acceptable for dev/MVP, replaced
 * by a shared store when the queue infra lands (P5). Mounted only on the
 * sign-in endpoints, not on refresh/logout.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  /** Login attempts per IP per 15-minute window. */
  private static readonly LIMIT = 10;
  private static readonly WINDOW_MS = 15 * 60_000;

  constructor(private readonly limiter: RateLimiterService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestLike>();
    const result = this.limiter.check(
      `login:${req.ip}`,
      { limit: RateLimitGuard.LIMIT, windowMs: RateLimitGuard.WINDOW_MS },
    );

    if (!result.allowed) {
      // `HttpException` maps to 429; the body carries `retryAfterSeconds`
      // so clients can back off (T-P2-07).
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: "Too many login attempts; try again later",
          error: "Too Many Requests",
          retryAfterSeconds: result.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
