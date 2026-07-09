import {
  DAY_LABELS,
  DEFAULT_INTENSITY,
  addDays,
  newSession,
  normIntensity,
  type BuilderWeek,
  type PlanMode,
} from '../lib/e08plan';
import {
  applyWeekTemplate,
  materializeSessionTemplate,
  saveWeekTemplate,
  useWeekTemplates,
} from '../lib/library';
import { SessionList } from './sessions';
import { useT, tr } from '../i18n';

const DAY_DATE_FMT = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** One week: intensity + focus, a Mon–Sun session grid, and notes. Used for both
 *  training-plan weeks and the weeks inside a season phase. Sessions are owned by
 *  the parent; this only emits `onChange` patches. The single `editing` id is
 *  lifted to the builder so just one session edits at a time across the plan. */
export function WeekCard({
  week,
  label,
  mode,
  editing,
  setEditing,
  onChange,
  onRemove,
  partialBeforeDow,
  weekStart,
  compact,
}: {
  week: BuilderWeek;
  /** Heading, e.g. "WEEK 1". */
  label: string;
  mode: PlanMode;
  editing: string | null;
  setEditing: (id: string | null) => void;
  onChange: (patch: Partial<BuilderWeek>) => void;
  onRemove?: () => void;
  /** Days with index < this are dimmed as "before plan start" (global first week only). */
  partialBeforeDow?: number;
  /** ISO Monday of this week; when set, each weekday shows its calendar date. */
  weekStart?: string;
  /** Slightly lighter chrome for nesting inside a phase card. */
  compact?: boolean;
}) {
  const t = useT();
  const weekTemplates = useWeekTemplates();
  const hasDates = !!weekStart && ISO_RE.test(weekStart);
  const addSession = (dayOfWeek: number) => {
    const s = newSession(dayOfWeek, mode);
    onChange({ sessions: [...week.sessions, s] });
    setEditing(s.id);
  };
  const updateSession = (id: string, patch: Partial<BuilderWeek['sessions'][number]>) =>
    onChange({ sessions: week.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const removeSession = (id: string) =>
    onChange({ sessions: week.sessions.filter((s) => s.id !== id) });

  return (
    <div
      className={`rounded-xl p-4 space-y-3 ${compact ? 'border border-border bg-abyss' : 'glass-card'}`}
    >
      <div className="flex items-center gap-3">
        <span className="font-heading text-accent whitespace-nowrap shrink-0">{label}</span>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-textDim whitespace-nowrap">
          {t('Intensity')}
          <select
            className="field w-auto"
            value={normIntensity(week.intensity) ?? DEFAULT_INTENSITY}
            onChange={(e) => onChange({ intensity: Number(e.target.value) })}
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}/10
              </option>
            ))}
          </select>
        </label>
        {onRemove && (
          <button onClick={onRemove} className="text-red text-sm px-2 shrink-0" title={t('Remove week')}>
            ✕
          </button>
        )}
      </div>
      <input
        className="field"
        placeholder={t('Week focus (optional), e.g. CO₂ capacity')}
        value={week.focus}
        onChange={(e) => onChange({ focus: e.target.value })}
      />

      <div className="space-y-2">
        {DAY_LABELS.map((dayLabel, day) => {
          const beforeStart = partialBeforeDow != null && day < partialBeforeDow;
          const daySessions = week.sessions.filter((s) => s.dayOfWeek === day);
          const dayDate = hasDates
            ? DAY_DATE_FMT.format(new Date(`${addDays(weekStart!, day)}T00:00:00Z`))
            : null;
          return (
            <div key={day} className={`flex gap-3 items-start ${beforeStart ? 'opacity-40' : ''}`}>
              <div className="w-16 shrink-0 pt-2 font-mono text-sm leading-tight text-textDim">
                <div>{t(dayLabel)}</div>
                {dayDate && <div className="text-[10px] opacity-70">{dayDate}</div>}
              </div>
              <SessionList
                sessions={daySessions}
                editing={editing}
                setEditing={setEditing}
                onAdd={() => addSession(day)}
                onChange={updateSession}
                onRemove={removeSession}
                onInsertTemplate={(tpl) => {
                  const s = materializeSessionTemplate(tpl, day);
                  onChange({ sessions: [...week.sessions, s] });
                  setEditing(s.id);
                }}
                disabledText={beforeStart ? t('before plan start') : undefined}
              />
            </div>
          );
        })}
      </div>

      <input
        className="field"
        placeholder={t('Week notes (optional)')}
        value={week.notes}
        onChange={(e) => onChange({ notes: e.target.value })}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => {
            const name = prompt(tr('Template name'), week.focus.trim() || label);
            if (name !== null) saveWeekTemplate(name, week);
          }}
          className="text-xs text-textDim hover:text-accent"
          title={t('Save this whole week (all sessions, doses, focus) for one-click reuse')}
        >
          {t('Save week as template')}
        </button>
        {weekTemplates.length > 0 && (
          <select
            className="ml-auto max-w-48 cursor-pointer border-none bg-transparent p-0 text-xs text-textDim hover:text-accent"
            value=""
            title={t('Fill this week from a saved week template (sessions append)')}
            onChange={(e) => {
              const tpl = weekTemplates.find((x) => x.id === e.target.value);
              if (tpl) onChange(applyWeekTemplate(tpl, week));
            }}
          >
            <option value="">{t('+ week from template')}</option>
            {weekTemplates.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
