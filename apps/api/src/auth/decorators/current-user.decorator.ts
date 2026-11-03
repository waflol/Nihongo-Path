import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AuthUser } from "../auth.types.js";

/**
 * Inject the verified access-token payload (`AuthGuard` attaches it to
 * `request.user`). P2-AUTH-07.
 *
 * ```ts
 * @Get("me") me(@CurrentUser() me: AuthUser) { ... }
 * ```
 *
 * The parameter is optional at the type level: unguarded routes may still
 * receive it (rarely needed), and a missing value only happens when
 * `AuthGuard` was bypassed — which is a programming error.
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    return request.user;
  },
);
