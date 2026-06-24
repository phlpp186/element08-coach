/**
 * useRoster — the coach's connected (paired) athletes + per-athlete plan/done
 * counts, from the cloud. Loads when signed in; empty otherwise. Returns a manual
 * refresh so callers can re-pull after pairing.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import { listMyStudents, listCoachAssignments, type ProfileRow } from './coachData';

export interface ConnectedAthlete {
  /** coach_student link id (for disconnect). */
  linkId: string;
  studentId: string;
  name: string;
  planCount: number;
  doneCount: number;
}

export function useRoster() {
  const { session } = useAuth();
  const [athletes, setAthletes] = useState<ConnectedAthlete[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!session) {
      setAthletes([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [students, assignments] = await Promise.all([
        listMyStudents(),
        listCoachAssignments(),
      ]);
      const planCount = new Map<string, number>();
      const doneCount = new Map<string, number>();
      for (const a of assignments) {
        planCount.set(a.studentId, (planCount.get(a.studentId) ?? 0) + 1);
        doneCount.set(a.studentId, (doneCount.get(a.studentId) ?? 0) + a.doneCount);
      }
      setAthletes(
        students.map((s: { id: string; student: ProfileRow }) => ({
          linkId: s.id,
          studentId: s.student.id,
          name: s.student.display_name?.trim() || 'Athlete',
          planCount: planCount.get(s.student.id) ?? 0,
          doneCount: doneCount.get(s.student.id) ?? 0,
        })),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { athletes, loading, error, refresh };
}
