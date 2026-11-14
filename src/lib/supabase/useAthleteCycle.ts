/**
 * useAthleteCycle — what the coach's cycle card needs for one athlete: whether
 * they share their cycle with this coach, the shared days, and the sessions
 * they completed on this coach's plans in the same weeks.
 *
 * `shared` stays false (and the card stays away) for an athlete who did not
 * name this coach, and on any read error: a missing optional card must never
 * break the athlete page.
 */
import { useEffect, useState } from 'react';
import { localDay, planSessions } from '../activity';
import { cycleFetchSince, cycleWindowStart, foldSessions, type CycleDay, type CycleSession } from '../cycleView';
import {
  getPlanDefinitions,
  isCycleSharedWithMe,
  listCompletionSummaries,
  listSharedCycleDays,
  subscribeToTables,
  unsubscribeChannel,
} from './coachData';

export interface AthleteCycle {
  shared: boolean;
  days: CycleDay[];
  sessions: CycleSession[];
  today: string;
}

const EMPTY = (today: string): AthleteCycle => ({ shared: false, days: [], sessions: [], today });

/** `assignmentKey` is "assignmentId:planId" pairs joined by commas: a stable
 *  primitive, so a fresh array of the same assignments does not refetch. */
export function useAthleteCycle(studentId: string, userId: string | null, assignmentKey: string): AthleteCycle {
  const [state, setState] = useState<AthleteCycle>(() => EMPTY(localDay(new Date().toISOString())));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!userId) return;
    const ch = subscribeToTables(['athlete_cycle_days', 'athlete_cycle_share', 'completions'], () =>
      setTick((n) => n + 1),
    );
    return () => unsubscribeChannel(ch);
  }, [userId]);

  useEffect(() => {
    let alive = true;
    const today = localDay(new Date().toISOString());
    if (!userId) {
      setState(EMPTY(today));
      return;
    }
    (async () => {
      try {
        if (!(await isCycleSharedWithMe(studentId))) {
          if (alive) setState(EMPTY(today));
          return;
        }
        const pairs = assignmentKey
          ? assignmentKey.split(',').map((p) => {
              const [id, planId] = p.split(':');
              return { id, planId };
            })
          : [];
        const [rows, comps, defs] = await Promise.all([
          listSharedCycleDays(studentId, cycleFetchSince(today)),
          listCompletionSummaries(pairs.map((p) => p.id)),
          getPlanDefinitions(pairs.map((p) => p.planId)),
        ]);
        const planOf = new Map(pairs.map((p) => [p.id, p.planId]));
        const labels = new Map<string, string>();
        for (const [planId, def] of defs)
          for (const s of planSessions(def)) if (s.label) labels.set(`${planId}:${s.id}`, s.label);
        const from = cycleWindowStart(today);
        const done = comps
          .filter((c) => c.completed_at)
          .map((c) => ({
            date: localDay(c.completed_at as string),
            label: labels.get(`${planOf.get(c.assignment_id)}:${c.exercise_id}`) ?? '',
            effort: c.rating ?? null,
          }))
          .filter((s) => s.date >= from && s.date <= today);
        if (!alive) return;
        setState({
          shared: true,
          today,
          sessions: foldSessions(done),
          days: rows.map((r) => ({
            date: r.date,
            period: !!r.period,
            symptoms: r.symptoms ?? [],
            note: r.note?.trim() || null,
            felt: typeof r.felt === 'number' ? r.felt : null,
          })),
        });
      } catch {
        if (alive) setState(EMPTY(today));
      }
    })();
    return () => {
      alive = false;
    };
  }, [studentId, userId, assignmentKey, tick]);

  return state;
}
