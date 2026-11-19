/**
 * Sending a template: which days, what each athlete receives, and how it lands
 * in their plan.
 *
 * Delivery reuses the coach -> student plan path that every app build already
 * understands. Each athlete gets ONE cloud plan, "Sessions from <coach>"
 * (marked Plan.coachInbox), assigned to them like any other plan. A send
 * appends PlannedSessions to that plan's weeks, with every target already
 * resolved into the text. The student's Today card, plan view and completion
 * sheet treat them like any other coach session; completions key on the
 * session id, which a later send never changes.
 *
 * Pure: the cloud calls live in services/coachStudent/coachTemplates.ts.
 */
import {
  DEFAULT_AUDIO_SETTINGS,
  PLAN_FILE_FORMAT,
  PLAN_FILE_VERSION,
  PROGRAM_FILE_VERSION_PROGRESSIVE,
  addDays,
  type MicroCycle,
  type Plan,
  type PlannedSession,
  type ProgramFile,
  type TrainingGroup,
  type Workout,
} from './deps';
import {
  FITNESS_WORKOUTS,
  newId,
  textLines,
  type CoachTemplate,
  type RestRule,
  type TemplateBlock,
  type TemplateType,
} from './model';
import { formatValue, type ResolvedTarget } from './resolve';

/** lib/season/planWorkout's PLAN_WORKOUT_PREFIX, repeated so this file stays
 *  free of the season code (the coach portal carries a copy of it); a test
 *  pins the two together. */
export const PLAN_WORKOUT_PREFIX = 'plan:';

/** The translator these helpers write with, bound to the coachTemplates
 *  namespace (other namespaces by "ns:key"). */
export type Tr = (key: string, opts?: Record<string, unknown>) => string;

// ─── When ───────────────────────────────────────────────────────────────────

/** Weekdays are 0=Mon..6=Sun, the plan model's own numbering. */
export type SendWhen =
  | { kind: 'once'; date: string }
  | { kind: 'weekly'; start: string; weekdays: number[]; weeks: number };

export const MAX_WEEKS = 12;
export const DEFAULT_WEEKS = 4;
/** Upper bound for one send, per athlete: 7 days × MAX_WEEKS. */
export const MAX_SESSIONS_PER_SEND = 7 * MAX_WEEKS;

/** 0=Mon..6=Sun for an ISO date. */
export function weekdayMon0(iso: string): number {
  return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** The Monday of an ISO date's week (plan weeks are Monday-anchored). */
export function mondayOf(iso: string): string {
  return addDays(`${iso}T00:00:00Z`, -weekdayMon0(iso));
}

/** Every calendar date a send covers, ascending. Weekly covers `weeks` × 7
 *  days from `start` (start included), keeping the chosen weekdays. */
export function scheduleDates(when: SendWhen): string[] {
  if (when.kind === 'once') return /^\d{4}-\d{2}-\d{2}$/.test(when.date) ? [when.date] : [];
  const weeks = Math.max(1, Math.min(MAX_WEEKS, Math.round(when.weeks)));
  const days = new Set(when.weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6));
  if (!days.size || !/^\d{4}-\d{2}-\d{2}$/.test(when.start)) return [];
  const out: string[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(`${when.start}T00:00:00Z`, i);
    if (days.has(weekdayMon0(d))) out.push(d);
  }
  return out.slice(0, MAX_SESSIONS_PER_SEND);
}

// ─── What each athlete receives ─────────────────────────────────────────────

const MODE_BY_TYPE: Record<TemplateType, NonNullable<PlannedSession['mode']>> = {
  depth: 'depth',
  pool: 'pool',
  dry: 'dry',
  fitness: 'general',
  general: 'general',
};

function restText(r: RestRule, t: Tr): string {
  if (r.kind === 'fixed') return t('deliver.restFixed', { time: formatValue(r.sec, 's', false) });
  if (r.kind === 'diveTimes') return t('deliver.restDiveTimes', { n: r.factor });
  return '';
}

/** "(80% of PB)"; with `named`, "(50% of STA PB)" for a dry table, where the
 *  discipline is not next to the number. */
function relativeNote(
  rt: ResolvedTarget | undefined,
  imperial: boolean,
  t: Tr,
  named = false,
): string {
  if (!rt || rt.manual) return '';
  const discipline = rt.discipline;
  if (rt.target.kind === 'pct') {
    return named
      ? t('deliver.pctOfNamedPb', { pct: rt.target.value, discipline })
      : t('deliver.pctOfPb', { pct: rt.target.value });
  }
  if (rt.target.kind === 'minus') {
    const value = formatValue(rt.target.value, rt.unit, imperial);
    return named
      ? t('deliver.namedPbMinus', { value, discipline })
      : t('deliver.pbMinus', { value });
  }
  return '';
}

function withNote(what: string, note: string, t: Tr): string {
  return note ? t('deliver.withNote', { what, note }) : what;
}

/** A text part's exercises, or the single line any other block reads as. */
export function blockLines(
  b: TemplateBlock,
  rt: ResolvedTarget | undefined,
  imperial: boolean,
  t: Tr,
): string[] {
  if (b.exercise.kind !== 'text') return [blockLine(b, rt, imperial, t)];
  const name = b.name.trim();
  return textLines(b.exercise.text).map((line) => {
    const body = b.reps > 1 ? t('deliver.reps', { n: b.reps, what: line }) : line;
    return name ? t('deliver.line', { name, body }) : body;
  });
}

/** One block as the line a student reads, with this athlete's numbers. */
export function blockLine(
  b: TemplateBlock,
  rt: ResolvedTarget | undefined,
  imperial: boolean,
  t: Tr,
): string {
  const ex = b.exercise;
  let body: string;
  switch (ex.kind) {
    case 'depth':
    case 'pool': {
      const unit = ex.kind === 'pool' && ex.discipline === 'STA' ? 's' : 'm';
      const value = rt?.value != null ? formatValue(rt.value, unit, imperial) : '?';
      const what = withNote(
        t('deliver.target', { discipline: ex.discipline, value }),
        relativeNote(rt, imperial, t),
        t,
      );
      const reps = b.reps > 1 ? t('deliver.reps', { n: b.reps, what }) : what;
      const rest = restText(ex.rest, t);
      body = rest ? t('deliver.joinRest', { what: reps, rest }) : reps;
      break;
    }
    case 'dry': {
      const rows = ex.rows
        .map((r) => {
          const type = t(`deliver.rowTypes.${r.type}`);
          if (r.endMode === 'signal') return t('deliver.dryRowOpen', { type });
          const isTargetHold =
            !!ex.holdTarget && r.type === 'Hold' && (!r.endMode || r.endMode === 'timed');
          const sec = isTargetHold && rt?.value != null ? rt.value : r.seconds;
          const row = t('deliver.dryRow', { type, time: formatValue(sec, 's', false) });
          return r.stepSec
            ? t('deliver.dryStep', {
                row,
                step: `${r.stepSec > 0 ? '+' : '-'}${formatValue(Math.abs(r.stepSec), 's', false)}`,
              })
            : row;
        })
        .join(' · ');
      const what = b.reps > 1 ? t('deliver.reps', { n: b.reps, what: `[${rows}]` }) : rows;
      body = withNote(what, ex.holdTarget ? relativeNote(rt, false, t, true) : '', t);
      break;
    }
    case 'program': {
      const items = ex.items
        .map((it) => {
          const work =
            it.reps != null
              ? t('deliver.reps', { n: it.reps, what: it.name.trim() })
              : t('deliver.programItem', {
                  name: it.name.trim(),
                  time: formatValue(it.workSec, 's', false),
                });
          return it.restSec > 0
            ? t('deliver.joinRest', {
                what: work,
                rest: t('deliver.restFixed', { time: formatValue(it.restSec, 's', false) }),
              })
            : work;
        })
        .join(' · ');
      const rounds = b.reps > 1 ? t('deliver.reps', { n: b.reps, what: `[${items}]` }) : items;
      body =
        (ex.restAfterSec ?? 0) > 0
          ? t('deliver.joinRest', {
              what: rounds,
              rest: t('deliver.restFixed', { time: formatValue(ex.restAfterSec!, 's', false) }),
            })
          : rounds;
      break;
    }
    case 'fitness': {
      const w = FITNESS_WORKOUTS.find((x) => x.id === ex.workout);
      const title = w ? t(`trainingPlans:${w.titleKey}`) : '';
      const parts = [title, ex.text.trim()].filter(Boolean).join(' · ');
      body = b.reps > 1 ? t('deliver.reps', { n: b.reps, what: parts }) : parts;
      break;
    }
    case 'text': {
      const text = textLines(ex.text).join(' · ');
      body = b.reps > 1 ? t('deliver.reps', { n: b.reps, what: text }) : text;
      break;
    }
  }
  const name = b.name.trim();
  return name ? t('deliver.line', { name, body }) : body;
}

/** The notes a student reads: the coach's notes. (What to report back is not
 *  written any more: the app always asks for effort and has a notes field.) */
export function sessionNotesFor(template: CoachTemplate): string {
  return template.notes.trim();
}

/** A dry template as the .e08plan training file the timer can run, with this
 *  athlete's hold lengths. Null when the template has no dry blocks. */
export function programFileFor(
  template: CoachTemplate,
  resolved: ResolvedTarget[],
  author: string,
): ProgramFile | null {
  const groups: TrainingGroup[] = [];
  for (const b of template.blocks) {
    if (b.exercise.kind !== 'dry') continue;
    const ex = b.exercise;
    const rt = resolved.find((r) => r.blockId === b.id);
    groups.push({
      cycles: b.reps,
      blocks: ex.rows.map((r) =>
        ex.holdTarget &&
        rt?.value != null &&
        r.type === 'Hold' &&
        (!r.endMode || r.endMode === 'timed')
          ? { ...r, seconds: rt.value }
          : { ...r },
      ),
      ...(ex.lungVol ? { lungVol: ex.lungVol } : {}),
    });
  }
  if (!groups.length) return null;
  const progressive = groups.some((g) => g.blocks.some((r) => !!r.stepSec));
  return {
    format: PLAN_FILE_FORMAT,
    version: progressive ? PROGRAM_FILE_VERSION_PROGRESSIVE : PLAN_FILE_VERSION,
    type: 'training_program',
    metadata: { title: template.name, author, created: new Date().toISOString() },
    content: {
      name: template.name,
      groups,
      audioSettings: { ...DEFAULT_AUDIO_SETTINGS },
      lungVol: null,
      trainingMode: template.trainingMode ?? 'static',
      sessionTag: template.sessionTag ?? null,
    },
  };
}

/** The fitness programmes of a template as ONE workout the fitness player
 *  runs, a block per programme part. Null when the template has none. `id`
 *  must be `plan:<session id>`, which is how the player finds a plan
 *  session's workout (lib/season/planWorkout).
 *
 *  All exercises on the clock: a circuit, each on its own clock, which runs
 *  by itself; the rest after a round's last exercise is the rest between
 *  rounds. Any exercise for repetitions: the athlete has to say when a set is
 *  done, so the part becomes sets, every round listed in turn (one set per
 *  exercise), which the player runs round by round. */
export function workoutFor(template: CoachTemplate, id: string): Workout | null {
  const blocks: Workout['blocks'] = [];
  for (const b of template.blocks) {
    if (b.exercise.kind !== 'program' || b.exercise.items.length === 0) continue;
    const items = b.exercise.items;
    const after = b.exercise.restAfterSec ?? 0;
    const restAfter = after > 0 ? { restAfterSec: after } : {};
    const ref = (name: string) => {
      const clean = name.trim().slice(0, 60);
      return { id: `custom:${clean.toLowerCase()}`, name: clean };
    };
    if (items.some((it) => it.reps != null)) {
      const round = items.map((it) =>
        it.reps != null
          ? {
              ...ref(it.name),
              measure: 'reps' as const,
              sets: 1,
              reps: it.reps,
              restSec: it.restSec,
            }
          : {
              ...ref(it.name),
              measure: 'time' as const,
              sets: 1,
              sec: it.workSec,
              restSec: it.restSec,
            },
      );
      blocks.push({
        kind: 'sets',
        items: Array.from({ length: b.reps }, () => round.map((x) => ({ ...x }))).flat(),
        rounds: b.reps,
        ...restAfter,
      });
      continue;
    }
    const last = items[items.length - 1];
    blocks.push({
      kind: 'circuit',
      moves: items.map((it) => ({ ...ref(it.name), sec: it.workSec, restSec: it.restSec })),
      // Builds that do not know per-move clocks run every move on these.
      workSec: items[0].workSec,
      restSec: items[0].restSec,
      rounds: b.reps,
      roundRestSec: last.restSec,
      ...restAfter,
    });
  }
  if (!blocks.length) return null;
  return { id, name: template.name.trim(), programme: true, blocks };
}

export interface DeliveredSession {
  date: string;
  session: PlannedSession;
}

/** One PlannedSession per date for one athlete, every target resolved. The
 *  caller must have filled every missing target (missingTargets is empty). */
export function buildPlannedSessions(
  template: CoachTemplate,
  resolved: ResolvedTarget[],
  dates: string[],
  opts: { imperial: boolean; author: string; t: Tr },
): DeliveredSession[] {
  const { imperial, author, t } = opts;
  const lines = template.blocks.flatMap((b) => {
    const k = b.exercise.kind;
    // A table's or programme's line says so (PlannedExercise.run), so the
    // athlete's views can draw the timer in its place.
    const run = k === 'dry' || k === 'program' ? { run: k } : {};
    return blockLines(
      b,
      resolved.find((r) => r.blockId === b.id),
      imperial,
      t,
    ).map((description) => ({ description, ...run }));
  });
  const notes = sessionNotesFor(template);
  const program = programFileFor(template, resolved, author);
  const fitnessRoute = FITNESS_WORKOUTS.find((w) =>
    template.blocks.some((b) => b.exercise.kind === 'fitness' && b.exercise.workout === w.id),
  )?.route;
  return dates.map((date) => {
    const id = newId('ts');
    const session: PlannedSession = {
      id,
      dayOfWeek: weekdayMon0(date),
      label: template.name.trim(),
      exercises: lines.map((line, i) => ({ id: `${id}-${i + 1}`, ...line })),
      mode: MODE_BY_TYPE[template.type],
      templateRef: { id: template.id, name: template.name.trim() },
    };
    if (template.sessionType) session.sessionType = template.sessionType;
    if (template.effort != null)
      session.coachTarget = template.effort as PlannedSession['coachTarget'];
    if (notes) session.sessionNotes = notes;
    const workout = workoutFor(template, `${PLAN_WORKOUT_PREFIX}${id}`);
    if (workout) session.workout = workout;
    if (program || fitnessRoute) {
      session.coachRun = {
        ...(program ? { program } : {}),
        ...(fitnessRoute ? { route: fitnessRoute } : {}),
      };
    }
    return { date, session };
  });
}

// ─── The athlete's "Sessions from <coach>" plan ─────────────────────────────

/** True when a plans.definition is the inbox plan for this athlete. */
export function isInboxFor(def: unknown, studentId: string): boolean {
  const ci = (def as Plan | null)?.coachInbox;
  return !!ci && typeof ci === 'object' && ci.studentId === studentId;
}

export function newInboxPlan(studentId: string, title: string, now = new Date()): Plan {
  return {
    id: now.getTime(),
    name: title,
    kind: 'training',
    competitionDate: null,
    startDate: null,
    phases: [{ id: 'inbox', name: title, type: 'base', weeks: [] }],
    createdAt: now.toISOString(),
    active: false,
    schemaVersion: 3,
    mode: 'general',
    coachInbox: { studentId, v: 1 },
  };
}

function emptyWeek(weekStart: string): MicroCycle {
  // Intensity 0 is "not set": normIntensity reads it as null, so the week
  // shows no intensity badge it was never given.
  return {
    weekStart,
    focus: '',
    targetSessions: 0,
    targetMix: {},
    intensity: 0,
    notes: '',
    plannedSessions: [],
  };
}

function sameSession(a: PlannedSession, b: PlannedSession): boolean {
  return (
    !!a.templateRef &&
    a.templateRef.id === b.templateRef?.id &&
    a.dayOfWeek === b.dayOfWeek &&
    a.label === b.label &&
    a.exercises.map((e) => e.description).join('\n') ===
      b.exercises.map((e) => e.description).join('\n')
  );
}

/**
 * Append delivered sessions to an inbox plan. Never edits or removes what is
 * already there: existing sessions keep their ids, so the athlete's
 * completions (keyed by session id) stay attached. A session identical to one
 * already on that day (a retried send) is skipped.
 */
export function mergeIntoInbox(
  plan: Plan,
  items: DeliveredSession[],
): { plan: Plan; added: number } {
  const next: Plan = JSON.parse(JSON.stringify(plan));
  if (!Array.isArray(next.phases) || next.phases.length === 0) {
    next.phases = [{ id: 'inbox', name: next.name, type: 'base', weeks: [] }];
  }
  let added = 0;
  for (const { date, session } of items) {
    const weekStart = mondayOf(date);
    let week: MicroCycle | undefined;
    for (const ph of next.phases) {
      week = (ph.weeks ?? []).find((w) => w.weekStart === weekStart);
      if (week) break;
    }
    if (!week) {
      const phase = next.phases[next.phases.length - 1];
      phase.weeks = [...(phase.weeks ?? []), emptyWeek(weekStart)].sort((a, b) =>
        a.weekStart.localeCompare(b.weekStart),
      );
      week = phase.weeks.find((w) => w.weekStart === weekStart)!;
    }
    week.plannedSessions = week.plannedSessions ?? [];
    if (week.plannedSessions.some((s) => sameSession(s, session))) continue;
    // Keep the day order without moving existing sessions: insert after the
    // last session on the same or an earlier day.
    let at = week.plannedSessions.length;
    while (at > 0 && week.plannedSessions[at - 1].dayOfWeek > session.dayOfWeek) at--;
    week.plannedSessions.splice(at, 0, session);
    week.targetSessions = week.plannedSessions.length;
    added++;
  }
  let first: string | null = null;
  for (const ph of next.phases) {
    for (const w of ph.weeks ?? []) if (!first || w.weekStart < first) first = w.weekStart;
  }
  next.startDate = first;
  return { plan: next, added };
}
