/** Whole days between two ISO dates (UTC), `to - from`. Negative if `to` precedes
 *  `from`. Used to size a season from a start date to a competition date. */
export function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T00:00:00Z`).getTime();
  const b = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}
