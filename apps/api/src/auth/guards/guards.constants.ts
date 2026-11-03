/**
 * Guard / decorator metadata keys.
 *
 * Execution order is fixed (architecture §4.3): `AuthGuard` → `RolesGuard`
 * → (later: `EntitlementGuard` → `QuotaGuard`). Both P2 guards are global
 * (`APP_GUARD`) and provided in that order from `AuthModule`; `RolesGuard`
 * therefore always sees `request.user` that `AuthGuard` attached.
 */
export const IS_PUBLIC = "auth:isPublic";
export const REQUIRED_ROLES = "auth:requiredRoles";
