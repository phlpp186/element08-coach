import { useState } from 'react';
import {
  DISCIPLINES,
  DISCIPLINE_GROUPS,
  disciplineById,
  formatValue,
  parseValue,
  valueHint,
  type Discipline,
} from '../lib/disciplines';
import { uid, downloadPlanFile } from '../lib/e08plan';
import {
  bestEntry,
  pbHistory,
  relativeDays,
  today,
} from '../lib/athleteStats';
import {
  deleteAthlete,
  deletePlan,
  updateAthlete,
  useAthlete,
  useSavedPlans,
} from '../lib/store';
import { Sparkline } from '../components/Sparkline';
import { Labeled } from '../components/sessions';
import { navigate } from '../hooks/useHashRoute';
import type {
  Athlete,
  Competition,
  GoalEntry,
  PBEntry,
  ProgressNote,
} from '../lib/types';

export function AthleteDetailView({ athleteId }: { athleteId: string }) {
  const athlete = useAthlete(athleteId);
  const plans = useSavedPlans().filter((p) => p.athleteId === athleteId);

  if (!athlete) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-10 text-center text-textDim">
        <p className="mb-3">That athlete no longer exists.</p>
        <button onClick={() => navigate('/athletes')} className="text-accent hover:underline">
          Back to roster
        </button>
      </main>
    );
  }

  const patch = (p: Partial<Athlete>) => updateAthlete(athlete.id, p);

  const remove = () => {
    if (confirm(`Delete ${athlete.name || 'this athlete'}? Their attached plans are kept but unlinked.`)) {
      deleteAthlete(athlete.id);
      navigate('/athletes');
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-5 py-6 space-y-8">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/athletes')} className="text-sm text-accent hover:underline shrink-0">
          ← Roster
        </button>
        <input
          className="field text-lg flex-1"
          placeholder="Athlete name"
          value={athlete.name}
          onChange={(e) => patch({ name: e.target.value })}
        />
        <button onClick={remove} className="text-red text-sm shrink-0 hover:underline">
          Delete
        </button>
      </div>

      {/* Profile */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Labeled label="Contact (optional)">
          <input className="field" placeholder="email / handle" value={athlete.contact ?? ''} onChange={(e) => patch({ contact: e.target.value })} />
        </Labeled>
        <Labeled label="Location (optional)">
          <input className="field" placeholder="e.g. Dahab" value={athlete.location ?? ''} onChange={(e) => patch({ location: e.target.value })} />
        </Labeled>
        <Labeled label="Coaching from">
          <input type="date" className="field" value={athlete.coachingFrom ?? ''} onChange={(e) => patch({ coachingFrom: e.target.value })} />
        </Labeled>
        <Labeled label="Coaching to">
          <input type="date" className="field" value={athlete.coachingTo ?? ''} onChange={(e) => patch({ coachingTo: e.target.value })} />
        </Labeled>
        <div className="sm:col-span-2">
          <Labeled label="Notes (optional)">
            <textarea
              className="field min-h-16"
              placeholder="Background, strengths, things to watch, equalisation notes…"
              value={athlete.notes ?? ''}
              onChange={(e) => patch({ notes: e.target.value })}
            />
          </Labeled>
        </div>
      </section>

      <PBSection athlete={athlete} patch={patch} />
      <GoalSection athlete={athlete} patch={patch} />
      <CompetitionSection athlete={athlete} patch={patch} />
      <ProgressSection athlete={athlete} patch={patch} />

      {/* Plans */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base">Plans</h3>
          <button
            onClick={() => navigate(`/plan/new?athlete=${athlete.id}`)}
            className="text-sm bg-accent text-ink rounded-lg px-3 py-1.5 font-heading tracking-wide"
          >
            + Build a plan
          </button>
        </div>
        {plans.length === 0 ? (
          <p className="text-textDim text-sm">No plans yet. Build one — the athlete's next competition pre-fills a season.</p>
        ) : (
          <div className="space-y-2">
            {plans.map((sp) => (
              <div key={sp.id} className="flex items-center gap-3 rounded-lg border border-border bg-panel px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-text truncate">{sp.plan.name || 'Untitled plan'}</div>
                  <div className="text-xs text-textDim">
                    {sp.plan.kind === 'season' ? 'Season' : 'Training'} · updated {sp.updatedAt.slice(0, 10)}
                  </div>
                </div>
                <button onClick={() => navigate(`/plan/${sp.id}`)} className="text-sm text-accent hover:underline shrink-0">
                  Edit
                </button>
                <button onClick={() => downloadPlanFile(sp.plan)} className="text-sm text-textDim hover:text-accent shrink-0">
                  Download
                </button>
                <button
                  onClick={() => confirm('Delete this saved plan?') && deletePlan(sp.id)}
                  className="text-red text-sm shrink-0"
                  title="Delete plan"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

// ── Personal bests ────────────────────────────────────────────────────────────

function PBSection({ athlete, patch }: { athlete: Athlete; patch: (p: Partial<Athlete>) => void }) {
  const [disc, setDisc] = useState<string>(DISCIPLINES[0].id);
  const [val, setVal] = useState('');
  const [date, setDate] = useState(today());
  const [expanded, setExpanded] = useState<string | null>(null);

  const addPB = () => {
    const d = disciplineById(disc);
    if (!d) return;
    const v = parseValue(d, val);
    if (v == null) {
      alert(`Enter a valid value (${valueHint(d)}).`);
      return;
    }
    const entry: PBEntry = { id: uid('pb'), value: v, date: date || today() };
    patch({ pbs: { ...athlete.pbs, [disc]: [...(athlete.pbs[disc] ?? []), entry] } });
    setVal('');
  };

  const removePB = (disciplineId: string, entryId: string) => {
    const next = (athlete.pbs[disciplineId] ?? []).filter((e) => e.id !== entryId);
    patch({ pbs: { ...athlete.pbs, [disciplineId]: next } });
  };

  const withData = DISCIPLINES.filter((d) => (athlete.pbs[d.id]?.length ?? 0) > 0);
  const selected = disciplineById(disc)!;

  return (
    <section className="space-y-3">
      <h3 className="text-base">Personal bests</h3>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-panel p-3">
        <label className="text-xs text-textDim">
          <span className="block mb-1 uppercase tracking-wide">Discipline</span>
          <select className="field w-auto" value={disc} onChange={(e) => setDisc(e.target.value)}>
            {DISCIPLINE_GROUPS.map((g) => (
              <optgroup key={g} label={g}>
                {DISCIPLINES.filter((d) => d.group === g).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label} — {d.full}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="text-xs text-textDim">
          <span className="block mb-1 uppercase tracking-wide">Mark</span>
          <input
            className="field w-28"
            placeholder={valueHint(selected)}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addPB()}
          />
        </label>
        <label className="text-xs text-textDim">
          <span className="block mb-1 uppercase tracking-wide">Date</span>
          <input type="date" className="field w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button onClick={addPB} className="text-sm text-accent border border-border rounded-lg px-3 py-2 hover:border-accent">
          Log PB
        </button>
      </div>

      {withData.length === 0 ? (
        <p className="text-textDim text-sm">No PBs logged yet.</p>
      ) : (
        <div className="space-y-1">
          {withData.map((d) => (
            <PBRow
              key={d.id}
              discipline={d}
              history={pbHistory(athlete, d.id)}
              open={expanded === d.id}
              onToggle={() => setExpanded(expanded === d.id ? null : d.id)}
              onRemove={(entryId) => removePB(d.id, entryId)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PBRow({
  discipline,
  history,
  open,
  onToggle,
  onRemove,
}: {
  discipline: Discipline;
  history: PBEntry[];
  open: boolean;
  onToggle: () => void;
  onRemove: (entryId: string) => void;
}) {
  const best = bestEntry(history)!;
  const values = history.map((e) => e.value);
  return (
    <div className="rounded-lg border border-border bg-panel">
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-3 py-2 text-left">
        <span className="text-textDim text-xs">{open ? '▾' : '▸'}</span>
        <span className="font-mono text-sm w-14 shrink-0 text-textDim">{discipline.label}</span>
        <span className="text-text">{formatValue(discipline, best.value)}</span>
        <span className="ml-auto flex items-center gap-3">
          {history.length > 1 && <Sparkline values={values} />}
          <span className="text-xs text-textDim">{history.length} mark{history.length === 1 ? '' : 's'}</span>
        </span>
      </button>
      {open && (
        <div className="px-3 pb-2 space-y-1">
          {[...history].reverse().map((e) => (
            <div key={e.id} className="flex items-center gap-3 text-sm">
              <span className="text-text w-20">{formatValue(discipline, e.value)}</span>
              <span className="text-textDim text-xs">{e.date}</span>
              {e === best && <span className="text-accent text-xs">PB</span>}
              <button onClick={() => onRemove(e.id)} className="ml-auto text-red text-xs" title="Remove">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Goals ─────────────────────────────────────────────────────────────────────

function GoalSection({ athlete, patch }: { athlete: Athlete; patch: (p: Partial<Athlete>) => void }) {
  const add = () => {
    const goal: GoalEntry = { id: uid('goal'), discipline: DISCIPLINES[0].id, target: 0 };
    patch({ goals: [...athlete.goals, goal] });
  };
  const update = (id: string, p: Partial<GoalEntry>) =>
    patch({ goals: athlete.goals.map((g) => (g.id === id ? { ...g, ...p } : g)) });
  const remove = (id: string) => patch({ goals: athlete.goals.filter((g) => g.id !== id) });

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base">Goals</h3>
        <button onClick={add} className="text-sm text-accent border border-border rounded-lg px-3 py-1.5 hover:border-accent">
          + Add goal
        </button>
      </div>
      {athlete.goals.length === 0 ? (
        <p className="text-textDim text-sm">No goals set.</p>
      ) : (
        <div className="space-y-2">
          {athlete.goals.map((g) => (
            <GoalRow key={g.id} goal={g} onChange={(p) => update(g.id, p)} onRemove={() => remove(g.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

function GoalRow({ goal, onChange, onRemove }: { goal: GoalEntry; onChange: (p: Partial<GoalEntry>) => void; onRemove: () => void }) {
  const d = disciplineById(goal.discipline)!;
  const [text, setText] = useState(goal.target ? formatValue(d, goal.target).replace(' m', '') : '');
  const commit = (raw: string) => {
    const v = parseValue(d, raw);
    if (v != null) onChange({ target: v });
  };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-panel px-3 py-2">
      <select
        className="field w-auto"
        value={goal.discipline}
        onChange={(e) => {
          onChange({ discipline: e.target.value });
          setText('');
        }}
      >
        {DISCIPLINES.map((dd) => (
          <option key={dd.id} value={dd.id}>
            {dd.label}
          </option>
        ))}
      </select>
      <input
        className="field w-28"
        placeholder={valueHint(d)}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
      />
      <input
        type="date"
        className="field w-auto"
        value={goal.targetDate ?? ''}
        onChange={(e) => onChange({ targetDate: e.target.value })}
        title="Target date (optional)"
      />
      <input
        className="field flex-1 min-w-32"
        placeholder="Note (optional)"
        value={goal.note ?? ''}
        onChange={(e) => onChange({ note: e.target.value })}
      />
      <button onClick={onRemove} className="text-red text-sm" title="Remove goal">
        ✕
      </button>
    </div>
  );
}

// ── Competitions ──────────────────────────────────────────────────────────────

function CompetitionSection({ athlete, patch }: { athlete: Athlete; patch: (p: Partial<Athlete>) => void }) {
  const add = () => {
    const c: Competition = { id: uid('comp'), name: '', date: today() };
    patch({ competitions: [...athlete.competitions, c] });
  };
  const update = (id: string, p: Partial<Competition>) =>
    patch({ competitions: athlete.competitions.map((c) => (c.id === id ? { ...c, ...p } : c)) });
  const remove = (id: string) => patch({ competitions: athlete.competitions.filter((c) => c.id !== id) });

  const sorted = [...athlete.competitions].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base">Competitions</h3>
        <button onClick={add} className="text-sm text-accent border border-border rounded-lg px-3 py-1.5 hover:border-accent">
          + Add competition
        </button>
      </div>
      {sorted.length === 0 ? (
        <p className="text-textDim text-sm">No competitions logged.</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-panel px-3 py-2">
              <input className="field flex-1 min-w-40" placeholder="Competition name" value={c.name} onChange={(e) => update(c.id, { name: e.target.value })} />
              <input type="date" className="field w-auto" value={c.date} onChange={(e) => update(c.id, { date: e.target.value })} />
              <input className="field w-32" placeholder="Location" value={c.location ?? ''} onChange={(e) => update(c.id, { location: e.target.value })} />
              <input className="field w-32" placeholder="Target, e.g. CWT 60m" value={c.target ?? ''} onChange={(e) => update(c.id, { target: e.target.value })} />
              {c.date && <span className="text-xs text-accent">{relativeDays(c.date)}</span>}
              <button onClick={() => remove(c.id)} className="text-red text-sm" title="Remove">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Progress notes ────────────────────────────────────────────────────────────

function ProgressSection({ athlete, patch }: { athlete: Athlete; patch: (p: Partial<Athlete>) => void }) {
  const [text, setText] = useState('');
  const [date, setDate] = useState(today());

  const add = () => {
    if (!text.trim()) return;
    const note: ProgressNote = { id: uid('note'), date: date || today(), text: text.trim() };
    patch({ progress: [...athlete.progress, note] });
    setText('');
  };
  const remove = (id: string) => patch({ progress: athlete.progress.filter((n) => n.id !== id) });

  const sorted = [...athlete.progress].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <section className="space-y-3">
      <h3 className="text-base">Progress log</h3>
      <div className="flex flex-wrap items-start gap-2 rounded-lg border border-border bg-panel p-3">
        <input type="date" className="field w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
        <textarea
          className="field flex-1 min-w-48 min-h-10"
          placeholder="Session feedback, milestone, observation…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button onClick={add} className="text-sm text-accent border border-border rounded-lg px-3 py-2 hover:border-accent">
          Add
        </button>
      </div>
      {sorted.length > 0 && (
        <div className="space-y-2">
          {sorted.map((n) => (
            <div key={n.id} className="flex gap-3 rounded-lg border border-border bg-panel px-3 py-2">
              <span className="text-xs text-textDim font-mono shrink-0 pt-0.5">{n.date}</span>
              <p className="text-sm text-text flex-1 whitespace-pre-wrap">{n.text}</p>
              <button onClick={() => remove(n.id)} className="text-red text-xs shrink-0" title="Remove">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
