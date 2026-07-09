import { useState, type ReactNode } from 'react';
import { uid, type BuilderExercise, type BuilderSession, type PlanMode } from '../lib/e08plan';
import { ExerciseInput } from './ExerciseInput';
import {
  defaultDoseFor,
  recordUseByDescription,
  saveSessionTemplate,
  useSessionTemplates,
  type SessionTemplate,
} from '../lib/library';
import { DoseChips, DoseEditor } from './dose';
import { useT, tr } from '../i18n';

const SESSION_MODES: PlanMode[] = ['depth', 'pool', 'dry', 'general'];

/** Small labelled field wrapper (shared across the builder forms). */
export function Labeled({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-textDim uppercase tracking-wide mb-1.5">
        {label}
        {required && <span className="text-red"> *</span>}
      </span>
      {children}
    </label>
  );
}

/** The day's list of sessions: chips that expand into the inline editor, plus
 *  an "+ session" affordance. Shared by training weeks, season weeks, and days. */
export function SessionList({
  sessions,
  editing,
  setEditing,
  onAdd,
  onChange,
  onRemove,
  onInsertTemplate,
  disabledText,
}: {
  sessions: BuilderSession[];
  editing: string | null;
  setEditing: (id: string | null) => void;
  onAdd: () => void;
  onChange: (id: string, patch: Partial<BuilderSession>) => void;
  onRemove: (id: string) => void;
  /** When given (and templates exist), a "+ from template" picker appears. */
  onInsertTemplate?: (tpl: SessionTemplate) => void;
  /** When set, the "+ session" button is replaced by this dim note. */
  disabledText?: string;
}) {
  const t = useT();
  const templates = useSessionTemplates();
  return (
    <div className="flex-1 space-y-2">
      {sessions.map((s) =>
        editing === s.id ? (
          <SessionEditor
            key={s.id}
            session={s}
            onChange={(patch) => onChange(s.id, patch)}
            onClose={() => setEditing(null)}
            onDelete={() => {
              onRemove(s.id);
              setEditing(null);
            }}
          />
        ) : (
          <SessionChip key={s.id} session={s} onEdit={() => setEditing(s.id)} />
        ),
      )}
      {disabledText ? (
        <span className="text-xs text-textDim italic">{disabledText}</span>
      ) : (
        <span className="flex flex-wrap items-center gap-3">
          <button onClick={onAdd} className="text-xs text-textDim hover:text-accent">
            {t('+ session')}
          </button>
          {onInsertTemplate && templates.length > 0 && (
            <select
              className="max-w-40 cursor-pointer border-none bg-transparent p-0 text-xs text-textDim hover:text-accent"
              value=""
              title={t('Insert a saved session template here')}
              onChange={(e) => {
                const tpl = templates.find((x) => x.id === e.target.value);
                if (tpl) onInsertTemplate(tpl);
              }}
            >
              <option value="">{t('+ from template')}</option>
              {templates.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          )}
        </span>
      )}
    </div>
  );
}

function SessionChip({ session, onEdit }: { session: BuilderSession; onEdit: () => void }) {
  const t = useT();
  const exCount = session.exercises.filter((e) => e.description.trim()).length;
  const hint =
    exCount > 0
      ? `${exCount} ${exCount === 1 ? t('exercise') : t('exercises')}`
      : session.body.trim();
  return (
    <button
      onClick={onEdit}
      className="w-full text-left rounded-lg border border-border bg-abyss px-3 py-2 hover:border-accent"
    >
      <div className="text-sm text-text">{session.label.trim() || t('Untitled session')}</div>
      {hint && <div className="text-xs text-textDim truncate mt-0.5">{hint}</div>}
    </button>
  );
}

function SessionEditor({
  session,
  onChange,
  onClose,
  onDelete,
}: {
  session: BuilderSession;
  onChange: (patch: Partial<BuilderSession>) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const [dropping, setDropping] = useState(false);
  const [doseOpen, setDoseOpen] = useState<string | null>(null);
  const addExercise = () =>
    onChange({ exercises: [...session.exercises, { id: uid('ex'), description: '' }] });
  const updateExercise = (id: string, patch: Partial<BuilderExercise>) =>
    onChange({
      exercises: session.exercises.map((e) => {
        if (e.id !== id) return e;
        const next = { ...e, ...patch };
        if (patch.dose !== undefined && (!patch.dose || patch.dose.length === 0)) delete next.dose;
        return next;
      }),
    });
  const removeExercise = (id: string) =>
    onChange({ exercises: session.exercises.filter((e) => e.id !== id) });

  return (
    <div className="rounded-lg border border-accent bg-abyss p-3 space-y-3">
      <input
        className="field"
        placeholder={t('Session title, e.g. Pool CO₂ table')}
        value={session.label}
        onChange={(e) => onChange({ label: e.target.value })}
      />

      {/* Structured exercises (mode #2). Drop target for library chips. */}
      <div
        className={`space-y-2 rounded-lg p-1 transition-colors ${
          dropping ? 'outline outline-1 outline-accent bg-accent/5' : ''
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDropping(false);
          const d = e.dataTransfer.getData('text/plain');
          if (d) {
            recordUseByDescription([d]);
            const dose = defaultDoseFor(d);
            onChange({ exercises: [...session.exercises, { id: uid('ex'), description: d, ...(dose ? { dose } : {}) }] });
          }
        }}
      >
        <span className="block text-xs text-textDim uppercase tracking-wide">
          {t('Exercises (optional) · drag from your library')}
        </span>
        {session.exercises.map((ex, i) => (
          <div key={ex.id} className="space-y-1">
            <div className="flex gap-2 items-center">
              <span className="text-textDim text-xs font-mono w-4 shrink-0">{i + 1}</span>
              <ExerciseInput
                value={ex.description}
                placeholder={t('e.g. 3×25m bi-fins, 5 min rest')}
                onChange={(v) => updateExercise(ex.id, { description: v })}
                onPick={(v) => {
                  const dose = defaultDoseFor(v);
                  updateExercise(ex.id, { description: v, ...(dose && !ex.dose?.length ? { dose } : {}) });
                }}
              />
              {!ex.dose?.length && doseOpen !== ex.id && (
                <button
                  onClick={() => {
                    if (!ex.dose?.length) updateExercise(ex.id, { dose: [{ unit: 'sets', value: '' }] });
                    setDoseOpen(ex.id);
                  }}
                  className="shrink-0 text-xs text-textDim hover:text-accent"
                  title={t('Add a structured dose (sets, hold, rest, distance…) to this exercise')}
                >
                  + {t('dose')}
                </button>
              )}
              <button
                onClick={() => removeExercise(ex.id)}
                className="text-red text-sm px-1"
                title={t('Remove exercise')}
              >
                ✕
              </button>
            </div>
            {doseOpen === ex.id ? (
              <div className="ml-6 space-y-1.5 rounded-lg border border-border bg-panel/50 p-2">
                <DoseEditor dose={ex.dose ?? []} onChange={(d) => updateExercise(ex.id, { dose: d })} />
                <div className="flex justify-end">
                  <button onClick={() => setDoseOpen(null)} className="text-xs text-accent hover:underline">
                    {t('Done')}
                  </button>
                </div>
              </div>
            ) : ex.dose?.length ? (
              <div className="ml-6">
                <DoseChips dose={ex.dose} onClick={() => setDoseOpen(ex.id)} />
              </div>
            ) : null}
          </div>
        ))}
        <button onClick={addExercise} className="text-xs text-accent hover:underline">
          {t('+ exercise')}
        </button>
      </div>

      {/* Free-text notes (mode #1), use either or both */}
      <div className="space-y-1">
        <span className="block text-xs text-textDim uppercase tracking-wide">{t('Notes / full text')}</span>
        <textarea
          className="field min-h-20"
          placeholder={t('Or write the session in plain text: warm-up, cues, anything.')}
          value={session.body}
          onChange={(e) => onChange({ body: e.target.value })}
        />
      </div>

      <div className="flex gap-2">
        <select
          className="field w-auto"
          value={session.mode}
          onChange={(e) => onChange({ mode: e.target.value as BuilderSession['mode'] })}
        >
          {SESSION_MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          className="field flex-1"
          placeholder={t('Type (optional), e.g. CWT, CO₂ table')}
          value={session.sessionType}
          onChange={(e) => onChange({ sessionType: e.target.value })}
        />
      </div>

      {/* Coach's target difficulty for this session, 1-10 — the same scale the
          athlete rates on, so the app can show intended-vs-actual effort. */}
      <div className="space-y-1">
        <span className="block text-xs text-textDim uppercase tracking-wide">
          {t('Target effort (optional)')}
        </span>
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
            const picked = session.coachTarget === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => onChange({ coachTarget: picked ? undefined : n })}
                className={`h-8 w-8 rounded-md border text-sm ${
                  picked
                    ? 'border-accent bg-accent/15 text-text'
                    : 'border-border text-textDim hover:border-accent'
                }`}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <button onClick={onDelete} className="text-red text-sm">
          {t('Delete')}
        </button>
        <button
          onClick={() => {
            const name = prompt(tr('Template name'), session.label.trim());
            if (name !== null) saveSessionTemplate(name, session);
          }}
          className="ml-auto text-xs text-textDim hover:text-accent"
          title={t('Save this whole session (exercises, doses, notes) for one-click reuse via + from template')}
        >
          {t('Save as template')}
        </button>
        <button
          onClick={onClose}
          className="glow-accent text-sm bg-accent text-ink rounded-lg px-3 py-1.5 font-heading tracking-wide"
        >
          {t('Done')}
        </button>
      </div>
    </div>
  );
}
