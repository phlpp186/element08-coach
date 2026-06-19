import { useMemo, useState, type ReactNode } from 'react';
import {
  DAY_LABELS,
  downloadPlanFile,
  mondayOf,
  isoDate,
  planIssues,
  planStats,
  uid,
  type BuilderPlan,
  type BuilderSession,
  type BuilderWeek,
  type Intensity,
  type PlanMode,
} from './lib/e08plan';

const INTENSITIES: Intensity[] = ['recovery', 'low', 'medium', 'high', 'max'];
const MODES: { id: PlanMode; label: string }[] = [
  { id: 'depth', label: 'Depth' },
  { id: 'pool', label: 'Pool' },
  { id: 'general', label: 'General' },
];
const SESSION_MODES: BuilderSession['mode'][] = ['depth', 'pool', 'dry', 'general'];

function emptyWeek(): BuilderWeek {
  return { focus: '', intensity: 'medium', notes: '', sessions: [] };
}

function newSession(dayOfWeek: number, mode: PlanMode): BuilderSession {
  return { id: uid('sess'), dayOfWeek, label: '', body: '', mode, sessionType: '' };
}

function initialPlan(): BuilderPlan {
  return {
    name: '',
    coach: '',
    description: '',
    mode: 'depth',
    startDate: mondayOf(isoDate(new Date())),
    weeks: [emptyWeek()],
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
            <Labeled label="Plan name">
              <input
                className="field"
                placeholder="e.g. 12-Week Depth Progression"
                value={plan.name}
                onChange={(e) => setMeta({ name: e.target.value })}
              />
            </Labeled>
            <Labeled label="Coach name (shown as author)">
              <input
                className="field"
                placeholder="Your name"
                value={plan.coach}
                onChange={(e) => setMeta({ coach: e.target.value })}
              />
            </Labeled>
            <Labeled label="Start date (Monday)">
              <input
                type="date"
                className="field"
                value={plan.startDate}
                onChange={(e) => setMeta({ startDate: mondayOf(e.target.value) })}
              />
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

        {/* Weeks */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg">Weeks</h2>
            <button
              onClick={addWeek}
              className="text-sm text-accent border border-border rounded-lg px-3 py-1.5 hover:border-accent"
            >
              + Add week
            </button>
          </div>

          {plan.weeks.map((week, wi) => (
            <div key={wi} className="rounded-xl border border-border bg-panel p-4 space-y-3">
              <div className="flex items-center gap-3">
                <span className="font-heading text-accent">WEEK {wi + 1}</span>
                <input
                  className="field flex-1"
                  placeholder="Focus, e.g. CO₂ capacity"
                  value={week.focus}
                  onChange={(e) => updateWeek(wi, { focus: e.target.value })}
                />
                <select
                  className="field w-auto"
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
                    className="text-red text-sm px-2"
                    title="Remove week"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {DAY_LABELS.map((dayLabel, day) => {
                  const daySessions = week.sessions.filter((s) => s.dayOfWeek === day);
                  return (
                    <div key={day} className="flex gap-3 items-start">
                      <div className="w-10 shrink-0 text-textDim text-sm pt-2 font-mono">
                        {dayLabel}
                      </div>
                      <div className="flex-1 space-y-2">
                        {daySessions.map((s) =>
                          editing === s.id ? (
                            <SessionEditor
                              key={s.id}
                              session={s}
                              onChange={(patch) => updateSession(wi, s.id, patch)}
                              onClose={() => setEditing(null)}
                              onDelete={() => {
                                removeSession(wi, s.id);
                                setEditing(null);
                              }}
                            />
                          ) : (
                            <SessionChip
                              key={s.id}
                              session={s}
                              onEdit={() => setEditing(s.id)}
                            />
                          ),
                        )}
                        <button
                          onClick={() => addSession(wi, day)}
                          className="text-xs text-textDim hover:text-accent"
                        >
                          + session
                        </button>
                      </div>
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
          ))}
        </section>
      </main>

      {/* Export bar */}
      <div className="fixed bottom-0 inset-x-0 border-t border-border bg-abyss/95 backdrop-blur px-5 py-3">
        <div className="mx-auto max-w-4xl flex items-center gap-4">
          <div className="text-sm text-textDim flex-1">
            {stats.weeks} week{stats.weeks === 1 ? '' : 's'} · {stats.sessions} session
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

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-textDim uppercase tracking-wide mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function SessionChip({ session, onEdit }: { session: BuilderSession; onEdit: () => void }) {
  return (
    <button
      onClick={onEdit}
      className="w-full text-left rounded-lg border border-border bg-abyss px-3 py-2 hover:border-accent"
    >
      <div className="text-sm text-text">{session.label.trim() || 'Untitled session'}</div>
      {session.body.trim() && (
        <div className="text-xs text-textDim truncate mt-0.5">{session.body.trim()}</div>
      )}
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
  return (
    <div className="rounded-lg border border-accent bg-abyss p-3 space-y-2">
      <input
        className="field"
        placeholder="Session title, e.g. Pool CO₂ table"
        value={session.label}
        onChange={(e) => onChange({ label: e.target.value })}
      />
      <textarea
        className="field min-h-24"
        placeholder="Write the session in plain text — warm-up, main set, rest, cues, anything."
        value={session.body}
        onChange={(e) => onChange({ body: e.target.value })}
      />
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
