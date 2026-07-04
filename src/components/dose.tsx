/**
 * Dose UI — chips that show an exercise's dose, and the editor that changes it.
 * A dose is any mix of parts (sets, reps, hold, rest, distance, depth, time, or
 * a custom-labelled part), so mixed work like DYN+STA (distance + hold + rest)
 * is one exercise. Free text stays first-class: everything here is optional.
 */
import { DOSE_UNITS, dosePartText, type DosePart, type DoseUnit } from '../lib/e08plan';
import { useT } from '../i18n';

const UNIT_LABEL: Record<DoseUnit, string> = {
  sets: 'Sets',
  reps: 'Reps',
  hold: 'Hold',
  rest: 'Rest',
  distance: 'Distance',
  depth: 'Depth',
  time: 'Time',
  other: 'Other',
};

const UNIT_HINT: Record<DoseUnit, string> = {
  sets: '8',
  reps: '20',
  hold: '2:00',
  rest: '1:00',
  distance: '50m',
  depth: '30',
  time: '10 min',
  other: '…',
};

export function DoseChips({ dose, onClick }: { dose?: DosePart[]; onClick?: () => void }) {
  const t = useT();
  if (!dose?.length) return null;
  const chips = dose
    .map((p) => dosePartText(p, t))
    .filter(Boolean)
    .map((txt, i) => (
      <span
        key={i}
        className="rounded-md border border-border bg-panel px-1.5 py-0.5 text-xs text-text tabular-nums"
      >
        {txt}
      </span>
    ));
  if (!chips.length) return null;
  return onClick ? (
    <button onClick={onClick} className="flex flex-wrap items-center gap-1" title={t('Edit dose')}>
      {chips}
    </button>
  ) : (
    <span className="flex flex-wrap items-center gap-1">{chips}</span>
  );
}

export function DoseEditor({
  dose,
  onChange,
}: {
  dose: DosePart[];
  onChange: (next: DosePart[]) => void;
}) {
  const t = useT();

  const update = (i: number, patch: Partial<DosePart>) =>
    onChange(dose.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const remove = (i: number) => onChange(dose.filter((_, j) => j !== i));
  const add = (unit: DoseUnit) => onChange([...dose, { unit, value: '' }]);

  return (
    <div className="space-y-1.5">
      {dose.map((p, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1.5">
          <select
            className="field w-auto py-1 text-sm"
            value={p.unit}
            onChange={(e) => update(i, { unit: e.target.value as DoseUnit })}
          >
            {DOSE_UNITS.map((u) => (
              <option key={u} value={u}>
                {t(UNIT_LABEL[u])}
              </option>
            ))}
          </select>
          {p.unit === 'other' && (
            <input
              className="field w-28 py-1 text-sm"
              placeholder={t('Label')}
              value={p.label ?? ''}
              onChange={(e) => update(i, { label: e.target.value })}
            />
          )}
          <input
            className="field w-24 py-1 text-sm tabular-nums"
            placeholder={UNIT_HINT[p.unit]}
            value={p.value}
            onChange={(e) => update(i, { value: e.target.value })}
          />
          <button onClick={() => remove(i)} className="px-1 text-sm text-textDim hover:text-red" title={t('Remove')}>
            ✕
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-textDim">{t('Add part:')}</span>
        {DOSE_UNITS.map((u) => (
          <button
            key={u}
            onClick={() => add(u)}
            className="rounded-full border border-border px-2 py-0.5 text-textDim hover:border-accent hover:text-accent"
          >
            + {t(UNIT_LABEL[u])}
          </button>
        ))}
      </div>
    </div>
  );
}
