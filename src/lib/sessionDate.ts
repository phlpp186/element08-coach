/**
 * The date on an uploaded session, which comes in two shapes.
 *
 * A PLAN date is a calendar date, `2026-08-17`, and JS parses that as UTC
 * midnight — so it has to be read back in UTC too, or a coach west of
 * Greenwich sees the day before the one the athlete trained. That is the
 * 2026-08-18 bug and `e08plan.ts` owns it.
 *
 * A SESSION date is not that. The app stores it as a full ISO instant,
 * `2026-06-09T17:05:00.000Z`, because a session happened at a time and not just
 * on a day. Appending `T00:00:00Z` to one of those produces
 * `2026-06-09T17:05:00.000ZT00:00:00Z`, which is not a date at all — and that
 * is what a coach has been shown, as literally the words "Invalid Date", every
 * time an athlete uploaded a session.
 *
 * So the shape has to be detected rather than assumed, and anything that still
 * will not parse must produce NOTHING rather than the string "Invalid Date".
 * A missing row reads as missing data; "Invalid Date" reads as a broken app.
 */

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A session's date, formatted for display, or null when there is nothing
 * trustworthy to show.
 *
 * `locale` and `options` are passed through to `toLocaleDateString` so a caller
 * can ask for whatever form it needs.
 */
export function formatSessionDate(
  raw: string | null | undefined,
  options: Intl.DateTimeFormatOptions = {},
  locale?: string,
): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;

  // A bare calendar date: pin it to UTC at both ends so it renders as itself
  // wherever the coach is sitting.
  if (CALENDAR_DATE.test(s)) {
    const d = new Date(`${s}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(locale, { ...options, timeZone: 'UTC' });
  }

  // A full instant. Shown in the reader's own zone, which is the honest thing
  // for a timestamp: the blob carries no offset for the athlete's location, so
  // pretending to know their local day would be a guess.
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(locale, options);
}
