/**
 * useCoachOverview — one row per active cloud assignment (student ↔ plan) with
 * everything the multi-student timeline needs: the plan's date span, how far
 * through it we are today, completion progress, each week's adherence and the
 * athlete's recent effort ratings. Powers CoachOverview's
 * Gantt-style swimlane so a coach can see, at a glance, where every athlete is
 * and when each plan finishes.
 *
 * Loads when signed in as a coach; live via the same `assignments` /
 * `completions` Realtime channels the roster uses. Plan definitions are fetched
 * once per distinct plan (cached across assignments that share a plan).
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import {
  getPlan,
  listCoachAssignments,
  listCompletionSummaries,
  subscribeToTables,
  unsubscribeChannel,
} from './coachData';
import type { BuilderPlan } from '../e08plan';
import { planSpan, planEndStatus, daysUntil, today } from '../athleteStats';
import { effortRising } from '../activity';
import { recentDone } from '../overviewWeeks';
import { athleteDots, dotSummary, type Dot, type DotPlan, type DotSummary } from '../overviewDots';

/** Ratings kept per lane for the effort trend. */
const TREND_LEN = 6;

export interface OverviewRow {
  assignmentId: string;
  studentId: string;
  studentName: string;
  planTitle: string;
  /** ISO plan start/end (null when the plan has no start date set). */
  start: string | null;
  end: string | null;
  doneCount: number;
  totalSessions: number;
  status: 'ended' | 'endingSoon' | 'active' | null;
  /** Days until the plan ends (negative = past). null without an end date. */
  daysLeft: number | null;
  /** Sessions planned / done in the last 28 days. */
  recent: { planned: number; done: number };
  /** The latest effort ratings (1-10), oldest first, at most TREND_LEN. */
  ratings: number[];
  /** The last three ratings when effort is rising (lib/activity effortRising). */
  rising: number[] | null;
}

/** One lane of the Overview: an athlete with every session of their plans as
 *  a dot (lib/overviewDots), the plans they had before included. */
export interface OverviewAthlete {
  studentId: string;
  name: string;
  /** The plans the athlete has now. */
  planTitles: string[];
  dots: Dot[];
  summary: DotSummary;
}

/** Count every planned session across a stored plan definition, defensively. */
function countSessions(plan: BuilderPlan): number {
  const phases = (plan as { phases?: { weeks?: { plannedSessions?: unknown[] }[] }[] }).phases ?? [];
  let n = 0;
  for (const phase of phases) {
    for (const week of phase.weeks ?? []) {
      n += (week.plannedSessions ?? []).length;
    }
  }
  return n;
}

export function useCoachOverview() {
  const { session, isCoach } = useAuth();
  const [rows, setRows] = useState<OverviewRow[]>([]);
  const [athletes, setAthletes] = useState<OverviewAthlete[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!session || !isCoach) {
      setRows([]);
      setAthletes([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // The plans an athlete had before are part of their past: listed too,
      // but only the active ones are "plans" for the tiles.
      const assignments = await listCoachAssignments({ includeInactive: true });
      // Fetch each distinct plan once; assignments often share a plan.
      const planCache = new Map<string, BuilderPlan | null>();
      const planFor = async (planId: string): Promise<BuilderPlan | null> => {
        if (planCache.has(planId)) return planCache.get(planId) ?? null;
        const row = await getPlan(planId);
        const plan = (row?.definition ?? null) as unknown as BuilderPlan | null;
        planCache.set(planId, plan);
        return plan;
      };

      const completions = await listCompletionSummaries(assignments.map((a) => a.id));
      const byAssignment = new Map<string, typeof completions>();
      for (const c of completions) {
        const list = byAssignment.get(c.assignment_id) ?? [];
        list.push(c);
        byAssignment.set(c.assignment_id, list);
      }
      const todayIso = today();

      const out: OverviewRow[] = [];
      const lanes = new Map<string, { name: string; titles: string[]; plans: DotPlan[] }>();
      for (const a of assignments) {
        const plan = await planFor(a.planId).catch(() => null);
        const lane = lanes.get(a.studentId) ?? { name: a.studentName, titles: [], plans: [] };
        lanes.set(a.studentId, lane);
        if (a.active) lane.titles.push(a.planTitle);
        if (plan) lane.plans.push({ title: a.planTitle, def: plan, active: a.active, completions: byAssignment.get(a.id) ?? [] });
        if (!a.active) continue;
        const rows = (byAssignment.get(a.id) ?? []).filter((c) => c.completed_at);
        const done = new Set(rows.map((c) => c.exercise_id));
        const rated = rows
          .filter((c) => typeof c.rating === 'number')
          .sort((x, y) => x.completed_at!.localeCompare(y.completed_at!))
          .map((c) => c.rating as number);
        const { start, end } = plan ? planSpan(plan) : { start: null, end: null };
        out.push({
          assignmentId: a.id,
          studentId: a.studentId,
          studentName: a.studentName,
          planTitle: a.planTitle,
          start,
          end,
          doneCount: a.doneCount,
          totalSessions: plan ? countSessions(plan) : 0,
          status: planEndStatus(end),
          daysLeft: end ? daysUntil(end) : null,
          recent: recentDone(plan, done, todayIso),
          ratings: rated.slice(-TREND_LEN),
          rising: effortRising(rated),
        });
      }

      // Soonest-finishing first so "who wraps up next" reads top-down; rows with
      // no end date sink to the bottom.
      out.sort((x, y) => {
        if (x.end && y.end) return x.end.localeCompare(y.end);
        if (x.end) return -1;
        if (y.end) return 1;
        return x.studentName.localeCompare(y.studentName);
      });
      setRows(out);
      setAthletes(
        [...lanes.entries()]
          // An athlete whose plans were all taken away is no longer coached here.
          .filter(([, l]) => l.titles.length > 0)
          .map(([studentId, l]) => {
            const dots = athleteDots(l.plans, todayIso);
            return { studentId, name: l.name, planTitles: l.titles, dots, summary: dotSummary(dots, todayIso) };
          })
          .sort((x, y) => x.name.localeCompare(y.name)),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [session, isCoach]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live: a new assignment or a completed session reshapes the timeline.
  useEffect(() => {
    if (!session || !isCoach) return;
    const ch = subscribeToTables(['assignments', 'completions'], () => refresh());
    return () => unsubscribeChannel(ch);
  }, [session, isCoach, refresh]);

  return { rows, athletes, loading, error, refresh, todayIso: today() };
}
