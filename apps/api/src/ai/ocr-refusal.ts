/**
 * A vision model that will not transcribe a page answers in prose — "I cannot transcribe this
 * page verbatim because … copyrighted material" — with HTTP 200, so the call looks like a read.
 * That text must never be stored as the page: the import would silently lose the whole page
 * (and with it question blocks, or the paper's header). Seen on 21 of 115 pages of an official
 * JLPT collection.
 */

/** Opens like a refusal: "I cannot / I can't / I'm unable / I am not able / Sorry / Unfortunately". */
const REFUSAL_START =
  /^[\s*_>#"“'`]*(?:I(?:['’]m|\s+am)?\s+(?:cannot|can['’]?t|can\s+not|unable|not\s+able|won['’]t|will\s+not)|Sorry|I\s+apologi[sz]e|Unfortunately)\b/i;
const JAPANESE = /[぀-ヿ一-鿿]/g;

/** A refusal instead of a transcription: refusal wording and (almost) no Japanese — a real page is mostly Japanese. */
export function isOcrRefusal(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t || !REFUSAL_START.test(t)) return false;
  return (t.match(JAPANESE) ?? []).length / t.length < 0.2;
}

/** Every service that looked at the page refused to transcribe it (`reason` = the last refusal, for the log). */
export interface OcrRefused {
  refused: string;
}

export function isOcrRefused(v: unknown): v is OcrRefused {
  return typeof v === "object" && v !== null && typeof (v as OcrRefused).refused === "string";
}
