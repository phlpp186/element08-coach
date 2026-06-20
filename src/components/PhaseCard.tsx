import {
  MESO_TYPES,
  MESO_LABEL,
  addDays,
  emptyWeek,
  type BuilderPhase,
  type BuilderWeek,
  type MesoType,
  type PlanMode,
} from '../lib/e08plan';
import { WeekCard } from './WeekCard';

const RANGE_FMT = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
function fmt(iso: string): string {
  return RANGE_FMT.format(new Date(`${iso}T00:00:00Z`));
}

/** One mesocycle in a season: a collapsible block of weeks with a type and name.
 *  Collapsed it's a one-line summary (type · weeks · date range); expanded it
 *  reveals the same week editor a training plan uses. The builder runs these as
 *  an accordion (one open at a time) to keep on-screen density low. */
export function PhaseCard({
  phase,
  index,
  mode,
  open,
  onToggle,
  weekOffset,
  firstMonday,
  startDow,
  editing,
  setEditing,
  onChange,
  onRemove,
}: {
  phase: BuilderPhase;
  index: number;
  mode: PlanMode;
  open: boolean;
  onToggle: () => void;
  /** Global week index where this phase begins (sum of earlier phases' weeks). */
  weekOffset: number;
  /** Monday of the plan's first week. */
  firstMonday: string;
  /** dayOfWeek (0=Mon..6=Sun) of the plan's start date — the partial first week. */
  startDow: number;
  editing: string | null;
  setEditing: (id: string | null) => void;
  onChange: (patch: Partial<BuilderPhase>) => void;
  onRemove?: () => void;
}) {
  const len = phase.weeks.length;
  const start = addDays(firstMonday, weekOffset * 7);
  const end = addDays(firstMonday, (weekOffset + Math.max(1, len)) * 7 - 1);

  const setWeek = (wi: number, patch: Partial<BuilderWeek>) =>
    onChange({ weeks: phase.weeks.map((w, i) => (i === wi ? { ...w, ...patch } : w)) });
  const addWeek = () => onChange({ weeks: [...phase.weeks, emptyWeek()] });
  const removeWeek = (wi: number) => onChange({ weeks: phase.weeks.filter((_, i) => i !== wi) });

  return (
    <div className="rounded-xl border border-border bg-panel">
      <div className="flex items-center gap-3 p-4">
        <button onClick={onToggle} className="text-textDim text-sm shrink-0" aria-label="Toggle phase">
          {open ? '▾' : '▸'}
        </button>
        <span className="font-heading text-accent shrink-0">PHASE {index + 1}</span>
        <input
          className="field flex-1 min-w-0"
          placeholder={MESO_LABEL[phase.type]}
          value={phase.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <select
          className="field w-auto shrink-0"
          value={phase.type}
          onChange={(e) => onChange({ type: e.target.value as MesoType })}
        >
          {MESO_TYPES.map((t) => (
            <option key={t} value={t}>
              {MESO_LABEL[t]}
            </option>
          ))}
        </select>
        {onRemove && (
          <button onClick={onRemove} className="text-red text-sm px-1 shrink-0" title="Remove phase">
            ✕
          </button>
        )}
      </div>

      <div className="px-4 pb-2 -mt-2 text-xs text-textDim">
        {len} week{len === 1 ? '' : 's'} · {fmt(start)} – {fmt(end)}
      </div>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {phase.weeks.map((week, wi) => {
            const globalIndex = weekOffset + wi;
            return (
              <WeekCard
                key={wi}
                week={week}
                label={`WEEK ${globalIndex + 1}`}
                mode={mode}
                editing={editing}
                setEditing={setEditing}
                onChange={(patch) => setWeek(wi, patch)}
                onRemove={phase.weeks.length > 1 ? () => removeWeek(wi) : undefined}
                partialBeforeDow={globalIndex === 0 ? startDow : undefined}
                compact
              />
            );
          })}
          <button
            onClick={addWeek}
            className="text-sm text-accent border border-border rounded-lg px-3 py-1.5 hover:border-accent"
          >
            + Add week
          </button>
        </div>
      )}
    </div>
  );
}
