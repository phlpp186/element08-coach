/**
 * A plan session's dry table and fitness programme as the parts a coach
 * edits (the plan editor's session screen offers what a template offers).
 *
 * Nothing new is stored. The session already carries both in a form the
 * timers run: the table as `coachRun.program` (one part per sequence) and
 * the programme as `workout` (one part per circuit). This file reads them
 * back into TemplateBlocks and writes them again after an edit, and keeps
 * the readable line of each part in the session's exercises in step.
 *
 * Shared with the coach portal (scripts/shared-templates.txt), whose plan
 * builder offers the same on a session.
 */
import { validateProgramFile, type PlannedSession, type TrainingMode } from './deps';
import { PLAN_WORKOUT_PREFIX, blockLine, programFileFor, workoutFor, type Tr } from './deliver';
import { DEFAULT_ASK, newId, type CoachTemplate, type TemplateBlock } from './model';
import { isCoachExercise } from './exercises';

/** A workout move from the app's exercise list keeps its id in the editor. */
const listed = (id: string): { exerciseId?: string } =>
  isCoachExercise(id) ? { exerciseId: id } : {};

export interface SessionParts {
  /** Dry table parts, then fitness programme parts. */
  parts: TemplateBlock[];
  /** False when the session has a workout that is not a coach's programme
   *  (a plan's own strength workout): it is left alone and no programme can
   *  be added beside it, since a session runs one workout. */
  canHaveProgram: boolean;
}

function programContent(session: PlannedSession) {
  const raw = session.coachRun?.program;
  if (!raw) return null;
  try {
    return validateProgramFile(raw).content;
  } catch {
    return null;
  }
}

/** A workout this file can read back: a coach's programme under the
 *  session's own id. One written before the `programme` mark existed is
 *  known by being circuits only. */
function isProgrammeWorkout(session: PlannedSession): boolean {
  const w = session.workout;
  if (!w || w.id !== `${PLAN_WORKOUT_PREFIX}${session.id}` || w.blocks.length === 0) return false;
  if (w.programme) return w.blocks.every((b) => b.kind === 'circuit' || b.kind === 'sets');
  return w.blocks.every((b) => b.kind === 'circuit');
}

/** The session's table and programme as editable parts. Ids are positional,
 *  so the same session always reads back with the same ids. */
export function sessionParts(session: PlannedSession): SessionParts {
  const parts: TemplateBlock[] = [];
  const content = programContent(session);
  (content?.groups ?? []).forEach((g, i) => {
    parts.push({
      id: `dry-${i}`,
      name: '',
      reps: Math.max(1, g.cycles),
      exercise: {
        kind: 'dry',
        rows: g.blocks.map((r) => ({ ...r })),
        holdTarget: null,
        lungVol: g.lungVol ?? null,
      },
    });
  });
  const programme = isProgrammeWorkout(session);
  if (programme) {
    session.workout!.blocks.forEach((b, i) => {
      if (b.kind === 'sets') {
        // Every round is listed in turn: the first one is the programme.
        const rounds = Math.max(1, b.rounds ?? 1);
        const per = Math.max(1, Math.round(b.items.length / rounds));
        parts.push({
          id: `fit-${i}`,
          name: '',
          reps: rounds,
          exercise: {
            kind: 'program',
            items: b.items.slice(0, per).map((it) => ({
              name: it.name ?? it.id.replace(/^custom:/, ''),
              workSec: it.sec ?? 0,
              restSec: it.restSec,
              ...(it.measure === 'reps' ? { reps: it.reps ?? 0 } : {}),
              ...(it.measure === 'reps' && it.repsHigh != null ? { repsHigh: it.repsHigh } : {}),
              ...listed(it.id),
            })),
            ...((b.restAfterSec ?? 0) > 0 ? { restAfterSec: b.restAfterSec } : {}),
          },
        });
        return;
      }
      if (b.kind !== 'circuit') return;
      parts.push({
        id: `fit-${i}`,
        name: '',
        reps: Math.max(1, b.rounds),
        exercise: {
          kind: 'program',
          items: b.moves.map((m, mi) => ({
            name: m.name ?? m.id.replace(/^custom:/, ''),
            ...listed(m.id),
            workSec: m.sec ?? b.workSec,
            // The rest after a round's last exercise is the round rest.
            restSec: mi === b.moves.length - 1 ? b.roundRestSec : (m.restSec ?? b.restSec),
          })),
          ...((b.restAfterSec ?? 0) > 0 ? { restAfterSec: b.restAfterSec } : {}),
        },
      });
    });
  }
  return { parts, canHaveProgram: !session.workout || programme };
}

const lineOf = (b: TemplateBlock, t: Tr) => blockLine(b, undefined, false, t);
/** The mark a part's line carries (PlannedExercise.run). */
const runOf = (b: TemplateBlock): { run?: 'dry' | 'program' } =>
  b.exercise.kind === 'dry' || b.exercise.kind === 'program' ? { run: b.exercise.kind } : {};

/**
 * The session with its table and programme replaced by `next`, as the timers
 * run them, and its exercise lines following: a part's line is rewritten
 * where it still reads as this file wrote it, added for a new part, and
 * removed with its part. A line the coach reworded is theirs and stays.
 */
export function withSessionParts(
  session: PlannedSession,
  parts: TemplateBlock[],
  opts: { author: string; t: Tr },
): PlannedSession {
  const { t } = opts;
  // What is written must read back (sessionParts), also halfway through an
  // edit: a table with no rows or a programme with no exercises is a removed
  // part, and a time field that is empty for a moment counts as zero.
  const next = parts
    .filter((b) =>
      b.exercise.kind === 'dry'
        ? b.exercise.rows.length > 0
        : b.exercise.kind === 'program' && b.exercise.items.length > 0,
    )
    .map((b) =>
      b.exercise.kind === 'dry'
        ? {
            ...b,
            exercise: {
              ...b.exercise,
              rows: b.exercise.rows.map((r) => ({
                ...r,
                seconds: Number.isFinite(r.seconds) && r.seconds > 0 ? Math.round(r.seconds) : 0,
              })),
            },
          }
        : b,
    );
  const before = sessionParts(session);
  const prev = new Map(before.parts.map((b) => [b.id, b]));
  const kept = new Set(next.map((b) => b.id));

  let exercises: PlannedSession['exercises'] = [...(session.exercises ?? [])];
  for (const b of before.parts) {
    if (kept.has(b.id)) continue;
    const old = lineOf(b, t);
    const at = exercises.findIndex((e) => e.description === old);
    if (at >= 0) exercises.splice(at, 1);
  }
  for (const b of next) {
    const line = lineOf(b, t);
    const was = prev.get(b.id);
    if (!was) {
      exercises.push({ id: newId('ex'), description: line, ...runOf(b) });
      continue;
    }
    const old = lineOf(was, t);
    if (old === line) continue;
    exercises = exercises.map((e) =>
      e.description === old ? { ...e, description: line, ...runOf(b) } : e,
    );
  }

  const content = programContent(session);
  const pseudo: CoachTemplate = {
    id: session.templateRef?.id ?? session.id,
    // The program file needs a name even while the session has none.
    name: session.label.trim() || t('editor.parts.dry'),
    type: session.mode ?? 'general',
    blocks: next,
    effort: null,
    ask: { ...DEFAULT_ASK },
    notes: '',
    ...(content?.trainingMode ? { trainingMode: content.trainingMode as TrainingMode } : {}),
    ...(content?.sessionTag ? { sessionTag: content.sessionTag } : {}),
    useCount: 0,
    createdAt: '',
    updatedAt: '',
  };
  const program = programFileFor(pseudo, [], opts.author);
  // An edit keeps the table's own creation stamp, so writing a session back
  // unchanged really changes nothing.
  const created = (session.coachRun?.program as { metadata?: { created?: unknown } } | undefined)
    ?.metadata?.created;
  if (program && typeof created === 'string' && created) program.metadata.created = created;
  const out: PlannedSession = { ...session, exercises };

  const route = session.coachRun?.route;
  if (program || route) {
    out.coachRun = { ...(program ? { program } : {}), ...(route ? { route } : {}) };
  } else delete out.coachRun;

  // A plan's own workout (not a programme) is never touched.
  if (before.canHaveProgram) {
    const workout = workoutFor(pseudo, `${PLAN_WORKOUT_PREFIX}${session.id}`);
    // An unnamed session's program has no name either (the player then
    // says "Fitness program"), not the stand-in the table file needs.
    if (workout && !session.label.trim()) delete workout.name;
    if (workout) out.workout = workout;
    else delete out.workout;
  }
  return out;
}
