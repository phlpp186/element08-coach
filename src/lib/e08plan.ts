/**
 * .e08plan wire format: must stay byte-compatible with the mobile app's
 * importer (Deeptimerapp/src/lib/planSharing/{schema,PlanValidator}.ts).
 *
 * Hard requirements the app's validatePlanFile() enforces (we satisfy all):
 *   - format === 'e08plan', version <= 1, type in {training_plan, season_plan}
 *   - metadata.title + metadata.author non-empty
 *   - content.kind in {training, season}
 *   - content.phases non-empty; each phase has an id + non-empty weeks
 *   - each week has a weekStart; each session has an id
 *
 * Keep this file in sync if the app bumps PLAN_FILE_VERSION.
 */
import { tr } from '../i18n';

export const PLAN_FILE_FORMAT = 'e08plan';
export const PLAN_FILE_VERSION = 1;

export type PlanMode = 'depth' | 'pool' | 'dry' | 'general';
/** @deprecated Week intensity is now a 1-10 number. This enum only describes /
 *  maps LEGACY stored values via `normIntensity`. */
export type LegacyIntensity = 'recovery' | 'low' | 'medium' | 'high' | 'max';

const LEGACY_INTENSITY: Record<LegacyIntensity, number> = {
  recovery: 2,
  low: 4,
  medium: 6,
  high: 8,
  max: 10,
};

/** Default week intensity when none is set (was 'medium'). */
export const DEFAULT_INTENSITY = 6;

/** Coerce any stored intensity (legacy string enum OR a 1-10 number / numeric
 *  string) to a 1-10 integer, or null if absent / unrecognized. Matches the
 *  app's src/lib/season/intensity.ts so both sides read old + new data. */
export function normIntensity(v: unknown): number | null {
  if (typeof v === 'number') return v >= 1 && v <= 10 ? Math.round(v) : null;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s in LEGACY_INTENSITY) return LEGACY_INTENSITY[s as LegacyIntensity];
    const n = Number(s);
    if (Number.isFinite(n) && n >= 1 && n <= 10) return Math.round(n);
  }
  return null;
}
export type MesoType = 'base' | 'build' | 'specific' | 'taper' | 'competition' | 'transition';

// ── Wire types (subset we emit) ──────────────────────────────────────────────

export interface PlannedExercise {
  id: string;
  description: string;
}

export interface PlannedSession {
  id: string;
  /** 0=Mon … 6=Sun */
  dayOfWeek: number;
  label: string;
  exercises: PlannedExercise[];
  mode?: PlanMode;
  sessionType?: string;
  /** Coach's target perceived effort for this session, 1-10 (same scale the
   *  athlete rates on). Absent = no target set. */
  coachTarget?: number;
  /** Free-text body for the session (the coach's full-text plan). */
  sessionNotes?: string;
}

export interface MicroCycle {
  /** ISO date (YYYY-MM-DD) of the Monday that starts this week. */
  weekStart: string;
  focus: string;
  targetSessions: number;
  targetMix: Record<string, number>;
  intensity: number;
  notes: string;
  plannedSessions: PlannedSession[];
}

export interface MesoCycle {
  id: string;
  name: string;
  type: MesoType;
  weeks: MicroCycle[];
}

export interface PlanContent {
  name: string;
  kind: 'training' | 'season';
  competitionDate: string | null;
  startDate: string | null;
  phases: MesoCycle[];
  schemaVersion: number;
  mode?: PlanMode;
}

export interface PlanFileMetadata {
  title: string;
  author: string;
  description?: string;
  created: string;
}

export interface PlanFileV1 {
  format: typeof PLAN_FILE_FORMAT;
  version: 1;
  type: 'training_plan' | 'season_plan';
  metadata: PlanFileMetadata;
  content: PlanContent;
}

// ── Builder model (the editor's working state) ───────────────────────────────

/** A dose part: one measured aspect of an exercise. A dose is an ORDERED LIST
 *  of any mix of parts — hold + distance + rest in one exercise is fine (mixed
 *  DYN/STA work needs exactly that). Values are free text ("2:00", "8", "50m",
 *  "moderate"); 'other' carries its own label. Doses are always optional: an
 *  exercise without one is exactly the free-text exercise it always was. */
export type DoseUnit = 'sets' | 'reps' | 'hold' | 'rest' | 'distance' | 'depth' | 'time' | 'other';

export interface DosePart {
  unit: DoseUnit;
  value: string;
  /** Custom name shown for 'other' parts (e.g. "charge depth", "effort"). */
  label?: string;
}

export const DOSE_UNITS: DoseUnit[] = ['sets', 'reps', 'hold', 'rest', 'distance', 'depth', 'time', 'other'];

/** How a part reads in text (wire format + chips). Unit words go through the
 *  translator at compose time so the plan reads in the coach's language. */
export function dosePartText(p: DosePart, t: (s: string) => string = (s) => s): string {
  const v = p.value.trim();
  if (!v) return '';
  const carriesUnit = /[a-z%]/i.test(v);
  switch (p.unit) {
    case 'sets':
      return `${v}×`;
    case 'reps':
      return `${v} ${t('reps')}`;
    case 'hold':
      return `${t('hold')} ${v}`;
    case 'rest':
      return `${t('rest')} ${v}`;
    case 'distance':
      return carriesUnit ? v : `${v} m`;
    case 'depth':
      return `@ ${carriesUnit ? v : `${v} m`}`;
    case 'time':
      return v;
    case 'other':
      return p.label?.trim() ? `${p.label.trim()} ${v}` : v;
  }
}

export function doseText(dose: DosePart[] | undefined, t: (s: string) => string = (s) => s): string {
  return (dose ?? [])
    .map((p) => dosePartText(p, t))
    .filter(Boolean)
    .join(' · ');
}

/** Drop empty parts; return undefined when nothing usable remains. */
export function normDose(dose: unknown): DosePart[] | undefined {
  if (!Array.isArray(dose)) return undefined;
  const out: DosePart[] = [];
  for (const p of dose) {
    if (!p || typeof p !== 'object') continue;
    const { unit, value, label } = p as DosePart;
    if (typeof value !== 'string' || !value.trim()) continue;
    if (!DOSE_UNITS.includes(unit)) continue;
    out.push({ unit, value: value.trim(), ...(unit === 'other' && typeof label === 'string' && label.trim() ? { label: label.trim() } : {}) });
  }
  return out.length ? out : undefined;
}

export interface BuilderExercise {
  id: string;
  description: string;
  /** Optional structured dose. On export it renders INTO the description text,
   *  so the .e08plan wire format (and the app that validates it) is unchanged. */
  dose?: DosePart[];
}

export interface BuilderSession {
  id: string;
  dayOfWeek: number;
  label: string;
  /** Free-text body (authoring mode #1). Maps to PlannedSession.sessionNotes. */
  body: string;
  /** Structured exercise rows (authoring mode #2). Maps to PlannedSession.exercises. */
  exercises: BuilderExercise[];
  mode: PlanMode;
  sessionType: string;
  /** Coach's target perceived effort for this session, 1-10. 0/undefined = none. */
  coachTarget?: number;
}

export interface BuilderWeek {
  focus: string;
  intensity: number;
  notes: string;
  sessions: BuilderSession[];
}

/** A single numbered day in a day-based plan. Without an explicit `date` it
 *  falls on startDate + its index (Day 1 = startDate, Day 2 = +1, …); the coach
 *  can override the calendar date per day (no past dates, no duplicates). */
export interface BuilderDay {
  id: string;
  sessions: BuilderSession[];
  /** ISO date (YYYY-MM-DD) override. Absent = positional (startDate + index). */
  date?: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The effective calendar date of a plan day: its override, or startDate+index. */
export function dayDate(startDate: string, day: BuilderDay, index: number): string {
  return day.date && ISO_DATE_RE.test(day.date) ? day.date : addDays(startDate, index);
}

export type PlanStructure = 'weeks' | 'days';
export type PlanKind = 'training' | 'season';

/** A mesocycle in a season plan: a named, typed block of weeks (Base, Build,
 *  Specific, Taper, Competition…). Reuses the same week editor as training weeks. */
export interface BuilderPhase {
  id: string;
  name: string;
  type: MesoType;
  weeks: BuilderWeek[];
}

export interface BuilderPlan {
  name: string;
  coach: string;
  description: string;
  mode: PlanMode;
  /** 'training' = one block (weeks or days). 'season' = periodized phases toward a comp. */
  kind: PlanKind;
  /** ISO date (YYYY-MM-DD). Day 1 / week 1 begins here; any day is allowed. */
  startDate: string;
  /** ISO date of the target competition (season plans). '' = none. */
  competitionDate: string;
  /** 'weeks' = Mon–Sun weeks; 'days' = a flat numbered day list (one-off block). */
  structure: PlanStructure;
  weeks: BuilderWeek[];
  days: BuilderDay[];
  /** Season-mode phases (used when kind === 'season'). */
  phases: BuilderPhase[];
}

export const MESO_TYPES: MesoType[] = [
  'base',
  'build',
  'specific',
  'taper',
  'competition',
  'transition',
];

export const MESO_LABEL: Record<MesoType, string> = {
  base: 'Base',
  build: 'Build',
  specific: 'Specific',
  taper: 'Taper',
  competition: 'Peak / Comp',
  transition: 'Transition',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

let _idCounter = 0;
export function uid(prefix: string): string {
  _idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${_idCounter}`;
}

/** Return a copy of `arr` with the item at `index` swapped one slot in `dir`
 *  (-1 = up/earlier, +1 = down/later). Out-of-range moves (already at an edge)
 *  return the SAME array reference unchanged, so callers can no-op safely. */
export function moveInArray<T>(arr: T[], index: number, dir: -1 | 1): T[] {
  const to = index + dir;
  if (index < 0 || index >= arr.length || to < 0 || to >= arr.length) return arr;
  const next = arr.slice();
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

// All date math is done in UTC (parse with the `Z` suffix, use the getUTC*/
// setUTC* accessors, format via toISOString) so a non-UTC machine timezone
// can't shift a YYYY-MM-DD by a day.
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}

/** Snap an ISO date back to the Monday of its week. */
export function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7; // 0 if Monday
  d.setUTCDate(d.getUTCDate() - offset);
  return isoDate(d);
}

/** Day-of-week index for an ISO date: 0 = Mon … 6 = Sun (matches dayOfWeek). */
export function dowOf(iso: string): number {
  return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Build + validate + download ──────────────────────────────────────────────

/** A builder exercise's full text: description plus its dose, if any. This is
 *  what the athlete's app receives — the wire shape stays `{id, description}`,
 *  which is exactly what the app's validator accepts today. */
export function exerciseText(e: BuilderExercise, t: (s: string) => string = (s) => s): string {
  const d = doseText(e.dose, t);
  return d ? `${e.description.trim()} · ${d}` : e.description.trim();
}

/** One BuilderSession → one wire PlannedSession at the given dayOfWeek + label. */
function toPlanned(s: BuilderSession, dayOfWeek: number, label: string): PlannedSession {
  return {
    id: s.id,
    dayOfWeek,
    label: label.trim() || 'Session',
    exercises: s.exercises
      .filter((e) => e.description.trim() || doseText(e.dose))
      // tr(): unit words render in the coach's authoring language.
      .map((e) => ({ id: e.id, description: exerciseText(e, tr) })),
    ...(s.mode ? { mode: s.mode } : {}),
    ...(s.sessionType.trim() ? { sessionType: s.sessionType.trim() } : {}),
    ...(s.coachTarget && s.coachTarget >= 1 && s.coachTarget <= 10
      ? { coachTarget: Math.round(s.coachTarget) }
      : {}),
    sessionNotes: s.body.trim(),
  };
}

/** One BuilderWeek → one MicroCycle anchored at the given Monday. */
function weekToMicro(w: BuilderWeek, weekStart: string): MicroCycle {
  return {
    weekStart,
    focus: w.focus.trim(),
    targetSessions: w.sessions.length,
    targetMix: {},
    intensity: normIntensity(w.intensity) ?? DEFAULT_INTENSITY,
    notes: w.notes.trim(),
    plannedSessions: w.sessions.map((s) => toPlanned(s, s.dayOfWeek, s.label)),
  };
}

/** Weeks-mode → MicroCycles. weekStart stays a Monday; week 1 may be partial. */
function weeksToMicroCycles(plan: BuilderPlan): MicroCycle[] {
  const firstMonday = mondayOf(plan.startDate);
  return plan.weeks.map((w, wi) => weekToMicro(w, addDays(firstMonday, wi * 7)));
}

/** Days-mode → MicroCycles. Each Day N maps to a real calendar date
 *  (startDate + N-1); sessions are bucketed into the Monday-week that date falls
 *  in, at that date's dayOfWeek, with "Day N:" baked into the title so the
 *  athlete sees the day number (the app stores plans as weeks, not day cycles). */
function daysToMicroCycles(plan: BuilderPlan): MicroCycle[] {
  const buckets = new Map<string, PlannedSession[]>();
  plan.days.forEach((d, di) => {
    const date = dayDate(plan.startDate, d, di);
    const weekStart = mondayOf(date);
    const dow = dowOf(date);
    const arr = buckets.get(weekStart) ?? [];
    d.sessions.forEach((s) =>
      arr.push(toPlanned(s, dow, `Day ${di + 1}: ${s.label.trim() || 'Session'}`)),
    );
    buckets.set(weekStart, arr);
  });
  return [...buckets.keys()]
    .sort()
    .map((weekStart) => ({
      weekStart,
      focus: '',
      targetSessions: buckets.get(weekStart)!.length,
      targetMix: {},
      intensity: DEFAULT_INTENSITY,
      notes: '',
      plannedSessions: buckets.get(weekStart)!,
    }));
}

/** Season-mode → MesoCycles. Phases run back-to-back from week 1's Monday; the
 *  global week index drives each week's weekStart so the whole season lays out as
 *  one continuous Mon–Sun calendar (the app requires Monday weekStarts). */
function seasonToPhases(plan: BuilderPlan): MesoCycle[] {
  const firstMonday = mondayOf(plan.startDate);
  let g = 0; // running week index across all phases
  return plan.phases.map((ph) => ({
    id: ph.id,
    name: ph.name.trim() || MESO_LABEL[ph.type],
    type: ph.type,
    weeks: ph.weeks.map((w) => weekToMicro(w, addDays(firstMonday, g++ * 7))),
  }));
}

/** Map the editor state into a valid PlanFileV1. The plan can begin on ANY day:
 *  content.startDate is the raw chosen date, but each week's weekStart stays the
 *  Monday of its calendar week (the app requires weekStart to be a Monday and
 *  places sessions by dayOfWeek 0=Mon..6=Sun). */
export function buildPlanFile(plan: BuilderPlan): PlanFileV1 {
  const season = plan.kind === 'season';
  const phases: MesoCycle[] = season
    ? seasonToPhases(plan)
    : [
        {
          id: uid('phase'),
          name: 'Training',
          type: 'base',
          weeks: plan.structure === 'days' ? daysToMicroCycles(plan) : weeksToMicroCycles(plan),
        },
      ];

  return {
    format: PLAN_FILE_FORMAT,
    version: 1,
    type: season ? 'season_plan' : 'training_plan',
    metadata: {
      title: plan.name.trim(),
      author: plan.coach.trim(),
      description: plan.description.trim() || undefined,
      created: new Date().toISOString(),
    },
    content: {
      name: plan.name.trim(),
      kind: season ? 'season' : 'training',
      competitionDate: season && plan.competitionDate ? plan.competitionDate : null,
      startDate: plan.startDate,
      // The app's Plan.mode only allows depth/pool/general; 'dry' is valid for
      // SESSIONS but not at the plan level (a 'dry' plan mode would silently fall
      // back to depth in the app's session editor). So we emit 'general' here while
      // each dry session keeps its own mode:'dry' — which is what drives the
      // correct (dry) session-type pills in the app.
      mode: plan.mode === 'dry' ? 'general' : plan.mode,
      schemaVersion: 3,
      phases,
    },
  };
}

/** Human-readable blockers that stop a valid export (mirrors the app's hard
 *  errors so the coach sees problems before downloading). Empty = ready. */
function countSessions(plan: BuilderPlan): number {
  if (plan.kind === 'season') {
    return plan.phases.reduce(
      (n, ph) => n + ph.weeks.reduce((m, w) => m + w.sessions.length, 0),
      0,
    );
  }
  const containers = plan.structure === 'days' ? plan.days : plan.weeks;
  return containers.reduce((n, c) => n + c.sessions.length, 0);
}

export function planIssues(plan: BuilderPlan): string[] {
  const issues: string[] = [];
  if (!plan.name.trim()) issues.push('Add a plan name.');
  if (!plan.coach.trim()) issues.push('Add your coach name (shown to the athlete as the author).');
  if (!plan.startDate) issues.push('Pick a start date.');
  if (plan.kind === 'season' && plan.phases.length === 0) issues.push('Add at least one phase.');
  if (countSessions(plan) === 0) issues.push('Add at least one session.');
  return issues;
}

export function planStats(plan: BuilderPlan): { units: number; unitLabel: string; sessions: number } {
  if (plan.kind === 'season') {
    const weeks = plan.phases.reduce((n, ph) => n + ph.weeks.length, 0);
    return { units: weeks, unitLabel: 'week', sessions: countSessions(plan) };
  }
  const units = plan.structure === 'days' ? plan.days.length : plan.weeks.length;
  return {
    units,
    unitLabel: plan.structure === 'days' ? 'day' : 'week',
    sessions: countSessions(plan),
  };
}

/** Trigger a browser download of the plan as a `.e08plan` JSON file. */
export function downloadPlanFile(plan: BuilderPlan): void {
  const file = buildPlanFile(plan);
  const safe = plan.name.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'training-plan';
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safe}.e08plan`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Builder-state factories ───────────────────────────────────────────────────

export function emptyWeek(): BuilderWeek {
  return { focus: '', intensity: DEFAULT_INTENSITY, notes: '', sessions: [] };
}

export function emptyDay(): BuilderDay {
  return { id: uid('day'), sessions: [] };
}

export function newSession(dayOfWeek: number, mode: PlanMode): BuilderSession {
  return { id: uid('sess'), dayOfWeek, label: '', body: '', exercises: [], mode, sessionType: '' };
}

export function emptyPhase(type: MesoType, weeks = 1): BuilderPhase {
  return {
    id: uid('phase'),
    name: MESO_LABEL[type],
    type,
    weeks: Array.from({ length: Math.max(1, weeks) }, emptyWeek),
  };
}

export function initialPlan(): BuilderPlan {
  return {
    name: '',
    coach: '',
    description: '',
    mode: 'depth',
    kind: 'training',
    startDate: isoDate(new Date()),
    competitionDate: '',
    structure: 'weeks',
    weeks: [emptyWeek()],
    days: [emptyDay()],
    phases: [emptyPhase('base')],
  };
}

/** Round-trip a saved/imported plan through the current shape so older saves
 *  gain any newly-added fields with sane defaults. */
export function normalizePlan(p: Partial<BuilderPlan> | undefined | null): BuilderPlan {
  const base = initialPlan();
  if (!p) return base;
  return {
    ...base,
    ...p,
    weeks: p.weeks?.length ? p.weeks : base.weeks,
    days: p.days?.length ? p.days : base.days,
    phases: p.phases?.length ? p.phases : base.phases,
  };
}

// ── Periodization skeleton ────────────────────────────────────────────────────

/** Suggest a back-to-back phase breakdown for a season of `totalWeeks`, ending in
 *  a Peak/Comp week. Classic freediving periodization weighted Base→Build→Specific
 *  →Taper→Peak; phase widths scale with the season length. The coach edits from
 *  here (rename, resize, drop a phase) rather than facing a blank calendar. */
export function generateSeasonSkeleton(totalWeeks: number): BuilderPhase[] {
  const n = Math.max(1, Math.min(52, Math.floor(totalWeeks) || 1));
  // Very short seasons: a couple of phases, then peak.
  if (n <= 2) return [emptyPhase('specific', n - 1 > 0 ? n - 1 : 1), emptyPhase('competition', 1)].slice(n <= 1 ? 1 : 0);
  if (n <= 4) {
    const build = Math.max(1, n - 2);
    return [emptyPhase('build', build), emptyPhase('taper', 1), emptyPhase('competition', 1)];
  }
  // Distribute the body across base/build/specific, reserve taper(1) + peak(1).
  const body = n - 2;
  const base = Math.max(1, Math.round(body * 0.4));
  const build = Math.max(1, Math.round(body * 0.35));
  const specific = Math.max(1, body - base - build);
  return [
    emptyPhase('base', base),
    emptyPhase('build', build),
    emptyPhase('specific', specific),
    emptyPhase('taper', 1),
    emptyPhase('competition', 1),
  ];
}
