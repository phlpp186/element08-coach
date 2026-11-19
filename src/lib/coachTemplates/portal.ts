/**
 * The portal's side of the shared template library (the model itself is the
 * app's, see deps.ts): turning a builder session or one of the old
 * browser-only "Builder templates" into a shared template, and a shared
 * template into a builder session.
 */
import {
  exerciseText,
  uid,
  type BuilderSession,
  type PlanMode,
} from '../e08plan';
import type { SessionTemplate } from '../library';
import type { Tr } from './deliver';
import {
  DEFAULT_ASK,
  MAX_NAME,
  MAX_PART_TEXT,
  newId,
  type CoachTemplate,
  type TemplateType,
} from './model';
import { sessionFromTemplate } from './planInsert';
import type { PlannedSession } from './deps';
import { sessionParts, withSessionParts, type SessionParts } from './sessionParts';
import type { TemplateBlock } from './model';
import type { ResolvedTarget } from './resolve';

const TYPES: TemplateType[] = ['dry', 'pool', 'depth', 'fitness', 'general'];

/** A template type as the builder's session mode (fitness is general there). */
export const modeOfType = (type: TemplateType): PlanMode =>
  type === 'fitness' ? 'general' : type;

function textTemplate(
  id: string,
  from: Pick<BuilderSession, 'body' | 'mode' | 'sessionType' | 'coachTarget'> & {
    exercises: Omit<BuilderSession['exercises'][number], 'id'>[];
  },
  name: string,
  now: string,
  useCount = 0,
): CoachTemplate {
  const text = from.exercises
    // One exercise per line: a line break inside one would split it.
    .map((e) => exerciseText({ id: '', ...e }).replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, MAX_PART_TEXT);
  const effort = from.coachTarget;
  return {
    id,
    name: name.trim().slice(0, MAX_NAME),
    type: TYPES.includes(from.mode) ? from.mode : 'general',
    blocks: text ? [{ id: newId('b'), name: '', reps: 1, exercise: { kind: 'text', text } }] : [],
    effort: effort && effort >= 1 && effort <= 10 ? Math.round(effort) : null,
    ask: { ...DEFAULT_ASK },
    notes: from.body.trim().slice(0, 2000),
    ...(from.sessionType.trim() ? { sessionType: from.sessionType.trim() } : {}),
    useCount,
    createdAt: now,
    updatedAt: now,
  };
}

/** "Save as template" in the builder: the session as a text template. */
export function templateFromSession(
  name: string,
  session: BuilderSession,
  now = new Date().toISOString(),
): CoachTemplate {
  return textTemplate(newId('tpl'), session, name || session.label || 'Session template', now);
}

/** The id a browser-only template gets in the shared library. Fixed per
 *  template, so a conversion that is retried finds its first upload instead
 *  of making a second copy. */
export const migratedId = (localId: string): string => `tpl-web-${localId}`;

/** One of the old browser-only templates as a shared text template: its
 *  exercises (dose written into the line), body as the notes, mode as the
 *  type, session type and use count kept. */
export function templateFromLocal(
  tpl: SessionTemplate,
  now = new Date().toISOString(),
): CoachTemplate {
  return textTemplate(
    migratedId(tpl.id),
    tpl,
    tpl.name || tpl.label || 'Session template',
    now,
    tpl.useCount ?? 0,
  );
}

/** What a template brings that the builder does not edit: where it came
 *  from, its dry table and its fitness programme. Rides along on the session
 *  (BuilderSession.app) into the plan the app reads. */
export type SessionExtras = NonNullable<BuilderSession['app']>;

/** A shared template as a builder session on `day`, or null while a PB
 *  target of an older template has no number yet. */
export function builderSessionFromTemplate(
  template: CoachTemplate,
  resolved: ResolvedTarget[],
  day: number,
  opts: { author: string; t: Tr },
): BuilderSession | null {
  const s = sessionFromTemplate(template, resolved, day, { ...opts, imperial: false });
  if (!s) return null;
  const app: SessionExtras = {
    ...(s.templateRef ? { templateRef: s.templateRef } : {}),
    ...(s.coachRun ? { coachRun: s.coachRun } : {}),
    ...(s.workout ? { workout: { ...s.workout } } : {}),
  };
  return {
    id: s.id,
    dayOfWeek: s.dayOfWeek,
    label: s.label,
    body: s.sessionNotes ?? '',
    exercises: s.exercises.map((e) => ({ id: uid('ex'), description: e.description })),
    mode: s.mode ?? modeOfType(template.type),
    sessionType: s.sessionType ?? '',
    ...(typeof s.coachTarget === 'number' ? { coachTarget: s.coachTarget } : {}),
    ...(Object.keys(app).length ? { app } : {}),
  };
}

// ── A dry table and a fitness programme on a builder session ────────────────

/** The builder session as the session the shared code reads: its own lines
 *  (doses stay on the builder's side) and what a template or an earlier edit
 *  put in `app`. */
function asPlanned(s: BuilderSession): PlannedSession {
  return {
    id: s.id,
    dayOfWeek: s.dayOfWeek,
    label: s.label,
    exercises: s.exercises.map((e) => ({ id: e.id, description: e.description })),
    mode: s.mode,
    ...(s.app?.templateRef ? { templateRef: s.app.templateRef } : {}),
    ...(s.app?.coachRun ? { coachRun: s.app.coachRun } : {}),
    ...(s.app?.workout ? { workout: s.app.workout as unknown as PlannedSession['workout'] } : {}),
  };
}

/** The session's dry table and fitness programme as the parts the template
 *  editor edits (the app's plan editor reads them the same way). */
export function builderParts(session: BuilderSession): SessionParts {
  return sessionParts(asPlanned(session));
}

/** The session with those parts replaced by `next`: what the app's timers
 *  run goes into `app`, and each part's readable line in the exercises
 *  follows (a line the coach reworded stays; doses stay on their lines). */
export function withBuilderParts(
  session: BuilderSession,
  next: TemplateBlock[],
  opts: { author: string; t: Tr },
): Pick<BuilderSession, 'exercises' | 'app'> {
  const out = withSessionParts(asPlanned(session), next, opts);
  const byId = new Map(session.exercises.map((e) => [e.id, e]));
  const app: SessionExtras = {
    ...(session.app?.templateRef ? { templateRef: session.app.templateRef } : {}),
    ...(out.coachRun ? { coachRun: out.coachRun } : {}),
    ...(out.workout ? { workout: { ...out.workout } } : {}),
  };
  return {
    exercises: out.exercises.map((e) => {
      const was = byId.get(e.id);
      return was ? { ...was, description: e.description } : { id: uid('ex'), description: e.description };
    }),
    app: Object.keys(app).length ? app : undefined,
  };
}
