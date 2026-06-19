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

export const PLAN_FILE_FORMAT = 'e08plan';
export const PLAN_FILE_VERSION = 1;

export type PlanMode = 'depth' | 'pool' | 'dry' | 'general';
export type Intensity = 'recovery' | 'low' | 'medium' | 'high' | 'max';
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
  /** Free-text body for the session (the coach's full-text plan). */
  sessionNotes?: string;
}

export interface MicroCycle {
  /** ISO date (YYYY-MM-DD) of the Monday that starts this week. */
  weekStart: string;
  focus: string;
  targetSessions: number;
  targetMix: Record<string, number>;
  intensity: Intensity;
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

export interface BuilderExercise {
  id: string;
  description: string;
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
}

export interface BuilderWeek {
  focus: string;
  intensity: Intensity;
  notes: string;
  sessions: BuilderSession[];
}

/** A single numbered day in a day-based plan (Day 1 = startDate, Day 2 = +1, …). */
export interface BuilderDay {
  id: string;
  sessions: BuilderSession[];
}

export type PlanStructure = 'weeks' | 'days';

export interface BuilderPlan {
  name: string;
  coach: string;
  description: string;
  mode: PlanMode;
  /** ISO date (YYYY-MM-DD). Day 1 / week 1 begins here; any day is allowed. */
  startDate: string;
  /** 'weeks' = Mon–Sun weeks; 'days' = a flat numbered day list (one-off block). */
  structure: PlanStructure;
  weeks: BuilderWeek[];
  days: BuilderDay[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

let _idCounter = 0;
export function uid(prefix: string): string {
  _idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${_idCounter}`;
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

/** One BuilderSession → one wire PlannedSession at the given dayOfWeek + label. */
function toPlanned(s: BuilderSession, dayOfWeek: number, label: string): PlannedSession {
  return {
    id: s.id,
    dayOfWeek,
    label: label.trim() || 'Session',
    exercises: s.exercises
      .filter((e) => e.description.trim())
      .map((e) => ({ id: e.id, description: e.description.trim() })),
    ...(s.mode ? { mode: s.mode } : {}),
    ...(s.sessionType.trim() ? { sessionType: s.sessionType.trim() } : {}),
    sessionNotes: s.body.trim(),
  };
}

/** Weeks-mode → MicroCycles. weekStart stays a Monday; week 1 may be partial. */
function weeksToMicroCycles(plan: BuilderPlan): MicroCycle[] {
  const firstMonday = mondayOf(plan.startDate);
  return plan.weeks.map((w, wi) => ({
    weekStart: addDays(firstMonday, wi * 7),
    focus: w.focus.trim(),
    targetSessions: w.sessions.length,
    targetMix: {},
    intensity: w.intensity,
    notes: w.notes.trim(),
    plannedSessions: w.sessions.map((s) => toPlanned(s, s.dayOfWeek, s.label)),
  }));
}

/** Days-mode → MicroCycles. Each Day N maps to a real calendar date
 *  (startDate + N-1); sessions are bucketed into the Monday-week that date falls
 *  in, at that date's dayOfWeek, with "Day N:" baked into the title so the
 *  athlete sees the day number (the app stores plans as weeks, not day cycles). */
function daysToMicroCycles(plan: BuilderPlan): MicroCycle[] {
  const buckets = new Map<string, PlannedSession[]>();
  plan.days.forEach((d, di) => {
    const date = addDays(plan.startDate, di);
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
      intensity: 'medium' as Intensity,
      notes: '',
      plannedSessions: buckets.get(weekStart)!,
    }));
}

/** Map the editor state into a valid PlanFileV1. The plan can begin on ANY day:
 *  content.startDate is the raw chosen date, but each week's weekStart stays the
 *  Monday of its calendar week (the app requires weekStart to be a Monday and
 *  places sessions by dayOfWeek 0=Mon..6=Sun). */
export function buildPlanFile(plan: BuilderPlan): PlanFileV1 {
  const weeks = plan.structure === 'days' ? daysToMicroCycles(plan) : weeksToMicroCycles(plan);

  return {
    format: PLAN_FILE_FORMAT,
    version: 1,
    type: 'training_plan',
    metadata: {
      title: plan.name.trim(),
      author: plan.coach.trim(),
      description: plan.description.trim() || undefined,
      created: new Date().toISOString(),
    },
    content: {
      name: plan.name.trim(),
      kind: 'training',
      competitionDate: null,
      startDate: plan.startDate,
      mode: plan.mode,
      schemaVersion: 3,
      phases: [
        {
          id: uid('phase'),
          name: 'Training',
          type: 'base',
          weeks,
        },
      ],
    },
  };
}

/** Human-readable blockers that stop a valid export (mirrors the app's hard
 *  errors so the coach sees problems before downloading). Empty = ready. */
function countSessions(plan: BuilderPlan): number {
  const containers = plan.structure === 'days' ? plan.days : plan.weeks;
  return containers.reduce((n, c) => n + c.sessions.length, 0);
}

export function planIssues(plan: BuilderPlan): string[] {
  const issues: string[] = [];
  if (!plan.name.trim()) issues.push('Add a plan name.');
  if (!plan.coach.trim()) issues.push('Add your coach name (shown to the athlete as the author).');
  if (!plan.startDate) issues.push('Pick a start date.');
  if (countSessions(plan) === 0) issues.push('Add at least one session.');
  return issues;
}

export function planStats(plan: BuilderPlan): { units: number; unitLabel: string; sessions: number } {
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
