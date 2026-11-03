/**
 * Role is an ADMINISTRATION axis, deliberately kept separate from `Plan`
 * (FREE/PRO/VIP) and feature entitlements (spec §4.1, §6.2). Role answers
 * "what can this account administer?", never "what content may it learn?".
 */
export const ROLES = ["USER", "ADMIN", "SUPER_ADMIN"];
export type Role = (typeof ROLES)[number];

/** Roles that may write learning content or manage users. */
export const CONTENT_ADMIN: readonly Role[] = ["ADMIN", "SUPER_ADMIN"];
