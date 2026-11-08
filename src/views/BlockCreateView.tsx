/**
 * BlockCreateView, at /block/new: a new plan is either built here (the
 * builder) or an app block. For a block the coach answers its start
 * questions for one paired athlete; the block service builds it, the plan
 * goes to the coach's library (assigned to her now, or sent later from the
 * editor), and the block editor opens.
 */
import { useEffect, useState } from 'react';
import { navigate } from '../hooks/useHashRoute';
import { fill, useT } from '../i18n';
import { DEFAULT_KG_STEP, isMonday, newBlockDefinition, nextMonday, type Focus, type Pull } from '../lib/appBlock';
import { newDefId } from '../lib/planLibrary';
import { calendarFormat, formatIso, mondayOf, todayIso } from '../lib/e08plan';
import { useAuth } from '../lib/supabase/AuthProvider';
import {
  remoteBlockService,
  type AppBlockSummary,
  type BlockFailure,
  type BlockService,
} from '../lib/supabase/appBlockService';
import { assignPlan, createPlan, type Json } from '../lib/supabase/coachData';
import { useRoster } from '../lib/supabase/useRoster';
import { PULLS } from '../components/block/BlockPanels';

const FOCI: { id: Focus; label: string }[] = [
  { id: 'depth', label: 'Depth' },
  { id: 'pool', label: 'Pool' },
  { id: 'both', label: 'Both' },
];
const KG_STEPS = [1, 1.25, 2, 2.5];
const DATE_FMT = calendarFormat({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const lbl = 'mb-1 mt-3 block text-xs font-bold text-textDim';

export function failureText(reason: BlockFailure, message: string, t: (s: string) => string): string {
  if (reason === 'unavailable') return t("The block service isn't available yet");
  if (reason === 'newer') return t('Made by a newer app version. Update the portal first.');
  if (reason === 'notCoach') return t('Only coaches can change app blocks.');
  if (reason === 'refused') return fill(t('The block service refused this change: {error}'), { error: message });
  return t('The block service did not answer.');
}

/** Where a created block goes: the real library, or the dev preview's mock. */
export interface CreateDeps {
  service: BlockService;
  /** Insert the plans row; its id. */
  insert(title: string, definition: Json): Promise<string>;
  assign(planId: string, studentId: string): Promise<void>;
  open(planId: string): void;
}

const LIVE: CreateDeps = {
  service: remoteBlockService,
  insert: async (title, definition) => (await createPlan(title, definition)).id,
  assign: async (planId, studentId) => {
    await assignPlan(planId, studentId);
  },
  open: (planId) => navigate(`/block/${planId}`, { replace: true }),
};

export function BlockCreateView({ presetStudentId }: { presetStudentId: string | null }) {
  const { session, isCoach } = useAuth();
  const { athletes, loading } = useRoster();
  return (
    <BlockCreateForm
      presetStudentId={presetStudentId}
      online={!!session && isCoach}
      athletes={athletes}
      loading={loading}
      deps={LIVE}
    />
  );
}

export function BlockCreateForm({
  presetStudentId,
  online,
  athletes,
  loading,
  deps,
}: {
  presetStudentId: string | null;
  online: boolean;
  athletes: { studentId: string; name: string }[];
  loading: boolean;
  deps: CreateDeps;
}) {
  const t = useT();
  const [blocks, setBlocks] = useState<AppBlockSummary[] | null>(null);
  const [svcError, setSvcError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [studentId, setStudentId] = useState(presetStudentId ?? '');
  const [start, setStart] = useState(() => nextMonday(todayIso()));
  const [focus, setFocus] = useState<Focus>('both');
  const [kgStep, setKgStep] = useState(DEFAULT_KG_STEP);
  const [pull, setPull] = useState<Pull>('weighted');
  const [cycle, setCycle] = useState(false);
  const [busy, setBusy] = useState<'now' | 'later' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { service } = deps;

  useEffect(() => {
    if (!online) return;
    let live = true;
    void service.call({ op: 'info' }).then((r) => {
      if (!live) return;
      if (r.ok && r.data.blocks) {
        setBlocks(r.data.blocks);
        if (r.data.blocks.length === 1) setPicked(r.data.blocks[0].id);
      } else setSvcError(r.ok ? t('The block service did not answer.') : failureText(r.reason, r.message, t));
    });
    return () => {
      live = false;
    };
  }, [online, service, t]);

  useEffect(() => {
    if (!studentId && athletes.length === 1) setStudentId(athletes[0].studentId);
  }, [athletes, studentId]);

  const block = blocks?.find((b) => b.id === picked) ?? null;
  const athlete = athletes.find((a) => a.studentId === studentId) ?? null;
  const ready = !!block && !!athlete && isMonday(start) && !busy;

  /** `send` assigns it to her now; without, it waits for Send in the editor. */
  const create = async (send: boolean) => {
    if (!block || !athlete) return;
    setBusy(send ? 'now' : 'later');
    setError(null);
    try {
      const r = await service.call({
        op: 'create',
        block: block.id,
        start,
        answers: { focus, kgStep, pull, cycle },
        name: `${athlete.name} · ${block.name}`,
      });
      if (!r.ok || !r.data.plan) {
        setError(r.ok ? t('The block service did not answer.') : failureText(r.reason, r.message, t));
        return;
      }
      const plan = r.data.plan;
      const coachFor = { studentId: athlete.studentId, name: athlete.name };
      const definition = newBlockDefinition(plan, coachFor, new Date().toISOString(), newDefId());
      const id = await deps.insert(plan.name?.trim() || `${athlete.name} · ${block.name}`, definition as Json);
      if (send) await deps.assign(id, athlete.studentId);
      deps.open(id);
    } catch (e) {
      setError(fill(t('Could not create the block: {error}'), { error: (e as Error).message }));
    } finally {
      setBusy(null);
    }
  };

  const pill = (on: boolean) => `pill px-3 py-1 text-sm ${on ? 'pill-on' : ''}`;

  return (
    <main className="mx-auto max-w-4xl space-y-4 px-5 py-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg">{t('New plan')}</h2>
        <button onClick={() => navigate('/plan')} className="pill px-3 py-1.5 text-sm">
          {t('Done')}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          onClick={() => navigate('/plan/new')}
          className="board p-4 text-left opacity-80 hover:opacity-100"
        >
          <span className="block font-heading text-text">{t('Build your own')}</span>
          <span className="block text-sm text-textDim">{t('Weeks, sessions and exercises from your library.')}</span>
        </button>
        {!online ? (
          <div className="board p-4 text-sm text-textDim">{t('Sign in as a coach to use app blocks.')}</div>
        ) : svcError ? (
          <div className="board p-4 text-sm text-amber">{svcError}</div>
        ) : !blocks ? (
          <div className="board p-4 text-sm text-textDim">{t('Loading…')}</div>
        ) : (
          blocks.map((b) => (
            <button
              key={b.id}
              onClick={() => setPicked(b.id)}
              aria-pressed={picked === b.id}
              className={`board p-4 text-left ${picked === b.id ? 'ring-2 ring-accent' : 'hover:border-accent'}`}
            >
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-heading text-text">{b.name}</span>
                <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[11px] font-heading uppercase text-accent">
                  {t('App block')}
                </span>
              </span>
              <span className="block text-sm text-textDim">
                {fill(t('{n} weeks. Built by the app, with its workouts, loads and tests.'), { n: b.weeks })}
              </span>
              <span className="mt-1 block text-xs text-textDim">{t('More blocks show up here when the app has them.')}</span>
            </button>
          ))
        )}
      </div>

      {block && (
        <section className="board p-4">
          <div className="grid gap-x-6 sm:grid-cols-2">
            <div>
              <span className={lbl}>{t('Athlete')}</span>
              {athletes.length === 0 ? (
                <p className="text-sm text-textDim">
                  {loading ? t('Loading…') : t('Pair an athlete first: only connected athletes can get an app block.')}
                </p>
              ) : (
                <select className="field" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                  <option value="">{t('Pick an athlete')}</option>
                  {athletes.map((a) => (
                    <option key={a.studentId} value={a.studentId}>
                      {a.name}
                    </option>
                  ))}
                </select>
              )}
              <span className={lbl}>{t('Test week starts')}</span>
              <input
                type="date"
                className="field"
                value={start}
                onChange={(e) => e.target.value && setStart(mondayOf(e.target.value))}
              />
              <span className="mt-1 block text-xs text-textDim">
                {isMonday(start) ? formatIso(DATE_FMT, start) : ''} · {t('The test week starts on a Monday.')}
              </span>
              <span className={lbl}>{t('Where does she dive?')}</span>
              <div className="flex flex-wrap gap-1.5">
                {FOCI.map((f) => (
                  <button key={f.id} onClick={() => setFocus(f.id)} className={pill(focus === f.id)}>
                    {t(f.label)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className={lbl}>{t('Smallest weight jump')}</span>
              <div className="flex flex-wrap gap-1.5">
                {KG_STEPS.map((k) => (
                  <button key={k} onClick={() => setKgStep(k)} className={pill(kgStep === k)}>
                    {fill(t('{n} kg'), { n: k })}
                  </button>
                ))}
              </div>
              <span className={lbl}>{t('Pull-ups')}</span>
              <div className="flex flex-wrap gap-1.5">
                {PULLS.map((p) => (
                  <button key={p.id} onClick={() => setPull(p.id)} className={pill(pull === p.id)}>
                    {t(p.label)}
                  </button>
                ))}
              </div>
              <span className={lbl}>{t('Her cycle')}</span>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setCycle(true)} className={pill(cycle)}>
                  {t('Take it into account')}
                </button>
                <button onClick={() => setCycle(false)} className={pill(!cycle)}>
                  {t('Not for me')}
                </button>
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-3 border-t border-border pt-3">
            <p className="text-sm text-textDim">
              {t('Send it now and she gets it right away, or create it first and send it from the editor when it is ready. It shows in your app either way.')}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button disabled={!ready} onClick={() => void create(false)} className="pill px-4 py-2">
                {busy === 'later' ? t('Creating…') : t('Create, send later')}
              </button>
              <button disabled={!ready} onClick={() => void create(true)} className="pill pill-on btn-raised px-4 py-2">
                {busy === 'now'
                  ? t('Creating…')
                  : athlete
                    ? fill(t('Create and send to {name}'), { name: athlete.name })
                    : t('Create and send')}
              </button>
            </div>
          </div>
          {error && <p className="mt-2 text-sm text-red">{error}</p>}
        </section>
      )}
    </main>
  );
}
