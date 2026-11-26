import { Types } from "mongoose";

/**
 * Narrow grammar points by textbook. Our own textbooks are referenced by
 * ObjectId; imported ones by a slug (`minna`) plus a lesson number.
 */
export function grammarTextbookFilter(textbookId?: string, unitId?: string) {
  if (!textbookId) return {};
  if (/^[a-f0-9]{24}$/i.test(textbookId)) return { textbooks: new Types.ObjectId(textbookId) };
  return {
    textbookRefs: { $elemMatch: { textbookId, ...(unitId ? { unitId } : {}) } },
  };
}
