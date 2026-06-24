/**
 * ConnectedAthleteView — read-only detail for a paired (cloud) athlete: the
 * PBs + goals they maintain in the app, plus the plans the coach assigned and how
 * many sessions are done. Distinct from the local AthleteDetailView (which edits
 * a coach-authored notebook entry); this data is student-owned, coach-readable.
 */
import { useEffect, useState } from 'react';
import { navigate } from '../hooks/useHashRoute';
import { useAuth } from '../lib/supabase/AuthProvider';
import {
  getAthleteProfile,
  listMyStudents,
  listCoachAssignments,
  type CoachAssignment,
} from '../lib/supabase/coachData';
import {
  parsePBs,
  parseGoals,
  formatPB,
  type AthletePB,
  type AthleteGoal,
} from '../lib/supabase/athleteProfileCloud';

export function ConnectedAthleteView({ studentId }: { studentId: string }) {
  const { session } = useAuth();
  const [name, setName] = useState('Athlete');
  const [pbs, setPbs] = useState<AthletePB[]>([]);
  const [goals, setGoals] = useState<AthleteGoal[]>([]);
  const [assignments, setAssignments] = useState<CoachAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    setLoading(true);
    setError(null);
    Promise.all([listMyStudents(), getAthleteProfile(studentId), listCoachAssignments()])
      .then(([students, profile, allAssignments]) => {
        if (!alive) return;
        const me = students.find((s) => s.student.id === studentId);
        setName(me?.student.display_name?.trim() || 'Athlete');
        setPbs(parsePBs(profile?.pbs));
        setGoals(parseGoals(profile?.goals));
        setAssignments(allAssignments.filter((a) => a.studentId === studentId));
      })
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [studentId, session]);

  if (!session) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-6">
        <p className="text-textDim">Sign in to view your connected athletes.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-5 py-6 space-y-6">
      <button onClick={() => navigate('/athletes')} className="text-sm text-textDim hover:text-text">
        ← Athletes
      </button>

      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent font-heading text-lg">
          {(name.trim()[0] ?? '?').toUpperCase()}
        </span>
        <div>
          <h2 className="text-xl text-text">{name}</h2>
          <p className="text-xs text-accent">✓ connected · synced with the app</p>
        </div>
      </div>

      {loading && <p className="text-textDim text-sm">Loading…</p>}
      {error && <p className="text-red text-sm">{error}</p>}

      {!loading && (
        <>
          <section className="space-y-2">
            <h3 className="font-heading tracking-wide text-text">PERSONAL BESTS</h3>
            {pbs.length === 0 ? (
              <p className="text-textDim text-sm">No PBs published yet (the athlete sets these in the app).</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {pbs.map((pb) => (
                  <span key={pb.discipline} className="rounded-lg border border-border bg-panel px-3 py-1.5 text-center">
                    <span className="block text-xs text-textDim tracking-wide">{pb.discipline}</span>
                    <span className="block font-heading text-text">{formatPB(pb)}</span>
                  </span>
                ))}
              </div>
            )}
          </section>

          {goals.length > 0 && (
            <section className="space-y-2">
              <h3 className="font-heading tracking-wide text-text">GOALS</h3>
              <ul className="space-y-1">
                {goals.map((g) => (
                  <li key={g.id} className="text-sm flex gap-2">
                    <span className={g.done ? 'text-recover' : 'text-accent'}>{g.done ? '✓' : '•'}</span>
                    <span className={g.done ? 'text-textDim line-through' : 'text-text'}>{g.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-2">
            <h3 className="font-heading tracking-wide text-text">ASSIGNED PLANS</h3>
            {assignments.length === 0 ? (
              <p className="text-textDim text-sm">No plans assigned yet.</p>
            ) : (
              <div className="space-y-2">
                {assignments.map((a) => (
                  <div key={a.id} className="rounded-lg border border-border bg-panel p-3 flex items-center justify-between">
                    <span className="text-text">{a.planTitle}</span>
                    <span className="text-xs text-textDim">
                      {a.doneCount} session{a.doneCount === 1 ? '' : 's'} done
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
