import {
  DAY_LABELS,
  newSession,
  type BuilderWeek,
  type Intensity,
  type PlanMode,
} from '../lib/e08plan';
import { SessionList } from './sessions';
import { useT } from '../i18n';

const INTENSITIES: Intensity[] = ['recovery', 'low', 'medium', 'high', 'max'];

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
  /** Slightly lighter chrome for nesting inside a phase card. */
  compact?: boolean;
}) {
  const t = useT();
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
        <select
          className="field w-auto ml-auto"
          value={week.intensity}
          onChange={(e) => onChange({ intensity: e.target.value as Intensity })}
        >
          {INTENSITIES.map((i) => (
            <option key={i} value={i}>
              {t(i)}
            </option>
          ))}
        </select>
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
          return (
            <div key={day} className={`flex gap-3 items-start ${beforeStart ? 'opacity-40' : ''}`}>
              <div className="w-10 shrink-0 text-textDim text-sm pt-2 font-mono">{t(dayLabel)}</div>
              <SessionList
                sessions={daySessions}
                editing={editing}
                setEditing={setEditing}
                onAdd={() => addSession(day)}
                onChange={updateSession}
                onRemove={removeSession}
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
    </div>
  );
}
