/**
 * BlockEditor: one athlete's app block, laid out like the plan builder's
 * season: the plan's phases as collapsible cards, each week inside as a
 * Mon–Sun grid with an "Any day this week" row. Every session shows her
 * report and the coach's edits (✕ a line, add an exercise, delete or add a
 * session); her numbers and the block's options sit beside it. The plan and
 * every change come in through `draft` (useBlockDraft); saving and sending
 * are the caller's.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  accessories,
  addExercise,
  addLocalLine,
  canRemoveLine,
  currentWeekIndex,
  deleteSession,
  flatPhases,
  flatWeeks,
  isBlockSession,
  isThisWeek,
  isUnplaced,
  modeOf,
  newAddId,
  phaseOfWeek,
  removedLines,
  removedSessionsInWeek,
  removeLine,
  removeLocalLine,
  sessionInfoOf,
  sessionSlot,
  setSessionInfo,
  toggleRemoved,
  undoDrop,
  type BlockExercise,
  type BlockSession,
  type DayChoice,
  type FlatPhase,
  type FlatWeek,
  type HerState,
  type PhoneStatus,
  type RemovedLine,
  type Report,
  type SessionMeta,
  type SessionMode,
  type SetsItem,
} from '../../lib/appBlock';
import { addDays, calendarFormat, DAY_LABELS, formatIso, MESO_LABEL, todayIso, type MesoType } from '../../lib/e08plan';
import { fill, useT } from '../../i18n';
import type { BlockDraft, DraftStatus } from './useBlockDraft';
import { AddExerciseDialog, AddSessionDialog, SessionInfoDialog } from './BlockDialogs';
import { HerNumbers, HowItWorks } from './BlockPanels';

export interface SaveState {
  state: 'idle' | 'saving' | 'saved' | 'conflict' | 'error';
  message?: string;
}

/** The plan is not on her phone yet: who it is for, and how to send it. */
export interface SendOffer {
  name: string;
  state: 'idle' | 'sending' | 'error';
  message?: string;
  onSend: () => void;
}

const DAY_DATE_FMT = calendarFormat({ day: 'numeric', month: 'short' });
/** Her own sessions change here even when the block service cannot be asked. */
const LOCAL_OK = new Set<DraftStatus>(['ready', 'unavailable', 'failed', 'notCoach']);

export const tagClass = 'inline-block rounded-md px-1.5 py-0.5 text-[11px] font-heading uppercase tracking-wide';

/** Kind accents as the builder's template picker has them; general is plain. */
const MODE_TAG: Record<SessionMode, { label: string; cls: string } | null> = {
  depth: { label: 'Depth', cls: 'bg-accent/15 text-accent' },
  pool: { label: 'Pool', cls: 'bg-recover/15 text-recover' },
  dry: { label: 'Dry', cls: 'bg-amber/15 text-amber' },
  general: null,
};
const FLAG_LABEL: Record<string, string> = { deload: 'Deload', taper: 'Taper', test: 'Test week' };

/** "14:02" today, else "9 Nov 14:02". */
export function shortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString()
    ? time
    : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`;
}

/** What the week cards need to show and change a session. */
interface Handlers {
  names: Record<string, string>;
  reports: Map<string, Report>;
  logHref: ((sessionId: string) => string) | null;
  canServer: boolean;
  canLocal: boolean;
  known: Map<string, SessionMeta>;
  onRemove: (s: BlockSession, line: BlockExercise, everyFrom: number | null) => void;
  onUndoLine: (r: RemovedLine) => void;
  onAddExercise: (s: BlockSession, w: FlatWeek) => void;
  onEditInfo: (s: BlockSession, w: FlatWeek) => void;
  onDelete: (s: BlockSession) => void;
  onUndoDelete: (id: string) => void;
  onAddSession: (w: FlatWeek, day: DayChoice) => void;
}

export function BlockEditor({
  draft,
  title,
  phone,
  send,
  reports,
  her,
  logHref,
  save,
  onSave,
  onDone,
}: {
  draft: BlockDraft;
  title: string;
  phone: { status: PhoneStatus; at: string | null };
  /** Set while the athlete it is for does not have it yet. */
  send: SendOffer | null;
  reports: Map<string, Report>;
  her: HerState | null;
  /** Where "Her log" opens a reported session, null without an assignment. */
  logHref: ((sessionId: string) => string) | null;
  save: SaveState;
  onSave: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const plan = draft.plan!;
  const phases = useMemo(() => flatPhases(plan), [plan]);
  const weekCount = phases.reduce((n, p) => n + p.weeks.length, 0);
  const today = todayIso();
  const [current] = useState(() => currentWeekIndex(flatWeeks(plan), today));
  const [open, setOpen] = useState<Set<number>>(() => new Set([phaseOfWeek(phases, current)]));
  const [adding, setAdding] = useState<{ session: BlockSession; week: FlatWeek } | null>(null);
  const [addingSession, setAddingSession] = useState<{ week: FlatWeek; day: DayChoice } | null>(null);
  const [editingInfo, setEditingInfo] = useState<{ session: BlockSession; week: FlatWeek } | null>(null);
  const [showHow, setShowHow] = useState(() => typeof window === 'undefined' || window.matchMedia('(min-width: 1024px)').matches);
  const info = draft.info;
  const canServer = draft.status === 'ready' && !draft.busy;
  const canLocal = LOCAL_OK.has(draft.status) && !draft.busy;
  const src = plan.source;
  const sessionCount = phases.reduce((n, p) => n + p.weeks.reduce((m, w) => m + (w.week.plannedSessions?.length ?? 0), 0), 0);

  // Open on the week she is in, as the builder opens on its current week.
  useEffect(() => {
    if (current > 0) document.getElementById(`block-week-${current}`)?.scrollIntoView({ block: 'start' });
  }, [current]);

  const h: Handlers = {
    names: info?.exercises ?? {},
    reports,
    logHref,
    canServer,
    canLocal,
    known: draft.known,
    onRemove: (s, line, everyFrom) => {
      if (!isBlockSession(s.id)) draft.local((p) => removeLocalLine(p, s.id, line.id));
      else void draft.change({ edits: removeLine(src?.edits, s, line, everyFrom) });
    },
    onUndoLine: (r) => void draft.change({ edits: undoDrop(src?.edits, r.drop) }),
    onAddExercise: (session, week) => setAdding({ session, week }),
    onEditInfo: (session, week) => setEditingInfo({ session, week }),
    onDelete: (s) => {
      if (isBlockSession(s.id)) void draft.change({ removed: toggleRemoved(src?.removed, s.id, true) });
      else if (confirm(t('Delete this session you added? It cannot be brought back.')))
        draft.local((p) => deleteSession(p, s.id));
    },
    onUndoDelete: (id) => void draft.change({ removed: toggleRemoved(src?.removed, id, false) }),
    onAddSession: (week, day) => setAddingSession({ week, day }),
  };

  const addTo = (s: BlockSession, item: SetsItem, everyFrom: number | null) => {
    if (!isBlockSession(s.id)) {
      draft.local((p) => addLocalLine(p, s.id, item, info?.tested ?? []));
      return Promise.resolve(true);
    }
    return draft.change({ edits: addExercise(src?.edits, s, newAddId(), item, everyFrom) });
  };

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg text-text">{title}</h2>
          {send ? <SendTag send={send} /> : <PhoneTag phone={phone} />}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowHow((v) => !v)} className={`pill px-3 py-1.5 text-sm ${showHow ? 'pill-on' : ''}`}>
            {t('How it works')}
          </button>
          <button onClick={onDone} className="pill px-3 py-1.5 text-sm">
            {t('Done')}
          </button>
        </div>
      </div>

      <StatusNote draft={draft} />

      <div className="gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <aside className="mb-5 space-y-4 lg:col-start-2 lg:row-start-1 lg:mb-0">
          <HerNumbers her={her} phone={phone.status} tests={plan.tests ?? []} />
          {showHow && src && (
            <HowItWorks
              source={src}
              info={info}
              accessories={info ? accessories(plan, info.mainLifts) : []}
              disabled={!canServer}
              onChange={(patch) => void draft.change(patch)}
            />
          )}
        </aside>

        <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-1">
          {phases.map((ph) => (
            <PhaseBlock
              key={ph.index}
              phase={ph}
              open={open.has(ph.index)}
              onToggle={() => toggle(ph.index)}
              today={today}
              plan={plan}
              h={h}
            />
          ))}
        </div>
      </div>

      {adding && (
        <AddExerciseDialog
          session={adding.session}
          week={adding.week}
          info={info}
          onClose={() => setAdding(null)}
          onAdd={async (item, everyFrom) => {
            if (await addTo(adding.session, item, everyFrom)) setAdding(null);
          }}
          busy={draft.busy}
          blockSession={isBlockSession(adding.session.id) && !!sessionSlot(adding.session.id)}
        />
      )}
      {editingInfo && (
        <SessionInfoDialog
          session={editingInfo.session}
          week={editingInfo.week}
          onClose={() => setEditingInfo(null)}
          onSave={(next) => {
            draft.local((p) => setSessionInfo(p, editingInfo.session.id, next));
            setEditingInfo(null);
          }}
        />
      )}
      {addingSession && (
        <AddSessionDialog
          plan={plan}
          week={addingSession.week}
          day={addingSession.day}
          onClose={() => setAddingSession(null)}
          onAdd={(fn) => {
            draft.local(fn);
            setAddingSession(null);
          }}
        />
      )}

      <SaveBar
        weeks={weekCount}
        sessions={sessionCount}
        dirty={draft.dirty}
        busy={draft.busy}
        save={save}
        canSave={draft.status !== 'newer' && draft.status !== 'notBlock'}
        sent={!send}
        onSave={onSave}
      />
    </main>
  );
}

/** One phase: a one-line summary, and its weeks when open (the builder's PhaseCard). */
function PhaseBlock({
  phase,
  open,
  onToggle,
  today,
  plan,
  h,
}: {
  phase: FlatPhase;
  open: boolean;
  onToggle: () => void;
  today: string;
  plan: BlockPlan;
  h: Handlers;
}) {
  const t = useT();
  const len = phase.weeks.length;
  const name =
    phase.name || (phase.type && phase.type in MESO_LABEL ? t(MESO_LABEL[phase.type as MesoType]) : '');
  const now = phase.weeks.some((w) => isThisWeek(w, today));
  return (
    <div className="glass-card rounded-xl">
      <button onClick={onToggle} aria-expanded={open} className="flex w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 p-3 text-left sm:p-4">
        <span className="w-3 shrink-0 text-sm text-textDim">{open ? '▾' : '▸'}</span>
        <span className="shrink-0 font-heading text-accent">
          {t('PHASE')} {phase.index + 1}
        </span>
        {name && <span className="min-w-0 font-heading text-text">{name}</span>}
        {now && <span className={`${tagClass} bg-accent/15 text-accent`}>{t('This week')}</span>}
        <span className="basis-full pl-5 text-xs text-textDim">
          {fill(t(len === 1 ? '{n} week' : '{n} weeks'), { n: len })}
          {phase.start && ` · ${formatIso(DAY_DATE_FMT, phase.start)} – ${formatIso(DAY_DATE_FMT, phase.end)}`}
        </span>
      </button>
      {open && (
        <div className="space-y-3 px-2 pb-3 sm:px-4 sm:pb-4">
          {phase.weeks.map((w) => (
            <WeekBlock key={w.index} w={w} now={isThisWeek(w, today)} plan={plan} h={h} />
          ))}
        </div>
      )}
    </div>
  );
}

type BlockPlan = NonNullable<BlockDraft['plan']>;

/** One week: heading, a Mon–Sun grid and the floating row (the builder's WeekCard). */
function WeekBlock({ w, now, plan, h }: { w: FlatWeek; now: boolean; plan: BlockPlan; h: Handlers }) {
  const t = useT();
  const all = w.week.plannedSessions ?? [];
  const done = all.filter((s) => h.reports.has(s.id)).length;
  const deleted = removedSessionsInWeek(plan, w.number, h.known);
  const flag = w.week.flag && !(w.isTest && w.week.flag === 'test') ? w.week.flag : null;
  const placed = all.filter((s) => !isUnplaced(s));
  const dayOf = (s: { dayOfWeek: number }) => Math.min(6, Math.max(0, Math.floor(s.dayOfWeek ?? 0)));

  const card = (s: BlockSession) => (
    <SessionCard
      key={s.id}
      session={s}
      week={w}
      removed={removedLines(plan, s.id, h.names)}
      report={h.reports.get(s.id) ?? null}
      h={h}
    />
  );
  const deletedCard = (m: SessionMeta) => (
    <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border px-2.5 py-1.5 opacity-70">
      <span className="min-w-0 text-sm text-textDim line-through">{m.label}</span>
      <button
        onClick={() => h.onUndoDelete(m.id)}
        disabled={!h.canServer}
        className={`${tagClass} bg-amber/15 text-amber hover:underline disabled:opacity-50`}
      >
        {t('Deleted')} · {t('Undo')}
      </button>
    </div>
  );
  const addButton = (day: DayChoice) => (
    <button onClick={() => h.onAddSession(w, day)} disabled={!h.canLocal} className="text-xs text-textDim hover:text-accent disabled:opacity-40">
      {t('+ session')}
    </button>
  );

  return (
    <div
      id={`block-week-${w.index}`}
      className={`scroll-mt-4 space-y-3 rounded-xl border bg-abyss p-3 sm:p-4 ${now ? 'border-accent/70' : 'border-border'}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="whitespace-nowrap font-heading text-accent">
          {w.isTest ? t('TEST WEEK') : `${t('WEEK')} ${w.number}`}
        </span>
        {flag && <span className={`${tagClass} bg-surface text-textDim`}>{t(FLAG_LABEL[flag] ?? flag)}</span>}
        {now && <span className={`${tagClass} bg-accent/15 text-accent`}>{t('This week')}</span>}
        {all.length > 0 && (
          <span className="ml-auto text-xs text-textDim">{fill(t('{n} of {total} done'), { n: done, total: all.length })}</span>
        )}
      </div>

      <div className="space-y-2">
        {DAY_LABELS.map((dayLabel, day) => (
          <DayRow
            key={day}
            label={t(dayLabel)}
            sub={w.week.weekStart ? formatIso(DAY_DATE_FMT, addDays(w.week.weekStart, day)) : null}
          >
            {placed.filter((s) => dayOf(s) === day).map(card)}
            {deleted.filter((m) => !m.floating && dayOf(m) === day).map(deletedCard)}
            {addButton(day)}
          </DayRow>
        ))}
        <DayRow label={t('Any day')} sub={null}>
          {all.filter(isUnplaced).map(card)}
          {deleted.filter((m) => m.floating).map(deletedCard)}
          {addButton('any')}
        </DayRow>
      </div>
    </div>
  );
}

function DayRow({ label, sub, children }: { label: string; sub: string | null; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 sm:gap-3">
      <div className="w-16 shrink-0 pt-2 font-mono text-sm leading-tight text-textDim">
        <div>{label}</div>
        {sub && <div className="text-[10px] opacity-70">{sub}</div>}
      </div>
      <div className="min-w-0 flex-1 space-y-2 pt-1">{children}</div>
    </div>
  );
}

function PhoneTag({ phone }: { phone: { status: PhoneStatus; at: string | null } }) {
  const t = useT();
  if (phone.status === 'onPhone')
    return (
      <span className={`${tagClass} bg-recover/15 text-recover`}>
        {fill(t('On her phone {time}'), { time: phone.at ? shortTime(phone.at) : '' })}
      </span>
    );
  if (phone.status === 'waiting') return <span className={`${tagClass} bg-amber/15 text-amber`}>{t('Waiting for her phone')}</span>;
  return <span className={`${tagClass} bg-surface text-textDim`}>{t('Nothing from her phone yet')}</span>;
}

function SendTag({ send }: { send: SendOffer }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`${tagClass} bg-amber/15 text-amber`}>{t('Not sent yet')}</span>
      <button onClick={send.onSend} disabled={send.state === 'sending'} className="pill pill-on btn-raised px-3 py-1 text-sm">
        {send.state === 'sending' ? t('Sending…') : fill(t('Send to {name}'), { name: send.name })}
      </button>
      {send.state === 'error' && (
        <span className="text-xs text-red">{fill(t('Could not send: {error}'), { error: send.message ?? '' })}</span>
      )}
    </div>
  );
}

function StatusNote({ draft }: { draft: BlockDraft }) {
  const t = useT();
  const box = (tone: string, children: ReactNode) => <div className={`rounded-xl border px-4 py-3 text-sm ${tone}`}>{children}</div>;
  const failed = draft.failure;
  return (
    <>
      {draft.status === 'loading' && box('border-border text-textDim', t('Asking the block service…'))}
      {draft.status === 'unavailable' &&
        box(
          'border-amber/50 bg-amber/5 text-amber',
          <>
            <p className="font-bold">{t("The block service isn't available yet")}</p>
            <p className="text-textDim">
              {t('Exercise edits, deleted sessions and How it works need it. Your own sessions can still be added and saved.')}
            </p>
          </>,
        )}
      {draft.status === 'failed' &&
        box(
          'border-amber/50 bg-amber/5 text-amber',
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{t('The block service did not answer.')}</span>
            <button onClick={() => void draft.retry()} className="pill px-3 py-1 text-xs">
              {t('Try again')}
            </button>
          </div>,
        )}
      {draft.status === 'notCoach' && box('border-red/50 bg-red/5 text-red', t('Only coaches can change app blocks.'))}
      {draft.status === 'newer' && box('border-amber/50 bg-amber/5 text-amber', t('Made by a newer app version. Update the portal first.'))}
      {draft.status === 'notBlock' &&
        box(
          'border-border text-textDim',
          <>
            <p className="font-bold text-amber">{t('Built in the app')}</p>
            <p>{t('This plan was not made from an app block, so it is shown here as it is. Edit it in the ELEMENT | 08 app.')}</p>
          </>,
        )}
      {draft.busy && <p className="text-sm text-accent">{t('Changing the block…')}</p>}
      {failed && failed.reason === 'refused' && (
        <p className="text-sm text-red">{fill(t('The block service refused this change: {error}'), { error: failed.message })}</p>
      )}
      {failed && failed.reason === 'failed' && <p className="text-sm text-red">{t('The block service did not answer.')}</p>}
    </>
  );
}

/** One session in a day row: her report, its lines with ✕ and Undo, and its actions. */
function SessionCard({
  session: s,
  week,
  removed,
  report,
  h,
}: {
  session: BlockSession;
  week: FlatWeek;
  removed: RemovedLine[];
  report: Report | null;
  h: Handlers;
}) {
  const t = useT();
  const [asking, setAsking] = useState<string | null>(null);
  const fromBlock = isBlockSession(s.id);
  const slot = fromBlock ? sessionSlot(s.id) : null;
  const can = fromBlock ? h.canServer : h.canLocal;
  const label = s.label?.trim() || t('Session');
  const kind = MODE_TAG[modeOf(s)];
  const weekday = report ? new Date(report.at).toLocaleDateString([], { weekday: 'short' }) : '';
  const info = sessionInfoOf(s);

  return (
    <div className={`rounded-lg border bg-panel px-2.5 py-2 ${report ? 'border-recover/50' : 'border-border'}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="min-w-0 flex-1 text-sm font-bold text-text">{label}</span>
        {kind && <span className={`${tagClass} ${kind.cls}`}>{t(kind.label)}</span>}
        {s.optional && <span className={`${tagClass} bg-surface text-textDim`}>{t('Optional')}</span>}
        {info.target != null && (
          <span className={`${tagClass} bg-surface text-textDim`}>{fill(t('Target {n}'), { n: info.target })}</span>
        )}
        {!fromBlock && <span className={`${tagClass} bg-accent/15 text-accent`}>{t('Added')}</span>}
      </div>
      {info.notes && <p className="mt-1 whitespace-pre-line text-xs leading-snug text-textDim">{info.notes}</p>}
      {report && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className={`${tagClass} bg-recover/15 text-recover`}>
            {fill(t('Done {day}'), { day: weekday })}
            {report.rating != null && ` · ${fill(t('Effort {n}'), { n: report.rating })}`}
          </span>
          {h.logHref && (
            <a href={h.logHref(s.id)} className="pill px-2 py-0.5 text-xs">
              {t('Her log')}
            </a>
          )}
        </div>
      )}

      {(s.exercises.length > 0 || removed.length > 0) && (
        <ul className="mt-1.5 space-y-1">
          {s.exercises.map((line) => (
            <li key={line.id}>
              <div className="flex items-start gap-1.5 text-xs leading-snug">
                <span className="min-w-0 flex-1 break-words text-text/90">{line.description}</span>
                {line.edit && <span className={`${tagClass} shrink-0 bg-accent/15 text-accent`}>{t('Added')}</span>}
                {canRemoveLine(s, line) && (
                  <button
                    onClick={() => (slot ? setAsking(asking === line.id ? null : line.id) : h.onRemove(s, line, null))}
                    disabled={!can}
                    className="shrink-0 px-0.5 text-textDim hover:text-red disabled:opacity-40"
                    title={t('Remove')}
                    aria-label={t('Remove')}
                  >
                    ✕
                  </button>
                )}
              </div>
              {asking === line.id && slot && (
                <div className="mt-1 flex flex-wrap items-center gap-1.5 rounded-lg bg-abyss px-2 py-1.5 text-xs">
                  <span className="text-textDim">{t('Remove from')}</span>
                  <button
                    onClick={() => {
                      setAsking(null);
                      h.onRemove(s, line, null);
                    }}
                    className="pill px-2 py-0.5"
                  >
                    {t('This session')}
                  </button>
                  <button
                    onClick={() => {
                      setAsking(null);
                      h.onRemove(s, line, week.number);
                    }}
                    className="pill px-2 py-0.5"
                  >
                    {fill(t('Every {label} from week {n}'), { label, n: week.number })}
                  </button>
                  <button onClick={() => setAsking(null)} className="px-1 text-textDim hover:text-text">
                    {t('Cancel')}
                  </button>
                </div>
              )}
            </li>
          ))}
          {removed.map((r) => (
            <li
              key={`${r.drop.ex}-${r.drop.session ?? `${r.drop.slot}-${r.drop.from}`}`}
              className="flex flex-wrap items-start gap-1.5 text-xs"
            >
              <span className="min-w-0 flex-1 text-textDim line-through">{r.name}</span>
              <button
                onClick={() => h.onUndoLine(r)}
                disabled={!h.canServer}
                className={`${tagClass} shrink-0 bg-amber/15 text-amber hover:underline disabled:opacity-50`}
                title={r.fromWeek != null ? fill(t('Brings it back in every {label} from week {n}'), { label, n: r.fromWeek }) : undefined}
              >
                {r.fromWeek != null ? fill(t('Removed from week {n} on'), { n: r.fromWeek }) : t('Removed')} · {t('Undo')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        <button onClick={() => h.onAddExercise(s, week)} disabled={!can} className="text-xs text-textDim hover:text-accent disabled:opacity-40">
          {t('+ exercise')}
        </button>
        {!fromBlock && (
          <button onClick={() => h.onEditInfo(s, week)} disabled={!can} className="text-xs text-textDim hover:text-accent disabled:opacity-40">
            {t('Notes and effort')}
          </button>
        )}
        <button onClick={() => h.onDelete(s)} disabled={!can} className="text-xs text-textDim hover:text-red disabled:opacity-40">
          {t('Delete session')}
        </button>
      </div>
    </div>
  );
}

function SaveBar({
  weeks,
  sessions,
  dirty,
  busy,
  save,
  canSave,
  sent,
  onSave,
}: {
  weeks: number;
  sessions: number;
  dirty: boolean;
  busy: boolean;
  save: SaveState;
  canSave: boolean;
  /** She has the plan: a save reaches her phone. */
  sent: boolean;
  onSave: () => void;
}) {
  const t = useT();
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-abyss/95 px-5 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4">
        <div className="min-w-0 flex-1 text-sm text-textDim">
          {fill(t(weeks === 1 ? '{n} week' : '{n} weeks'), { n: weeks })} ·{' '}
          {fill(t(sessions === 1 ? '{n} session' : '{n} sessions'), { n: sessions })}
          {save.state === 'saving' && <span className="ml-2">· {t('Saving…')}</span>}
          {save.state === 'saved' && !dirty && (
            <span className="ml-2 text-recover">
              · {t('Saved')} ✓ {sent && t('She gets it at her next sync.')}
            </span>
          )}
          {save.state === 'conflict' && (
            <span className="ml-2 text-red">
              · {t('Changed elsewhere (in the app) since you opened it. This is the newer version: your changes were not saved.')}
            </span>
          )}
          {save.state === 'error' && <span className="ml-2 text-red">· {fill(t('Could not save: {error}'), { error: save.message ?? '' })}</span>}
          {dirty && save.state !== 'saving' && <span className="ml-2 text-amber">· {t('Unsaved changes')}</span>}
        </div>
        <button onClick={onSave} disabled={!canSave || !dirty || busy || save.state === 'saving'} className="pill pill-on btn-raised px-4 py-2">
          {t('Save')}
        </button>
      </div>
    </div>
  );
}
