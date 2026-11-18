/**
 * "Not done" reports and the grace before a session counts as missed. The
 * app's twin is src/lib/coachLink/notDone.ts: the two must agree, or the coach
 * is told about a miss the athlete still sees as open.
 *
 * Many athletes have jobs that move their training around, so a session is
 * not missed the morning after its planned day (Philipp, 2026-11-18): only
 * from the fifth day. A session the athlete answered with "not done" is never
 * missed.
 */
import { addDays } from './e08plan';

export const MISSED_GRACE_DAYS = 4;

/** True from the fifth day after the planned day. */
export function isPastGrace(date: string | null | undefined, todayIso: string): boolean {
  return !!date && addDays(date, MISSED_GRACE_DAYS) < todayIso;
}

export function isNotDone(
  row: { completed_at: string | null; not_done_at?: string | null } | null | undefined,
): boolean {
  return !!row && !row.completed_at && !!row.not_done_at;
}

/** Reason ids as the app stores them, with the English label (the i18n key). */
export const SKIP_REASON_LABEL: Record<string, string> = {
  sick: 'Sick',
  tired: 'Tired',
  noTime: 'No time',
  noPool: 'No pool',
  injury: 'Injury',
  other: 'Other',
};
