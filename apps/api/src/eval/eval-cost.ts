/** USD per 1M tokens, set by the admin per `provider:model` (or `provider:*`). */
export interface Price {
  input: number;
  output: number;
}
export type PriceTable = Record<string, Price>;

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

/** Strip routing prefixes / suffixes so one model reached through two providers compares equal. */
export function modelBase(model: string): string {
  return model
    .toLowerCase()
    .replace(/^models\//, "")
    .replace(/:free$|:beta$/, "")
    .split("/")
    .pop()!
    .replace(/^@cf-?/, "");
}

/** Same provider and model, or the same underlying model reached through another provider. */
export function sameModel(a: { provider: string; model: string }, b: { provider: string; model: string }): boolean {
  if (a.provider === b.provider && a.model.toLowerCase() === b.model.toLowerCase()) return true;
  return modelBase(a.model) !== "" && modelBase(a.model) === modelBase(b.model);
}

export function priceOf(table: PriceTable, provider: string, model: string): Price | null {
  return table[`${provider}:${model}`] ?? table[`${provider}:*`] ?? null;
}

/** Cost in USD; null when no price is known. */
export function costOf(usage: Usage, price: Price | null): number | null {
  if (!price) return null;
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
}

/**
 * Token estimate for a call whose provider reported none (Antigravity CLI):
 * Japanese ≈ 1 token per character, other text ≈ 1 per 3.5 characters.
 */
export function estimateTokens(text: string): number {
  let ja = 0;
  for (const ch of text) if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(ch)) ja++;
  return Math.ceil(ja + (text.length - ja) / 3.5);
}
