/**
 * Pure view model for the coach's cycle card (components/CycleCard): the last
 * five weeks as day cells, each with its cycle day, the athlete's shared cycle
 * entry and that day's session.
 *
 * Cycle days are counted from LOGGED period starts only (a period day whose
 * previous day is not one), the same rule as the app's lib/cycle/model. A day
 * before the first logged start has no cycle day. Nothing is predicted.
 */

/** One shared day, as stored in public.athlete_cycle_days (migration 0021). */
export interface CycleDay {
  date: string; // YYYY-MM-DD
  period: boolean;
  /** Symptom ids from the app: cramps, lowEnergy, headache, bloating, mood, sleep. */
  symptoms: string[];
  /** Only present when the athlete switched note sharing on. */
  note: string | null;
  /** Training against usual: -1 easier, 0 normal, 1 a bit harder, 2 much harder. */
  felt: number | null;
}

export interface CycleSession {
  date: string; // YYYY-MM-DD, the coach's local day
  label: string;
  /** Effort 1-10, when rated. */
  effort: number | null;
  /** Sessions done that day (the label and effort are the hardest one's). */
  count: number;
}

export interface CycleCell {
  key: string;
  dayOfMonth: number;
  /** 0-11, for the caller's month names. */
  month: number;
  future: boolean;
  cycleDay: number | null;
  day: CycleDay | null;
  session: CycleSession | null;
}

export const CYCLE_WEEKS = 5;
/** How far before the window to read days, so a period that started before
 *  it still numbers the window's first days. */
export const CYCLE_LOOKBACK_DAYS = 60;

const DAY_MS = 86_400_000;
const utc = (key: string) => Date.parse(`${key}T00:00:00Z`);
const keyOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Monday of the first of the five weeks that end with today's week. */
export function cycleWindowStart(today: string): string {
  const ms = utc(today);
  const dow = (new Date(ms).getUTCDay() + 6) % 7;
  return keyOf(ms - dow * DAY_MS - (CYCLE_WEEKS - 1) * 7 * DAY_MS);
}

/** First day to fetch: the window start minus the lookback. */
export function cycleFetchSince(today: string): string {
  return keyOf(utc(cycleWindowStart(today)) - CYCLE_LOOKBACK_DAYS * DAY_MS);
}

export function buildCycleCells(days: CycleDay[], sessions: CycleSession[], today: string): CycleCell[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const sesByDate = new Map(sessions.map((s) => [s.date, s]));
  const todayMs = utc(today);
  const start = utc(cycleWindowStart(today));
  const starts = days
    .filter((d) => d.period && !byDate.get(keyOf(utc(d.date) - DAY_MS))?.period)
    .map((d) => utc(d.date))
    .sort((a, b) => a - b);
  const cells: CycleCell[] = [];
  for (let i = 0; i < CYCLE_WEEKS * 7; i++) {
    const ms = start + i * DAY_MS;
    const key = keyOf(ms);
    const d = new Date(ms);
    let last: number | null = null;
    for (const s of starts) if (s <= ms) last = s;
    cells.push({
      key,
      dayOfMonth: d.getUTCDate(),
      month: d.getUTCMonth(),
      future: ms > todayMs,
      cycleDay: last == null ? null : Math.round((ms - last) / DAY_MS) + 1,
      day: byDate.get(key) ?? null,
      session: sesByDate.get(key) ?? null,
    });
  }
  return cells;
}

export interface CycleSummary {
  /** Day key of the most recent logged period start, anywhere in `days`. */
  lastStart: string | null;
  /** Days between the two most recent logged starts. */
  cycleLength: number | null;
  /** Sessions in the window, and on how many of their days training felt harder. */
  sessionDays: number;
  harderDays: number;
}

export function cycleSummary(days: CycleDay[], cells: CycleCell[], today: string): CycleSummary {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const starts = days
    .filter((d) => d.period && d.date <= today && !byDate.get(keyOf(utc(d.date) - DAY_MS))?.period)
    .map((d) => d.date)
    .sort();
  const lastStart = starts[starts.length - 1] ?? null;
  const prev = starts[starts.length - 2] ?? null;
  const withSession = cells.filter((c) => c.session);
  return {
    lastStart,
    cycleLength: lastStart && prev ? Math.round((utc(lastStart) - utc(prev)) / DAY_MS) : null,
    sessionDays: withSession.length,
    harderDays: withSession.filter((c) => (c.day?.felt ?? 0) >= 1).length,
  };
}

/** One entry per day from single done sessions: the hardest one names the day. */
export function foldSessions(items: { date: string; label: string; effort: number | null }[]): CycleSession[] {
  const out = new Map<string, CycleSession>();
  for (const it of items) {
    const cur = out.get(it.date);
    if (!cur) out.set(it.date, { ...it, count: 1 });
    else {
      cur.count += 1;
      if ((it.effort ?? -1) > (cur.effort ?? -1)) {
        cur.label = it.label;
        cur.effort = it.effort;
      }
    }
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
}
