/**
 * Pure logic behind the coach's activity feed and the bell: what counts as an
 * event, which ones are unread, how they group by day, and which athletes need
 * a look. Everything takes "now" / "today" as an argument so tests and renders
 * agree; no Supabase in here.
 *
 * An event is one completion row. The app writes completed_at, rating and
 * remarks when the athlete finishes a session, and later edits of the attached
 * logbook session touch ONLY `session` + `updated_at`. So a row whose
 * updated_at is clearly after completed_at is an edit ("updated"), and its
 * event time is the later of the two.
 */
import { HYPOXIA_DAYS, HYPOXIA_FLAG_MIN, hypoxiaLevel, type HypoxiaLevel } from './hypoxia';
import { addDays, mondayOf } from './e08plan';
import { daysBetween } from './planHelpers';

/** Below this, updated_at vs completed_at is write latency, not an edit. */
export const UPDATE_THRESHOLD_MS = 60_000;

export interface CompletionLike {
  assignment_id: string;
  exercise_id: string;
  completed_at: string | null;
  updated_at: string | null;
  rating: number | null;
  mental?: number | null;
  hypoxia?: number | null;
}

export type EventKind = 'completed' | 'updated';

/** Event time + kind of a completion row; null when it is not completed. */
export function completionEvent(c: Pick<CompletionLike, 'completed_at' | 'updated_at'>): {
  at: string;
  kind: EventKind;
} | null {
  if (!c.completed_at) return null;
  const done = Date.parse(c.completed_at);
  const upd = c.updated_at ? Date.parse(c.updated_at) : NaN;
  if (Number.isFinite(upd) && Number.isFinite(done) && upd - done > UPDATE_THRESHOLD_MS) {
    return { at: c.updated_at!, kind: 'updated' };
  }
  return { at: c.completed_at, kind: 'completed' };
}

/** Unread = newer than the stored seen stamp. No stamp means nothing was ever
 *  seen. Compared as instants, not strings: Postgres and JS format offsets
 *  differently ("+00:00" vs "Z"). */
export function isUnread(at: string, seenAt: string): boolean {
  if (!seenAt) return true;
  return Date.parse(at) > Date.parse(seenAt);
}

// ─── Plan definitions (the app Plan shape: phases → weeks → plannedSessions) ──

export interface PlanDefLike {
  startDate?: string | null;
  phases?: {
    weeks?: {
      weekStart?: string;
      plannedSessions?: { id?: string; dayOfWeek?: number; label?: string; sessionType?: string }[];
    }[];
  }[];
}

export interface PlanSessionRef {
  id: string;
  /** 1-based week number across the whole plan. */
  week: number;
  /** ISO Monday of that week, when the plan is dated. */
  weekStart: string | null;
  /** ISO day the session falls on (weekStart + dayOfWeek), when dated. */
  date: string | null;
  label: string | null;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function planSessions(def: unknown): PlanSessionRef[] {
  const phases = (def as PlanDefLike | null)?.phases ?? [];
  const out: PlanSessionRef[] = [];
  let week = 0;
  for (const ph of phases) {
    for (const w of ph?.weeks ?? []) {
      week += 1;
      const weekStart = typeof w?.weekStart === 'string' && ISO_RE.test(w.weekStart) ? w.weekStart : null;
      for (const s of w?.plannedSessions ?? []) {
        if (!s?.id) continue;
        const dow = typeof s.dayOfWeek === 'number' ? s.dayOfWeek : 0;
        out.push({
          id: s.id,
          week,
          weekStart,
          date: weekStart ? addDays(weekStart, dow) : null,
          label: s.label?.trim() || s.sessionType || null,
        });
      }
    }
  }
  return out;
}

/** Last calendar day a dated plan covers (Sunday of its last week), or null. */
export function planEnd(def: unknown): string | null {
  const phases = (def as PlanDefLike | null)?.phases ?? [];
  let last: string | null = null;
  for (const ph of phases)
    for (const w of ph?.weeks ?? [])
      if (typeof w?.weekStart === 'string' && ISO_RE.test(w.weekStart) && (!last || w.weekStart > last)) last = w.weekStart;
  return last ? addDays(last, 6) : null;
}

// ─── Day grouping ────────────────────────────────────────────────────────────

/** Local calendar day (YYYY-MM-DD) of an instant: the coach's own calendar. */
export function localDay(iso: string): string {
  const d = new Date(iso);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export interface DayGroup<T> {
  day: string;
  /** 'today' / 'yesterday' get a word; anything older shows its date. */
  rel: 'today' | 'yesterday' | null;
  items: T[];
}

/** Group newest-first items by local day, keeping their order. */
export function groupByDay<T>(items: T[], atOf: (x: T) => string, todayIso: string): DayGroup<T>[] {
  const yesterday = addDays(todayIso, -1);
  const out: DayGroup<T>[] = [];
  for (const it of items) {
    const day = localDay(atOf(it));
    let g = out[out.length - 1];
    if (!g || g.day !== day) {
      g = { day, rel: day === todayIso ? 'today' : day === yesterday ? 'yesterday' : null, items: [] };
      out.push(g);
    }
    g.items.push(it);
  }
  return out;
}

// ─── Needs a look ────────────────────────────────────────────────────────────

export interface AssignmentInput {
  id: string;
  studentId: string;
  /** When the plan was assigned; an athlete is not "quiet" on a plan they got
   *  yesterday. */
  assignedAt: string | null;
  plan: unknown;
}

export interface AthleteInput {
  studentId: string;
  name: string;
}

export type FlagReason =
  | { kind: 'missed'; count: number }
  | { kind: 'quiet'; days: number }
  | { kind: 'effortRising'; ratings: number[] }
  /** The worst hypoxia sign reported in the last HYPOXIA_DAYS, with the
   *  effort the athlete gave that session (a low one = it felt easy). */
  | { kind: 'hypoxia'; level: HypoxiaLevel; rating: number | null }
  | { kind: 'noPlan' };

export interface AthleteFlags {
  studentId: string;
  name: string;
  reasons: FlagReason[];
}

export const MISSED_MIN = 2;
export const QUIET_DAYS = 7;
export const EFFORT_FLOOR = 7;

/** Planned sessions in plan weeks that have fully ended with no completion.
 *  Sessions dated before the plan's own start (the dimmed part of a first week
 *  that begins mid-week) do not count. Undated plans count 0. */
export function missedSessions(plan: unknown, doneIds: ReadonlySet<string>, todayIso: string): number {
  const start = (plan as PlanDefLike | null)?.startDate ?? null;
  let n = 0;
  for (const s of planSessions(plan)) {
    if (!s.weekStart || !s.date) continue;
    if (addDays(s.weekStart, 7) > todayIso) continue; // week not over yet
    if (start && ISO_RE.test(start) && s.date < start) continue;
    if (!doneIds.has(s.id)) n += 1;
  }
  return n;
}

/** Whether a plan is still running on `todayIso`: undated plans always are. */
function planRunning(plan: unknown, todayIso: string): boolean {
  const end = planEnd(plan);
  return !end || end >= todayIso;
}

/** The last three ratings (oldest first) when they climb strictly and end at
 *  a hard session (>= EFFORT_FLOOR), else null: the "effort rising" signal
 *  shared by Needs a look and the Overview lanes. */
export function effortRising(ratings: readonly number[]): number[] | null {
  const last3 = ratings.slice(-3);
  return last3.length === 3 && last3[0] < last3[1] && last3[1] < last3[2] && last3[2] >= EFFORT_FLOOR
    ? [...last3]
    : null;
}

/**
 * Which athletes need the coach's attention, and why.
 *   missed       >= 2 planned sessions in ended weeks with no completion
 *   quiet        no completion or edit for >= 7 days on a running plan,
 *                counted from the latest of: last event, assignment, plan start
 *   effortRising last 3 ratings strictly increasing and the latest >= 7
 *   hypoxia      a report with symptoms or worse (>= HYPOXIA_FLAG_MIN) in the
 *                last HYPOXIA_DAYS; the worst one, the latest on a tie
 *   noPlan       a connected athlete with no active assignment
 */
export function needsALook(input: {
  athletes: AthleteInput[];
  assignments: AssignmentInput[];
  completions: CompletionLike[];
  todayIso: string;
  nowMs: number;
}): AthleteFlags[] {
  const { athletes, assignments, completions, todayIso, nowMs } = input;
  const byAssignment = new Map<string, CompletionLike[]>();
  for (const c of completions) {
    const list = byAssignment.get(c.assignment_id) ?? [];
    list.push(c);
    byAssignment.set(c.assignment_id, list);
  }

  const out: AthleteFlags[] = [];
  for (const ath of athletes) {
    const mine = assignments.filter((a) => a.studentId === ath.studentId);
    const reasons: FlagReason[] = [];
    if (mine.length === 0) {
      out.push({ studentId: ath.studentId, name: ath.name, reasons: [{ kind: 'noPlan' }] });
      continue;
    }

    let missed = 0;
    let lastActive = -Infinity;
    let anyRunning = false;
    const rated: { at: number; rating: number }[] = [];
    let hyp: { level: HypoxiaLevel; rating: number | null; at: number } | null = null;
    const hypSince = nowMs - HYPOXIA_DAYS * 86_400_000;
    for (const a of mine) {
      const rows = byAssignment.get(a.id) ?? [];
      const done = new Set(rows.filter((c) => c.completed_at).map((c) => c.exercise_id));
      missed += missedSessions(a.plan, done, todayIso);
      for (const c of rows) {
        const ev = completionEvent(c);
        if (!ev) continue;
        lastActive = Math.max(lastActive, Date.parse(ev.at));
        if (typeof c.rating === 'number') rated.push({ at: Date.parse(c.completed_at!), rating: c.rating });
        const level = hypoxiaLevel(c.hypoxia);
        const at = Date.parse(c.completed_at!);
        if (level != null && level >= HYPOXIA_FLAG_MIN && at >= hypSince) {
          if (!hyp || level > hyp.level || (level === hyp.level && at > hyp.at)) {
            hyp = { level, rating: typeof c.rating === 'number' ? c.rating : null, at };
          }
        }
      }
      if (planRunning(a.plan, todayIso)) {
        anyRunning = true;
        if (a.assignedAt) lastActive = Math.max(lastActive, Date.parse(a.assignedAt));
        const start = (a.plan as PlanDefLike | null)?.startDate;
        // A plan that starts in the future keeps the athlete out of "quiet".
        if (start && ISO_RE.test(start)) lastActive = Math.max(lastActive, Date.parse(`${start}T00:00:00`));
      }
    }

    if (missed >= MISSED_MIN) reasons.push({ kind: 'missed', count: missed });
    if (anyRunning && Number.isFinite(lastActive)) {
      const days = Math.floor((nowMs - lastActive) / 86_400_000);
      if (days >= QUIET_DAYS) reasons.push({ kind: 'quiet', days });
    }
    rated.sort((x, y) => x.at - y.at);
    const rising = effortRising(rated.map((r) => r.rating));
    if (rising) reasons.push({ kind: 'effortRising', ratings: rising });
    if (hyp) reasons.push({ kind: 'hypoxia', level: hyp.level, rating: hyp.rating });
    if (reasons.length) out.push({ studentId: ath.studentId, name: ath.name, reasons });
  }
  return out;
}

// ─── This week ───────────────────────────────────────────────────────────────

export interface WeekSummary {
  /** Planned sessions in this calendar week across running dated plans; null
   *  when no plan has dates in this week. */
  planned: number | null;
  /** How many of those are completed. */
  done: number;
  /** Plans (active assignments) ending within the next 14 days. */
  endingSoon: number;
}

export function thisWeekSummary(input: {
  assignments: AssignmentInput[];
  completions: CompletionLike[];
  todayIso: string;
}): WeekSummary {
  const { assignments, completions, todayIso } = input;
  const monday = mondayOf(todayIso);
  const done = new Set(
    completions.filter((c) => c.completed_at).map((c) => `${c.assignment_id}|${c.exercise_id}`),
  );
  let planned = 0;
  let doneN = 0;
  let dated = false;
  let endingSoon = 0;
  for (const a of assignments) {
    for (const s of planSessions(a.plan)) {
      if (s.weekStart !== monday) continue;
      dated = true;
      planned += 1;
      if (done.has(`${a.id}|${s.id}`)) doneN += 1;
    }
    const end = planEnd(a.plan);
    if (end) {
      const d = daysBetween(todayIso, end);
      if (d >= 0 && d <= 14) endingSoon += 1;
    }
  }
  return { planned: dated ? planned : null, done: doneN, endingSoon };
}

/** Events in the current calendar week (local Monday on) that carry any text
 *  from the athlete: a completion comment or a per-dive / per-hold note. */
export function remarkedThisWeek(events: { at: string; hasRemark: boolean }[], todayIso: string): number {
  const monday = mondayOf(todayIso);
  return events.filter((e) => e.hasRemark && localDay(e.at) >= monday).length;
}

// ─── Feed entries ────────────────────────────────────────────────────────────

export interface FeedAssignment {
  id: string;
  planId: string;
  planTitle: string;
  studentId: string;
  studentName: string;
}

export interface FeedRow extends CompletionLike {
  id: string;
  remarks: string | null;
  session?: unknown;
}

export interface FeedEntry {
  id: string;
  assignmentId: string;
  planId: string;
  planTitle: string;
  studentId: string;
  studentName: string;
  sessionId: string;
  /** Planned-session label, or null when the plan no longer has the session. */
  sessionLabel: string | null;
  /** 1-based week in the plan, when the session is still in it. */
  week: number | null;
  at: string;
  kind: EventKind;
  rating: number | null;
  mental: number | null;
  hypoxia: HypoxiaLevel | null;
  remarks: string | null;
  /** The attached logbook session, when there is one. */
  session: unknown | null;
}

/** Resolve completion rows on the coach's own assignments into feed entries,
 *  newest event first. Rows on other assignments (a coach who is also someone's
 *  student can read their own completions) are dropped. */
export function toFeedEntries(
  rows: FeedRow[],
  assignments: ReadonlyMap<string, FeedAssignment>,
  defs: ReadonlyMap<string, unknown>,
): FeedEntry[] {
  const sessionsByPlan = new Map<string, Map<string, PlanSessionRef>>();
  const refOf = (planId: string, sessionId: string) => {
    let m = sessionsByPlan.get(planId);
    if (!m) {
      m = new Map(planSessions(defs.get(planId)).map((s) => [s.id, s]));
      sessionsByPlan.set(planId, m);
    }
    return m.get(sessionId) ?? null;
  };
  const out: FeedEntry[] = [];
  for (const r of rows) {
    const a = assignments.get(r.assignment_id);
    const ev = completionEvent(r);
    if (!a || !ev) continue;
    const ref = refOf(a.planId, r.exercise_id);
    out.push({
      id: r.id,
      assignmentId: a.id,
      planId: a.planId,
      planTitle: a.planTitle,
      studentId: a.studentId,
      studentName: a.studentName,
      sessionId: r.exercise_id,
      sessionLabel: ref?.label ?? null,
      week: ref?.week ?? null,
      at: ev.at,
      kind: ev.kind,
      rating: typeof r.rating === 'number' ? r.rating : null,
      mental: typeof r.mental === 'number' ? r.mental : null,
      hypoxia: hypoxiaLevel(r.hypoxia),
      remarks: r.remarks?.trim() || null,
      session: r.session ?? null,
    });
  }
  out.sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
  return out;
}

const REL_FMT = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
/** "5 minutes ago" / "in 2 hours" / "yesterday", in the browser's locale. */
export function relTime(iso: string, nowMs = Date.now()): string {
  const mins = Math.round((Date.parse(iso) - nowMs) / 60000);
  if (Math.abs(mins) < 60) return REL_FMT.format(mins, 'minute');
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return REL_FMT.format(hours, 'hour');
  return REL_FMT.format(Math.round(hours / 24), 'day');
}
