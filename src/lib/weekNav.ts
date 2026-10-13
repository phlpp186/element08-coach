/**
 * Layout rules for a long training plan in the builder: which week is "now",
 * and which older weeks fold into a summary row so an 18-week plan does not
 * mean scrolling past 15 full week editors to add week 19.
 *
 * Pure; `todayIso` is passed in so tests and renders agree.
 */
import { addDays, mondayOf } from './e08plan';
import { daysBetween } from './planHelpers';

/** Index of the plan week containing `todayIso`, or -1 (not started / over /
 *  no start date). Week 1 is the Mon-Sun week holding the start date, the same
 *  Monday anchoring the builder and the .e08plan export use. */
export function currentWeekIndex(startDate: string | null | undefined, weekCount: number, todayIso: string): number {
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return -1;
  const days = daysBetween(mondayOf(startDate), todayIso);
  if (days < 0) return -1;
  const i = Math.floor(days / 7);
  return i < weekCount ? i : -1;
}

/** Monday of plan week `index`. */
export function weekMonday(startDate: string, index: number): string {
  return addDays(mondayOf(startDate), index * 7);
}

export type WeekSlot =
  | { kind: 'week'; index: number }
  /** A run of consecutive folded weeks, inclusive 0-based bounds. */
  | { kind: 'folded'; from: number; to: number };

/** Plans at or below this many weeks never fold: the summary row would hide
 *  almost nothing. */
export const FOLD_MIN_WEEKS = 5;

/**
 * The render order for `weekCount` weeks. The last `keepLast` weeks, the
 * current week and any week in `expanded` always show; with `showAll` every
 * week does. Everything else folds, consecutive weeks into one slot.
 */
export function weekSlots(
  weekCount: number,
  opts: { current: number; expanded: ReadonlySet<number>; showAll: boolean; keepLast?: number },
): WeekSlot[] {
  const keepLast = opts.keepLast ?? 3;
  const fold = !opts.showAll && weekCount >= FOLD_MIN_WEEKS;
  const slots: WeekSlot[] = [];
  for (let i = 0; i < weekCount; i++) {
    const visible = !fold || i >= weekCount - keepLast || i === opts.current || opts.expanded.has(i);
    if (visible) {
      slots.push({ kind: 'week', index: i });
      continue;
    }
    const last = slots[slots.length - 1];
    if (last?.kind === 'folded' && last.to === i - 1) last.to = i;
    else slots.push({ kind: 'folded', from: i, to: i });
  }
  return slots;
}

/** Whether any week is folded away right now. */
export function hasFolded(slots: WeekSlot[]): boolean {
  return slots.some((s) => s.kind === 'folded');
}
