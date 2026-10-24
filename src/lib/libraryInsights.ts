/**
 * What the Library page shows about each plan (Philipp's option B,
 * 2026-10-24), PURE: the plan's weeks as a strip (shaded by intensity, in the
 * phase colour for season plans), where the plan stands today, and the list
 * filters.
 */
import { mondayOf, normIntensity, DEFAULT_INTENSITY, type BuilderPlan, type MesoType } from './e08plan';
import { planSpan } from './athleteStats';

export interface StripWeek {
  /** 1-10. */
  intensity: number;
  /** The season phase it belongs to; null for a training plan. */
  phase: MesoType | null;
}

/** One entry per week (a day-based plan: per 7 days, at the default intensity). */
export function weekStrip(plan: BuilderPlan): StripWeek[] {
  const level = (v: unknown) => normIntensity(v) ?? DEFAULT_INTENSITY;
  if (plan.kind === 'season') {
    return plan.phases.flatMap((ph) => ph.weeks.map((w) => ({ intensity: level(w.intensity), phase: ph.type })));
  }
  if (plan.structure === 'days') {
    return Array.from({ length: Math.ceil(plan.days.length / 7) }, () => ({
      intensity: DEFAULT_INTENSITY,
      phase: null,
    }));
  }
  return plan.weeks.map((w) => ({ intensity: level(w.intensity), phase: null }));
}

export type PlanNow =
  | { state: 'undated' }
  | { state: 'upcoming'; inDays: number }
  | { state: 'running'; unit: 'week' | 'day'; index: number; total: number }
  | { state: 'ended'; end: string };

const dayNum = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

/** Where a plan stands on `todayIso`: not started, week n of N (or day n of
 *  N), or ended. */
export function planNow(plan: BuilderPlan, todayIso: string): PlanNow {
  const { start, end } = planSpan(plan);
  if (!start || !end) return { state: 'undated' };
  const today = dayNum(todayIso);
  if (today < dayNum(start)) return { state: 'upcoming', inDays: dayNum(start) - today };
  if (today > dayNum(end)) return { state: 'ended', end };
  if (plan.kind !== 'season' && plan.structure === 'days') {
    return { state: 'running', unit: 'day', index: today - dayNum(start) + 1, total: dayNum(end) - dayNum(start) + 1 };
  }
  const total = Math.round((dayNum(end) - dayNum(mondayOf(start)) + 1) / 7);
  return { state: 'running', unit: 'week', index: Math.floor((today - dayNum(mondayOf(start))) / 7) + 1, total };
}

export type KindFilter = 'all' | 'training' | 'season';
export type AssignFilter = 'all' | 'assigned' | 'unassigned' | 'sync';

export interface LibraryRowLike {
  name: string;
  kind: 'training' | 'season';
  assigned: number;
  /** Changed on another device at the same time: needs the coach's choice. */
  conflict: boolean;
}

export function matchesLibrary(
  r: LibraryRowLike,
  kind: KindFilter,
  assign: AssignFilter,
  search: string,
): boolean {
  if (kind !== 'all' && r.kind !== kind) return false;
  if (assign === 'assigned' && r.assigned === 0) return false;
  if (assign === 'unassigned' && r.assigned > 0) return false;
  if (assign === 'sync' && !r.conflict) return false;
  const q = search.trim().toLowerCase();
  return !q || r.name.toLowerCase().includes(q);
}
