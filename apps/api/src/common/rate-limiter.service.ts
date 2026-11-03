import { Injectable } from "@nestjs/common";

export interface RateLimitConfig {
  /** Max requests allowed per window. */
  limit: number;
  /** Window length in milliseconds (sliding). */
  windowMs: number;
}

export interface RateLimitCheck {
  allowed: boolean;
  remaining: number;
  /** Seconds until the next slot frees up (0 when allowed). */
  retryAfterSeconds: number;
}

/**
 * In-memory fixed-window rate limiter keyed by an arbitrary string (usually
 * the client IP). Process-local: every instance keeps its own counters, so
 * across multiple API replicas the effective limit is `limit × replicas`.
 * That is acceptable for dev/MVP; a shared store (Redis) replaces this when
 * the queue infra lands (P5). No clock/IO dependencies — trivially testable.
 */
@Injectable()
export class RateLimiterService {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  /**
   * Record one hit and report whether it is within `config`. A hit outside
   * the window resets the counter and starts a fresh window.
   */
  check(key: string, config: RateLimitConfig, now: number = Date.now()): RateLimitCheck {
    const bucket = this.buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      const fresh = { count: 1, resetAt: now + config.windowMs };
      this.buckets.set(key, fresh);
      return {
        allowed: true,
        remaining: Math.max(0, config.limit - 1),
        retryAfterSeconds: 0,
      };
    }

    bucket.count += 1;
    const allowed = bucket.count <= config.limit;
    return {
      allowed,
      remaining: Math.max(0, config.limit - bucket.count),
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  /** Drop accumulated state (tests / cache eviction hooks). */
  reset(): void {
    this.buckets.clear();
  }
}
