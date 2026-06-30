/**
 * ConnectedPlanView — read-only detail for ONE plan a coach assigned to a paired
 * (cloud) athlete. Walks the stored `plans.definition` (the app's Plan shape:
 * phases → weeks → plannedSessions → exercises) and overlays the athlete's
 * completions: which sessions are done, when, their rating/note, and any logbook
 * session they attached. Completions are keyed by `exercise_id === plannedSession.id`
 * (the app marks completion at the session level). Student-owned, coach-readable;
 * live via the same completions Realtime channel the roster uses.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { navigate } from '../hooks/useHashRoute';
import { AttachedSessionDetail } from '../components/AttachedSessionDetail';
import { useT, tr } from '../i18n';
import { useAuth } from '../lib/supabase/AuthProvider';
import {
  getPlan,
  listCoachAssignments,
  listCompletions,
  subscribeToTables,
  unsubscribeChannel,
  type CompletionRow,
} from '../lib/supabase/coachData';

// ─── Stored-plan shape (mirrors the app's wire Plan; all fields defensive) ────
interface PlannedExercise {
  id: string;
  description?: string;
}
interface PlannedSession {
  id: string;
  dayOfWeek?: number;
  label?: string;
  exercises?: PlannedExercise[];
  mode?: string;
  sessionType?: string;
  sessionNotes?: string;
}
interface MicroCycle {
  weekStart?: string;
  focus?: string;
  intensity?: string;
  notes?: string;
  plannedSessions?: PlannedSession[];
}
interface MesoCycle {
  id?: string;
  name?: string;
  type?: string;
  weeks?: MicroCycle[];
}
interface PlanDef {
  id?: number;
  name?: string;
  kind?: 'training' | 'season';
  competitionDate?: string | null;
  startDate?: string | null;
  mode?: string;
  phases?: MesoCycle[];
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function ConnectedPlanView({
  studentId,
  assignmentId,
}: {
  studentId: string;
  assignmentId: string;
}) {
  const t = useT();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [planTitle, setPlanTitle] = useState(t('Plan'));
  const [studentName, setStudentName] = useState(t('Athlete'));
  const [plan, setPlan] = useState<PlanDef | null>(null);
  const [completions, setCompletions] = useState<CompletionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setError(null);
    try {
      const assignments = await listCoachAssignments();
      const meta = assignments.find((a) => a.id === assignmentId);
      if (!meta) {
        setError(tr('This assignment is no longer active.'));
        setLoading(false);
        return;
      }
      setPlanTitle(meta.planTitle || tr('Plan'));
      setStudentName(meta.studentName || tr('Athlete'));
      const [planRow, comps] = await Promise.all([
        getPlan(meta.planId),
        listCompletions(assignmentId),
      ]);
      setPlan((planRow?.definition ?? null) as PlanDef | null);
      setCompletions(comps);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [assignmentId, userId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Live: the athlete marking a session done reflects here.
  useEffect(() => {
    if (!userId) return;
    const ch = subscribeToTables(['completions'], () => load());
    return () => unsubscribeChannel(ch);
  }, [userId, load]);

  // exercise_id (session id) → its completion row, done-only.
  const doneBySession = useMemo(() => {
    const m = new Map<string, CompletionRow>();
    for (const c of completions) if (c.completed_at) m.set(c.exercise_id, c);
    return m;
  }, [completions]);

  const flat = useMemo(() => flattenPlan(plan), [plan]);
  const totalSessions = flat.reduce((n, w) => n + w.sessions.length, 0);
  const doneCount = doneBySession.size;
  const pct = totalSessions > 0 ? Math.round((doneCount / totalSessions) * 100) : 0;
  const multiPhase = (plan?.phases?.length ?? 0) > 1 || plan?.kind === 'season';

  if (!session) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-6">
        <p className="text-textDim">{t('Sign in to view your connected athletes.')}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-5 py-6 space-y-6">
      <button
        onClick={() => navigate(`/connected/${studentId}`)}
        className="text-sm text-textDim hover:text-text"
      >
        ← {studentName}
      </button>

      <div className="space-y-3">
        <h2 className="text-xl text-text">{planTitle}</h2>
        {!loading && totalSessions > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-textDim">
                {doneCount} {t('of')} {totalSessions}{' '}
                {totalSessions === 1 ? t('session') : t('sessions')} {t('done')}
              </span>
              <span className="text-accent font-heading">{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-abyss overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {loading && <p className="text-textDim text-sm">{t('Loading…')}</p>}
      {error && <p className="text-red text-sm">{error}</p>}

      {!loading && !error && totalSessions === 0 && (
        <p className="text-textDim text-sm">{t('This plan has no sessions yet.')}</p>
      )}

      {!loading &&
        flat.map((w) => (
          <section key={`${w.phaseIdx}-${w.weekIdx}`} className="space-y-2">
            <div className="flex items-baseline gap-2 flex-wrap">
              <h3 className="font-heading tracking-wide text-text">
                {t('Week')} {w.globalWeek}
              </h3>
              {multiPhase && w.phaseName && (
                <span className="text-xs text-accent">· {w.phaseName}</span>
              )}
              {w.week.weekStart && (
                <span className="text-xs text-textDim">· {w.week.weekStart}</span>
              )}
              {w.week.intensity && (
                <span className="text-xs text-textDim uppercase tracking-wide">
                  · {w.week.intensity}
                </span>
              )}
            </div>
            {(w.week.focus || w.week.notes) && (
              <p className="text-xs text-textDim">
                {[w.week.focus, w.week.notes].filter(Boolean).join(' — ')}
              </p>
            )}
            {w.sessions.length === 0 ? (
              <p className="text-xs text-textDim italic">{t('Rest week.')}</p>
            ) : (
              <div className="space-y-2">
                {w.sessions.map((ses) => (
                  <SessionRow
                    key={ses.id}
                    session={ses}
                    completion={doneBySession.get(ses.id) ?? null}
                    t={t}
                  />
                ))}
              </div>
            )}
          </section>
        ))}
    </main>
  );
}

// ─── One session card with completion overlay ────────────────────────────────
function SessionRow({
  session,
  completion,
  t,
}: {
  session: PlannedSession;
  completion: CompletionRow | null;
  t: (s: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const done = !!completion?.completed_at;
  const day = typeof session.dayOfWeek === 'number' ? DAY_LABELS[session.dayOfWeek] : null;
  const title = session.label?.trim() || session.sessionType || t('Session');
  const attached = completion?.session ?? null;

  return (
    <div
      className={`rounded-lg border p-3 ${done ? 'border-recover/50 bg-recover/5' : 'border-border bg-panel'}`}
    >
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 text-sm ${done ? 'text-recover' : 'text-textDim'}`}>
          {done ? '✓' : '○'}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {day && (
              <span className="rounded bg-abyss px-1.5 py-0.5 text-[10px] font-heading tracking-wide text-textDim">
                {day}
              </span>
            )}
            <span className="text-text">{title}</span>
            {session.sessionType && session.sessionType !== title && (
              <span className="text-xs text-textDim">{session.sessionType}</span>
            )}
          </div>

          {session.exercises && session.exercises.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {session.exercises.map((ex) => (
                <li key={ex.id} className="text-sm text-textDim flex gap-2">
                  <span className="text-border">–</span>
                  <span>{ex.description || t('(no description)')}</span>
                </li>
              ))}
            </ul>
          )}
          {session.sessionNotes && (
            <p className="mt-1 text-xs text-textDim italic">{session.sessionNotes}</p>
          )}

          {done && (
            <div className="mt-2 space-y-1.5 border-t border-border pt-2">
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="text-recover">
                  ✓ {t('Done')}
                  {completion?.completed_at
                    ? ` · ${new Date(completion.completed_at).toLocaleDateString()}`
                    : ''}
                </span>
                {typeof completion?.rating === 'number' && (
                  <span className="text-amber" title={t('Rating')}>
                    {'★'.repeat(Math.max(0, Math.min(5, completion.rating)))}
                  </span>
                )}
              </div>
              {completion?.remarks && (
                <p className="text-sm text-text">“{completion.remarks}”</p>
              )}
              {attached && (
                <div>
                  <button
                    onClick={() => setOpen((o) => !o)}
                    className="text-xs text-accent hover:underline"
                  >
                    📎 {t('Attached session')} {open ? '▲' : '▾'}
                  </button>
                  {open && (
                    <div className="mt-2 rounded-lg border border-border bg-abyss p-3">
                      <AttachedSessionDetail blob={attached} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Flatten phases → weeks into a single ordered list with context ──────────
interface FlatWeek {
  phaseIdx: number;
  weekIdx: number;
  globalWeek: number;
  phaseName: string | null;
  week: MicroCycle;
  sessions: PlannedSession[];
}
function flattenPlan(plan: PlanDef | null): FlatWeek[] {
  if (!plan?.phases) return [];
  const out: FlatWeek[] = [];
  let global = 0;
  plan.phases.forEach((phase, phaseIdx) => {
    (phase.weeks ?? []).forEach((week, weekIdx) => {
      global += 1;
      const sessions = [...(week.plannedSessions ?? [])].sort(
        (a, b) => (a.dayOfWeek ?? 0) - (b.dayOfWeek ?? 0),
      );
      out.push({
        phaseIdx,
        weekIdx,
        globalWeek: global,
        phaseName: phase.name ?? null,
        week,
        sessions,
      });
    });
  });
  return out;
}
