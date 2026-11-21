/**
 * The plan as the calendar shows it: one flat run of weeks, each with its
 * phase or none (combination 1 of element08-app/docs/mockups/
 * portal-plan-a-plus-b.html, details in portal-plan-calendar-step3.html,
 * Philipp 2026-11-21).
 *
 * The builder's saved shape (BuilderPlan) stays what it was, so the library,
 * the .e08plan file and the athlete's phone see nothing new: a plan with
 * phases is a season plan, one without is a training plan of weeks. A plan
 * saved as numbered days opens here as the weeks its dates fall in.
 *
 * Pure: no React, so every rule has a test (__tests__/planCalendar.test.ts).
 */
import {
  addDays,
  copyWeek,
  dayDate,
  DEFAULT_INTENSITY,
  dowOf,
  emptyDay,
  emptyPhase,
  emptyWeek,
  intensityPreset,
  MESO_LABEL,
  mondayOf,
  skeletonPhaseSizes,
  uid,
  type BuilderPhase,
  type BuilderPlan,
  type BuilderSession,
  type BuilderWeek,
  type MesoType,
  type IntensityPreset,
} from './e08plan';

export interface CalPhase {
  id: string;
  name: string;
  type: MesoType;
}

export interface CalWeek {
  week: BuilderWeek;
  phase: CalPhase | null;
}

export interface PlanCompetition {
  id: string;
  /** YYYY-MM-DD. */
  date: string;
  name: string;
}

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

/** Monday of week 1 (week 1 may start later in the week). */
export const firstMonday = (plan: Pick<BuilderPlan, 'startDate'>): string => mondayOf(plan.startDate);

/** The Monday of week `index` (0-based). */
export const weekMonday = (plan: Pick<BuilderPlan, 'startDate'>, index: number): string =>
  addDays(firstMonday(plan), index * 7);

/** The week (0-based) a date falls in, counted from week 1's Monday. */
export const weekIndexOf = (plan: Pick<BuilderPlan, 'startDate'>, date: string): number =>
  Math.floor(daysBetween(firstMonday(plan), date) / 7);

/** A day of week 1 before the start date: no sessions there. */
export const beforeStart = (plan: Pick<BuilderPlan, 'startDate'>, index: number, day: number): boolean =>
  index === 0 && day < dowOf(plan.startDate);

// ── Reading and writing the builder's shape ──────────────────────────────────

/** A numbered-day plan as the Monday weeks its days' dates fall in. Sessions
 *  keep their ids (the athlete's ticks follow them) and land on their date's
 *  weekday. */
function daysAsWeeks(plan: BuilderPlan): CalWeek[] {
  const weeks: BuilderWeek[] = [];
  plan.days.forEach((d, i) => {
    const date = dayDate(plan.startDate, d, i);
    const w = Math.max(0, weekIndexOf(plan, date));
    while (weeks.length <= w) weeks.push(emptyWeek());
    const dow = dowOf(date);
    weeks[w] = { ...weeks[w], sessions: [...weeks[w].sessions, ...d.sessions.map((s) => ({ ...s, dayOfWeek: dow }))] };
  });
  if (!weeks.length) weeks.push(emptyWeek());
  return weeks.map((week) => ({ week, phase: null }));
}

export function calWeeks(plan: BuilderPlan): CalWeek[] {
  if (plan.kind === 'season')
    return plan.phases.flatMap((ph) =>
      ph.weeks.map((week) => ({ week, phase: { id: ph.id, name: ph.name, type: ph.type } })),
    );
  if (plan.structure === 'days') return daysAsWeeks(plan);
  return plan.weeks.map((week) => ({ week, phase: null }));
}

/** Weeks back into the builder's shape: phases (season) when any week has
 *  one, else plain weeks (training). The containers the plan does not use
 *  are reset, so nothing hidden comes back later. */
export function withCalWeeks(plan: BuilderPlan, rows: CalWeek[]): BuilderPlan {
  const list = rows.length ? rows : [{ week: emptyWeek(), phase: null }];
  const filled = fillPhases(list);
  if (!filled.some((r) => r.phase))
    return {
      ...plan,
      kind: 'training',
      structure: 'weeks',
      weeks: filled.map((r) => r.week),
      days: [emptyDay()],
      phases: [emptyPhase('base')],
    };
  const phases: BuilderPhase[] = [];
  for (const r of filled) {
    const ph = r.phase!;
    const last = phases[phases.length - 1];
    if (last && last.id === ph.id) last.weeks.push(r.week);
    else phases.push({ id: ph.id, name: ph.name, type: ph.type, weeks: [r.week] });
  }
  return { ...plan, kind: 'season', structure: 'weeks', phases, weeks: [emptyWeek()], days: [emptyDay()] };
}

/** In a plan with phases every week has one: a week without takes the phase
 *  before it (the first ones the first phase after them). */
function fillPhases(rows: CalWeek[]): CalWeek[] {
  const firstPhase = rows.find((r) => r.phase)?.phase;
  if (!firstPhase) return rows;
  let cur: CalPhase = firstPhase;
  return rows.map((r) => {
    if (r.phase) cur = r.phase;
    return r.phase ? r : { ...r, phase: cur };
  });
}

// ── Phases ───────────────────────────────────────────────────────────────────

const newPhase = (type: MesoType): CalPhase => ({ id: uid('phase'), name: MESO_LABEL[type], type });

/** A new phase of `type` starts at week `at` and runs to where the phase it
 *  replaces ended. In a plan without phases the weeks before become Base. A
 *  run that ends up next to one of the same type joins it. */
export function phaseFrom(rows: CalWeek[], at: number, type: MesoType): CalWeek[] {
  if (at < 0 || at >= rows.length) return rows;
  const ph = newPhase(type);
  if (!rows.some((r) => r.phase)) {
    const base = newPhase('base');
    return joinRuns(rows.map((r, i) => ({ ...r, phase: i < at ? base : ph })));
  }
  const filled = fillPhases(rows);
  const old = filled[at].phase!.id;
  // A phase's weeks are one run, so "the same id from here on" is the rest of it.
  return joinRuns(filled.map((r, i) => (i >= at && r.phase!.id === old ? { ...r, phase: ph } : r)));
}

/** Neighbouring runs of the same type become one phase (the earlier one's). */
function joinRuns(rows: CalWeek[]): CalWeek[] {
  let prev: CalPhase | null = null;
  return rows.map((r) => {
    let ph = r.phase;
    if (ph && prev && prev.type === ph.type && prev.id !== ph.id) ph = prev;
    prev = ph;
    return ph === r.phase ? r : { ...r, phase: ph };
  });
}

export const withoutPhases = (rows: CalWeek[]): CalWeek[] => rows.map((r) => ({ ...r, phase: null }));

/** Base → Peak across the weeks there are (the season map's suggestion). */
export function suggestPhases(rows: CalWeek[]): CalWeek[] {
  const out: CalWeek[] = [];
  let i = 0;
  for (const s of skeletonPhaseSizes(rows.length)) {
    const ph = newPhase(s.type);
    for (let k = 0; k < s.len && i < rows.length; k++) out.push({ ...rows[i++], phase: ph });
  }
  const last = out[out.length - 1]?.phase ?? newPhase('base');
  while (i < rows.length) out.push({ ...rows[i++], phase: last });
  return out;
}

export function withIntensityCurve(rows: CalWeek[], kind: IntensityPreset): CalWeek[] {
  const curve = intensityPreset(kind, rows.length);
  return rows.map((r, i) => ({ ...r, week: { ...r.week, intensity: curve[i] ?? r.week.intensity } }));
}

// ── Weeks ────────────────────────────────────────────────────────────────────

const blankWeek = (): BuilderWeek => ({ ...emptyWeek(), intensity: DEFAULT_INTENSITY });

/** A new empty week before week `at`, in the phase of the week it pushes on. */
export function insertWeek(rows: CalWeek[], at: number): CalWeek[] {
  const i = Math.max(0, Math.min(at, rows.length));
  const phase = rows[i]?.phase ?? rows[i - 1]?.phase ?? null;
  return [...rows.slice(0, i), { week: blankWeek(), phase }, ...rows.slice(i)];
}

export function addWeeks(rows: CalWeek[], n: number): CalWeek[] {
  const phase = rows[rows.length - 1]?.phase ?? null;
  return [...rows, ...Array.from({ length: Math.max(0, n) }, () => ({ week: blankWeek(), phase }))];
}

/** Week `at` gone; the weeks after it move one week earlier. A plan keeps at
 *  least one week. */
export function deleteWeek(rows: CalWeek[], at: number): CalWeek[] {
  if (rows.length < 2 || at < 0 || at >= rows.length) return rows;
  return rows.filter((_, i) => i !== at);
}

export const clearWeek = (rows: CalWeek[], at: number): CalWeek[] =>
  rows.map((r, i) => (i === at ? { ...r, week: { ...r.week, sessions: [] } } : r));

/** Week `at`'s sessions copied into the week after it (added beside what is
 *  there; a new week when it is the last). Focus and intensity fill in only
 *  where the next week has none. */
export function copyToNextWeek(rows: CalWeek[], at: number): CalWeek[] {
  if (at < 0 || at >= rows.length) return rows;
  const out = at === rows.length - 1 ? addWeeks(rows, 1) : rows.slice();
  const src = copyWeek(rows[at].week);
  const next = out[at + 1].week;
  out[at + 1] = {
    ...out[at + 1],
    week: {
      ...next,
      focus: next.focus.trim() ? next.focus : src.focus,
      intensity: next.sessions.length ? next.intensity : src.intensity,
      sessions: [...next.sessions, ...src.sessions],
    },
  };
  return out;
}

export const updateWeek = (rows: CalWeek[], at: number, patch: Partial<BuilderWeek>): CalWeek[] =>
  rows.map((r, i) => (i === at ? { ...r, week: { ...r.week, ...patch } } : r));

// ── Sessions ─────────────────────────────────────────────────────────────────

export interface SessionAt {
  week: number;
  session: BuilderSession;
}

export function findSession(rows: CalWeek[], id: string): SessionAt | null {
  for (let w = 0; w < rows.length; w++) {
    const s = rows[w].week.sessions.find((x) => x.id === id);
    if (s) return { week: w, session: s };
  }
  return null;
}

/** A copy with its own session and exercise ids: a new session to the app,
 *  whose completions key on the session id. */
export const copySession = (s: BuilderSession): BuilderSession =>
  copyWeek({ ...emptyWeek(), sessions: [s] }).sessions[0];

export function addSession(rows: CalWeek[], week: number, s: BuilderSession): CalWeek[] {
  return rows.map((r, i) => (i === week ? { ...r, week: { ...r.week, sessions: [...r.week.sessions, s] } } : r));
}

export function patchSession(rows: CalWeek[], id: string, patch: Partial<BuilderSession>): CalWeek[] {
  return rows.map((r) =>
    r.week.sessions.some((s) => s.id === id)
      ? { ...r, week: { ...r.week, sessions: r.week.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)) } }
      : r,
  );
}

export function removeSession(rows: CalWeek[], id: string): CalWeek[] {
  return rows.map((r) =>
    r.week.sessions.some((s) => s.id === id)
      ? { ...r, week: { ...r.week, sessions: r.week.sessions.filter((s) => s.id !== id) } }
      : r,
  );
}

/** The session on another day (last of that day's sessions). */
export function moveSession(rows: CalWeek[], id: string, week: number, day: number): CalWeek[] {
  const at = findSession(rows, id);
  if (!at || week < 0 || week >= rows.length) return rows;
  if (at.week === week && at.session.dayOfWeek === day) return rows;
  return addSession(removeSession(rows, id), week, { ...at.session, dayOfWeek: day });
}

/** A copy of the session on another day; the original stays. */
export function copySessionTo(rows: CalWeek[], id: string, week: number, day: number): CalWeek[] {
  const at = findSession(rows, id);
  if (!at || week < 0 || week >= rows.length) return rows;
  return addSession(rows, week, { ...copySession(at.session), dayOfWeek: day });
}

/** Copies of the session on its weekday in each of `weeks`. */
export function copyToWeeks(rows: CalWeek[], id: string, weeks: number[]): CalWeek[] {
  const at = findSession(rows, id);
  if (!at) return rows;
  let out = rows;
  for (const w of [...new Set(weeks)].sort((a, b) => a - b))
    if (w !== at.week && w >= 0 && w < rows.length) out = addSession(out, w, { ...copySession(at.session), dayOfWeek: at.session.dayOfWeek });
  return out;
}

/** A session with nothing in it yet: closing its editor leaves no trace. */
export const isBlankSession = (s: BuilderSession): boolean =>
  !s.label.trim() &&
  !s.body.trim() &&
  !s.exercises.some((e) => e.description.trim() || e.dose?.length) &&
  !s.app;

// ── Competitions ─────────────────────────────────────────────────────────────

/** The plan's competitions. Plans from before the calendar have at most the
 *  season plan's one competition date. */
export function planCompetitions(plan: BuilderPlan): PlanCompetition[] {
  if (Array.isArray(plan.competitions)) return plan.competitions;
  return plan.kind === 'season' && plan.competitionDate
    ? [{ id: 'comp-main', date: plan.competitionDate, name: '' }]
    : [];
}

/** The competitions, sorted by date. The last one is the plan's target: it is
 *  what the athlete's app shows (the plan file has one competition date). */
export function withCompetitions(plan: BuilderPlan, list: PlanCompetition[]): BuilderPlan {
  const competitions = [...list].sort((a, b) => a.date.localeCompare(b.date));
  return { ...plan, competitions, competitionDate: competitions[competitions.length - 1]?.date ?? '' };
}

/** Weeks the plan needs so the date falls inside it. */
export const weeksToReach = (plan: Pick<BuilderPlan, 'startDate'>, date: string): number =>
  weekIndexOf(plan, date) + 1;

// ── A new plan ───────────────────────────────────────────────────────────────

/** The Monday a new plan starts on: today when it is a Monday, else the next. */
export function nextMonday(today: string): string {
  const d = dowOf(today);
  return d === 0 ? today : addDays(today, 7 - d);
}
