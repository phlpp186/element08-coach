import { useMemo, useState } from 'react';
import { daysBetween } from '../lib/planHelpers';
import {
  addDays,
  DAY_LABELS,
  dayDate,
  downloadPlanFile,
  dowOf,
  emptyDay,
  emptyPhase,
  generateSeasonSkeleton,
  initialPlan,
  isoDate,
  MESO_LABEL,
  mondayOf,
  normalizePlan,
  planIssues,
  planStats,
  DEFAULT_INTENSITY,
  type BuilderDay,
  type BuilderPhase,
  type BuilderPlan,
  type BuilderWeek,
  type PlanKind,
  type PlanMode,
  type PlanStructure,
} from '../lib/e08plan';
import { ExercisePalette, type AssignTarget } from '../components/ExercisePalette';
import { defaultDoseFor, materializeSessionTemplate, recordUseByDescription } from '../lib/library';
import { Labeled, SessionList } from '../components/sessions';
import { WeekCard } from '../components/WeekCard';
import { PhaseCard } from '../components/PhaseCard';
import { navigate } from '../hooks/useHashRoute';
import {
  newPlanId,
  upsertPlan,
  useAthletes,
  useSavedPlan,
} from '../lib/store';
import type { Athlete } from '../lib/types';
import { AssignToConnectedButton } from '../components/AssignToConnectedButton';
import { InfoTip } from '../components/InfoTip';
import { useT } from '../i18n';

const MODES: { id: PlanMode; label: string }[] = [
  { id: 'depth', label: 'Depth' },
  { id: 'pool', label: 'Pool' },
  { id: 'dry', label: 'Dry' },
  { id: 'general', label: 'General' },
];
const KINDS: { id: PlanKind; label: string }[] = [
  { id: 'training', label: 'Training plan' },
  { id: 'season', label: 'Season plan' },
];
const STRUCTURES: { id: PlanStructure; label: string }[] = [
  { id: 'weeks', label: 'Weeks' },
  { id: 'days', label: 'Days' },
];

const WEEKDAY_FMT = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
/** Weekday name (e.g. "Monday") for an ISO date — shown beside the editable
 *  date picker for quick orientation. */
function weekdayLabel(isoDay: string): string {
  return WEEKDAY_FMT.format(new Date(`${isoDay}T00:00:00Z`));
}

/** Build the initial working plan for this mount: load a saved plan, or start a
 *  fresh one (optionally pre-filled for an athlete + their next competition). */
function makeInitial(saved: BuilderPlan | undefined, athlete: Athlete | undefined): BuilderPlan {
  if (saved) return normalizePlan(saved);
  const p = initialPlan();
  if (!athlete) return p;
  p.name = `${athlete.name.trim() || 'Athlete'} plan`;
  const nextComp = [...athlete.competitions]
    .filter((c) => c.date && c.date >= p.startDate)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (nextComp) {
    const weeks = Math.max(1, Math.ceil(daysBetween(p.startDate, nextComp.date) / 7));
    p.kind = 'season';
    p.competitionDate = nextComp.date;
    p.phases = generateSeasonSkeleton(weeks);
  }
  return p;
}

export function PlanBuilderView({
  planId,
  presetAthleteId,
}: {
  planId: string | null;
  presetAthleteId: string | null;
}) {
  const t = useT();
  const athletes = useAthletes();
  const saved = useSavedPlan(planId);
  const presetAthlete = athletes.find((a) => a.id === presetAthleteId);

  const [plan, setPlan] = useState<BuilderPlan>(() => makeInitial(saved?.plan, presetAthlete));
  const [recordId, setRecordId] = useState<string | null>(saved?.id ?? null);
  const [athleteId, setAthleteId] = useState<string | null>(saved?.athleteId ?? presetAthleteId);
  const [editing, setEditing] = useState<string | null>(null);
  const [openPhase, setOpenPhase] = useState<string | null>(plan.phases[0]?.id ?? null);
  const [dirty, setDirty] = useState(false);
  const [savedTick, setSavedTick] = useState(false);

  const issues = useMemo(() => planIssues(plan), [plan]);
  const stats = useMemo(() => planStats(plan), [plan]);
  const ready = issues.length === 0;

  // ── updaters ──
  const mutate = (fn: (p: BuilderPlan) => BuilderPlan) => {
    setPlan(fn);
    setDirty(true);
    setSavedTick(false);
  };
  const setMeta = (patch: Partial<BuilderPlan>) => mutate((p) => ({ ...p, ...patch }));

  // weeks (training)
  const updateWeek = (wi: number, patch: Partial<BuilderWeek>) =>
    mutate((p) => ({ ...p, weeks: p.weeks.map((w, i) => (i === wi ? { ...w, ...patch } : w)) }));
  const addWeek = () =>
    mutate((p) => ({
      ...p,
      weeks: [...p.weeks, { focus: '', intensity: DEFAULT_INTENSITY, notes: '', sessions: [] }],
    }));
  const removeWeek = (wi: number) => mutate((p) => ({ ...p, weeks: p.weeks.filter((_, i) => i !== wi) }));

  // days (training)
  const updateDay = (di: number, patch: Partial<BuilderDay>) =>
    mutate((p) => ({ ...p, days: p.days.map((d, i) => (i === di ? { ...d, ...patch } : d)) }));
  const addDay = () => mutate((p) => ({ ...p, days: [...p.days, emptyDay()] }));
  const removeDay = (di: number) => mutate((p) => ({ ...p, days: p.days.filter((_, i) => i !== di) }));
  const setDayCount = (n: number) =>
    mutate((p) => {
      const target = Math.max(1, Math.min(366, Math.floor(n) || 1));
      if (target === p.days.length) return p;
      const days =
        target > p.days.length
          ? [...p.days, ...Array.from({ length: target - p.days.length }, emptyDay)]
          : p.days.slice(0, target);
      return { ...p, days };
    });

  // phases (season)
  const updatePhase = (pi: number, patch: Partial<BuilderPhase>) =>
    mutate((p) => ({ ...p, phases: p.phases.map((ph, i) => (i === pi ? { ...ph, ...patch } : ph)) }));
  const addPhase = () => {
    const ph = emptyPhase('build');
    mutate((p) => ({ ...p, phases: [...p.phases, ph] }));
    setOpenPhase(ph.id);
  };
  const removePhase = (pi: number) => mutate((p) => ({ ...p, phases: p.phases.filter((_, i) => i !== pi) }));
  const [genWeeks, setGenWeeks] = useState(12);
  const regenerate = () => {
    const phases = generateSeasonSkeleton(genWeeks);
    mutate((p) => ({ ...p, kind: 'season', phases }));
    setOpenPhase(phases[0]?.id ?? null);
  };

  // append exercises to MANY sessions at once (multi-assign)
  const appendExercisesToSessions = (sessionIds: string[], descriptions: string[]) => {
    if (!sessionIds.length || !descriptions.length) return;
    recordUseByDescription(descriptions);
    const ids = new Set(sessionIds);
    const stamp = Date.now().toString(36);
    const withDose = descriptions.map((description) => ({ description, dose: defaultDoseFor(description) }));
    const mapSessions = (ss: BuilderWeek['sessions']) =>
      ss.map((s) =>
        ids.has(s.id)
          ? {
              ...s,
              exercises: [
                ...s.exercises,
                ...withDose.map((d, i) => ({
                  id: `ex-${stamp}-${s.id}-${i}`,
                  description: d.description,
                  ...(d.dose ? { dose: d.dose.map((p) => ({ ...p })) } : {}),
                })),
              ],
            }
          : s,
      );
    mutate((p) => ({
      ...p,
      weeks: p.weeks.map((w) => ({ ...w, sessions: mapSessions(w.sessions) })),
      days: p.days.map((d) => ({ ...d, sessions: mapSessions(d.sessions) })),
      phases: p.phases.map((ph) => ({ ...ph, weeks: ph.weeks.map((w) => ({ ...w, sessions: mapSessions(w.sessions) })) })),
    }));
  };

  // flat list of every session in the plan, grouped + labelled, for multi-assign
  const assignTargets = useMemo(() => {
    const out: AssignTarget[] = [];
    const day = (dow: number) => t(DAY_LABELS[dow] ?? 'Mon');
    const suffix = (s: BuilderWeek['sessions'][number]) => (s.label.trim() ? ` · ${s.label.trim()}` : '');
    if (plan.kind === 'season') {
      let g = 0;
      for (const ph of plan.phases) {
        const phName = ph.name.trim() || t(MESO_LABEL[ph.type]);
        for (const w of ph.weeks) {
          g++;
          const group = `${phName} · ${t('Week')} ${g}`;
          for (const s of w.sessions)
            out.push({ id: s.id, label: `${day(s.dayOfWeek)}${suffix(s)}`, group, dow: s.dayOfWeek });
        }
      }
    } else if (plan.structure === 'days') {
      plan.days.forEach((d, di) =>
        d.sessions.forEach((s) =>
          out.push({ id: s.id, label: `${t('Day')} ${di + 1}${suffix(s)}`, group: `${t('Day')} ${di + 1}`, dow: null }),
        ),
      );
    } else {
      plan.weeks.forEach((w, wi) => {
        const group = `${t('Week')} ${wi + 1}`;
        w.sessions.forEach((s) =>
          out.push({ id: s.id, label: `${day(s.dayOfWeek)}${suffix(s)}`, group, dow: s.dayOfWeek }),
        );
      });
    }
    return out;
  }, [plan, t]);

  const doSave = (): string => {
    const id = recordId ?? newPlanId();
    upsertPlan({ id, athleteId, plan, updatedAt: '' });
    setRecordId(id);
    setDirty(false);
    setSavedTick(true);
    return id;
  };
  const doDownload = () => {
    doSave();
    downloadPlanFile(plan);
  };

  // Season layout helpers (phase week offsets + the partial first week).
  const firstMonday = mondayOf(plan.startDate);
  const startDow = dowOf(plan.startDate);
  const phaseOffsets = useMemo(() => {
    let g = 0;
    return plan.phases.map((ph) => {
      const off = g;
      g += ph.weeks.length;
      return off;
    });
  }, [plan.phases]);

  const attachedAthlete = athletes.find((a) => a.id === athleteId);

  return (
    <main className="mx-auto max-w-4xl px-5 py-6 space-y-8">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg">{recordId ? t('Edit plan') : t('New plan')}</h2>
        <div className="flex items-center gap-3">
          {attachedAthlete && (
            <button
              onClick={() => navigate(`/athletes/${attachedAthlete.id}`)}
              className="text-sm text-accent hover:underline"
            >
              ← {attachedAthlete.name || t('athlete')}
            </button>
          )}
          <button
            onClick={() => {
              doSave();
              navigate('/plan');
            }}
            title={t('Save and return to Plans')}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-text hover:border-accent"
          >
            {t('Done')}
          </button>
        </div>
      </div>

      {/* Plan details */}
      <section className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Labeled label={t('Plan name')} required>
            <input
              className="field"
              placeholder={t('e.g. 12-Week Depth Progression')}
              value={plan.name}
              onChange={(e) => setMeta({ name: e.target.value })}
            />
          </Labeled>
          <Labeled label={t('Coach name (shown as author)')} required>
            <input
              className="field"
              placeholder={t('Your name')}
              value={plan.coach}
              onChange={(e) => setMeta({ coach: e.target.value })}
            />
          </Labeled>
          <Labeled label={t('Roster athlete (optional)')}>
            <select
              className="field"
              value={athleteId ?? ''}
              onChange={(e) => {
                setAthleteId(e.target.value || null);
                setDirty(true);
                setSavedTick(false);
              }}
            >
              <option value="">{t('Not linked')}</option>
              {athletes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || t('Unnamed athlete')}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-textDim">
              {t('A local roster athlete (this browser), not a connected app athlete.')}
            </span>
          </Labeled>
          <Labeled label={t('Start date')}>
            <input
              type="date"
              className="field"
              value={plan.startDate}
              onChange={(e) => setMeta({ startDate: e.target.value || plan.startDate })}
            />
          </Labeled>
          <Labeled label={t('Mode')}>
            <select className="field" value={plan.mode} onChange={(e) => setMeta({ mode: e.target.value as PlanMode })}>
              {MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {t(m.label)}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled label={t('Plan type')}>
            <div className="flex rounded-lg border border-border overflow-hidden">
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  onClick={() => setMeta({ kind: k.id })}
                  className={`flex-1 px-3 py-2 text-sm ${plan.kind === k.id ? 'bg-accent text-ink' : 'text-textDim'}`}
                >
                  {t(k.label)}
                </button>
              ))}
            </div>
          </Labeled>
          <div className="sm:col-span-2">
            <Labeled label={t('Description (optional)')}>
              <input
                className="field"
                placeholder={t('One line the athlete sees on import')}
                value={plan.description}
                onChange={(e) => setMeta({ description: e.target.value })}
              />
            </Labeled>
          </div>
        </div>
        <p className="text-xs text-textDim">
          {plan.kind === 'season'
            ? t('A season periodizes weeks into phases (Base → Build → Specific → Taper → Peak) toward a competition.')
            : t('Week 1 starts on your start date and runs to that Sunday, then full Mon–Sun weeks.')}
        </p>
      </section>

      <ExercisePalette targets={assignTargets} onAssign={appendExercisesToSessions} />

      {plan.kind === 'season' ? (
        <SeasonSchedule
          plan={plan}
          openPhase={openPhase}
          setOpenPhase={setOpenPhase}
          phaseOffsets={phaseOffsets}
          firstMonday={firstMonday}
          startDow={startDow}
          editing={editing}
          setEditing={setEditing}
          genWeeks={genWeeks}
          setGenWeeks={setGenWeeks}
          regenerate={regenerate}
          updatePhase={updatePhase}
          addPhase={addPhase}
          removePhase={removePhase}
          setMeta={setMeta}
        />
      ) : (
        <TrainingSchedule
          plan={plan}
          editing={editing}
          setEditing={setEditing}
          setMeta={setMeta}
          updateWeek={updateWeek}
          addWeek={addWeek}
          removeWeek={removeWeek}
          updateDay={updateDay}
          addDay={addDay}
          removeDay={removeDay}
          setDayCount={setDayCount}
        />
      )}

      {/* Export bar */}
      <div className="fixed bottom-0 inset-x-0 border-t border-border bg-abyss/95 backdrop-blur px-5 py-3">
        <div className="mx-auto max-w-4xl flex items-center gap-4">
          <div className="text-sm text-textDim flex-1">
            {stats.units} {t(stats.units === 1 ? stats.unitLabel : stats.unitLabel + 's')} ·{' '}
            {stats.sessions} {t(stats.sessions === 1 ? 'session' : 'sessions')}
            {!ready && <span className="text-amber ml-2">· {t(issues[0])}</span>}
            {ready && savedTick && <span className="text-recover ml-2">· {t('Saved')} ✓</span>}
            {ready && dirty && !savedTick && <span className="text-textDim ml-2">· {t('Unsaved changes')}</span>}
          </div>
          <button
            onClick={doSave}
            title={t('Save this plan as a draft in this browser. Find it later under Plans.')}
            className="rounded-lg px-4 py-2 font-heading tracking-wide border border-border text-text hover:border-accent"
          >
            {t('Save')}
          </button>
          <AssignToConnectedButton plan={plan} ready={ready} ensureSaved={doSave} />
          <div className="flex items-center gap-1.5">
            <button
              disabled={!ready}
              onClick={doDownload}
              className="glow-accent rounded-lg px-4 py-2 font-heading tracking-wide disabled:opacity-40 bg-accent text-ink"
            >
              {t('Download')} .e08plan
            </button>
            <InfoTip
              align="right"
              dir="up"
              text={t('Downloads a plan file. Send it to an athlete (email, chat); they open the app and import it under Training > Plans. This is the account-free alternative to Assign, which pushes the plan straight to a connected athlete.')}
            />
          </div>
        </div>
      </div>
    </main>
  );
}

// ── Training schedule (weeks or days) ─────────────────────────────────────────

function TrainingSchedule(props: {
  plan: BuilderPlan;
  editing: string | null;
  setEditing: (id: string | null) => void;
  setMeta: (patch: Partial<BuilderPlan>) => void;
  updateWeek: (wi: number, patch: Partial<BuilderWeek>) => void;
  addWeek: () => void;
  removeWeek: (wi: number) => void;
  updateDay: (di: number, patch: Partial<BuilderDay>) => void;
  addDay: () => void;
  removeDay: (di: number) => void;
  setDayCount: (n: number) => void;
}) {
  const t = useT();
  const { plan, editing, setEditing, setMeta } = props;
  const today = isoDate(new Date());
  // Effective calendar date of every day, for duplicate checks.
  const dayDates = plan.days.map((d, i) => dayDate(plan.startDate, d, i));
  const newSess = (dayOfWeek: number) => ({
    id: `sess-${Date.now().toString(36)}-${Math.round(performance.now())}`,
    dayOfWeek,
    label: '',
    body: '',
    exercises: [],
    mode: plan.mode,
    sessionType: '',
  });

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg">{t('Schedule')}</h2>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {STRUCTURES.map((st) => (
              <button
                key={st.id}
                onClick={() => setMeta({ structure: st.id })}
                className={`px-3 py-1.5 text-sm ${plan.structure === st.id ? 'bg-accent text-ink' : 'text-textDim'}`}
              >
                {t(st.label)}
              </button>
            ))}
          </div>
        </div>
        {plan.structure === 'weeks' ? (
          <button
            onClick={props.addWeek}
            className="text-sm text-accent border border-border rounded-lg px-3 py-1.5 hover:border-accent"
          >
            + {t('Add week')}
          </button>
        ) : (
          <div className="flex items-center gap-2 text-sm text-textDim">
            <span>{t('Duration')}</span>
            <input
              type="number"
              min={1}
              max={366}
              value={plan.days.length}
              onChange={(e) => props.setDayCount(Number(e.target.value))}
              className="field w-20 text-center"
            />
            <span>{t('days')}</span>
          </div>
        )}
      </div>

      {plan.structure === 'weeks'
        ? plan.weeks.map((week, wi) => (
            <WeekCard
              key={wi}
              week={week}
              label={`${t('WEEK')} ${wi + 1}`}
              mode={plan.mode}
              editing={editing}
              setEditing={setEditing}
              onChange={(patch) => props.updateWeek(wi, patch)}
              onRemove={plan.weeks.length > 1 ? () => props.removeWeek(wi) : undefined}
              partialBeforeDow={wi === 0 ? dowOf(plan.startDate) : undefined}
              weekStart={plan.startDate ? addDays(mondayOf(plan.startDate), wi * 7) : undefined}
            />
          ))
        : plan.days.map((day, di) => (
            <div key={day.id} className="glass-card rounded-xl p-4 space-y-3">
              <DayHeader
                index={di}
                date={dayDates[di]}
                weekday={weekdayLabel(dayDates[di])}
                today={today}
                otherDates={dayDates.filter((_, i) => i !== di)}
                onDate={(date) => props.updateDay(di, { date })}
                onRemove={plan.days.length > 1 ? () => props.removeDay(di) : undefined}
              />
              <DaySessions
                day={day}
                editing={editing}
                setEditing={setEditing}
                onChange={(patch) => props.updateDay(di, patch)}
                newSess={newSess}
              />
            </div>
          ))}
      {plan.structure === 'days' && (
        <button onClick={props.addDay} className="text-sm text-accent border border-border rounded-lg px-3 py-1.5 hover:border-accent">
          + {t('Add day')}
        </button>
      )}
    </section>
  );
}

/** Day header with an editable calendar date. The date can't be in the past
 *  or collide with another day; an invalid pick is rejected with an inline
 *  note and the field snaps back. Clearing it returns the day to positional. */
function DayHeader({
  index,
  date,
  weekday,
  today,
  otherDates,
  onDate,
  onRemove,
}: {
  index: number;
  date: string;
  weekday: string;
  today: string;
  otherDates: string[];
  onDate: (date: string | undefined) => void;
  onRemove?: () => void;
}) {
  const t = useT();
  const [err, setErr] = useState<string | null>(null);

  const onChange = (val: string) => {
    setErr(null);
    if (!val) {
      onDate(undefined); // back to positional (startDate + index)
      return;
    }
    if (val < today) {
      setErr(t('The date can’t be in the past.'));
      return;
    }
    if (otherDates.includes(val)) {
      setErr(t('Another day already uses this date.'));
      return;
    }
    onDate(val);
  };

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-heading text-accent whitespace-nowrap shrink-0">{t('DAY')} {index + 1}</span>
        <input
          type="date"
          value={date}
          min={today}
          onChange={(e) => onChange(e.target.value)}
          className="field w-auto"
          title={t('Set this day’s date (not in the past, no duplicates)')}
        />
        <span className="text-textDim text-sm">{weekday}</span>
        {onRemove && (
          <button onClick={onRemove} className="text-red text-sm px-2 shrink-0 ml-auto" title={t('Remove day')}>
            ✕
          </button>
        )}
      </div>
      {err && <p className="text-red text-xs">{err}</p>}
    </div>
  );
}

function DaySessions({
  day,
  editing,
  setEditing,
  onChange,
  newSess,
}: {
  day: BuilderDay;
  editing: string | null;
  setEditing: (id: string | null) => void;
  onChange: (patch: Partial<BuilderDay>) => void;
  newSess: (dayOfWeek: number) => BuilderDay['sessions'][number];
}) {
  const add = () => {
    const s = newSess(0);
    onChange({ sessions: [...day.sessions, s] });
    setEditing(s.id);
  };
  return (
    <SessionList
      sessions={day.sessions}
      editing={editing}
      setEditing={setEditing}
      onAdd={add}
      onChange={(id, patch) => onChange({ sessions: day.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)) })}
      onRemove={(id) => onChange({ sessions: day.sessions.filter((s) => s.id !== id) })}
      onInsertTemplate={(tpl) => {
        const s = materializeSessionTemplate(tpl, 0);
        onChange({ sessions: [...day.sessions, s] });
        setEditing(s.id);
      }}
    />
  );
}

// ── Season schedule (phases) ──────────────────────────────────────────────────

function SeasonSchedule(props: {
  plan: BuilderPlan;
  openPhase: string | null;
  setOpenPhase: (id: string | null) => void;
  phaseOffsets: number[];
  firstMonday: string;
  startDow: number;
  editing: string | null;
  setEditing: (id: string | null) => void;
  genWeeks: number;
  setGenWeeks: (n: number) => void;
  regenerate: () => void;
  updatePhase: (pi: number, patch: Partial<BuilderPhase>) => void;
  addPhase: () => void;
  removePhase: (pi: number) => void;
  setMeta: (patch: Partial<BuilderPlan>) => void;
}) {
  const t = useT();
  const { plan } = props;
  const compWeeks = plan.competitionDate
    ? Math.max(1, Math.ceil(daysBetween(plan.startDate, plan.competitionDate) / 7))
    : null;

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Labeled label={t('Target competition date')}>
          <input
            type="date"
            className="field"
            value={plan.competitionDate}
            min={plan.startDate}
            onChange={(e) => {
              props.setMeta({ competitionDate: e.target.value });
              if (e.target.value) {
                props.setGenWeeks(Math.max(1, Math.ceil(daysBetween(plan.startDate, e.target.value) / 7)));
              }
            }}
          />
          {compWeeks != null && (
            <span className="block text-xs text-textDim mt-1">{compWeeks} {t('weeks out.')}</span>
          )}
        </Labeled>
        <Labeled label={t('Auto-build periodization')}>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={52}
              value={props.genWeeks}
              onChange={(e) => props.setGenWeeks(Math.max(1, Math.min(52, Number(e.target.value) || 1)))}
              className="field w-20 text-center"
            />
            <span className="text-sm text-textDim">{t('weeks')}</span>
            <button
              onClick={props.regenerate}
              className="text-sm text-accent border border-border rounded-lg px-3 py-1.5 hover:border-accent whitespace-nowrap"
            >
              {t('Generate phases')}
            </button>
          </div>
          <span className="block text-xs text-textDim mt-1">{t('Replaces the phases below with a Base→Peak skeleton you then edit.')}</span>
        </Labeled>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg">{t('Phases')}</h2>
        <button onClick={props.addPhase} className="text-sm text-accent border border-border rounded-lg px-3 py-1.5 hover:border-accent">
          + {t('Add phase')}
        </button>
      </div>

      {plan.phases.map((ph, pi) => (
        <PhaseCard
          key={ph.id}
          phase={ph}
          index={pi}
          mode={plan.mode}
          open={props.openPhase === ph.id}
          onToggle={() => props.setOpenPhase(props.openPhase === ph.id ? null : ph.id)}
          weekOffset={props.phaseOffsets[pi]}
          firstMonday={props.firstMonday}
          startDow={props.startDow}
          editing={props.editing}
          setEditing={props.setEditing}
          onChange={(patch) => props.updatePhase(pi, patch)}
          onRemove={plan.phases.length > 1 ? () => props.removePhase(pi) : undefined}
        />
      ))}
    </section>
  );
}
