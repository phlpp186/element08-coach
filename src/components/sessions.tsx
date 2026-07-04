import { useState, type ReactNode } from 'react';
import { uid, type BuilderSession, type PlanMode } from '../lib/e08plan';
import { ExerciseInput } from './ExerciseInput';
import { recordUseByDescription } from '../lib/library';
import { useT } from '../i18n';

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
  disabledText,
}: {
  sessions: BuilderSession[];
  editing: string | null;
  setEditing: (id: string | null) => void;
  onAdd: () => void;
  onChange: (id: string, patch: Partial<BuilderSession>) => void;
  onRemove: (id: string) => void;
  /** When set, the "+ session" button is replaced by this dim note. */
  disabledText?: string;
}) {
  const t = useT();
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
        <button onClick={onAdd} className="text-xs text-textDim hover:text-accent">
          {t('+ session')}
        </button>
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
  const addExercise = () =>
    onChange({ exercises: [...session.exercises, { id: uid('ex'), description: '' }] });
  const updateExercise = (id: string, description: string) =>
    onChange({
      exercises: session.exercises.map((e) => (e.id === id ? { ...e, description } : e)),
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
            onChange({ exercises: [...session.exercises, { id: uid('ex'), description: d }] });
          }
        }}
      >
        <span className="block text-xs text-textDim uppercase tracking-wide">
          {t('Exercises (optional) · drag from your library')}
        </span>
        {session.exercises.map((ex, i) => (
          <div key={ex.id} className="flex gap-2 items-center">
            <span className="text-textDim text-xs font-mono w-4 shrink-0">{i + 1}</span>
            <ExerciseInput
              value={ex.description}
              placeholder={t('e.g. 3×25m bi-fins, 5 min rest')}
              onChange={(v) => updateExercise(ex.id, v)}
            />
            <button
              onClick={() => removeExercise(ex.id)}
              className="text-red text-sm px-1"
              title={t('Remove exercise')}
            >
              ✕
            </button>
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
      <div className="flex items-center justify-between pt-1">
        <button onClick={onDelete} className="text-red text-sm">
          {t('Delete')}
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
