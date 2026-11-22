/**
 * The plan calendar's top bar. No setup form before the calendar (piece 5 of
 * element08-app/docs/mockups/portal-plan-calendar-options.html): the name,
 * start, competitions and the rest of the plan's details sit here, and the
 * plan can be saved at any point.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { fill, useT } from '../../i18n';
import {
  addDays,
  calendarFormat,
  formatIso,
  type BuilderPlan,
  type IntensityPreset,
  type PlanMode,
} from '../../lib/e08plan';
import { firstMonday, type PlanCompetition } from '../../lib/planCalendar';
import type { Athlete } from '../../lib/types';
import { AssignToConnectedButton } from '../AssignToConnectedButton';

const DATE_FMT = calendarFormat({ weekday: 'short', day: 'numeric', month: 'short' });
const MODES: { id: PlanMode; label: string }[] = [
  { id: 'depth', label: 'Depth' },
  { id: 'pool', label: 'Pool' },
  { id: 'dry', label: 'Dry' },
  { id: 'general', label: 'General' },
];

/** Open state for a small menu that closes on a click outside it or Escape. */
function usePop() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return { open, setOpen, ref };
}

const popBox = 'board absolute right-0 top-full z-40 mt-1 w-72 space-y-2 p-3 text-sm shadow-lg';
const lbl = 'block text-[11px] font-bold uppercase tracking-wide text-textDim';

export function PlanTopBar(props: {
  plan: BuilderPlan;
  weeks: number;
  status: ReactNode;
  onMeta: (patch: Partial<BuilderPlan>) => void;
  competitions: PlanCompetition[];
  /** An error to show, or null once it is in. */
  onAddCompetition: (date: string, name: string) => string | null;
  onRemoveCompetition: (id: string) => void;
  onGoCompetition: (id: string) => void;
  hasPhases: boolean;
  onSuggestPhases: () => void;
  onCurve: (kind: IntensityPreset) => void;
  onNoPhases: () => void;
  athletes: Athlete[];
  athleteId: string | null;
  onAthlete: (id: string | null) => void;
  ready: boolean;
  issue: string | null;
  onSave: () => void;
  onDone: () => void;
  onDownload: () => void;
  onOldBuilder: () => void;
  ensurePublished: () => Promise<string | null>;
  /** Set when the start date moves the sessions of a plan athletes already
   *  train on: their reports are stored under the session ids and move too. */
  startMove: { names: string[]; weeks: number; was: string } | null;
  onKeepStart: () => void;
}) {
  const t = useT();
  const { plan } = props;
  const end = addDays(firstMonday(plan), props.weeks * 7 - 1);
  const comp = usePop();
  const season = usePop();
  const details = usePop();
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const addComp = () => {
    const e = props.onAddCompetition(date, name.trim());
    setErr(e);
    if (!e) {
      setDate('');
      setName('');
      comp.setOpen(false);
    }
  };

  return (
    <div className="board flex flex-wrap items-center gap-2 px-3 py-2">
      <input
        className="field w-64 max-w-full py-1 font-heading text-base"
        placeholder={t('Name this plan')}
        value={plan.name}
        onChange={(e) => props.onMeta({ name: e.target.value })}
      />
      <span className="flex flex-wrap items-center gap-1.5 text-xs text-textDim">
        {t('Starts')}
        <input
          type="date"
          className="field w-auto px-2 py-0.5 text-xs"
          value={plan.startDate}
          onChange={(e) => e.target.value && props.onMeta({ startDate: e.target.value })}
        />
        · {fill(t('{n} weeks'), { n: props.weeks })} · {fill(t('to {date}'), { date: formatIso(DATE_FMT, end) })}
      </span>
      {props.startMove && (
        <p role="alert" className="basis-full rounded-md border border-amber/50 bg-amber/10 px-2 py-1 text-xs text-amber">
          {fill(
            t(
              props.startMove.weeks > 0
                ? Math.abs(props.startMove.weeks) === 1
                  ? 'Already on this plan: {names}. The new start moves every session one week later, reports included.'
                  : 'Already on this plan: {names}. The new start moves every session {n} weeks later, reports included.'
                : Math.abs(props.startMove.weeks) === 1
                  ? 'Already on this plan: {names}. The new start moves every session one week earlier, reports included.'
                  : 'Already on this plan: {names}. The new start moves every session {n} weeks earlier, reports included.',
            ),
            { names: props.startMove.names.join(', '), n: Math.abs(props.startMove.weeks) },
          )}{' '}
          <button onClick={props.onKeepStart} className="font-bold underline">
            {fill(t('Keep {date}'), { date: formatIso(DATE_FMT, props.startMove.was) })}
          </button>
        </p>
      )}

      {props.competitions.map((c) => (
        <span
          key={c.id}
          className="inline-flex items-center gap-1 rounded-full bg-[#ab47bc]/25 px-2.5 py-0.5 text-xs font-bold text-[#efc5f6]"
        >
          <button onClick={() => props.onGoCompetition(c.id)} title={t('Show this week')}>
            🏁 {c.name || t('Competition')} · {formatIso(DATE_FMT, c.date)}
          </button>
          <button
            onClick={() => props.onRemoveCompetition(c.id)}
            title={t('Remove')}
            aria-label={t('Remove')}
            className="opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </span>
      ))}
      <div ref={comp.ref} className="relative">
        <button onClick={() => (comp.setOpen(!comp.open), setErr(null))} className="pill px-3 py-0.5 text-xs">
          + {t('Competition')}
        </button>
        {comp.open && (
          <div className={popBox}>
            <label className={lbl}>
              {t('Date')}
              <input
                type="date"
                autoFocus
                min={plan.startDate}
                className="field mt-1 w-full text-sm normal-case"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label className={lbl}>
              {t('Name (optional)')}
              <input
                className="field mt-1 w-full text-sm normal-case"
                placeholder={t('e.g. Nationals')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addComp()}
              />
            </label>
            {err && <p className="text-xs text-red">{err}</p>}
            <p className="text-xs text-textDim">
              {t('One after the last week makes the plan longer. The athlete’s app shows the last competition.')}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => comp.setOpen(false)} className="text-xs text-textDim hover:text-text">
                {t('Cancel')}
              </button>
              <button onClick={addComp} className="pill pill-on px-3 py-1 text-xs">
                {t('Add')}
              </button>
            </div>
          </div>
        )}
      </div>

      <div ref={season.ref} className="relative">
        <button onClick={() => season.setOpen(!season.open)} className="pill px-3 py-0.5 text-xs">
          {t('Season')} ▾
        </button>
        {season.open && (
          <div className={popBox}>
            <button
              onClick={() => (season.setOpen(false), props.onSuggestPhases())}
              className="block w-full rounded px-2 py-1 text-left hover:bg-accent/10"
            >
              {t('Suggest phases (Base to Peak)')}
            </button>
            <p className={lbl}>{t('Intensity curve')}</p>
            {(
              [
                ['linear', 'Linear build'],
                ['wave', 'Wave 3:1'],
                ['double', 'Double peak'],
              ] as [IntensityPreset, string][]
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => (season.setOpen(false), props.onCurve(k))}
                className="block w-full rounded px-2 py-1 text-left hover:bg-accent/10"
              >
                {t(l)}
              </button>
            ))}
            {props.hasPhases && (
              <button
                onClick={() => (season.setOpen(false), props.onNoPhases())}
                className="block w-full rounded px-2 py-1 text-left text-red hover:bg-red/10"
              >
                {t('No phases')}
              </button>
            )}
            <p className="text-xs text-textDim">{t('A week’s phase is set in its column when it is open.')}</p>
          </div>
        )}
      </div>

      <div ref={details.ref} className="relative">
        <button onClick={() => details.setOpen(!details.open)} className="pill px-3 py-0.5 text-xs">
          {t('Plan details')} ▾
        </button>
        {details.open && (
          <div className={popBox}>
            <label className={lbl}>
              {t('Coach name (shown as author)')}
              <input
                className="field mt-1 w-full text-sm normal-case"
                placeholder={t('Your name')}
                value={plan.coach}
                onChange={(e) => props.onMeta({ coach: e.target.value })}
              />
            </label>
            <label className={lbl}>
              {t('Description (optional)')}
              <input
                className="field mt-1 w-full text-sm normal-case"
                placeholder={t('One line the athlete sees on import')}
                value={plan.description}
                onChange={(e) => props.onMeta({ description: e.target.value })}
              />
            </label>
            <label className={lbl}>
              {t('Mode')}
              <select
                className="field mt-1 w-full text-sm normal-case"
                value={plan.mode}
                onChange={(e) => props.onMeta({ mode: e.target.value as PlanMode })}
              >
                {MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {t(m.label)}
                  </option>
                ))}
              </select>
            </label>
            <label className={lbl}>
              {t('Roster athlete (optional)')}
              <select
                className="field mt-1 w-full text-sm normal-case"
                value={props.athleteId ?? ''}
                onChange={(e) => props.onAthlete(e.target.value || null)}
              >
                <option value="">{t('Not linked')}</option>
                {props.athletes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name || t('Unnamed athlete')}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-col gap-1 border-t border-border pt-2">
              <button
                disabled={!props.ready}
                title={props.issue ? t(props.issue) : undefined}
                onClick={() => (details.setOpen(false), props.onDownload())}
                className="rounded px-2 py-1 text-left hover:bg-accent/10 disabled:opacity-40"
              >
                {t('Download')} .e08plan
              </button>
              {props.issue && <span className="px-2 text-xs text-amber">{t(props.issue)}</span>}
              <button
                onClick={() => (details.setOpen(false), props.onOldBuilder())}
                className="rounded px-2 py-1 text-left text-xs text-textDim hover:bg-accent/10"
              >
                {t('Open in the old plan builder')}
              </button>
            </div>
          </div>
        )}
      </div>

      <span className="ml-auto text-xs text-textDim">{props.status}</span>
      <button onClick={props.onSave} title={t('Save this plan to your library. It shows up in the app too.')} className="pill pill-on btn-raised px-4 py-1 text-sm">
        {t('Save')}
      </button>
      <AssignToConnectedButton ready={props.ready} ensurePublished={props.ensurePublished} menuBelow />
      <button onClick={props.onDone} title={t('Save and return to Plans')} className="pill px-3 py-1 text-sm">
        {t('Done')}
      </button>
    </div>
  );
}
