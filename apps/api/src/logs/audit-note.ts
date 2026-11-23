import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types.js";
import { scrub } from "./scrub.js";

/** One before/after snapshot of a mutated document (P5-ADMIN-03). */
export interface AuditNote {
  /** Field values of the target BEFORE the mutation. */
  before?: Record<string, unknown>;
  /** Field values AFTER. */
  after?: Record<string, unknown>;
  /** Short human summary, e.g. `role: USER → ADMIN`. */
  summary?: string;
}

/**
 * The Express request surface that can carry an audit note. Controllers
 * attach `auditNote` via `attachAuditNote`; the global `AuditInterceptor`
 * merges it into the audit row it writes, so one admin action = one record
 * with who / what / before / after.
 */
export type AuditRequest = Request & {
  user?: AuthUser;
  auditNote?: AuditNote;
};

const MAX_SNAPSHOT_CHARS = 4000;

function cap(value: Record<string, unknown>): Record<string, unknown> | undefined {
  const scrubbed = scrub(value) as Record<string, unknown>;
  const json = JSON.stringify(scrubbed);
  return json.length <= MAX_SNAPSHOT_CHARS ? scrubbed : undefined;
}

/**
 * Attach a before/after snapshot to the current action's audit record.
 * Call it before the mutation; the interceptor records the row on the way out.
 */
export function attachAuditNote(req: unknown, note: AuditNote): void {
  const target = req as AuditRequest;
  if (!target) return;
  target.auditNote = {
    before: note.before ? cap(note.before) : undefined,
    after: note.after ? cap(note.after) : undefined,
    summary: note.summary?.slice(0, 200),
  };
}
