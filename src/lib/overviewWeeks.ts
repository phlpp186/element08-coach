/**
 * How much of the last four weeks was done, for the Overview's tiles. PURE.
 *
 * Reads the plan as stored (the app's TrainingPlan: phases of Mon–Sun weeks
 * with a weekStart; day-based plans are already bucketed into weeks), the same
 * shape lib/activity reads. Sessions dated before the plan's own start (the
 * dimmed part of a first week that begins mid-week) are not counted, as in
 * lib/activity missedSessions.
 */
import { addDays } from './e08plan';
import type { PlanDefLike } from './activity';

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Planned sessions dated in the last `days` days up to today, and how many
 *  of them are done: the "done, last 4 weeks" share. */
export function recentDone(
  def: unknown,
  doneIds: ReadonlySet<string>,
  todayIso: string,
  days = 28,
): { planned: number; done: number } {
  const plan = def as PlanDefLike | null;
  const start = plan?.startDate && ISO_RE.test(plan.startDate) ? plan.startDate : null;
  const from = addDays(todayIso, -(days - 1));
  let planned = 0;
  let done = 0;
  for (const ph of plan?.phases ?? []) {
    for (const w of ph?.weeks ?? []) {
      const weekStart = typeof w?.weekStart === 'string' && ISO_RE.test(w.weekStart) ? w.weekStart : null;
      if (!weekStart) continue;
      for (const s of w?.plannedSessions ?? []) {
        if (!s?.id) continue;
        const date = addDays(weekStart, typeof s.dayOfWeek === 'number' ? s.dayOfWeek : 0);
        if (date < from || date > todayIso || (start && date < start)) continue;
        planned += 1;
        if (doneIds.has(s.id)) done += 1;
      }
    }
  }
  return { planned, done };
}
