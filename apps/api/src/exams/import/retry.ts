/**
 * Waits between rounds when every AI service failed (NP-407). A `transient`
 * failure rests a service for 60 s and a rate limit for 5 min, so the waits add
 * up to a little over both.
 */
export const AI_RETRY_DELAYS_MS: readonly number[] = [15_000, 30_000, 60_000, 120_000, 180_000];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Run `attempt` until it returns something other than `null`, waiting between
 * rounds. `null` = still nothing after the last wait, or `stop` said to give up.
 */
export async function retryRounds<T>(
  attempt: () => Promise<T | null>,
  delaysMs: readonly number[],
  stop: () => Promise<boolean> = async () => false,
): Promise<T | null> {
  for (let i = 0; ; i += 1) {
    const out = await attempt();
    if (out !== null) return out;
    if (i >= delaysMs.length || (await stop())) return null;
    await sleep(delaysMs[i]);
    if (await stop()) return null;
  }
}
