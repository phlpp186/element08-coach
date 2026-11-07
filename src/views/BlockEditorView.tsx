/**
 * BlockEditorView, at /block/:cloudPlanId: an app block from the coach's
 * library, opened in the block editor. Loads the plans row, her assignment
 * and reports (live), and saves the edited plan back over the row only while
 * it is still the version loaded, so an edit made in the app meanwhile is
 * never overwritten unseen.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { navigate, setLeaveGuard } from '../hooks/useHashRoute';
import { tr, useT } from '../i18n';
import {
  asBlockPlan,
  blockDefinition,
  herState,
  phoneStatus,
  reportsBySession,
  type CoachFor,
} from '../lib/appBlock';
import { useAuth } from '../lib/supabase/AuthProvider';
import { remoteBlockService } from '../lib/supabase/appBlockService';
import {
  assignPlan,
  getPlan,
  listCoachAssignments,
  listCompletions,
  subscribeToTables,
  unsubscribeChannel,
  updatePlanIf,
  type CoachAssignment,
  type CompletionRow,
  type Json,
  type PlanRow,
} from '../lib/supabase/coachData';
import { BlockEditor, type SaveState, type SendOffer } from '../components/block/BlockEditor';
import { useBlockDraft } from '../components/block/useBlockDraft';

const coachForOf = (definition: unknown): CoachFor | undefined =>
  (definition as { coachFor?: CoachFor } | null)?.coachFor;

export function BlockEditorView({ cloudPlanId }: { cloudPlanId: string }) {
  const t = useT();
  const { session, isCoach, loading: authLoading } = useAuth();
  const userId = session?.user?.id ?? null;
  const draft = useBlockDraft(remoteBlockService);
  const { load, markSaved } = draft;
  const [row, setRow] = useState<PlanRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<CoachAssignment | null>(null);
  /** Who has the plan, once known (null until the first load). */
  const [holders, setHolders] = useState<string[] | null>(null);
  const [sending, setSending] = useState<{ state: SendOffer['state']; message?: string }>({ state: 'idle' });
  const [completions, setCompletions] = useState<CompletionRow[]>([]);
  const [save, setSave] = useState<SaveState>({ state: 'idle' });
  const rowRef = useRef<PlanRow | null>(null);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  dirtyRef.current = draft.dirty;

  const take = useCallback(
    async (r: PlanRow) => {
      const p = asBlockPlan(r.definition);
      if (!p) {
        setLoadError(tr('This plan has no weeks to show.'));
        return;
      }
      rowRef.current = r;
      setRow(r);
      await load(p);
    },
    [load],
  );

  useEffect(() => {
    if (!userId) return;
    let live = true;
    getPlan(cloudPlanId)
      .then((r) => {
        if (!live) return;
        if (r) void take(r);
        else setLoadError(tr('This plan is not in your library.'));
      })
      .catch((e: Error) => live && setLoadError(e.message));
    return () => {
      live = false;
    };
  }, [userId, cloudPlanId, take]);

  // Saved in the app (or another tab): take it while nothing is unsaved here.
  useEffect(() => {
    if (!userId) return;
    const ch = subscribeToTables(['plans'], () => {
      if (dirtyRef.current || savingRef.current) return;
      void getPlan(cloudPlanId)
        .then((r) => {
          if (r && rowRef.current && r.updated_at !== rowRef.current.updated_at && !dirtyRef.current) void take(r);
        })
        .catch(() => {});
    });
    return () => unsubscribeChannel(ch);
  }, [userId, cloudPlanId, take]);

  const studentHint = coachForOf(row?.definition)?.studentId ?? null;
  const loadHer = useCallback(async () => {
    try {
      const mine = (await listCoachAssignments()).filter((a) => a.planId === cloudPlanId);
      const a = mine.find((x) => x.studentId === studentHint) ?? mine[0] ?? null;
      setAssignment(a);
      setHolders(mine.map((x) => x.studentId));
      setCompletions(a ? await listCompletions(a.id) : []);
    } catch {
      /* her side stays as it was; the editor works without it */
    }
  }, [cloudPlanId, studentHint]);

  useEffect(() => {
    if (!userId) return;
    void loadHer();
    const ch = subscribeToTables(['completions', 'assignments'], () => void loadHer());
    return () => unsubscribeChannel(ch);
  }, [userId, loadHer]);

  // A new edit makes the last "Saved" or "changed elsewhere" old news.
  useEffect(() => {
    if (draft.dirty) setSave((s) => (s.state === 'saving' ? s : { state: 'idle' }));
  }, [draft.dirty]);

  useEffect(() => {
    if (!draft.dirty) return;
    setLeaveGuard(() => confirm(tr('Leave without saving? Your changes to this block are lost.')));
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      setLeaveGuard(null);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [draft.dirty]);

  const reports = useMemo(() => reportsBySession(completions), [completions]);
  const her = useMemo(() => herState(completions), [completions]);
  const phone = { status: phoneStatus(her, row?.updated_at ?? null), at: her?.at ?? null };

  const doSave = async (): Promise<boolean> => {
    const p = draft.plan;
    const r = rowRef.current;
    if (!p || !r || savingRef.current) return false;
    savingRef.current = true;
    setSave({ state: 'saving' });
    try {
      const at = new Date().toISOString();
      const definition = blockDefinition(p, p.coachFor ?? coachForOf(r.definition), at);
      const title = (p.name ?? '').trim() || r.title;
      const saved = await updatePlanIf(r.id, r.updated_at, { title, definition: definition as Json });
      if (!saved) {
        const now = await getPlan(r.id);
        if (now) await take(now);
        setSave({ state: 'conflict' });
        return false;
      }
      rowRef.current = saved;
      setRow(saved);
      markSaved();
      setSave({ state: 'saved' });
      return true;
    } catch (e) {
      setSave({ state: 'error', message: (e as Error).message });
      return false;
    } finally {
      savingRef.current = false;
    }
  };

  // Made with "Create, send later": she gets it when the coach sends it,
  // with what is on screen saved first.
  const coachFor = draft.plan?.coachFor ?? coachForOf(row?.definition);
  const notSent = !!coachFor && holders != null && !holders.includes(coachFor.studentId);
  const doSend = async () => {
    // A rebuild still on its way would land after the save and stay unsent.
    if (!coachFor || sending.state === 'sending' || draft.busy) return;
    setSending({ state: 'sending' });
    try {
      if (draft.dirty && !(await doSave())) {
        setSending({ state: 'idle' });
        return;
      }
      await assignPlan(cloudPlanId, coachFor.studentId);
      await loadHer();
      setSending({ state: 'idle' });
    } catch (e) {
      setSending({ state: 'error', message: (e as Error).message });
    }
  };

  const shell = (text: string, tone = 'text-textDim') => (
    <main className="mx-auto max-w-4xl space-y-3 px-5 py-6">
      <p className={`text-sm ${tone}`}>{text}</p>
      <button onClick={() => navigate('/plan')} className="pill px-3 py-1.5 text-sm">
        ← {t('Library')}
      </button>
    </main>
  );

  if (authLoading) return shell(t('Loading…'));
  if (!session || !isCoach) return shell(t('Sign in as a coach to use app blocks.'));
  if (loadError) return shell(loadError, 'text-red');
  if (!draft.plan || !row) return shell(t('Loading…'));

  const studentId = assignment?.studentId;
  return (
    <BlockEditor
      draft={draft}
      title={draft.plan.name?.trim() || row.title}
      phone={phone}
      send={
        notSent && coachFor
          ? { name: coachFor.name, state: sending.state, message: sending.message, onSend: () => void doSend() }
          : null
      }
      reports={reports}
      her={her}
      logHref={
        assignment && studentId
          ? (sid) => `#/connected/${studentId}/plan/${assignment.id}?session=${encodeURIComponent(sid)}`
          : null
      }
      save={save}
      onSave={() => void doSave()}
      onDone={() => navigate('/plan')}
    />
  );
}
