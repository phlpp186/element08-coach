/**
 * BlockEditor: one athlete's app block, a week at a time. Her reports on
 * each session, the coach's edits (✕ a line, add an exercise, delete or add
 * a session), her numbers and the block's options. The plan and every change
 * come in through `draft` (useBlockDraft); saving is the caller's.
 */
import { useMemo, useState, type ReactNode } from 'react';
import {
  accessories,
  addExercise,
  addLocalLine,
  canRemoveLine,
  currentWeekIndex,
  deleteSession,
  flatWeeks,
  isBlockSession,
  isUnplaced,
  newAddId,
  removedLines,
  removedSessionsInWeek,
  removeLine,
  removeLocalLine,
  sessionSlot,
  sessionsByDay,
  toggleRemoved,
  undoDrop,
  type BlockExercise,
  type BlockSession,
  type FlatWeek,
  type HerState,
  type PhoneStatus,
  type RemovedLine,
  type Report,
  type SessionMeta,
  type SetsItem,
} from '../../lib/appBlock';
import { addDays, calendarFormat, formatIso, todayIso } from '../../lib/e08plan';
import { fill, useT } from '../../i18n';
import type { BlockDraft, DraftStatus } from './useBlockDraft';
import { AddExerciseDialog, AddSessionDialog } from './BlockDialogs';
import { HerNumbers, HowItWorks } from './BlockPanels';

export interface SaveState {
  state: 'idle' | 'saving' | 'saved' | 'conflict' | 'error';
  message?: string;
}

const DAY_FMT = calendarFormat({ weekday: 'short', day: 'numeric', month: 'short' });
/** Her own sessions change here even when the block service cannot be asked. */
const LOCAL_OK = new Set<DraftStatus>(['ready', 'unavailable', 'failed', 'notCoach']);

export const tagClass = 'inline-block rounded-md px-1.5 py-0.5 text-[11px] font-heading uppercase tracking-wide';

/** "14:02" today, else "9 Nov 14:02". */
export function shortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString()
    ? time
    : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`;
}

export function BlockEditor({
  draft,
  title,
  phone,
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
  const weeks = useMemo(() => flatWeeks(plan), [plan]);
  const [sel, setSel] = useState(() => currentWeekIndex(weeks, todayIso()));
  const [adding, setAdding] = useState<BlockSession | null>(null);
  const [addingSession, setAddingSession] = useState(false);
  const [showHow, setShowHow] = useState(true);
  const w: FlatWeek | undefined = weeks[Math.min(sel, weeks.length - 1)];
  const info = draft.info;
  const names = info?.exercises ?? {};
  const canServer = draft.status === 'ready' && !draft.busy;
  const canLocal = LOCAL_OK.has(draft.status) && !draft.busy;
  const src = plan.source;
  const sessionCount = weeks.reduce((n, x) => n + (x.week.plannedSessions?.length ?? 0), 0);

  const removeLineAt = (s: BlockSession, line: BlockExercise, everyFrom: number | null) => {
    if (!isBlockSession(s.id)) {
      draft.local((p) => removeLocalLine(p, s.id, line.id));
      return;
    }
    void draft.change({ edits: removeLine(src?.edits, s, line, everyFrom) });
  };
  const undoLine = (r: RemovedLine) => void draft.change({ edits: undoDrop(src?.edits, r.drop) });
  const deleteAt = (s: BlockSession) => {
    if (isBlockSession(s.id)) {
      void draft.change({ removed: toggleRemoved(src?.removed, s.id, true) });
      return;
    }
    if (confirm(t('Delete this session you added? It cannot be brought back.')))
      draft.local((p) => deleteSession(p, s.id));
  };
  const undoDelete = (id: string) => void draft.change({ removed: toggleRemoved(src?.removed, id, false) });
  const addTo = (s: BlockSession, item: SetsItem, everyFrom: number | null) => {
    if (!isBlockSession(s.id)) {
      draft.local((p) => addLocalLine(p, s.id, item, info?.tested ?? []));
      return Promise.resolve(true);
    }
    return draft.change({ edits: addExercise(src?.edits, s, newAddId(), item, everyFrom) });
  };

  const days = w ? sessionsByDay(w.week) : [];
  const deleted = w ? removedSessionsInWeek(plan, w.number, draft.known) : [];
  const unplaced = w ? (w.week.plannedSessions ?? []).filter(isUnplaced) : [];
  const dayRows = new Map<number, { sessions: BlockSession[]; deleted: SessionMeta[] }>();
  for (const d of days) dayRows.set(d.day, { sessions: d.sessions, deleted: [] });
  for (const m of deleted.filter((x) => !x.floating)) {
    const row = dayRows.get(m.dayOfWeek) ?? { sessions: [], deleted: [] };
    row.deleted.push(m);
    dayRows.set(m.dayOfWeek, row);
  }
  const deletedAny = deleted.filter((x) => x.floating);

  const card = (s: BlockSession) => (
    <SessionCard
      key={s.id}
      session={s}
      week={w!}
      removed={removedLines(plan, s.id, names)}
      report={reports.get(s.id) ?? null}
      logHref={logHref}
      canServer={canServer}
      canLocal={canLocal}
      onRemove={(line, every) => removeLineAt(s, line, every)}
      onUndo={undoLine}
      onAdd={() => setAdding(s)}
      onDelete={() => deleteAt(s)}
    />
  );
  const deletedCard = (m: SessionMeta) => (
    <div key={m.id} className="board p-3 opacity-60">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-heading text-text line-through">{m.label}</span>
        <button
          onClick={() => undoDelete(m.id)}
          disabled={!canServer}
          className={`${tagClass} bg-amber/15 text-amber hover:underline disabled:opacity-50`}
        >
          {t('Deleted')} · {t('Undo')}
        </button>
      </div>
    </div>
  );

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-5 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg text-text">{title}</h2>
          <PhoneTag phone={phone} />
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

      {weeks.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist">
          {weeks.map((x) => {
            const all = x.week.plannedSessions ?? [];
            const done = all.filter((s) => reports.has(s.id)).length;
            const on = x.index === w?.index;
            const now = x.index === currentWeekIndex(weeks, todayIso());
            return (
              <button
                key={x.index}
                role="tab"
                aria-selected={on}
                onClick={() => setSel(x.index)}
                title={now ? t('This week') : undefined}
                className={`flex min-w-[3.25rem] shrink-0 flex-col items-center rounded-lg border px-2 pb-1.5 pt-1 text-[11px] ${
                  on ? 'border-accent bg-accent text-ink' : 'border-border bg-panel text-textDim hover:border-accent'
                } ${now && !on ? 'ring-2 ring-accent/60' : ''}`}
              >
                <span className="font-heading uppercase">{x.isTest ? t('Test') : t('Wk')}</span>
                <span className={`font-num text-base font-bold leading-tight ${on ? 'text-ink' : 'text-text'}`}>{x.number}</span>
                <span className={`mt-1 h-1 w-full overflow-hidden rounded-full ${on ? 'bg-ink/25' : 'bg-abyss'}`}>
                  <span
                    className={`block h-full rounded-full ${on ? 'bg-ink' : 'bg-recover'}`}
                    style={{ width: `${all.length ? Math.round((done / all.length) * 100) : 0}%` }}
                  />
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="min-w-0 space-y-4">
          {w && dayRows.size === 0 && unplaced.length === 0 && deletedAny.length === 0 && (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-textDim">
              {t('No sessions this week.')}
            </p>
          )}
          {[...dayRows.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([day, row]) => (
              <section key={day} className="space-y-2">
                <DayHeading>{formatIso(DAY_FMT, addDays(w!.week.weekStart, day))}</DayHeading>
                {row.sessions.map(card)}
                {row.deleted.map(deletedCard)}
              </section>
            ))}
          {(unplaced.length > 0 || deletedAny.length > 0) && (
            <section className="space-y-2">
              <DayHeading>
                {t('Any day this week')}{' '}
                <span className="font-body normal-case tracking-normal text-textDim">· {t('she places them')}</span>
              </DayHeading>
              {unplaced.map(card)}
              {deletedAny.map(deletedCard)}
            </section>
          )}
          {w && (
            <button
              onClick={() => setAddingSession(true)}
              disabled={!canLocal}
              className="pill px-3 py-1.5 text-sm text-accent"
            >
              + {fill(t('Add session to week {n}'), { n: w.number })}
            </button>
          )}
        </div>

        <aside className="mt-5 space-y-4 lg:mt-0">
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
      </div>

      {adding && w && (
        <AddExerciseDialog
          session={adding}
          week={w}
          info={info}
          onClose={() => setAdding(null)}
          onAdd={async (item, everyFrom) => {
            if (await addTo(adding, item, everyFrom)) setAdding(null);
          }}
          busy={draft.busy}
          blockSession={isBlockSession(adding.id) && !!sessionSlot(adding.id)}
        />
      )}
      {addingSession && w && (
        <AddSessionDialog
          plan={plan}
          week={w}
          onClose={() => setAddingSession(false)}
          onAdd={(fn) => {
            draft.local(fn);
            setAddingSession(false);
          }}
        />
      )}

      <SaveBar
        weeks={weeks.length}
        sessions={sessionCount}
        dirty={draft.dirty}
        busy={draft.busy}
        save={save}
        canSave={draft.status !== 'newer' && draft.status !== 'notBlock'}
        onSave={onSave}
      />
    </main>
  );
}

function DayHeading({ children }: { children: ReactNode }) {
  return <h3 className="font-heading text-xs uppercase tracking-widest text-textDim">{children}</h3>;
}

function PhoneTag({ phone }: { phone: { status: PhoneStatus; at: string | null } }) {
  const t = useT();
  if (phone.status === 'onPhone')
    return (
      <span className={`${tagClass} mt-1 bg-recover/15 text-recover`}>
        {fill(t('On her phone {time}'), { time: phone.at ? shortTime(phone.at) : '' })}
      </span>
    );
  if (phone.status === 'waiting')
    return <span className={`${tagClass} mt-1 bg-amber/15 text-amber`}>{t('Waiting for her phone')}</span>;
  return <span className={`${tagClass} mt-1 bg-surface text-textDim`}>{t('Nothing from her phone yet')}</span>;
}

function StatusNote({ draft }: { draft: BlockDraft }) {
  const t = useT();
  const box = (tone: string, children: ReactNode) => (
    <div className={`rounded-xl border px-4 py-3 text-sm ${tone}`}>{children}</div>
  );
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
      {draft.status === 'newer' &&
        box('border-amber/50 bg-amber/5 text-amber', t('Made by a newer app version. Update the portal first.'))}
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

function SessionCard({
  session: s,
  week,
  removed,
  report,
  logHref,
  canServer,
  canLocal,
  onRemove,
  onUndo,
  onAdd,
  onDelete,
}: {
  session: BlockSession;
  week: FlatWeek;
  removed: RemovedLine[];
  report: Report | null;
  logHref: ((sessionId: string) => string) | null;
  canServer: boolean;
  canLocal: boolean;
  onRemove: (line: BlockExercise, everyFrom: number | null) => void;
  onUndo: (r: RemovedLine) => void;
  onAdd: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const [asking, setAsking] = useState<string | null>(null);
  const fromBlock = isBlockSession(s.id);
  const slot = fromBlock ? sessionSlot(s.id) : null;
  const can = fromBlock ? canServer : canLocal;
  const label = s.label?.trim() || t('Session');
  const weekday = report ? new Date(report.at).toLocaleDateString([], { weekday: 'short' }) : '';

  return (
    <div className="board space-y-1 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className="font-heading text-text">{label}</span>
          {s.optional && <span className={`${tagClass} bg-surface text-textDim`}>{t('Optional')}</span>}
          {!fromBlock && <span className={`${tagClass} bg-accent/15 text-accent`}>{t('Added')}</span>}
        </span>
        {report && (
          <span className="flex items-center gap-1.5">
            <span className={`${tagClass} bg-recover/15 text-recover`}>
              {fill(t('Done {day}'), { day: weekday })}
              {report.rating != null && ` · ${fill(t('Effort {n}'), { n: report.rating })}`}
            </span>
            {logHref && (
              <a href={logHref(s.id)} className="pill px-2 py-0.5 text-xs">
                {t('Her log')}
              </a>
            )}
          </span>
        )}
      </div>

      {s.exercises.map((line) => {
        const removable = canRemoveLine(s, line);
        return (
          <div key={line.id} className="border-t border-border/50 pt-1">
            <div className="flex items-start gap-2 text-sm">
              <span className="min-w-0 flex-1 text-text">{line.description}</span>
              {line.edit && <span className={`${tagClass} shrink-0 bg-accent/15 text-accent`}>{t('Added')}</span>}
              {removable && (
                <button
                  onClick={() => (slot ? setAsking(asking === line.id ? null : line.id) : onRemove(line, null))}
                  disabled={!can}
                  className="shrink-0 px-1 text-textDim hover:text-red disabled:opacity-40"
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
                    onRemove(line, null);
                  }}
                  className="pill px-2 py-0.5"
                >
                  {t('This session')}
                </button>
                <button
                  onClick={() => {
                    setAsking(null);
                    onRemove(line, week.number);
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
          </div>
        );
      })}

      {removed.map((r) => (
        <div key={`${r.drop.ex}-${r.drop.session ?? `${r.drop.slot}-${r.drop.from}`}`} className="flex items-start gap-2 border-t border-border/50 pt-1 text-sm">
          <span className="min-w-0 flex-1 text-textDim line-through">{r.name}</span>
          <button
            onClick={() => onUndo(r)}
            disabled={!canServer}
            className={`${tagClass} shrink-0 bg-amber/15 text-amber hover:underline disabled:opacity-50`}
            title={r.fromWeek != null ? fill(t('Brings it back in every {label} from week {n}'), { label, n: r.fromWeek }) : undefined}
          >
            {r.fromWeek != null ? fill(t('Removed from week {n} on'), { n: r.fromWeek }) : t('Removed')} · {t('Undo')}
          </button>
        </div>
      ))}

      <div className="flex flex-wrap gap-2 pt-2">
        <button onClick={onAdd} disabled={!can} className="pill px-2.5 py-1 text-xs">
          + {t('Add exercise')}
        </button>
        <button onClick={onDelete} disabled={!can} className="pill px-2.5 py-1 text-xs hover:text-red">
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
  onSave,
}: {
  weeks: number;
  sessions: number;
  dirty: boolean;
  busy: boolean;
  save: SaveState;
  canSave: boolean;
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
              · {t('Saved')} ✓ {t('She gets it at her next sync.')}
            </span>
          )}
          {save.state === 'conflict' && (
            <span className="ml-2 text-red">
              ·{' '}
              {t('Changed elsewhere (in the app) since you opened it. This is the newer version: your changes were not saved.')}
            </span>
          )}
          {save.state === 'error' && (
            <span className="ml-2 text-red">· {fill(t('Could not save: {error}'), { error: save.message ?? '' })}</span>
          )}
          {dirty && save.state !== 'saving' && <span className="ml-2 text-amber">· {t('Unsaved changes')}</span>}
        </div>
        <button
          onClick={onSave}
          disabled={!canSave || !dirty || busy || save.state === 'saving'}
          className="pill pill-on btn-raised px-4 py-2"
        >
          {t('Save')}
        </button>
      </div>
    </div>
  );
}
