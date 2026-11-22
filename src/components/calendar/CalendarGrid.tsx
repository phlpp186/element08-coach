/**
 * The plan as a calendar: one row per week, Monday to Sunday. One week at a
 * time opens in place into the big week (every exercise written out, the
 * week's phase, focus, intensity and notes); the session itself is edited in
 * the side panel. Combination 1 of element08-app/docs/mockups/
 * portal-plan-a-plus-b.html (Philipp 2026-11-21).
 *
 * Dragging a session moves it; with Option (Alt) held at the drop it copies.
 * The day says which before the drop (Philipp chose move, 2026-11-21).
 */
import { useState, type DragEvent, type ReactNode } from 'react';
import { fill, tr, useT } from '../../i18n';
import {
  addDays,
  calendarFormat,
  DAY_LABELS,
  exerciseText,
  formatIso,
  MESO_LABEL,
  MESO_TYPES,
  type BuilderPlan,
  type BuilderSession,
  type BuilderWeek,
  type MesoType,
  type PlanMode,
} from '../../lib/e08plan';
import { beforeStart, findSession, isPastSession, weekMonday, type CalWeek, type PlanCompetition } from '../../lib/planCalendar';
import { PHASE_HEX, PHASE_INK } from '../../lib/phaseColor';
import { dragging, endDrag, isOurs, readDrag, startDrag, type DragItem } from './dnd';

const DAY_FMT = calendarFormat({ day: 'numeric', month: 'short' });
const fmt = (iso: string) => formatIso(DAY_FMT, iso);
const dnum = (iso: string) => Number(iso.slice(8, 10));

const MODE_EDGE: Record<PlanMode, string> = {
  depth: 'border-l-modeDepth',
  pool: 'border-l-modePool',
  dry: 'border-l-modeDry',
  general: 'border-l-textDim',
};

const COLS = 'grid grid-cols-[136px_repeat(7,minmax(0,1fr))] gap-1';

export interface GridProps {
  plan: BuilderPlan;
  rows: CalWeek[];
  open: number;
  selected: string | null;
  today: string;
  competitions: PlanCompetition[];
  placing: boolean;
  menuWeek: number | null;
  onToggle: (week: number) => void;
  onAdd: (week: number, day: number) => void;
  onOpenSession: (id: string) => void;
  /** A click on a day or a week while a template waits to be placed. */
  onPlace: (week: number, day: number | null) => void;
  /** `before`: the session of that day it was dropped above, null = last. */
  onDrop: (item: DragItem, week: number, day: number | null, copy: boolean, before: string | null) => void;
  onDropExercise: (sessionId: string, description: string) => void;
  onWeekMenu: (week: number, anchor: HTMLElement) => void;
  onWeek: (week: number, patch: Partial<BuilderWeek>) => void;
  onPhase: (week: number, type: MesoType | null) => void;
  onAddWeeks: (n: number) => void;
}

interface Over {
  week: number;
  day: number | null;
  label: string;
  copy: boolean;
  /** Where a dragged session lands among the day's sessions: before this
   *  one, null = last, undefined = not a session. */
  before?: string | null;
}

/** The session of the day under the pointer's half: a session dropped in the
 *  upper half of a session goes before it. The dragged one itself does not
 *  count, so its own spot means "stay". */
function dropBefore(e: DragEvent, dragged: string): string | null {
  const els = (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-session]');
  for (const el of els) {
    if (el.dataset.session === dragged) continue;
    const r = el.getBoundingClientRect();
    if (e.clientY < r.top + r.height / 2) return el.dataset.session ?? null;
  }
  return null;
}

export function CalendarGrid(props: GridProps) {
  const t = useT();
  const [over, setOver] = useState<Over | null>(null);
  const { rows, open } = props;

  /** Drop hint for what is being dragged over this day (or week). */
  const hint = (e: DragEvent, week: number, day: number | null): Over | null => {
    const item = dragging();
    if (!item || item.k === 'exercise') return null;
    if (item.k === 'session') {
      if (day == null) return null;
      const at = findSession(rows, item.id);
      const before = dropBefore(e, item.id);
      // Its own day: a new place in the day's order. The date stays, so a
      // past session may move here too.
      if (at && at.week === week && at.session.dayOfWeek === day && !e.altKey)
        return { week, day, copy: false, label: t('Reorder'), before };
      // A past session is history: it is copied, its report stays on its day.
      if (isPastSession(props.plan, rows, item.id, props.today))
        return { week, day, copy: true, label: t('Copy here · past sessions stay'), before };
      return e.altKey
        ? { week, day, copy: true, label: t('Copy here'), before }
        : { week, day, copy: false, label: t('Move here · ⌥ copies'), before };
    }
    if (item.k === 'template') return day == null ? null : { week, day, copy: true, label: t('Add here') };
    return { week, day, copy: true, label: t('Add to this week') };
  };

  const dropZone = (week: number, day: number | null, disabled = false) =>
    disabled
      ? {}
      : {
          onDragOver: (e: DragEvent) => {
            if (!isOurs(e)) return;
            const h = hint(e, week, day);
            if (!h) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = h.copy ? 'copy' : 'move';
            if (!over || over.week !== h.week || over.day !== h.day || over.copy !== h.copy || over.before !== h.before)
              setOver(h);
          },
          onDragLeave: (e: DragEvent) => {
            if (!(e.currentTarget as Node).contains(e.relatedTarget as Node | null)) setOver(null);
          },
          onDrop: (e: DragEvent) => {
            const item = readDrag(e);
            setOver(null);
            endDrag();
            if (!item || item.k === 'exercise') return;
            e.preventDefault();
            const before = item.k === 'session' && day != null ? dropBefore(e, item.id) : null;
            props.onDrop(item, week, day, e.altKey, before);
          },
        };

  const isOver = (week: number, day: number | null) => over && over.week === week && over.day === day;
  const insertAt = (week: number, day: number) => (isOver(week, day) ? over!.before : undefined);
  const overLabel = (week: number, day: number | null) =>
    isOver(week, day) ? (
      <span
        className={`pointer-events-none absolute inset-x-1 bottom-1 z-10 rounded px-1 text-center text-[10px] font-bold ${
          over!.copy ? 'bg-amber text-ink' : 'bg-accent text-ink'
        }`}
      >
        {over!.label}
      </span>
    ) : null;

  return (
    <div className="min-w-[760px] space-y-1" onDragEnd={() => (setOver(null), endDrag())}>
      <div className={`${COLS} text-center text-xs font-bold text-textDim`}>
        <span />
        {DAY_LABELS.map((d) => (
          <span key={d}>{t(d)}</span>
        ))}
      </div>
      {rows.map((r, w) =>
        w === open ? (
          <OpenWeek key={w} {...props} row={r} index={w} dropZone={dropZone} overLabel={overLabel} isOver={isOver} insertAt={insertAt} />
        ) : (
          <WeekRow key={w} {...props} row={r} index={w} dropZone={dropZone} overLabel={overLabel} isOver={isOver} insertAt={insertAt} />
        ),
      )}
      <div className="flex items-center gap-3 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-textDim">
        <button onClick={() => props.onAddWeeks(1)} className="font-bold text-text hover:text-accent">
          + {t('1 week')}
        </button>
        <span>·</span>
        <button onClick={() => props.onAddWeeks(4)} className="font-bold text-text hover:text-accent">
          + {t('4 weeks')}
        </button>
        <span className="ml-auto">{fill(t('{n} weeks'), { n: rows.length })}</span>
      </div>
    </div>
  );
}

type RowProps = GridProps & {
  row: CalWeek;
  index: number;
  dropZone: (week: number, day: number | null, disabled?: boolean) => object;
  overLabel: (week: number, day: number | null) => ReactNode;
  isOver: (week: number, day: number | null) => boolean | null;
  insertAt: (week: number, day: number) => string | null | undefined;
};

function phaseStarts(rows: CalWeek[], w: number): boolean {
  const ph = rows[w].phase;
  return !!ph && (w === 0 || rows[w - 1].phase?.id !== ph.id);
}

function PhaseTag({ type, name }: { type: MesoType; name: string }) {
  const t = useT();
  return (
    <span
      className="inline-block rounded px-1.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ background: PHASE_HEX[type], color: PHASE_INK }}
    >
      {name.trim() || t(MESO_LABEL[type])}
    </span>
  );
}

function MenuButton({ index, menuWeek, onWeekMenu }: Pick<RowProps, 'menuWeek' | 'onWeekMenu'> & { index: number }) {
  const t = useT();
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onWeekMenu(index, e.currentTarget);
      }}
      title={t('Week options')}
      aria-haspopup="menu"
      aria-expanded={menuWeek === index}
      className={`absolute right-1 top-1 h-5 w-6 rounded border text-xs leading-none ${
        menuWeek === index ? 'border-border text-text' : 'border-transparent text-textDim hover:border-border hover:text-text'
      }`}
    >
      ⋯
    </button>
  );
}

function gutterEdge(row: CalWeek) {
  return { borderLeftColor: row.phase ? PHASE_HEX[row.phase.type] : undefined };
}

function WeekRow(p: RowProps) {
  const t = useT();
  const { row, index: w, plan } = p;
  const mon = weekMonday(plan, w);
  return (
    <div className={COLS}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => (p.placing ? p.onPlace(w, null) : p.onToggle(w))}
        onKeyDown={(e) => e.key === 'Enter' && p.onToggle(w)}
        title={t('Open this week')}
        style={gutterEdge(row)}
        className="relative min-w-0 cursor-pointer rounded-lg border border-l-4 border-border border-l-border bg-panel py-1 pl-2 pr-7 text-xs hover:border-accent"
        {...p.dropZone(w, null)}
      >
        {phaseStarts(p.rows, w) && <PhaseTag type={row.phase!.type} name={row.phase!.name} />}
        <b className="block font-heading text-sm text-text">
          {t('Week')} {w + 1}
        </b>
        <span className="block text-textDim">
          {fill(t('{from} to {to}'), { from: fmt(mon), to: fmt(addDays(mon, 6)) })}
        </span>
        {row.week.focus.trim() && <span className="block truncate text-text/80">{row.week.focus}</span>}
        {row.week.intensity ? (
          <span className="absolute bottom-1 right-2 text-[10px] font-bold text-amber" title={t('Intensity')}>
            {row.week.intensity}
          </span>
        ) : null}
        <MenuButton index={w} menuWeek={p.menuWeek} onWeekMenu={p.onWeekMenu} />
      </div>
      {DAY_LABELS.map((_, d) => (
        <DayCell key={d} {...p} day={d} big={false} />
      ))}
    </div>
  );
}

function OpenWeek(p: RowProps) {
  const t = useT();
  const { row, index: w, plan } = p;
  const mon = weekMonday(plan, w);
  const v = row.week.intensity || 0;
  return (
    <div className={`${COLS} -mx-1 rounded-xl bg-accent/5 p-1 outline outline-1 outline-accent/40`} id={`cal-week-${w}`}>
      <div
        style={gutterEdge(row)}
        className="relative flex min-w-0 flex-col gap-1.5 rounded-lg border border-l-4 border-border border-l-border bg-panel p-2 text-xs"
        {...p.dropZone(w, null)}
      >
        <div className="flex items-center gap-1.5 pr-6">
          <b className="font-heading text-sm text-text">
            {t('Week')} {w + 1}
          </b>
          <button
            onClick={() => p.onToggle(w)}
            title={t('Close this week')}
            className="rounded border border-border px-1.5 text-[10px] text-textDim hover:text-text"
          >
            ▴
          </button>
        </div>
        <MenuButton index={w} menuWeek={p.menuWeek} onWeekMenu={p.onWeekMenu} />
        <span className="text-textDim">
          {fill(t('{from} to {to}'), { from: fmt(mon), to: fmt(addDays(mon, 6)) })}
        </span>
        <label className="text-[10px] font-bold uppercase tracking-wide text-textDim">
          {t('Phase from here')}
          <select
            className="field mt-0.5 w-full px-1.5 py-0.5 text-xs normal-case"
            value={row.phase?.type ?? ''}
            onChange={(e) => p.onPhase(w, (e.target.value || null) as MesoType | null)}
          >
            <option value="">{t('No phases')}</option>
            {MESO_TYPES.map((m) => (
              <option key={m} value={m}>
                {t(MESO_LABEL[m])}
              </option>
            ))}
          </select>
        </label>
        <input
          className="field w-full px-1.5 py-0.5 text-xs"
          placeholder={t('Focus')}
          value={row.week.focus}
          onChange={(e) => p.onWeek(w, { focus: e.target.value })}
        />
        <div className="flex gap-0.5" title={`${t('Intensity')} ${v || ''}`}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => p.onWeek(w, { intensity: n })}
              aria-label={`${t('Intensity')} ${n}`}
              className={`h-3.5 flex-1 rounded-sm border ${n <= v ? 'border-amber bg-amber' : 'border-border bg-abyss'}`}
            />
          ))}
        </div>
        <textarea
          className="field min-h-[3rem] w-full px-1.5 py-0.5 text-xs"
          placeholder={t('Week notes (optional)')}
          value={row.week.notes}
          onChange={(e) => p.onWeek(w, { notes: e.target.value })}
        />
      </div>
      {DAY_LABELS.map((_, d) => (
        <DayCell key={d} {...p} day={d} big />
      ))}
    </div>
  );
}

function DayCell(p: RowProps & { day: number; big: boolean }) {
  const t = useT();
  const { index: w, day: d, plan, big } = p;
  const iso = addDays(weekMonday(plan, w), d);
  const off = beforeStart(plan, w, d);
  const comps = p.competitions.filter((c) => c.date === iso);
  const sessions = p.row.week.sessions.filter((s) => s.dayOfWeek === d);
  const isToday = iso === p.today;
  // Where a dragged session would land: a line above that session, or below
  // the day's last one (not the dragged one itself).
  const at = p.insertAt(w, d);
  const dragged = dragging();
  const lastOther = [...sessions].reverse().find((s) => s.id !== (dragged?.k === 'session' ? dragged.id : ''))?.id;
  if (off)
    return (
      <div className={`rounded-lg border border-dashed border-border/60 p-1 text-[10px] text-textDim/60 ${big ? 'min-h-[11rem]' : 'min-h-[4.25rem]'}`}>
        {dnum(iso)}
        <span className="block">{t('before plan start')}</span>
      </div>
    );
  return (
    <div
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button,[data-session]')) return;
        if (p.placing) p.onPlace(w, d);
        else if (!big) p.onToggle(w);
      }}
      className={`group relative flex min-w-0 flex-col rounded-lg border p-1 ${
        comps.length ? 'border-[#ab47bc] bg-[#ab47bc]/15' : 'border-border bg-abyss'
      } ${isToday ? 'ring-1 ring-accent' : ''} ${p.isOver(w, d) ? 'outline-dashed outline-2 outline-accent' : ''} ${
        big ? 'min-h-[11rem]' : 'min-h-[4.25rem] cursor-pointer pb-6'
      } ${p.placing ? 'cursor-copy' : ''}`}
      {...p.dropZone(w, d)}
    >
      <span className={`text-[10px] font-bold ${isToday ? 'text-accent' : 'text-textDim'}`}>{dnum(iso)}</span>
      {comps.map((c) => (
        <span key={c.id} className="mb-0.5 truncate text-[11px] font-bold text-[#e7b6f0]" title={c.name || t('Competition')}>
          🏁 {c.name || t('Competition')}
        </span>
      ))}
      {sessions.map((s) => {
        const mark = s.id === at ? 'above' : at === null && s.id === lastOther ? 'below' : undefined;
        return big ? (
          <SessionCard key={s.id} s={s} selected={p.selected === s.id} onOpen={p.onOpenSession} onDropExercise={p.onDropExercise} mark={mark} />
        ) : (
          <SessionChipCell key={s.id} s={s} selected={p.selected === s.id} onOpen={p.onOpenSession} onDropExercise={p.onDropExercise} mark={mark} />
        );
      })}
      {big ? (
        <button
          onClick={() => p.onAdd(w, d)}
          className="mt-auto rounded-md border border-dashed border-accent/50 py-1 text-xs font-bold text-accent hover:bg-accent/10"
        >
          + {t('Add')}
        </button>
      ) : (
        <button
          onClick={() => p.onAdd(w, d)}
          title={t('Add a session')}
          className="absolute bottom-1 right-1 grid h-5 w-5 place-items-center rounded border border-dashed border-border text-sm leading-none text-textDim opacity-60 group-hover:border-accent group-hover:bg-accent group-hover:text-ink group-hover:opacity-100"
        >
          +
        </button>
      )}
      {p.overLabel(w, d)}
    </div>
  );
}

interface SessionViewProps {
  s: BuilderSession;
  selected: boolean;
  onOpen: (id: string) => void;
  onDropExercise: (sessionId: string, description: string) => void;
  /** A dragged session would land above or below this one. */
  mark?: 'above' | 'below';
}

const markStyle = (mark: SessionViewProps['mark']) =>
  mark ? { boxShadow: `0 ${mark === 'above' ? -3 : 3}px 0 0 rgb(var(--c-accent))` } : undefined;

/** A session takes an exercise dropped from the library rail. */
function useExerciseDrop(id: string, onDropExercise: SessionViewProps['onDropExercise']) {
  const [hot, setHot] = useState(false);
  return {
    hot,
    handlers: {
      onDragOver: (e: DragEvent) => {
        if (dragging()?.k !== 'exercise') return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        if (!hot) setHot(true);
      },
      onDragLeave: () => setHot(false),
      onDrop: (e: DragEvent) => {
        const item = readDrag(e);
        setHot(false);
        if (item?.k !== 'exercise') return;
        e.preventDefault();
        e.stopPropagation();
        endDrag();
        onDropExercise(id, item.d);
      },
    },
  };
}

const title = (s: BuilderSession) => s.label.trim() || tr('Untitled session');

/** What the session holds, for a one-line hint. */
function firstLine(s: BuilderSession): string {
  const e = s.exercises.find((x) => x.description.trim());
  if (e) return exerciseText(e, tr);
  return s.body.trim().split('\n')[0] ?? '';
}

function SessionChipCell({ s, selected, onOpen, onDropExercise, mark }: SessionViewProps) {
  const { hot, handlers } = useExerciseDrop(s.id, onDropExercise);
  return (
    <div
      data-session={s.id}
      style={markStyle(mark)}
      draggable
      onDragStart={(e) => startDrag(e, { k: 'session', id: s.id })}
      onClick={() => onOpen(s.id)}
      className={`mb-0.5 cursor-pointer overflow-hidden rounded-md border-l-4 bg-surface px-1.5 py-0.5 text-[11px] font-bold leading-tight text-text ${MODE_EDGE[s.mode]} ${
        selected ? 'outline outline-2 outline-accent' : ''
      } ${hot ? 'outline-dashed outline-2 outline-accent' : ''}`}
      {...handlers}
    >
      <span className="block truncate">{title(s)}</span>
      {firstLine(s) && <span className="block truncate text-[10px] font-normal text-textDim">{firstLine(s)}</span>}
    </div>
  );
}

function SessionCard({ s, selected, onOpen, onDropExercise, mark }: SessionViewProps) {
  const t = useT();
  const { hot, handlers } = useExerciseDrop(s.id, onDropExercise);
  const lines = s.exercises.filter((e) => e.description.trim() || e.dose?.length);
  return (
    <div
      data-session={s.id}
      style={markStyle(mark)}
      draggable
      onDragStart={(e) => startDrag(e, { k: 'session', id: s.id })}
      onClick={() => onOpen(s.id)}
      className={`mb-1 cursor-pointer rounded-md border border-l-4 border-border bg-panel px-1.5 py-1 text-[11px] text-text ${MODE_EDGE[s.mode]} ${
        selected ? 'outline outline-2 outline-accent' : ''
      } ${hot ? 'outline-dashed outline-2 outline-accent' : ''}`}
      {...handlers}
    >
      <b className="block font-heading text-xs leading-tight">
        {title(s)}
        {s.coachTarget ? (
          <span className="ml-1 rounded bg-amber/20 px-1 text-[9px] font-bold text-amber">
            {fill(t('effort {n}'), { n: s.coachTarget })}
          </span>
        ) : null}
      </b>
      {lines.length > 0 && (
        <ul className="mt-0.5 list-disc space-y-0.5 pl-3.5 text-[10px] text-textDim">
          {lines.map((e) => (
            <li key={e.id}>
              {e.run ? '⏱ ' : ''}
              {exerciseText(e, tr)}
            </li>
          ))}
        </ul>
      )}
      {s.body.trim() && <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-[10px] text-textDim">{s.body.trim()}</p>}
    </div>
  );
}
