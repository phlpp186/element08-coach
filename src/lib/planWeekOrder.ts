/**
 * Where to split a plan's weeks so the newest one reads first.
 *
 * A coach opening an athlete's plan is checking in on the latest finished
 * session. Listing Week 1 → N buries that at the bottom, so the view shows the
 * weeks that have STARTED newest → oldest, with the weeks still ahead after
 * them in natural order.
 *
 * Pure and generic over the caller's week shape so the view keeps its own
 * types; `todayIso` is injected rather than read from the clock so the split is
 * deterministic.
 */

export interface WeekSplit<T> {
  /** Started weeks, newest first. Empty when the plan has not begun. */
  past: T[];
  /** Weeks still ahead, in plan order. */
  upcoming: T[];
  /** Index into the ORIGINAL array of the week the athlete is on, or -1. */
  currentIdx: number;
  /** Whether that week is the actual calendar week (drives the "This week" badge). */
  currentIsThisWeek: boolean;
}

/**
 * Split `weeks` at the week the athlete is currently on.
 *
 * "Current" is the LAST week that has already begun. Dated plans answer that
 * from each week's start date (ISO yyyy-mm-dd, so a string compare is a date
 * compare); plans stored without dates fall back to the last week holding a
 * completed session. When neither applies the plan has not started, so there is
 * no recent activity to surface and every week is returned as upcoming — the
 * caller renders that as the plain chronological list it always was.
 */
export function splitAtCurrentWeek<T>(
  weeks: T[],
  weekStartOf: (w: T) => string | undefined,
  hasCompletion: (w: T) => boolean,
  todayIso: string,
): WeekSplit<T> {
  let currentIdx = -1;
  for (let i = 0; i < weeks.length; i++) {
    const start = weekStartOf(weeks[i]);
    if (start && start <= todayIso) currentIdx = i;
  }
  if (currentIdx < 0) {
    for (let i = 0; i < weeks.length; i++) {
      if (hasCompletion(weeks[i])) currentIdx = i;
    }
  }
  if (currentIdx < 0) {
    return { past: [], upcoming: weeks, currentIdx: -1, currentIsThisWeek: false };
  }

  // The last started week of a finished or abandoned plan is not "this week",
  // so only badge it while today actually falls inside it.
  const start = weekStartOf(weeks[currentIdx]);
  const currentIsThisWeek = !!start && start <= todayIso && todayIso < addDaysIso(start, 7);

  return {
    past: weeks.slice(0, currentIdx + 1).reverse(),
    upcoming: weeks.slice(currentIdx + 1),
    currentIdx,
    currentIsThisWeek,
  };
}

/** `iso` + n days, in UTC so a local DST shift can't move the date. */
function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
