/**
 * /exercises/week-template/new and /exercises/week-template/:id: the week
 * template builder. One week, edited with the plan builder's own week card
 * (sessions per weekday, written here or started from a session template),
 * saved as a week template without a plan around it. "Add to a plan" saves
 * first, then asks for the plan and the week.
 */
import { useMemo, useState } from 'react';
import { navigate } from '../hooks/useHashRoute';
import { useT } from '../i18n';
import { emptyWeek, type BuilderWeek, type PlanMode } from '../lib/e08plan';
import {
  applyWeekTemplate,
  saveWeekTemplate,
  updateWeekTemplate,
  useWeekTemplates,
  weekFromTemplate,
} from '../lib/library';
import { dominantMode } from '../lib/templateGroups';
import { nameProblem } from '../lib/planName';
import { WeekCard } from '../components/WeekCard';
import { AddToPlanDialog } from '../components/AddToPlanDialog';

const BACK = '/exercises?view=weeks';
const MODES: { id: PlanMode; label: string }[] = [
  { id: 'depth', label: 'Depth' },
  { id: 'pool', label: 'Pool' },
  { id: 'dry', label: 'Dry' },
  { id: 'general', label: 'General' },
];

export function WeekTemplateView({ templateId }: { templateId: string | null }) {
  const t = useT();
  const all = useWeekTemplates();
  const found = templateId ? all.find((x) => x.id === templateId) : undefined;
  // The id once saved, so a second Save updates instead of adding another.
  const [savedId, setSavedId] = useState<string | null>(found?.id ?? null);
  const [name, setName] = useState(found?.name ?? '');
  // Read once: saving rewrites the stored template, which must not reset the
  // week being edited (its sessions get new ids on every read).
  const initial = useMemo(() => (found ? weekFromTemplate(found) : emptyWeek()), []);
  const [week, setWeek] = useState<BuilderWeek>(initial);
  // New sessions start in this type; it follows the sessions already there.
  const [mode, setMode] = useState<PlanMode>(found?.sessions.length ? dominantMode(found.sessions) : 'pool');
  const [editing, setEditing] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [adding, setAdding] = useState(false);
  const [tried, setTried] = useState(false);

  if (templateId && !found && !savedId) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-6">
        <p className="text-sm text-textDim">{t('Template not found.')}</p>
      </main>
    );
  }

  const others = all.filter((x) => x.id !== savedId).map((x) => x.name);
  const problem = nameProblem(name, others);
  const empty = week.sessions.length === 0;

  /** Saves and returns the template id, or null while the name is missing or
   *  taken or the week has no session. */
  const save = (): string | null => {
    setTried(true);
    if (problem || empty) return null;
    let id = savedId;
    if (id) updateWeekTemplate(id, name, week);
    else {
      id = saveWeekTemplate(name, week);
      setSavedId(id);
    }
    setDirty(false);
    return id;
  };
  const saved = savedId ? all.find((x) => x.id === savedId) : undefined;

  return (
    <main className="mx-auto max-w-5xl space-y-4 px-5 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => navigate(BACK)} className="text-sm text-textDim hover:text-text">
          ‹ {t('Week templates')}
        </button>
        <h2 className="min-w-0 flex-1 text-lg">{found ? t('Edit week template') : t('Build week template')}</h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="block space-y-1">
          <span className="text-xs font-bold text-textDim">{t('Name')}</span>
          <input
            className="field font-heading"
            value={name}
            maxLength={80}
            autoFocus={!found}
            placeholder={t('e.g. Base week, 3 water + 2 dry')}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
          />
        </label>
        <label className="block space-y-1">
          <span className="block text-xs font-bold text-textDim">{t('New sessions start as')}</span>
          <select className="field w-auto" value={mode} onChange={(e) => setMode(e.target.value as PlanMode)}>
            {MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {t(m.label)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {tried && problem === 'empty' && <p className="text-sm text-amber">{t('Give the week template a name.')}</p>}
      {problem === 'taken' && (
        <p className="text-sm text-amber">{t('Another week template has this name already.')}</p>
      )}

      <WeekCard
        bare
        week={week}
        label={t('WEEK')}
        mode={mode}
        editing={editing}
        setEditing={setEditing}
        onChange={(patch) => {
          setWeek((w) => ({ ...w, ...patch }));
          setDirty(true);
        }}
      />
      {tried && empty && <p className="text-sm text-amber">{t('Add at least one session to the week.')}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-40 flex-1 text-xs text-textDim">
          {savedId && !dirty
            ? t('Saved. Use it in the plan builder with + week from template, or add it to a plan from here.')
            : t('A day takes a session written here or one of your session templates.')}
        </p>
        <button onClick={() => navigate(BACK)} className="pill px-3 py-1.5 text-sm">
          {savedId && !dirty ? t('Close') : t('Cancel')}
        </button>
        <button
          onClick={() => {
            if (save()) setAdding(true);
          }}
          className="pill px-3 py-1.5 text-sm"
        >
          {t('Add to a plan…')}
        </button>
        <button onClick={save} className="pill pill-on btn-raised px-4 py-1.5 text-sm">
          {t('Save week template')}
        </button>
      </div>

      {adding && saved && (
        <AddToPlanDialog
          payload={{ kind: 'week', name: saved.name, apply: (w) => applyWeekTemplate(saved, w) }}
          onClose={() => setAdding(false)}
        />
      )}
    </main>
  );
}
