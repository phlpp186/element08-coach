/**
 * ConnectedAthleteView — read-only detail for a paired (cloud) athlete: the
 * PBs + goals they maintain in the app, plus the plans the coach assigned and how
 * many sessions are done. Distinct from the local AthleteDetailView (which edits
 * a coach-authored notebook entry); this data is student-owned, coach-readable.
 */
import { useCallback, useEffect, useState } from 'react';
import { navigate } from '../hooks/useHashRoute';
import { useT } from '../i18n';
import { groupStyleById } from '../lib/disciplines';
import { useAuth } from '../lib/supabase/AuthProvider';
import {
  getAthleteProfile,
  listMyStudents,
  listCoachAssignments,
  subscribeToTables,
  unsubscribeChannel,
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
  const t = useT();
  const { session } = useAuth();
  const [name, setName] = useState(t('Athlete'));
  const [pbs, setPbs] = useState<AthletePB[]>([]);
  const [goals, setGoals] = useState<AthleteGoal[]>([]);
  const [assignments, setAssignments] = useState<CoachAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setError(null);
    try {
      const [students, profile, allAssignments] = await Promise.all([
        listMyStudents(),
        getAthleteProfile(studentId),
        listCoachAssignments(),
      ]);
      const me = students.find((s) => s.student.id === studentId);
      setName(me?.student.display_name?.trim() || t('Athlete'));
      setPbs(parsePBs(profile?.pbs));
      setGoals(parseGoals(profile?.goals));
      setAssignments(allAssignments.filter((a) => a.studentId === studentId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [studentId, session, t]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Live: the athlete updating PBs/goals or completing a session reflects here.
  useEffect(() => {
    if (!session) return;
    const ch = subscribeToTables(['completions', 'athlete_profiles'], () => load());
    return () => unsubscribeChannel(ch);
  }, [session, load]);

  if (!session) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-6">
        <p className="text-textDim">{t('Sign in to view your connected athletes.')}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-5 py-6 space-y-6">
      <button onClick={() => navigate('/athletes')} className="text-sm text-textDim hover:text-text">
        ← {t('Athletes')}
      </button>

      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent font-heading text-lg">
          {(name.trim()[0] ?? '?').toUpperCase()}
        </span>
        <div>
          <h2 className="text-xl text-text">{name}</h2>
          <p className="text-xs text-accent">✓ {t('connected · synced with the app')}</p>
        </div>
      </div>

      {loading && <p className="text-textDim text-sm">{t('Loading…')}</p>}
      {error && <p className="text-red text-sm">{error}</p>}

      {!loading && (
        <>
          <section className="space-y-2">
            <h3 className="font-heading tracking-wide text-text">{t('PERSONAL BESTS')}</h3>
            {pbs.length === 0 ? (
              <p className="text-textDim text-sm">{t('No PBs published yet (the athlete sets these in the app).')}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {pbs.map((pb) => {
                  const g = groupStyleById(pb.discipline);
                  return (
                    <span key={pb.discipline} className={`rounded-lg border px-3 py-1.5 text-center ${g.chip}`}>
                      <span className={`block text-xs tracking-wide ${g.label}`}>{pb.discipline}</span>
                      <span className="block font-heading text-text">{formatPB(pb)}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </section>

          {goals.length > 0 && (
            <section className="space-y-2">
              <h3 className="font-heading tracking-wide text-text">{t('GOALS')}</h3>
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
            <h3 className="font-heading tracking-wide text-text">{t('ASSIGNED PLANS')}</h3>
            {assignments.length === 0 ? (
              <p className="text-textDim text-sm">{t('No plans assigned yet.')}</p>
            ) : (
              <div className="space-y-2">
                {assignments.map((a) => (
                  <div key={a.id} className="rounded-lg border border-border bg-panel p-3 flex items-center justify-between">
                    <span className="text-text">{a.planTitle}</span>
                    <span className="text-xs text-textDim">
                      {a.doneCount} {a.doneCount === 1 ? t('session') : t('sessions')} {t('done')}
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
