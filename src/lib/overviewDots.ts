/**
 * The Overview's session dots (Philipp's option B, 2026-11-19): every session
 * of an athlete's plans as one dot on a day axis, past and ahead. PURE.
 *
 * A reported session sits on the day it was actually done and is coloured by
 * its effort rating. A session answered "not done" is a cross on its planned
 * day. A planned day that is over shows "still open" while the grace runs
 * (lib/notDone) and "no report" after it: never "missed", because the portal
 * only knows what was reported, not what was trained. Everything ahead is
 * "planned".
 *
 * Reads plans as stored (the app's TrainingPlan, like lib/activity). A report
 * is one completion row under the session's id; app builds before mid-2026
 * wrote one row per exercise instead, so those count for their session too.
 * A plan the athlete no longer has (an unassigned one) only contributes what
 * was reported on it: its open sessions are nobody's to do any more.
 */
import { addDays } from './e08plan';
import { localDay } from './activity';
import { isPastGrace } from './notDone';

export type DotKind =
  /** reported, effort up to 6 or not rated */
  | 'done'
  /** reported, effort 7 or 8 */
  | 'hard'
  /** reported, effort 9 or 10 */
  | 'max'
  /** answered "not done" */
  | 'notDone'
  /** planned day and grace are over, nothing reported */
  | 'noReport'
  /** planned day is today or past, grace still running */
  | 'open'
  /** planned for a day ahead */
  | 'planned';

export interface Dot {
  /** The day the dot is drawn on (ISO). */
  day: string;
  /** The session's planned day, when the plan is dated. */
  planned: string | null;
  kind: DotKind;
  label: string | null;
  plan: string;
  rating: number | null;
}

export interface DotCompletion {
  exercise_id: string;
  completed_at: string | null;
  rating?: number | null;
  not_done_at?: string | null;
}

export interface DotPlan {
  title: string;
  /** The stored plan definition. */
  def: unknown;
  /** False for a plan the athlete no longer has. */
  active: boolean;
  completions: DotCompletion[];
}

interface DefLike {
  startDate?: string;
  phases?: {
    weeks?: {
      weekStart?: string;
      plannedSessions?: {
        id?: string;
        dayOfWeek?: number;
        label?: string;
        sessionType?: string;
        exercises?: { id?: string }[];
      }[];
    }[];
  }[];
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export const doneKind = (rating: number | null | undefined): DotKind =>
  typeof rating !== 'number' ? 'done' : rating >= 9 ? 'max' : rating >= 7 ? 'hard' : 'done';

export const isDoneKind = (k: DotKind): boolean => k === 'done' || k === 'hard' || k === 'max';

/** Every session of the athlete's plans as a dot, oldest first. */
export function athleteDots(plans: DotPlan[], todayIso: string): Dot[] {
  const out: Dot[] = [];
  for (const p of plans) {
    const def = p.def as DefLike | null;
    const start = def?.startDate && ISO_RE.test(def.startDate) ? def.startDate : null;
    const done = new Map<string, DotCompletion>();
    const said = new Map<string, DotCompletion>();
    for (const c of p.completions) {
      if (c.completed_at) {
        // The latest report wins when a session was sent twice.
        const cur = done.get(c.exercise_id);
        if (!cur || cur.completed_at! < c.completed_at) done.set(c.exercise_id, c);
      } else if (c.not_done_at) said.set(c.exercise_id, c);
    }
    for (const ph of def?.phases ?? []) {
      for (const w of ph?.weeks ?? []) {
        const weekStart = typeof w?.weekStart === 'string' && ISO_RE.test(w.weekStart) ? w.weekStart : null;
        for (const s of w?.plannedSessions ?? []) {
          if (!s?.id) continue;
          const planned = weekStart ? addDays(weekStart, typeof s.dayOfWeek === 'number' ? s.dayOfWeek : 0) : null;
          const base = { planned, label: s.label?.trim() || s.sessionType || null, plan: p.title };
          // The session's own report, else the latest of its exercises' (older builds).
          let report = done.get(s.id);
          if (!report)
            for (const e of s.exercises ?? []) {
              const r = e?.id ? done.get(e.id) : undefined;
              if (r && (!report || report.completed_at! < r.completed_at!)) report = r;
            }
          if (report) {
            const rating = typeof report.rating === 'number' ? report.rating : null;
            out.push({ ...base, day: localDay(report.completed_at!), kind: doneKind(rating), rating });
            continue;
          }
          const no = said.get(s.id);
          if (no) {
            out.push({ ...base, day: planned ?? localDay(no.not_done_at!), kind: 'notDone', rating: null });
            continue;
          }
          // The dimmed days of a first week that begins mid-week are not planned.
          if (!p.active || !planned || (start && planned < start)) continue;
          const kind: DotKind = planned > todayIso ? 'planned' : isPastGrace(planned, todayIso) ? 'noReport' : 'open';
          out.push({ ...base, day: planned, kind, rating: null });
        }
      }
    }
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
}

export interface DotSummary {
  /** Sessions whose day falls in the last `days` days up to today. */
  due: number;
  done: number;
  noReport: number;
  /** The last day with something planned ahead, or null when nothing is. */
  plannedUntil: string | null;
  /** Whole or started weeks from today to `plannedUntil`. */
  weeksAhead: number;
}

const dayNum = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

export function dotSummary(dots: Dot[], todayIso: string, days = 28): DotSummary {
  const from = addDays(todayIso, -(days - 1));
  let due = 0;
  let done = 0;
  let noReport = 0;
  let plannedUntil: string | null = null;
  for (const d of dots) {
    if (d.kind === 'planned') {
      if (!plannedUntil || d.day > plannedUntil) plannedUntil = d.day;
      continue;
    }
    // A reported session counts in the window it was done in; an open or
    // unanswered one in the window it was planned for.
    if (d.day < from || d.day > todayIso) continue;
    due += 1;
    if (isDoneKind(d.kind)) done += 1;
    if (d.kind === 'noReport') noReport += 1;
  }
  const weeksAhead = plannedUntil ? Math.ceil((dayNum(plannedUntil) - dayNum(todayIso)) / 7) : 0;
  return { due, done, noReport, plannedUntil, weeksAhead };
}

/** The dots of each day in a window of `total` days from `fromIso`, by column. */
export function dotColumns(dots: Dot[], fromIso: string, total: number): Dot[][] {
  const cols: Dot[][] = Array.from({ length: total }, () => []);
  const lo = dayNum(fromIso);
  for (const d of dots) {
    const i = dayNum(d.day) - lo;
    if (i >= 0 && i < total) cols[i].push(d);
  }
  return cols;
}
