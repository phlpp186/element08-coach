/** Derived read-only views over an athlete: best PBs, headline marks, next comp. */
import { DISCIPLINES, disciplineById, formatValue, type Discipline } from './disciplines';
import { addDays, isoDate, mondayOf, type BuilderPlan } from './e08plan';
import { daysBetween } from './planHelpers';
import type { Athlete, Competition, PBEntry } from './types';

export function today(): string {
  return isoDate(new Date());
}

/** Best (max — higher is always better) PB entry for a discipline, or undefined. */
export function bestEntry(entries: PBEntry[] | undefined): PBEntry | undefined {
  if (!entries || entries.length === 0) return undefined;
  return entries.reduce((best, e) => (e.value > best.value ? e : best));
}

/** PB history sorted oldest→newest (for a sparkline). */
export function pbHistory(athlete: Athlete, disciplineId: string): PBEntry[] {
  return [...(athlete.pbs[disciplineId] ?? [])].sort((a, b) => a.date.localeCompare(b.date));
}

export interface HeadlinePB {
  discipline: Discipline;
  text: string;
}

/** Up to `n` of the athlete's best marks, in the canonical discipline order. */
export function headlinePBs(athlete: Athlete, n = 2): HeadlinePB[] {
  const out: HeadlinePB[] = [];
  for (const d of DISCIPLINES) {
    const best = bestEntry(athlete.pbs[d.id]);
    if (best) out.push({ discipline: d, text: formatValue(d, best.value) });
    if (out.length >= n) break;
  }
  return out;
}

/** The soonest competition on/after today, or undefined. */
export function nextCompetition(athlete: Athlete, ref = today()): Competition | undefined {
  return [...athlete.competitions]
    .filter((c) => c.date && c.date >= ref)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
}

export function daysUntil(dateIso: string, ref = today()): number {
  return daysBetween(ref, dateIso);
}

/** "in 23 days" / "today" / "in 1 day" / "12 days ago". */
export function relativeDays(dateIso: string, ref = today()): string {
  const d = daysUntil(dateIso, ref);
  if (d === 0) return 'today';
  if (d > 0) return `in ${d} day${d === 1 ? '' : 's'}`;
  const a = -d;
  return `${a} day${a === 1 ? '' : 's'} ago`;
}

export function disciplineLabel(id: string): string {
  return disciplineById(id)?.label ?? id;
}

/** Tailwind text-colour class for a competition date, by how close it is.
 *  amber = imminent (≤14d, taper window) · accent = on the horizon (≤45d) ·
 *  dim = far off or already past. Keeps countdowns scannable at a glance. */
export function compColorClass(dateIso: string, ref = today()): string {
  const d = daysUntil(dateIso, ref);
  if (d < 0) return 'text-textDim';
  if (d <= 14) return 'text-amber';
  if (d <= 45) return 'text-accent';
  return 'text-textDim';
}

// ── Plan span ──────────────────────────────────────────────────────────────

function planWeekCount(plan: BuilderPlan): number {
  if (plan.kind === 'season') return plan.phases.reduce((n, p) => n + (p.weeks?.length ?? 0), 0);
  return plan.weeks?.length ?? 0;
}

/** First + last calendar day a plan covers, from its start date + length.
 *  Weeks are Monday-anchored (matching the builder). Null when there's no
 *  start date or the plan is empty. */
export function planSpan(plan: BuilderPlan): { start: string | null; end: string | null } {
  if (!plan.startDate) return { start: null, end: null };
  const start = plan.startDate;
  if (plan.kind !== 'season' && plan.structure === 'days') {
    const n = plan.days?.length ?? 0;
    return { start, end: n > 0 ? addDays(start, n - 1) : start };
  }
  const w = planWeekCount(plan);
  return { start, end: w > 0 ? addDays(mondayOf(start), w * 7 - 1) : start };
}

/** Coaching status of a plan's end date: ended, wrapping up soon (<=14 days), or
 *  still running. So a coach can spot who needs a fresh/updated plan. */
export function planEndStatus(
  end: string | null,
  ref = today(),
): 'ended' | 'endingSoon' | 'active' | null {
  if (!end) return null;
  const d = daysUntil(end, ref);
  if (d < 0) return 'ended';
  if (d <= 14) return 'endingSoon';
  return 'active';
}
