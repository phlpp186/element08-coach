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

export type PlanMode = 'depth' | 'pool' | 'general';
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
  mode?: PlanMode | 'dry';
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
  mode: PlanMode | 'dry';
  sessionType: string;
}

export interface BuilderWeek {
  focus: string;
  intensity: Intensity;
  notes: string;
  sessions: BuilderSession[];
}

export interface BuilderPlan {
  name: string;
  coach: string;
  description: string;
  mode: PlanMode;
  /** ISO date (YYYY-MM-DD). Snapped to Monday on export. */
  startDate: string;
  weeks: BuilderWeek[];
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

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Build + validate + download ──────────────────────────────────────────────

/** Map the editor state into a valid PlanFileV1. */
export function buildPlanFile(plan: BuilderPlan): PlanFileV1 {
  const start = mondayOf(plan.startDate);
  const weeks: MicroCycle[] = plan.weeks.map((w, wi) => ({
    weekStart: addDays(start, wi * 7),
    focus: w.focus.trim(),
    targetSessions: w.sessions.length,
    targetMix: {},
    intensity: w.intensity,
    notes: w.notes.trim(),
    plannedSessions: w.sessions.map((s) => ({
      id: s.id,
      dayOfWeek: s.dayOfWeek,
      label: s.label.trim() || 'Session',
      exercises: s.exercises
        .filter((e) => e.description.trim())
        .map((e) => ({ id: e.id, description: e.description.trim() })),
      ...(s.mode ? { mode: s.mode } : {}),
      ...(s.sessionType.trim() ? { sessionType: s.sessionType.trim() } : {}),
      sessionNotes: s.body.trim(),
    })),
  }));

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
      startDate: start,
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
export function planIssues(plan: BuilderPlan): string[] {
  const issues: string[] = [];
  if (!plan.name.trim()) issues.push('Add a plan name.');
  if (!plan.coach.trim()) issues.push('Add your coach name (shown to the athlete as the author).');
  if (!plan.startDate) issues.push('Pick a start date.');
  const sessions = plan.weeks.reduce((n, w) => n + w.sessions.length, 0);
  if (sessions === 0) issues.push('Add at least one session.');
  return issues;
}

export function planStats(plan: BuilderPlan): { weeks: number; sessions: number } {
  return {
    weeks: plan.weeks.length,
    sessions: plan.weeks.reduce((n, w) => n + w.sessions.length, 0),
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
