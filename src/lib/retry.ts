// Retrying what failed for a passing reason (a dropped connection, a busy server), never what failed
// for a real one (not allowed, not found, bad input). Pure enough to unit test.

/** Is this worth trying again? Network failures, timeouts, rate limits and server errors are. */
export function isTransient(err: unknown): boolean {
  if (!err) return false;
  const e = err as { status?: number; code?: string; message?: string; name?: string; context?: { status?: number } };
  const status = e.status ?? e.context?.status;
  if (typeof status === "number") return status === 408 || status === 429 || status >= 500;
  const msg = `${e.name ?? ""} ${e.message ?? ""}`;
  return /fetch|network|load failed|timeout|timed out|aborted|ECONNRESET|socket|offline/i.test(msg);
}

/** Wait before try `n` (1-based): 0.8s, 1.6s, 3.2s… with a little jitter, capped at 8s. */
export const backoff = (n: number, rand = Math.random) => Math.min(8000, 800 * 2 ** (n - 1)) * (0.85 + rand() * 0.3);

/** Run `fn`, trying again up to `tries` times in all while the failure looks transient. */
export async function withRetry<T>(fn: () => Promise<T>, tries = 3, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<T> {
  for (let n = 1; ; n++) {
    try {
      return await fn();
    } catch (err) {
      if (n >= tries || !isTransient(err)) throw err;
      await sleep(backoff(n));
    }
  }
}

/** Supabase answers with `{ data, error }` instead of throwing: this turns an error into a throw, so withRetry can see it. */
export async function must<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

/** For React Query: retry a failed load up to 3 times, only for transient failures. */
export const queryRetry = (count: number, err: unknown) => count < 3 && isTransient(err);

/** A screen's code file went missing (usually right after a new version went out). */
export const isChunkError = (err: unknown) => /dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk \d+ failed|error loading dynamically imported/i.test(String((err as Error)?.message ?? err));
