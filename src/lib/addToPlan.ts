/**
 * Putting something into a saved plan from outside the plan builder: picked
 * exercises into a session, a session (from a template) onto a day, a week
 * template onto a week. Pure: each function returns a new plan.
 *
 * A plan keeps its sessions in one of three shapes (BuilderPlan): the weeks
 * of a training plan, the weeks inside a season's phases, or a flat list of
 * numbered days. planRows gives all three one shape the picker can draw.
 */
import {
  newSession,
  uid,
  emptyDay,
  emptyWeek,
  type BuilderExercise,
  type BuilderPlan,
  type BuilderSession,
  type BuilderWeek,
} from './e08plan';

/** A week by position: in `plan.weeks`, or in a season phase's weeks. */
export interface WeekRef {
  phase: number | null;
  week: number;
}

export type PlanRow =
  | {
      kind: 'week';
      ref: WeekRef;
      /** 1-based, counted through the whole plan. */
      number: number;
      /** Index of the phase a season week belongs to. */
      phase: number | null;
      /** Mon..Sun. */
      days: BuilderSession[][];
    }
  | { kind: 'day'; index: number; sessions: BuilderSession[] };

export type PlanTarget =
  /** An existing session: exercises are appended to it. */
  | { kind: 'session'; sessionId: string }
  /** A weekday of a week: a new session there. */
  | { kind: 'weekDay'; ref: WeekRef; dayOfWeek: number }
  /** A numbered day of a day-based plan: a new session there. */
  | { kind: 'day'; index: number }
  /** One more day at the end of a day-based plan. */
  | { kind: 'newDay' };

export const isSeason = (plan: BuilderPlan): boolean => plan.kind === 'season';
export const isDayPlan = (plan: BuilderPlan): boolean => !isSeason(plan) && plan.structure === 'days';

export function planRows(plan: BuilderPlan): PlanRow[] {
  const weekRow = (week: BuilderWeek, ref: WeekRef, number: number): PlanRow => ({
    kind: 'week',
    ref,
    number,
    phase: ref.phase,
    days: Array.from({ length: 7 }, (_, d) => week.sessions.filter((s) => s.dayOfWeek === d)),
  });
  if (isSeason(plan)) {
    let n = 0;
    return plan.phases.flatMap((ph, pi) => ph.weeks.map((w, wi) => weekRow(w, { phase: pi, week: wi }, ++n)));
  }
  if (isDayPlan(plan)) return plan.days.map((d, index) => ({ kind: 'day', index, sessions: d.sessions }));
  return plan.weeks.map((w, wi) => weekRow(w, { phase: null, week: wi }, wi + 1));
}

function mapWeek(plan: BuilderPlan, ref: WeekRef, fn: (w: BuilderWeek) => BuilderWeek): BuilderPlan {
  if (ref.phase === null) return { ...plan, weeks: plan.weeks.map((w, i) => (i === ref.week ? fn(w) : w)) };
  return {
    ...plan,
    phases: plan.phases.map((ph, pi) =>
      pi === ref.phase ? { ...ph, weeks: ph.weeks.map((w, i) => (i === ref.week ? fn(w) : w)) } : ph,
    ),
  };
}

function mapSessions(plan: BuilderPlan, fn: (s: BuilderSession) => BuilderSession): BuilderPlan {
  const week = (w: BuilderWeek) => ({ ...w, sessions: w.sessions.map(fn) });
  return {
    ...plan,
    weeks: plan.weeks.map(week),
    days: plan.days.map((d) => ({ ...d, sessions: d.sessions.map(fn) })),
    phases: plan.phases.map((ph) => ({ ...ph, weeks: ph.weeks.map(week) })),
  };
}

/** Put a new session where `target` points. `make` gets the weekday (0 for a
 *  day-based plan, which has none). The plan comes back unchanged when the
 *  target does not exist in it. */
export function addSession(
  plan: BuilderPlan,
  target: Exclude<PlanTarget, { kind: 'session' }>,
  make: (dayOfWeek: number) => BuilderSession,
): BuilderPlan {
  if (target.kind === 'weekDay')
    return mapWeek(plan, target.ref, (w) => ({ ...w, sessions: [...w.sessions, make(target.dayOfWeek)] }));
  if (target.kind === 'day')
    return {
      ...plan,
      days: plan.days.map((d, i) => (i === target.index ? { ...d, sessions: [...d.sessions, make(0)] } : d)),
    };
  return { ...plan, days: [...plan.days, { ...emptyDay(), sessions: [make(0)] }] };
}

export type PickedExercise = Pick<BuilderExercise, 'description' | 'dose'>;

const fresh = (list: PickedExercise[]): BuilderExercise[] =>
  list.map((e) => ({
    id: uid('ex'),
    description: e.description,
    ...(e.dose?.length ? { dose: e.dose.map((p) => ({ ...p })) } : {}),
  }));

/** Append the exercises, in their order, to the target session, or make a new
 *  session with them on the target day. */
export function addExercises(plan: BuilderPlan, target: PlanTarget, list: PickedExercise[]): BuilderPlan {
  if (!list.length) return plan;
  if (target.kind === 'session')
    return mapSessions(plan, (s) =>
      s.id === target.sessionId ? { ...s, exercises: [...s.exercises, ...fresh(list)] } : s,
    );
  return addSession(plan, target, (day) => ({ ...newSession(day, plan.mode), exercises: fresh(list) }));
}

/** Run `apply` (a week template) over the week at `ref`, or over a new week
 *  at the end of the plan (of a season: at the end of its last phase). A
 *  day-based plan has no weeks and comes back unchanged. */
export function applyToWeek(
  plan: BuilderPlan,
  ref: WeekRef | 'new',
  apply: (week: BuilderWeek) => BuilderWeek,
): BuilderPlan {
  if (isDayPlan(plan)) return plan;
  if (ref !== 'new') return mapWeek(plan, ref, apply);
  if (!isSeason(plan)) return { ...plan, weeks: [...plan.weeks, apply(emptyWeek())] };
  if (!plan.phases.length) return plan;
  const last = plan.phases.length - 1;
  return {
    ...plan,
    phases: plan.phases.map((ph, i) => (i === last ? { ...ph, weeks: [...ph.weeks, apply(emptyWeek())] } : ph)),
  };
}

/** True when the target still exists in the plan (it may have changed in
 *  another tab while the picker was open). */
export function targetExists(plan: BuilderPlan, target: PlanTarget): boolean {
  const rows = planRows(plan);
  if (target.kind === 'newDay') return isDayPlan(plan);
  if (target.kind === 'day') return rows.some((r) => r.kind === 'day' && r.index === target.index);
  if (target.kind === 'weekDay')
    return rows.some((r) => r.kind === 'week' && r.ref.phase === target.ref.phase && r.ref.week === target.ref.week);
  return rows.some((r) =>
    (r.kind === 'week' ? r.days.flat() : r.sessions).some((s) => s.id === target.sessionId),
  );
}
