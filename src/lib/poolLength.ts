/**
 * Pool length, in metres — the coach-side reader for what the app writes.
 *
 * `PoolSession.poolType` used to BE the pool length: a three-value enum,
 * `'25m' | '50m' | '-'`. Since 2026-08-09 the watch offers an arbitrary
 * length, so the app made `poolLengthM` the truth and demoted `poolType` to a
 * legacy/filter label that is `'-'` for anything that is neither 25 nor 50 m.
 *
 * The consequence here: a 33 m pool arrives in an attached session blob as
 * `poolType: '-'` plus `poolLengthM: 33`, so reading the enum alone shows the
 * coach no pool at all. Read the length through `poolMeters` and print it
 * through `poolLengthLabel`; never re-derive either from `poolType`.
 *
 * Mirrors `src/lib/poolLength.ts` in the mobile app. Blobs are unversioned, so
 * the pre-2026-08-09 fallback has to stay.
 */

/** Anything carrying a pool length: a session blob, or a flattened dive row. */
export interface PoolLengthSource {
  poolType?: string | null;
  poolLengthM?: number | null;
}

/**
 * The pool length in metres, or **0 when unknown** — the same "no length"
 * signal the `'-'` poolType carried.
 */
export function poolMeters(s: PoolLengthSource | null | undefined): number {
  if (s == null) return 0;
  const m = s.poolLengthM;
  if (typeof m === 'number' && Number.isFinite(m) && m > 0) return m;
  // Pre-2026-08-09 sessions have only the enum.
  return s.poolType === '50m' ? 50 : s.poolType === '25m' ? 25 : 0;
}

/**
 * How a pool length is written in the UI: `'25m'`, `'16m'`, or `'-'` when
 * unknown. Matches the old `poolType` strings exactly for 25/50, so existing
 * sessions read identically to before.
 */
export function poolLengthLabel(s: PoolLengthSource | null | undefined): string {
  const m = poolMeters(s);
  if (m <= 0) return '-';
  // Metres are whole in practice; a stray fraction prints at 1 dp rather than
  // as a 17-digit float.
  return `${Number.isInteger(m) ? m : Math.round(m * 10) / 10}m`;
}
