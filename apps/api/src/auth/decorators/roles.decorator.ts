import { SetMetadata } from "@nestjs/common";
import { CONTENT_ADMIN, type Role } from "../../common/roles.js";
import { REQUIRED_ROLES } from "../guards/guards.constants.js";

/**
 * Declare the roles required on a route. `RolesGuard` (global) enforces it:
 * a caller without an allowed role gets 403 (T-P2-04).
 *
 * ```ts
 * @Roles("ADMIN")                 // admin write
 * @Roles(CONTENT_ADMIN)           // ADMIN + SUPER_ADMIN
 * ```
 */
export const Roles = (...roles: ReadonlyArray<Role | ReadonlyArray<Role>>) =>
  SetMetadata(
    REQUIRED_ROLES,
    roles.flat() as Role[],
  );

/** Convenience: content-admin write surface (ADMIN or SUPER_ADMIN). */
export const ContentAdmin = () => Roles(CONTENT_ADMIN);
