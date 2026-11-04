import { createHash } from "node:crypto";

/**
 * The stable content fingerprint for a card within a deck (P3-CARD-02).
 *
 * Normalized (trim + casefold + collapsed internal whitespace) so the same
 * content typed two different ways still collides — which is what makes
 * "save a word" and import re-sends idempotent (T-P3-03) and lets the
 * preview flag duplicates before writing (T-P3-01/02).
 *
 * Scoped to the deck by the `(deck, dedupeKey)` unique index: the same term
 * in two decks is two cards, as intended.
 */
export function cardDedupeKey(front: string, back: string): string {
  const norm = (s: string) =>
    s.trim().toLowerCase().replace(/\s+/g, " ");
  return createHash("sha256")
    .update(`${norm(front)}\u0000${norm(back)}`)
    .digest("hex");
}
