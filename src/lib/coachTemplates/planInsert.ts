/**
 * A template as a session inside a plan the coach is writing (the plan
 * editor's "From template"). Same conversion as a send (deliver.ts), so a
 * template reads the same wherever it is used; the difference is where it
 * lands (a week of the coach's own plan, not an athlete's inbox) and where the
 * PBs come from (the athlete the plan is a copy for, if any).
 *
 * Pure: the sheet (components/coachTemplates/PlanTemplateSheet) supplies the
 * hand-set values and the editor persists the returned plan.
 */
import { addDays, type MicroCycle, type Plan, type PlannedSession } from './deps';
import { buildPlannedSessions, type Tr } from './deliver';
import type { CoachTemplate } from './model';
import { missingTargets, type PBMap, type ResolvedTarget } from './resolve';

/** Any Monday: buildPlannedSessions takes dates, a plan week only needs the
 *  weekday, and plan weeks are not guaranteed to start on a Monday. */
const A_MONDAY = '2024-01-01';

const clampDay = (d: number): number => (Number.isInteger(d) && d >= 0 && d <= 6 ? d : 0);

/** The PBs a plan's targets resolve against: those of the athlete the plan is
 *  the coach's copy for. A plan with no athlete has none, so every relative
 *  target is asked for. */
export function planPbs(
  plan: Pick<Plan, 'coachFor'>,
  athletes: { id: string; pbs: PBMap }[],
): PBMap {
  const id = plan.coachFor?.studentId;
  return (id && athletes.find((a) => a.id === id)?.pbs) || {};
}

/** The first weekday (0=Mon) with no session yet; the same rule the editor
 *  uses for an empty session. */
export function firstFreeDay(week: Pick<MicroCycle, 'plannedSessions'>): number {
  const sessions = week.plannedSessions ?? [];
  const used = new Set(sessions.map((s) => s.dayOfWeek));
  return [0, 1, 2, 3, 4, 5, 6].find((d) => !used.has(d)) ?? sessions.length % 7;
}

/** The template as one PlannedSession on `day`, or null while a relative
 *  target still has no number (nothing half-resolved goes into a plan). */
export function sessionFromTemplate(
  template: CoachTemplate,
  resolved: ResolvedTarget[],
  day: number,
  opts: { imperial: boolean; author: string; t: Tr },
): PlannedSession | null {
  if (missingTargets(resolved).length) return null;
  const d = clampDay(day);
  const [item] = buildPlannedSessions(
    template,
    resolved,
    [addDays(`${A_MONDAY}T00:00:00Z`, d)],
    opts,
  );
  if (!item) return null;
  return { ...item.session, dayOfWeek: d, completedAt: null };
}

/** The plan with `session` added to one week, in day order and without
 *  moving the sessions already there. Returns the plan unchanged when the
 *  phase or week does not exist. */
export function insertSession<P extends Pick<Plan, 'phases'>>(
  plan: P,
  phaseId: string,
  weekIdx: number,
  session: PlannedSession,
): P {
  const pi = plan.phases.findIndex((p) => p.id === phaseId);
  const week = pi === -1 ? undefined : plan.phases[pi].weeks[weekIdx];
  if (!week) return plan;
  const list = [...(week.plannedSessions ?? [])];
  let at = list.length;
  while (at > 0 && list[at - 1].dayOfWeek > session.dayOfWeek) at--;
  list.splice(at, 0, session);
  return {
    ...plan,
    phases: plan.phases.map((ph, i) =>
      i === pi
        ? {
            ...ph,
            weeks: ph.weeks.map((w, j) => (j === weekIdx ? { ...w, plannedSessions: list } : w)),
          }
        : ph,
    ),
  };
}
