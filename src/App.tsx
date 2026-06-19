import { useMemo, useState, type ReactNode } from 'react';
import {
  DAY_LABELS,
  addDays,
  downloadPlanFile,
  dowOf,
  isoDate,
  planIssues,
  planStats,
  uid,
  type BuilderDay,
  type BuilderPlan,
  type BuilderSession,
  type BuilderWeek,
  type Intensity,
  type PlanMode,
  type PlanStructure,
} from './lib/e08plan';
import { ExercisePalette } from './components/ExercisePalette';
import { ExerciseInput } from './components/ExerciseInput';

const INTENSITIES: Intensity[] = ['recovery', 'low', 'medium', 'high', 'max'];
const MODES: { id: PlanMode; label: string }[] = [
  { id: 'depth', label: 'Depth' },
  { id: 'pool', label: 'Pool' },
  { id: 'dry', label: 'Dry' },
  { id: 'general', label: 'General' },
];
const SESSION_MODES: BuilderSession['mode'][] = ['depth', 'pool', 'dry', 'general'];

const STRUCTURES: { id: PlanStructure; label: string }[] = [
  { id: 'weeks', label: 'Weeks' },
  { id: 'days', label: 'Days' },
];

function emptyWeek(): BuilderWeek {
  return { focus: '', intensity: 'medium', notes: '', sessions: [] };
}

function emptyDay(): BuilderDay {
  return { id: uid('day'), sessions: [] };
}

function newSession(dayOfWeek: number, mode: PlanMode): BuilderSession {
  return { id: uid('sess'), dayOfWeek, label: '', body: '', exercises: [], mode, sessionType: '' };
}

const WEEKDAY_FMT = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
/** Human label for the Nth day of a day-based plan, e.g. "Wed 24 Jun". */
function dayDateLabel(startDate: string, di: number): string {
  return WEEKDAY_FMT.format(new Date(`${addDays(startDate, di)}T00:00:00Z`));
}

function initialPlan(): BuilderPlan {
  return {
    name: '',
    coach: '',
    description: '',
    mode: 'depth',
    startDate: isoDate(new Date()),
    structure: 'weeks',
    weeks: [emptyWeek()],
    days: [emptyDay()],
  };
}

export function App() {
  const [plan, setPlan] = useState<BuilderPlan>(initialPlan);
  const [editing, setEditing] = useState<string | null>(null);

  const issues = useMemo(() => planIssues(plan), [plan]);
  const stats = useMemo(() => planStats(plan), [plan]);
  const ready = issues.length === 0;

  // ── immutable updaters ──
  const setMeta = (patch: Partial<BuilderPlan>) => setPlan((p) => ({ ...p, ...patch }));

  const updateWeek = (wi: number, patch: Partial<BuilderWeek>) =>
    setPlan((p) => ({
      ...p,
      weeks: p.weeks.map((w, i) => (i === wi ? { ...w, ...patch } : w)),
    }));

  const addWeek = () => setPlan((p) => ({ ...p, weeks: [...p.weeks, emptyWeek()] }));
  const removeWeek = (wi: number) =>
    setPlan((p) => ({ ...p, weeks: p.weeks.filter((_, i) => i !== wi) }));

  const addSession = (wi: number, dayOfWeek: number) => {
    const s = newSession(dayOfWeek, plan.mode);
    updateWeek(wi, { sessions: [...plan.weeks[wi].sessions, s] });
    setEditing(s.id);
  };
  const updateSession = (wi: number, id: string, patch: Partial<BuilderSession>) =>
    updateWeek(wi, {
      sessions: plan.weeks[wi].sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  const removeSession = (wi: number, id: string) =>
    updateWeek(wi, { sessions: plan.weeks[wi].sessions.filter((s) => s.id !== id) });

  // ── day-mode updaters (sessions live in days; dayOfWeek is derived at export) ──
  const updateDay = (di: number, patch: Partial<BuilderDay>) =>
    setPlan((p) => ({ ...p, days: p.days.map((d, i) => (i === di ? { ...d, ...patch } : d)) }));
  const addDay = () => setPlan((p) => ({ ...p, days: [...p.days, emptyDay()] }));
  const removeDay = (di: number) =>
    setPlan((p) => ({ ...p, days: p.days.filter((_, i) => i !== di) }));
  // Duration control: grow with empty days or trim from the end.
  const setDayCount = (n: number) =>
    setPlan((p) => {
      const target = Math.max(1, Math.min(366, Math.floor(n) || 1));
      if (target === p.days.length) return p;
      const days =
        target > p.days.length
          ? [...p.days, ...Array.from({ length: target - p.days.length }, emptyDay)]
          : p.days.slice(0, target);
      return { ...p, days };
    });
  const addDaySession = (di: number) => {
    const s = newSession(0, plan.mode);
    updateDay(di, { sessions: [...plan.days[di].sessions, s] });
    setEditing(s.id);
  };
  const updateDaySession = (di: number, id: string, patch: Partial<BuilderSession>) =>
    updateDay(di, {
      sessions: plan.days[di].sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  const removeDaySession = (di: number, id: string) =>
    updateDay(di, { sessions: plan.days[di].sessions.filter((s) => s.id !== id) });

  // Append a library exercise to a session by id, wherever it lives (week or day).
  const appendExerciseToSession = (sessionId: string, description: string) => {
    const ex = { id: uid('ex'), description };
    const mapSessions = (sessions: BuilderSession[]) =>
      sessions.map((s) =>
        s.id === sessionId ? { ...s, exercises: [...s.exercises, ex] } : s,
      );
    setPlan((p) => ({
      ...p,
      weeks: p.weeks.map((w) => ({ ...w, sessions: mapSessions(w.sessions) })),
      days: p.days.map((d) => ({ ...d, sessions: mapSessions(d.sessions) })),
    }));
  };

  return (
    <div className="min-h-screen pb-28">
      <header className="border-b border-border px-5 py-4">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-2xl font-heading tracking-wider">
            E<span className="text-red">|</span>08{' '}
            <span className="text-textDim font-body text-base align-middle">Coach</span>
          </h1>
          <p className="text-textDim text-sm mt-1">
            Build a training plan and hand it to your athletes as a file. No account, no sign-up.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-6 space-y-8">
        {/* Plan details */}
        <section className="space-y-4">
          <h2 className="text-lg">Plan details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Labeled label="Plan name" required>
              <input
                className="field"
                placeholder="e.g. 12-Week Depth Progression"
                value={plan.name}
                onChange={(e) => setMeta({ name: e.target.value })}
              />
            </Labeled>
            <Labeled label="Coach name (shown as author)" required>
              <input
                className="field"
                placeholder="Your name"
                value={plan.coach}
                onChange={(e) => setMeta({ coach: e.target.value })}
              />
            </Labeled>
            <Labeled label="Start date">
              <input
                type="date"
                className="field"
                value={plan.startDate}
                onChange={(e) => setMeta({ startDate: e.target.value || plan.startDate })}
              />
              <span className="block text-xs text-textDim mt-1">
                Any day. Week 1 starts here; it runs to the following Sunday, then full
                Mon to Sun weeks.
              </span>
            </Labeled>
            <Labeled label="Mode">
              <select
                className="field"
                value={plan.mode}
                onChange={(e) => setMeta({ mode: e.target.value as PlanMode })}
              >
                {MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Labeled>
            <div className="sm:col-span-2">
              <Labeled label="Description (optional)">
                <input
                  className="field"
                  placeholder="One line the athlete sees on import"
                  value={plan.description}
                  onChange={(e) => setMeta({ description: e.target.value })}
                />
              </Labeled>
            </div>
          </div>
        </section>

        <ExercisePalette
          onUse={(desc) => {
            if (editing) appendExerciseToSession(editing, desc);
          }}
        />

        {/* Schedule: weeks or days */}
        <section className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-lg">Schedule</h2>
              <div className="flex rounded-lg border border-border overflow-hidden">
                {STRUCTURES.map((st) => (
                  <button
                    key={st.id}
                    onClick={() => setMeta({ structure: st.id })}
                    className={`px-3 py-1.5 text-sm ${
                      plan.structure === st.id ? 'bg-accent text-deep' : 'text-textDim'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>
            {plan.structure === 'weeks' ? (
              <button
                onClick={addWeek}
                className="text-sm text-accent border border-border rounded-lg px-3 py-1.5 hover:border-accent"
              >
                + Add week
              </button>
            ) : (
              <div className="flex items-center gap-2 text-sm text-textDim">
                <span>Duration</span>
                <input
                  type="number"
                  min={1}
                  max={366}
                  value={plan.days.length}
                  onChange={(e) => setDayCount(Number(e.target.value))}
                  className="field w-20 text-center"
                />
                <span>days</span>
              </div>
            )}
          </div>

          {plan.structure === 'weeks'
            ? plan.weeks.map((week, wi) => (
                <div key={wi} className="rounded-xl border border-border bg-panel p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="font-heading text-accent whitespace-nowrap shrink-0">
                      WEEK {wi + 1}
                    </span>
                    <select
                      className="field w-auto ml-auto"
                      value={week.intensity}
                      onChange={(e) => updateWeek(wi, { intensity: e.target.value as Intensity })}
                    >
                      {INTENSITIES.map((i) => (
                        <option key={i} value={i}>
                          {i}
                        </option>
                      ))}
                    </select>
                    {plan.weeks.length > 1 && (
                      <button
                        onClick={() => removeWeek(wi)}
                        className="text-red text-sm px-2 shrink-0"
                        title="Remove week"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <input
                    className="field"
                    placeholder="Week focus (optional), e.g. CO₂ capacity"
                    value={week.focus}
                    onChange={(e) => updateWeek(wi, { focus: e.target.value })}
                  />

                  <div className="space-y-2">
                    {DAY_LABELS.map((dayLabel, day) => {
                      const beforeStart = wi === 0 && day < dowOf(plan.startDate);
                      const daySessions = week.sessions.filter((s) => s.dayOfWeek === day);
                      return (
                        <div
                          key={day}
                          className={`flex gap-3 items-start ${beforeStart ? 'opacity-40' : ''}`}
                        >
                          <div className="w-10 shrink-0 text-textDim text-sm pt-2 font-mono">
                            {dayLabel}
                          </div>
                          <SessionList
                            sessions={daySessions}
                            editing={editing}
                            setEditing={setEditing}
                            onAdd={() => addSession(wi, day)}
                            onChange={(id, patch) => updateSession(wi, id, patch)}
                            onRemove={(id) => removeSession(wi, id)}
                            disabledText={beforeStart ? 'before plan start' : undefined}
                          />
                        </div>
                      );
                    })}
                  </div>

                  <input
                    className="field"
                    placeholder="Week notes (optional)"
                    value={week.notes}
                    onChange={(e) => updateWeek(wi, { notes: e.target.value })}
                  />
                </div>
              ))
            : plan.days.map((day, di) => (
                <div
                  key={day.id}
                  className="rounded-xl border border-border bg-panel p-4 space-y-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-heading text-accent whitespace-nowrap shrink-0">
                      DAY {di + 1}
                    </span>
                    <span className="text-textDim text-sm">{dayDateLabel(plan.startDate, di)}</span>
                    {plan.days.length > 1 && (
                      <button
                        onClick={() => removeDay(di)}
                        className="text-red text-sm px-2 shrink-0 ml-auto"
                        title="Remove day"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <SessionList
                    sessions={day.sessions}
                    editing={editing}
                    setEditing={setEditing}
                    onAdd={() => addDaySession(di)}
                    onChange={(id, patch) => updateDaySession(di, id, patch)}
                    onRemove={(id) => removeDaySession(di, id)}
                  />
                </div>
              ))}
          {plan.structure === 'days' && (
            <button
              onClick={addDay}
              className="text-sm text-accent border border-border rounded-lg px-3 py-1.5 hover:border-accent"
            >
              + Add day
            </button>
          )}
        </section>
      </main>

      {/* Export bar */}
      <div className="fixed bottom-0 inset-x-0 border-t border-border bg-abyss/95 backdrop-blur px-5 py-3">
        <div className="mx-auto max-w-4xl flex items-center gap-4">
          <div className="text-sm text-textDim flex-1">
            {stats.units} {stats.unitLabel}
            {stats.units === 1 ? '' : 's'} · {stats.sessions} session
            {stats.sessions === 1 ? '' : 's'}
            {!ready && <span className="text-amber ml-2">· {issues[0]}</span>}
          </div>
          <button
            disabled={!ready}
            onClick={() => downloadPlanFile(plan)}
            className="rounded-lg px-4 py-2 font-heading tracking-wide disabled:opacity-40 bg-accent text-deep"
          >
            Download .e08plan
          </button>
        </div>
      </div>
    </div>
  );
}

function SessionList({
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
          + session
        </button>
      )}
    </div>
  );
}

function Labeled({
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

function SessionChip({ session, onEdit }: { session: BuilderSession; onEdit: () => void }) {
  const exCount = session.exercises.filter((e) => e.description.trim()).length;
  const hint = exCount > 0 ? `${exCount} exercise${exCount === 1 ? '' : 's'}` : session.body.trim();
  return (
    <button
      onClick={onEdit}
      className="w-full text-left rounded-lg border border-border bg-abyss px-3 py-2 hover:border-accent"
    >
      <div className="text-sm text-text">{session.label.trim() || 'Untitled session'}</div>
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
        placeholder="Session title, e.g. Pool CO₂ table"
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
          if (d) onChange({ exercises: [...session.exercises, { id: uid('ex'), description: d }] });
        }}
      >
        <span className="block text-xs text-textDim uppercase tracking-wide">
          Exercises (optional) · drag from your library
        </span>
        {session.exercises.map((ex, i) => (
          <div key={ex.id} className="flex gap-2 items-center">
            <span className="text-textDim text-xs font-mono w-4 shrink-0">{i + 1}</span>
            <ExerciseInput
              value={ex.description}
              placeholder="e.g. 3×25m bi-fins, 5 min rest"
              onChange={(v) => updateExercise(ex.id, v)}
            />
            <button
              onClick={() => removeExercise(ex.id)}
              className="text-red text-sm px-1"
              title="Remove exercise"
            >
              ✕
            </button>
          </div>
        ))}
        <button onClick={addExercise} className="text-xs text-accent hover:underline">
          + exercise
        </button>
      </div>

      {/* Free-text notes (mode #1), use either or both */}
      <div className="space-y-1">
        <span className="block text-xs text-textDim uppercase tracking-wide">Notes / full text</span>
        <textarea
          className="field min-h-20"
          placeholder="Or write the session in plain text: warm-up, cues, anything."
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
          placeholder="Type (optional), e.g. CWT, CO₂ table"
          value={session.sessionType}
          onChange={(e) => onChange({ sessionType: e.target.value })}
        />
      </div>
      <div className="flex items-center justify-between pt-1">
        <button onClick={onDelete} className="text-red text-sm">
          Delete
        </button>
        <button
          onClick={onClose}
          className="text-sm bg-accent text-deep rounded-lg px-3 py-1.5 font-heading tracking-wide"
        >
          Done
        </button>
      </div>
    </div>
  );
}
