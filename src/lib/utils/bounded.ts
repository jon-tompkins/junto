/**
 * Bounded-concurrency runner with a wall-clock budget, for per-user / per-junto
 * loops inside time-limited serverless crons.
 *
 * - At most `concurrency` items are in flight at once.
 * - Once `budgetMs` has elapsed (measured from `startedAt`), NO new item is
 *   started; in-flight items finish. Unstarted items are returned in `deferred`
 *   so the caller can report them — the next cron tick picks them up because
 *   the caller's own idempotency guard (locks / "already done today") skips
 *   whatever finished.
 * - `fn` is never allowed to reject the whole batch: errors are caught per item
 *   and surfaced in `errors`.
 */
export interface BoundedResult<T, R> {
  results: Array<{ item: T; value: R }>;
  errors: Array<{ item: T; error: unknown }>;
  deferred: T[];
}

export async function runBounded<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  opts: { concurrency: number; budgetMs?: number; startedAt?: number },
): Promise<BoundedResult<T, R>> {
  const startedAt = opts.startedAt ?? Date.now();
  const concurrency = Math.max(1, Math.floor(opts.concurrency));
  const out: BoundedResult<T, R> = { results: [], errors: [], deferred: [] };
  let next = 0;

  async function worker() {
    while (true) {
      if (opts.budgetMs != null && Date.now() - startedAt >= opts.budgetMs) return;
      const i = next++;
      if (i >= items.length) return;
      const item = items[i];
      try {
        out.results.push({ item, value: await fn(item) });
      } catch (error) {
        out.errors.push({ item, error });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  out.deferred = items.slice(Math.min(next, items.length));
  return out;
}
