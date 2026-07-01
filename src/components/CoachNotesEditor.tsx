/**
 * CoachNotesEditor — the coach's editable CRM block: contact, location, coaching
 * period, free notes, and a competitions list. Shared by the manual roster
 * detail (AthleteDetailView) and the connected-athlete detail (ConnectedAthleteView,
 * where it's backed by local CoachNotes keyed to the cloud student) so both look
 * identical. Value-agnostic: pass any object with these fields + an onPatch.
 */
import { uid } from '../lib/e08plan';
import { compColorClass, relativeDays, today } from '../lib/athleteStats';
import { Labeled } from './sessions';
import { useT } from '../i18n';
import type { Competition } from '../lib/types';

export interface CoachNotesValue {
  contact?: string;
  location?: string;
  coachingFrom?: string;
  coachingTo?: string;
  notes?: string;
  competitions: Competition[];
}

export function CoachNotesEditor({
  value,
  onPatch,
}: {
  value: CoachNotesValue;
  onPatch: (p: Partial<CoachNotesValue>) => void;
}) {
  const t = useT();
  const comps = value.competitions ?? [];
  const addComp = () =>
    onPatch({ competitions: [...comps, { id: uid('comp'), name: '', date: today() }] });
  const updateComp = (id: string, p: Partial<Competition>) =>
    onPatch({ competitions: comps.map((c) => (c.id === id ? { ...c, ...p } : c)) });
  const removeComp = (id: string) =>
    onPatch({ competitions: comps.filter((c) => c.id !== id) });
  const sorted = [...comps].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Labeled label={t('Contact (optional)')}>
          <input
            className="field"
            placeholder={t('email / handle')}
            value={value.contact ?? ''}
            onChange={(e) => onPatch({ contact: e.target.value })}
          />
        </Labeled>
        <Labeled label={t('Location (optional)')}>
          <input
            className="field"
            placeholder={t('e.g. Dahab')}
            value={value.location ?? ''}
            onChange={(e) => onPatch({ location: e.target.value })}
          />
        </Labeled>
        <Labeled label={t('Coaching from')}>
          <input
            type="date"
            className="field"
            value={value.coachingFrom ?? ''}
            onChange={(e) => onPatch({ coachingFrom: e.target.value })}
          />
        </Labeled>
        <Labeled label={t('Coaching to')}>
          <input
            type="date"
            className="field"
            value={value.coachingTo ?? ''}
            onChange={(e) => onPatch({ coachingTo: e.target.value })}
          />
        </Labeled>
        <div className="sm:col-span-2">
          <Labeled label={t('Notes (optional)')}>
            <textarea
              className="field min-h-16"
              placeholder={t('Background, strengths, things to watch, equalisation notes…')}
              value={value.notes ?? ''}
              onChange={(e) => onPatch({ notes: e.target.value })}
            />
          </Labeled>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base">{t('Competitions')}</h3>
          <button
            onClick={addComp}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-accent hover:border-accent"
          >
            + {t('Add competition')}
          </button>
        </div>
        {sorted.length === 0 ? (
          <p className="text-textDim text-sm">{t('No competitions logged.')}</p>
        ) : (
          <div className="space-y-2">
            {sorted.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-panel px-3 py-2"
              >
                <input
                  className="field min-w-40 flex-1"
                  placeholder={t('Competition name')}
                  value={c.name}
                  onChange={(e) => updateComp(c.id, { name: e.target.value })}
                />
                <input
                  type="date"
                  className="field w-auto"
                  value={c.date}
                  onChange={(e) => updateComp(c.id, { date: e.target.value })}
                />
                <input
                  className="field w-32"
                  placeholder={t('Location')}
                  value={c.location ?? ''}
                  onChange={(e) => updateComp(c.id, { location: e.target.value })}
                />
                <input
                  className="field w-32"
                  placeholder={t('Target, e.g. CWT 60m')}
                  value={c.target ?? ''}
                  onChange={(e) => updateComp(c.id, { target: e.target.value })}
                />
                {c.date && <span className={`text-xs ${compColorClass(c.date)}`}>{relativeDays(c.date)}</span>}
                <button onClick={() => removeComp(c.id)} className="text-red text-sm" title={t('Remove')}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
