/**
 * ConnectedAthleteView — read-only detail for a paired (cloud) athlete: the
 * PBs + goals they maintain in the app, plus the plans the coach assigned and how
 * many sessions are done. Distinct from the local AthleteDetailView (which edits
 * a coach-authored notebook entry); this data is student-owned, coach-readable.
 */
import { useCallback, useEffect, useState } from 'react';
import { navigate } from '../hooks/useHashRoute';
import { fill, useT, tr } from '../i18n';
import { groupStyleById } from '../lib/disciplines';
import { useAuth } from '../lib/supabase/AuthProvider';
import {
  disconnect,
  getAthleteProfile,
  listMyStudents,
  listCoachAssignments,
  removeAssignment,
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
import { CoachNotesEditor } from '../components/CoachNotesEditor';
import { CycleCard } from '../components/CycleCard';
import { useAthleteCycle } from '../lib/supabase/useAthleteCycle';
import { IntakeEditor } from '../components/IntakeEditor';
import { linkAthlete, updateAthlete, updateCoachNote, useAthletes, useCoachNote, useLinkedAthlete } from '../lib/store';

export function ConnectedAthleteView({ studentId }: { studentId: string }) {
  const t = useT();
  const { session } = useAuth();
  const note = useCoachNote(studentId);
  // Linked to a notebook entry: that entry IS the coach's record for this
  // athlete, so the notes below edit it instead of a second, separate set.
  const linked = useLinkedAthlete(studentId);
  const unlinkedEntries = useAthletes().filter((a) => !a.studentId);
  const [name, setName] = useState(t('Athlete'));
  const [pbs, setPbs] = useState<AthletePB[]>([]);
  const [goals, setGoals] = useState<AthleteGoal[]>([]);
  const [assignments, setAssignments] = useState<CoachAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkId, setLinkId] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  // Depend only on STABLE primitives (studentId + the signed-in user's id), never
  // the whole `session` object — Supabase's onAuthStateChange hands a fresh
  // session object on every event (token refresh, focus), which would otherwise
  // recreate `load`, re-fire the effects, and flicker. `tr()` (non-reactive) is
  // used for the fallback label so a language change doesn't trigger a refetch.
  const userId = session?.user?.id ?? null;
  const load = useCallback(async () => {
    if (!userId) return;
    setError(null);
    try {
      const [students, profile, allAssignments] = await Promise.all([
        listMyStudents(),
        getAthleteProfile(studentId),
        listCoachAssignments(),
      ]);
      const me = students.find((s) => s.student.id === studentId);
      setName(me?.student.display_name?.trim() || tr('Athlete'));
      setLinkId(me?.id ?? null);
      setPbs(parsePBs(profile?.pbs));
      setGoals(parseGoals(profile?.goals));
      setAssignments(allAssignments.filter((a) => a.studentId === studentId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [studentId, userId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // The cycle days this athlete shares with this coach, if they named them.
  // Keyed by a string so a fresh array of the same assignments does not refetch.
  const assignmentKey = assignments.map((a) => `${a.id}:${a.planId}`).join(',');
  const cycle = useAthleteCycle(studentId, userId, assignmentKey);

  // Live: the athlete updating PBs/goals or completing a session reflects here.
  useEffect(() => {
    if (!userId) return;
    const ch = subscribeToTables(['completions', 'athlete_profiles'], () => load());
    return () => unsubscribeChannel(ch);
  }, [userId, load]);

  // Takes one plan off the athlete; it leaves their app at the next sync.
  async function removePlan(a: CoachAssignment) {
    if (
      !confirm(
        fill(
          t('Remove {plan} from {name}? It disappears from their app. What they logged on it stays, and assigning the plan again brings it back.'),
          { plan: a.planTitle, name },
        ),
      )
    )
      return;
    setRemoving(a.id);
    try {
      await removeAssignment(a.id);
      setAssignments((prev) => prev.filter((x) => x.id !== a.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRemoving(null);
    }
  }

  // Ends coaching: the link, the plans assigned to them and the Pro included
  // with coaching (disconnect re-syncs it). Their own logbook is untouched.
  async function endCoaching() {
    if (!linkId) return;
    if (
      !confirm(
        fill(
          t('Disconnect {name}? They stop seeing your plans, you stop seeing their sessions, and the Pro included with your coaching ends. Their own logbook stays as it is.'),
          { name },
        ),
      )
    )
      return;
    setDisconnecting(true);
    try {
      await disconnect(linkId);
      navigate('/athletes');
    } catch (e) {
      setError((e as Error).message);
      setDisconnecting(false);
    }
  }

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
        {linkId && (
          <button
            onClick={() => void endCoaching()}
            disabled={disconnecting}
            title={t('For an athlete you no longer coach. You can invite them again later.')}
            className="ml-auto pill text-sm px-3 py-1.5 hover:text-red"
          >
            {disconnecting ? '…' : t('Disconnect athlete')}
          </button>
        )}
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

          {cycle.shared && (
            <CycleCard name={name} days={cycle.days} sessions={cycle.sessions} today={cycle.today} />
          )}

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-heading tracking-wide text-text">{t('ASSIGNED PLANS')}</h3>
              <button
                onClick={() => navigate(`/block/new?athlete=${studentId}`)}
                className="pill px-3 py-1 text-sm"
              >
                + {t('App block')}
              </button>
            </div>
            {assignments.length === 0 ? (
              <p className="text-textDim text-sm">{t('No plans assigned yet.')}</p>
            ) : (
              <div className="space-y-2">
                {assignments.map((a) => (
                  <div key={a.id} className="flex items-stretch gap-2">
                    <button
                      onClick={() => navigate(`/connected/${studentId}/plan/${a.id}`)}
                      className="flex-1 min-w-0 text-left rounded-lg border border-border bg-panel p-3 flex items-center justify-between gap-3 hover:border-accent transition-colors"
                    >
                      <span className="text-text truncate">{a.planTitle}</span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-textDim">
                          {a.doneCount} {a.doneCount === 1 ? t('session') : t('sessions')} {t('done')}
                        </span>
                        <span className="text-textDim">›</span>
                      </span>
                    </button>
                    <button
                      onClick={() => removePlan(a)}
                      disabled={removing === a.id}
                      className="pill px-3 text-xs text-textDim hover:text-red shrink-0 disabled:opacity-50"
                      aria-label={fill(t('Remove {plan} from {name}'), { plan: a.planTitle, name })}
                    >
                      {t('Remove')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-heading tracking-wide text-text">{t('YOUR NOTES')}</h3>
                <p className="text-xs text-textDim">
                  {t('Private to you, not shared with the athlete. Kept on this device (backs up with your roster file).')}
                </p>
              </div>
              {linked ? (
                <button onClick={() => navigate(`/athletes/${linked.id}`)} className="pill px-3 py-1.5 text-sm">
                  {t('Notebook page')} ›
                </button>
              ) : (
                unlinkedEntries.length > 0 && (
                  <label className="flex flex-wrap items-center gap-2 text-xs text-textDim">
                    {t('Onboarded with Add athlete? Link that entry:')}
                    <select
                      className="field w-auto py-1 text-sm"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) linkAthlete(e.target.value, studentId);
                      }}
                    >
                      <option value="">{t('Choose an athlete')}</option>
                      {unlinkedEntries.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name.trim() || t('Unnamed athlete')}
                        </option>
                      ))}
                    </select>
                  </label>
                )
              )}
            </div>
            {linked ? (
              <CoachNotesEditor value={linked} onPatch={(p) => updateAthlete(linked.id, p)} />
            ) : (
              <CoachNotesEditor value={note} onPatch={(p) => updateCoachNote(studentId, p)} />
            )}
          </section>

          <section className="space-y-3">
            <h3 className="font-heading tracking-wide text-text">{t('Intro questionnaire')}</h3>
            {linked ? (
              <IntakeEditor
                value={linked.intake}
                onChange={(p) => updateAthlete(linked.id, { intake: { ...linked.intake, ...p } })}
              />
            ) : (
              <IntakeEditor
                value={note.intake}
                onChange={(p) => updateCoachNote(studentId, { intake: { ...note.intake, ...p } })}
              />
            )}
          </section>

        </>
      )}
    </main>
  );
}
