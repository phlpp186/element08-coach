/**
 * One library write per plan at a time (lib/supabase/planLibrary.ts).
 *
 * A save reads the row, compares it with the version this browser last saw
 * and writes over it. Two of those at once for one plan (a builder Save and
 * the Assign that follows it, or a save and a sync) let the second read the
 * row the first just wrote and report it as "changed on another device",
 * or both create a row for a plan that had none.
 */
export interface PlanLock {
  /** Run `fn` after every earlier `run` for the same key has settled. */
  run<T>(key: string, fn: () => Promise<T>): Promise<T>;
  /** Note a new save of `key` and return its number. */
  want(key: string): number;
  /** The newest save number of `key` (0 before any). */
  current(key: string): number;
  /** Whether `n` is still the newest save of `key`: only then may its
   *  result clear the plan's "unsent" mark. */
  latest(key: string, n: number): boolean;
}

export function createPlanLock(): PlanLock {
  const tails = new Map<string, Promise<unknown>>();
  const wanted = new Map<string, number>();
  return {
    run(key, fn) {
      const prev = tails.get(key) ?? Promise.resolve();
      const next = prev.then(fn, fn);
      const tail = next.then(
        () => undefined,
        () => undefined,
      );
      tails.set(key, tail);
      void tail.then(() => {
        if (tails.get(key) === tail) tails.delete(key);
      });
      return next;
    },
    want(key) {
      const n = (wanted.get(key) ?? 0) + 1;
      wanted.set(key, n);
      return n;
    },
    current(key) {
      return wanted.get(key) ?? 0;
    },
    latest(key, n) {
      return (wanted.get(key) ?? 0) === n;
    },
  };
}
