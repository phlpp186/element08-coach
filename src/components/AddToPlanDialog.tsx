/**
 * AddToPlanDialog — puts something into one of the coach's saved plans
 * without opening the plan builder: picked exercises (into a session or onto
 * a free day), a session from a template (onto a day), or a week template
 * (onto a week). First the plan, then the place in it.
 *
 * The plan is saved here and sent to the library like a save in the builder,
 * so an assigned plan asks who gets the new version (LibrarySave).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DAY_LABELS, type BuilderPlan, type BuilderSession, type BuilderWeek } from '../lib/e08plan';
import {
  addExercises,
  addSession,
  applyToWeek,
  isDayPlan,
  planRows,
  targetExists,
  type PickedExercise,
  type PlanTarget,
  type WeekRef,
} from '../lib/addToPlan';
import { recordUseByDescription } from '../lib/library';
import { upsertPlan, useSavedPlans } from '../lib/store';
import { isAppPlan } from '../lib/planLibrary';
import { getCloudPlanLink } from '../lib/supabase/cloudPlanLinks';
import { useLibrary } from '../lib/supabase/planLibrary';
import { useCoachAssignments } from '../lib/supabase/useCoachAssignments';
import { useAuth } from '../lib/supabase/AuthProvider';
import { navigate } from '../hooks/useHashRoute';
import { useLibrarySave } from './LibrarySave';
import { PlanSpan } from './PlanSpan';
import { fill, useT } from '../i18n';

export type PlanPayload =
  | { kind: 'exercises'; items: PickedExercise[] }
  /** `make` builds the session for a weekday; null when it cannot be built. */
  | { kind: 'session'; name: string; make: (dayOfWeek: number) => BuilderSession | null }
  | { kind: 'week'; name: string; apply: (week: BuilderWeek) => BuilderWeek };

type Pick = PlanTarget | { kind: 'week'; ref: WeekRef | 'new' };

const sameRef = (a: WeekRef, b: WeekRef) => a.phase === b.phase && a.week === b.week;

export function AddToPlanDialog({
  payload,
  onClose,
  onAdded,
}: {
  payload: PlanPayload;
  onClose: () => void;
  /** After the plan was changed and saved. */
  onAdded?: () => void;
}) {
  const t = useT();
  const plans = useSavedPlans();
  const lib = useLibrary();
  const { session, isCoach } = useAuth();
  const online = !!session && isCoach;
  const { namesByCloudPlanId } = useCoachAssignments();
  const library = useLibrarySave();
  const [planId, setPlanId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [pick, setPick] = useState<Pick | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  // An app plan opens in the block editor and a plan that changed on another
  // device has to be resolved first: neither is written from here.
  const usable = useMemo(
    () =>
      plans
        .filter((sp) => {
          const cloudId = getCloudPlanLink(sp.id)?.cloudPlanId;
          const row = cloudId ? lib.rows[cloudId] : undefined;
          return !lib.conflicts[sp.id] && !(row && isAppPlan(row.definition));
        })
        .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')),
    [plans, lib],
  );
  const sp = planId ? usable.find((p) => p.id === planId) ?? null : null;
  const q = search.trim().toLowerCase();
  const listed = q ? usable.filter((p) => (p.plan.name ?? '').toLowerCase().includes(q)) : usable;
  const whoHas = (id: string) => {
    const cloudId = getCloudPlanLink(id)?.cloudPlanId;
    return cloudId ? (namesByCloudPlanId.get(cloudId) ?? []) : [];
  };

  const choosePlan = (id: string | null) => {
    setPlanId(id);
    setPick(null);
    setDone(null);
  };

  const sessionName = (s: BuilderSession) => s.label.trim() || t('Session');
  const weekName = (n: number) => `${t('Week')} ${n}`;
  const dayName = (i: number) => `${t('Day')} ${i + 1}`;

  /** "Week 3, Wed" / "Day 4" / "Week 3, Wed, “Pool CO₂”" for the footer. */
  const describe = (plan: BuilderPlan, p: Pick): string => {
    const rows = planRows(plan);
    if (p.kind === 'week') {
      if (p.ref === 'new') return t('a new week at the end');
      const ref = p.ref;
      const row = rows.find((r) => r.kind === 'week' && sameRef(r.ref, ref));
      return row?.kind === 'week' ? weekName(row.number) : '';
    }
    if (p.kind === 'newDay') return t('a new day at the end');
    if (p.kind === 'day') return `${dayName(p.index)}, ${t('new session')}`;
    if (p.kind === 'weekDay') {
      const row = rows.find((r) => r.kind === 'week' && sameRef(r.ref, p.ref));
      return row?.kind === 'week' ? `${weekName(row.number)}, ${t(DAY_LABELS[p.dayOfWeek])}, ${t('new session')}` : '';
    }
    for (const r of rows) {
      if (r.kind === 'week') {
        for (let d = 0; d < 7; d++) {
          const s = r.days[d].find((x) => x.id === p.sessionId);
          if (s) return `${weekName(r.number)}, ${t(DAY_LABELS[d])}, “${sessionName(s)}”`;
        }
      } else {
        const s = r.sessions.find((x) => x.id === p.sessionId);
        if (s) return `${dayName(r.index)}, “${sessionName(s)}”`;
      }
    }
    return '';
  };

  async function add() {
    if (!sp || !pick) return;
    setBusy(true);
    try {
      let next: BuilderPlan = sp.plan;
      if (pick.kind === 'week') {
        if (payload.kind !== 'week') return;
        next = applyToWeek(sp.plan, pick.ref, payload.apply);
      } else if (!targetExists(sp.plan, pick)) {
        setDone({ ok: false, text: t('That place is no longer in the plan. Choose again.') });
        setPick(null);
        return;
      } else if (payload.kind === 'exercises') {
        next = addExercises(sp.plan, pick, payload.items);
        recordUseByDescription(payload.items.map((e) => e.description));
      } else if (payload.kind === 'session' && pick.kind !== 'session') {
        let failed = false;
        next = addSession(sp.plan, pick, (day) => {
          const s = payload.make(day);
          if (!s) failed = true;
          return s as BuilderSession;
        });
        if (failed) {
          setDone({ ok: false, text: t('This template could not be turned into a session.') });
          return;
        }
      }
      if (next === sp.plan) return;
      const where = describe(next, pick);
      upsertPlan({ ...sp, plan: next, updatedAt: '' });
      const name = sp.plan.name?.trim() || t('Untitled plan');
      let text = fill(t('Added to “{plan}”: {where}.'), { plan: name, where });
      let ok = true;
      if (online) {
        const outcome = await library.publish(sp.id, next);
        if (outcome === 'offline')
          text = `${text} ${t('Not synced yet: it goes to the library on the next sync.')}`;
        if (outcome === 'conflict') {
          ok = false;
          text = t('Changed on another device at the same time. Open it to choose which version to keep.');
        }
      }
      setDone({ ok, text });
      if (ok) onAdded?.();
    } finally {
      setBusy(false);
    }
  }

  const chip = 'block w-full truncate rounded px-1.5 py-1 text-left text-[11px] font-bold leading-tight';
  const sessionChip = (s: BuilderSession): ReactNode => {
    if (payload.kind !== 'exercises')
      return (
        <span key={s.id} className={`${chip} bg-surface text-text/80`} title={sessionName(s)}>
          {sessionName(s)}
        </span>
      );
    const on = pick?.kind === 'session' && pick.sessionId === s.id;
    return (
      <button
        key={s.id}
        onClick={() => setPick({ kind: 'session', sessionId: s.id })}
        aria-pressed={on}
        title={`${sessionName(s)} · ${s.exercises.length}`}
        className={`${chip} ${on ? 'bg-accent text-ink' : 'bg-surface text-text hover:bg-accent/30'}`}
      >
        {sessionName(s)} <span className="font-normal opacity-70">· {s.exercises.length}</span>
      </button>
    );
  };
  const newBtn = (target: Exclude<PlanTarget, { kind: 'session' }>, on: boolean, label = `+ ${t('new')}`) => (
    <button
      onClick={() => setPick(target)}
      aria-pressed={on}
      className={`${chip} border border-dashed ${
        on ? 'border-accent bg-accent text-ink' : 'border-accent/50 text-accent hover:bg-accent/15'
      }`}
    >
      {label}
    </button>
  );

  const rows = sp ? planRows(sp.plan) : [];
  const weekPayload = payload.kind === 'week';
  const hint =
    payload.kind === 'exercises'
      ? t('Choose a session to add them to, or “+ new” for a new session on that day.')
      : payload.kind === 'session'
        ? t('Choose the day for this session.')
        : t('Choose the week. Its sessions are added to the ones already there.');

  const title =
    payload.kind === 'exercises'
      ? fill(t(payload.items.length === 1 ? 'Add {n} exercise to a plan' : 'Add {n} exercises to a plan'), {
          n: payload.items.length,
        })
      : fill(t('Add “{name}” to a plan'), { name: payload.name });

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-3 sm:items-center"
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="board flex max-h-[92vh] w-full max-w-3xl flex-col gap-3 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-heading text-base text-text">{title}</h3>
            {payload.kind === 'exercises' && (
              <p className="truncate text-xs text-textDim">{payload.items.map((e) => e.description).join(' · ')}</p>
            )}
          </div>
          <button onClick={onClose} disabled={busy} className="px-1 text-textDim hover:text-text" aria-label={t('Close')}>
            ✕
          </button>
        </div>

        {done?.ok ? (
          <>
            <p className="text-sm text-recover" role="status">
              {done.text}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button onClick={() => sp && navigate(`/plan/${sp.id}`)} className="pill px-3 py-1.5 text-sm">
                {t('Open the plan')}
              </button>
              <button onClick={onClose} className="pill pill-on btn-raised px-4 py-1.5 text-sm">
                {t('Done')}
              </button>
            </div>
          </>
        ) : !sp ? (
          <>
            <p className="text-xs font-bold text-textDim">{t('1 · Choose the plan')}</p>
            {usable.length > 6 && (
              <input
                className="field h-8 py-1 text-sm"
                placeholder={t('Search plans')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            )}
            {usable.length === 0 ? (
              <p className="text-sm text-textDim">
                {t('No saved plans yet.')}{' '}
                <button onClick={() => navigate('/plan/new')} className="text-accent hover:underline">
                  {t('Build your first plan')}
                </button>
              </p>
            ) : (
              <div className="min-h-0 space-y-1.5 overflow-y-auto">
                {listed.map((p) => {
                  const who = whoHas(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => choosePlan(p.id)}
                      className="flex w-full flex-wrap items-baseline gap-x-3 rounded-lg border border-border bg-abyss px-3 py-2 text-left hover:border-accent"
                    >
                      <span className="min-w-0 flex-1 truncate font-heading text-text">
                        {p.plan.name?.trim() || t('Untitled plan')}
                      </span>
                      <span className="text-xs text-textDim">
                        {p.plan.kind === 'season' ? t('Season') : t('Training')} · <PlanSpan plan={p.plan} />
                      </span>
                      <span className="w-full truncate text-xs text-textDim">
                        {who.length ? who.join(', ') : t('not assigned')}
                      </span>
                    </button>
                  );
                })}
                {listed.length === 0 && <p className="text-sm text-textDim">{t('No plans match.')}</p>}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-3 rounded-lg border border-accent/60 bg-abyss px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-heading text-text">
                {sp.plan.name?.trim() || t('Untitled plan')}
              </span>
              <span className="truncate text-xs text-textDim">
                {whoHas(sp.id).join(', ') || t('not assigned')}
              </span>
              <button onClick={() => choosePlan(null)} disabled={busy} className="text-xs font-bold text-accent hover:underline">
                {t('Change plan')}
              </button>
            </div>

            {weekPayload && isDayPlan(sp.plan) ? (
              <p className="text-sm text-amber">
                {t('This plan is built from single days. A week template needs a plan with weeks.')}
              </p>
            ) : (
              <>
                <p className="text-xs font-bold text-textDim">2 · {hint}</p>
                <div className="min-h-0 space-y-1 overflow-y-auto pr-1">
                  {rows.some((r) => r.kind === 'week') && (
                    <div className="sticky top-0 z-10 grid grid-cols-[3.2rem_repeat(7,minmax(0,1fr))] gap-1 bg-panel pb-1 text-[10px] font-bold text-textDim">
                      <span />
                      {DAY_LABELS.map((d) => (
                        <span key={d}>{t(d)}</span>
                      ))}
                    </div>
                  )}
                  {rows.map((r) => {
                    if (r.kind === 'day') {
                      const on = pick?.kind === 'day' && pick.index === r.index;
                      return (
                        <div key={`d${r.index}`} className="grid grid-cols-[3.2rem_minmax(0,1fr)] items-start gap-1">
                          <span className="pt-1.5 text-[11px] font-bold text-textDim">{dayName(r.index)}</span>
                          <div className="flex flex-wrap gap-1 rounded-md border border-border bg-abyss p-1 [&>*]:w-auto [&>*]:max-w-[12rem]">
                            {r.sessions.map(sessionChip)}
                            {newBtn({ kind: 'day', index: r.index }, on)}
                          </div>
                        </div>
                      );
                    }
                    const rowOn = pick?.kind === 'week' && pick.ref !== 'new' && sameRef(pick.ref, r.ref);
                    const phase = r.phase !== null ? sp.plan.phases[r.phase] : null;
                    const cells = r.days.map((list, d) => {
                      const on = pick?.kind === 'weekDay' && sameRef(pick.ref, r.ref) && pick.dayOfWeek === d;
                      return (
                        <div key={d} className="min-h-[2.6rem] space-y-1 rounded-md border border-border bg-abyss p-1">
                          {list.map(sessionChip)}
                          {!weekPayload && newBtn({ kind: 'weekDay', ref: r.ref, dayOfWeek: d }, on)}
                        </div>
                      );
                    });
                    const label = (
                      <span className="pt-1.5 text-[11px] font-bold leading-tight text-textDim">
                        {weekName(r.number)}
                        {phase && r.ref.week === 0 && (
                          <span className="block truncate font-normal">{phase.name}</span>
                        )}
                      </span>
                    );
                    const grid = 'grid grid-cols-[3.2rem_repeat(7,minmax(0,1fr))] items-stretch gap-1';
                    return weekPayload ? (
                      <button
                        key={`w${r.number}`}
                        onClick={() => setPick({ kind: 'week', ref: r.ref })}
                        aria-pressed={rowOn}
                        className={`${grid} w-full rounded-lg p-1 text-left ${rowOn ? 'bg-accent/20 ring-2 ring-accent' : 'hover:bg-accent/10'}`}
                      >
                        {label}
                        {cells}
                      </button>
                    ) : (
                      <div key={`w${r.number}`} className={grid}>
                        {label}
                        {cells}
                      </div>
                    );
                  })}
                  {weekPayload && (
                    <div className="pt-1">
                      <button
                        onClick={() => setPick({ kind: 'week', ref: 'new' })}
                        aria-pressed={pick?.kind === 'week' && pick.ref === 'new'}
                        className={`${chip} border border-dashed ${
                          pick?.kind === 'week' && pick.ref === 'new'
                            ? 'border-accent bg-accent text-ink'
                            : 'border-accent/50 text-accent hover:bg-accent/15'
                        }`}
                      >
                        + {t('New week at the end')}
                      </button>
                    </div>
                  )}
                  {!weekPayload && isDayPlan(sp.plan) && (
                    <div className="grid grid-cols-[3.2rem_minmax(0,1fr)] gap-1 pt-1">
                      <span />
                      {newBtn({ kind: 'newDay' }, pick?.kind === 'newDay', `+ ${t('New day at the end')}`)}
                    </div>
                  )}
                </div>
              </>
            )}

            {done && !done.ok && <p className="text-sm text-red">{done.text}</p>}
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <p className="min-w-40 flex-1 text-xs text-textDim">
                {pick ? `${t('Adds to')}: ${describe(sp.plan, pick)}` : ''}
              </p>
              <button onClick={onClose} disabled={busy} className="pill px-3 py-1.5 text-sm">
                {t('Cancel')}
              </button>
              <button
                onClick={() => void add()}
                disabled={!pick || busy}
                className="pill pill-on btn-raised px-4 py-1.5 text-sm disabled:opacity-50"
              >
                {busy ? t('Saving…') : t('Add to plan')}
              </button>
            </div>
          </>
        )}
        {library.dialogs}
      </div>
    </div>,
    document.body,
  );
}
