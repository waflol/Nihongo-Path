import { SetMetadata } from "@nestjs/common";
import { IS_PUBLIC } from "../guards/guards.constants.js";

/**
 * Mark a route as public — `AuthGuard` skips token verification for it
 * (P2-AUTH-06/07). Used on `/auth/*` sign-in endpoints and on public
 * content reads.
 */
export const IsPublic = () => SetMetadata(IS_PUBLIC, true);
