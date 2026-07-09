/**
 * useCoachAssignments — the coach's active cloud assignments (which plan is
 * assigned to which connected athlete), keyed by cloud plan id. Lets a local,
 * offline-first view (PlansView) show who actually has a draft even though the
 * assignment lives in the cloud, not on the local record. Empty when signed
 * out; live via the `assignments` table.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthProvider';
import {
  listCoachAssignments,
  subscribeToTables,
  unsubscribeChannel,
  type CoachAssignment,
} from './coachData';

export function useCoachAssignments() {
  const { session, isCoach } = useAuth();
  const [assignments, setAssignments] = useState<CoachAssignment[]>([]);

  const refresh = useCallback(async () => {
    if (!session || !isCoach) {
      setAssignments([]);
      return;
    }
    try {
      setAssignments(await listCoachAssignments());
    } catch {
      setAssignments([]);
    }
  }, [session, isCoach]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!session || !isCoach) return;
    const ch = subscribeToTables(['assignments'], () => refresh());
    return () => unsubscribeChannel(ch);
  }, [session, isCoach, refresh]);

  /** cloud plan id → distinct assigned athlete names (assignment order). */
  const namesByCloudPlanId = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const a of assignments) {
      const names = m.get(a.planId) ?? [];
      if (!names.includes(a.studentName)) names.push(a.studentName);
      m.set(a.planId, names);
    }
    return m;
  }, [assignments]);

  return { namesByCloudPlanId };
}
