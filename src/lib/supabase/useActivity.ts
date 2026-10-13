/**
 * useActivity: everything the Activity page needs in one load: the feed of
 * completion events (last 30 days, with attached sessions), plus the light
 * per-assignment completion history behind "Needs a look" and "This week".
 * Live over the same Realtime channels the roster uses.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthProvider';
import {
  getPlanDefinitions,
  listCoachAssignments,
  listCompletionEvents,
  listCompletionSummaries,
  listMyStudents,
  subscribeToTables,
  unsubscribeChannel,
  type CoachAssignment,
  type CompletionRow,
} from './coachData';
import {
  needsALook,
  remarkedThisWeek,
  thisWeekSummary,
  toFeedEntries,
  type AssignmentInput,
  type AthleteInput,
  type CompletionLike,
} from '../activity';
import { sessionNoteLines } from '../sessionNotes';
import { todayIso } from '../e08plan';

export const FEED_DAYS = 30;
const FEED_LIMIT = 200;

interface Loaded {
  athletes: AthleteInput[];
  assignments: CoachAssignment[];
  defs: Map<string, unknown>;
  events: CompletionRow[];
  history: CompletionLike[];
}

const EMPTY: Loaded = { athletes: [], assignments: [], defs: new Map(), events: [], history: [] };

export function useActivity() {
  const { session, isCoach } = useAuth();
  const [data, setData] = useState<Loaded>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only the first load shows a spinner; live refreshes swap data in place.
  const loadedOnce = useRef(false);

  const refresh = useCallback(async () => {
    if (!session || !isCoach) {
      setData(EMPTY);
      return;
    }
    if (!loadedOnce.current) setLoading(true);
    setError(null);
    try {
      const [students, assignments] = await Promise.all([listMyStudents(), listCoachAssignments()]);
      const ids = assignments.map((a) => a.id);
      const since = new Date(Date.now() - FEED_DAYS * 86_400_000).toISOString();
      const [defs, events, history] = await Promise.all([
        getPlanDefinitions(assignments.map((a) => a.planId)),
        listCompletionEvents(ids, { since, limit: FEED_LIMIT }),
        listCompletionSummaries(ids),
      ]);
      setData({
        athletes: students.map((s) => ({
          studentId: s.student.id,
          name: s.student.display_name?.trim() || 'Athlete',
        })),
        assignments,
        defs: defs as Map<string, unknown>,
        events,
        history,
      });
      loadedOnce.current = true;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [session, isCoach]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!session || !isCoach) return;
    const ch = subscribeToTables(['completions', 'assignments', 'coach_student'], () => refresh());
    return () => unsubscribeChannel(ch);
  }, [session, isCoach, refresh]);

  const derived = useMemo(() => {
    const today = todayIso();
    const byId = new Map(data.assignments.map((a) => [a.id, a]));
    const feed = toFeedEntries(data.events, byId, data.defs);
    const inputs: AssignmentInput[] = data.assignments.map((a) => ({
      id: a.id,
      studentId: a.studentId,
      assignedAt: a.assignedAt,
      plan: data.defs.get(a.planId) ?? null,
    }));
    const flags = needsALook({
      athletes: data.athletes,
      assignments: inputs,
      completions: data.history,
      todayIso: today,
      nowMs: Date.now(),
    });
    const week = thisWeekSummary({ assignments: inputs, completions: data.history, todayIso: today });
    const remarked = remarkedThisWeek(
      feed.map((e) => ({ at: e.at, hasRemark: !!e.remarks || sessionNoteLines(e.session).length > 0 })),
      today,
    );
    return { feed, flags, week, remarked, today };
  }, [data]);

  return { ...derived, athleteCount: data.athletes.length, loading, error, refresh };
}
