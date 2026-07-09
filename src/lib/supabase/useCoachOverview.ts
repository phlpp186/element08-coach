/**
 * useCoachOverview — one row per active cloud assignment (student ↔ plan) with
 * everything the multi-student timeline needs: the plan's date span, how far
 * through it we are today, and completion progress. Powers CoachOverview's
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
  subscribeToTables,
  unsubscribeChannel,
} from './coachData';
import type { BuilderPlan } from '../e08plan';
import { planSpan, planEndStatus, daysUntil, today } from '../athleteStats';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!session || !isCoach) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const assignments = await listCoachAssignments();
      // Fetch each distinct plan once; assignments often share a plan.
      const planCache = new Map<string, BuilderPlan | null>();
      const planFor = async (planId: string): Promise<BuilderPlan | null> => {
        if (planCache.has(planId)) return planCache.get(planId) ?? null;
        const row = await getPlan(planId);
        const plan = (row?.definition ?? null) as unknown as BuilderPlan | null;
        planCache.set(planId, plan);
        return plan;
      };

      const out: OverviewRow[] = [];
      for (const a of assignments) {
        const plan = await planFor(a.planId);
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

  return { rows, loading, error, refresh, todayIso: today() };
}
