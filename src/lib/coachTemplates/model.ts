/**
 * Coach session templates: the model, validation and the cloud wire wrapper.
 * ONE library for the phone and the coach portal (Philipp, 2026-11-18): this
 * file and its siblings listed in scripts/shared-templates.txt are copied
 * byte-identical into element08-coach (`npm run check:shared` there fails on
 * drift). Edit them here, then copy.
 *
 * THE FORMAT. A template is a reusable session:
 *   name, type (dry | pool | depth | fitness | general), target effort 1-10,
 *   notes for the athlete, what to report back (ask), and `blocks`: its PARTS,
 *   run in the order they are stored. A part is a TemplateBlock whose
 *   `exercise.kind` says what it is. Any type may hold any mix of the three
 *   kinds a coach can add:
 *     text     exercises as free text, ONE PER LINE of `text`. Each line
 *              becomes one tick-box line of the athlete's session.
 *     dry      a table the breath-hold timer runs: `rows` are the Free
 *              Session's own TrainingBlocks, the block's `reps` its rounds.
 *     program  a fitness programme the fitness timer runs: `items` (a name,
 *              then EITHER work seconds OR `reps`, and rest seconds), the
 *              block's `reps` its rounds.
 *   Kinds only older templates hold. They are read, sent and inserted as
 *   before, shown read-only in the editor, and never created again:
 *     depth, pool  a target that may be relative to the athlete's PB
 *                  (TargetKind) and a rest rule
 *     fitness      one of the app's own workouts by id, plus text
 *     dry.holdTarget  hold length relative to the athlete's STA PB
 *   A reader that does not know a kind skips that block (parseExercise), so
 *   a new kind never breaks an older build; it only does not show there.
 *
 * Sending and inserting into a plan: deliver.ts and planInsert.ts turn a
 * template into plain PlannedSessions (text lines, plus the table as
 * coachRun.program and the programme as `workout`). Nothing relative ever
 * reaches a student: PB targets of older templates are resolved per athlete
 * first (resolve.ts).
 *
 * Storage: a template lives in the coach's own `plans` row, its definition
 * wrapped as { format: 'e08template', version, template } (templateDefinition).
 * plans RLS already limits the row to its coach, and a template row is never
 * assigned, so no student can read it. Every list of plans must drop these
 * rows (isTemplateDefinition).
 *
 * Units: depth and distance in metres, times in seconds, like the rest of the
 * app. Imperial is a display concern (resolve.ts formatValue).
 */
import type { Discipline, LungVolume, SessionTag, TrainingBlock, TrainingMode } from './deps';

export const TEMPLATE_FORMAT = 'e08template';
/** 2 added the type 'general', the 'program' kind and many lines per text
 *  block. Readers do not gate on it (see parseExercise). */
export const TEMPLATE_VERSION = 2;

export type TemplateType = 'dry' | 'pool' | 'depth' | 'fitness' | 'general';
export const TEMPLATE_TYPES: TemplateType[] = ['dry', 'pool', 'depth', 'fitness', 'general'];

/** fixed: the value itself (m or s). pct: percent of the athlete's PB.
 *  minus: the athlete's PB less `value` (m or s). */
export type TargetKind = 'fixed' | 'pct' | 'minus';
export interface TemplateTarget {
  kind: TargetKind;
  value: number;
}

/** Rest between reps: none, a fixed time, or a multiple of the dive's own time
 *  (the usual depth rule, "rest 3 × dive time"). */
export type RestRule =
  | { kind: 'none' }
  | { kind: 'fixed'; sec: number }
  | { kind: 'diveTimes'; factor: number };

export type DepthDiscipline = Exclude<Discipline, 'MIX'>;
export const DEPTH_DISCIPLINES: DepthDiscipline[] = ['CWT', 'CWTB', 'CNF', 'FIM', 'VWT', 'NLT'];

export type PoolTplDiscipline = 'DYN' | 'DYNB' | 'DNF' | 'STA';
export const POOL_DISCIPLINES: PoolTplDiscipline[] = ['DYN', 'DYNB', 'DNF', 'STA'];

/** The app's own fitness workouts a template can point at. The route is what
 *  a student's app opens; the title key lives in trainingPlans. */
export type FitnessWorkoutId = 'circuit:body-core' | 'hiit:hiit' | 'hiit:apnea';
export const FITNESS_WORKOUTS: {
  id: FitnessWorkoutId;
  route: string;
  titleKey: 'courses.circuit.title' | 'courses.hiit.title' | 'courses.apneaHiit.title';
}[] = [
  {
    id: 'circuit:body-core',
    route: '/training/circuit?lesson=body-core',
    titleKey: 'courses.circuit.title',
  },
  { id: 'hiit:hiit', route: '/training/hiit-workout?pool=hiit', titleKey: 'courses.hiit.title' },
  {
    id: 'hiit:apnea',
    route: '/training/hiit-workout?pool=apnea',
    titleKey: 'courses.apneaHiit.title',
  },
];

/** One exercise of a fitness programme: work on the clock, or a number of
 *  repetitions the athlete ticks off, then rest. */
export interface ProgramItem {
  name: string;
  /** Work seconds. Kept but not used while `reps` is set, so switching an
   *  exercise back to time finds its old value. */
  workSec: number;
  /** Set = done for this many repetitions instead of on the clock. */
  reps?: number;
  /** 0 = straight into the next exercise. */
  restSec: number;
}

/** Dry rows are the Free Session's own TrainingBlocks, so a dry part is a
 *  table the timer can run. `holdTarget` (older templates only) replaces the
 *  length of every timed Hold row with the athlete's resolved STA value. */
export type TemplateExercise =
  | { kind: 'depth'; discipline: DepthDiscipline; target: TemplateTarget; rest: RestRule }
  | { kind: 'pool'; discipline: PoolTplDiscipline; target: TemplateTarget; rest: RestRule }
  | {
      kind: 'dry';
      rows: TrainingBlock[];
      holdTarget: TemplateTarget | null;
      lungVol: LungVolume | null;
    }
  | { kind: 'program'; items: ProgramItem[] }
  | { kind: 'fitness'; workout: FitnessWorkoutId | null; text: string }
  | { kind: 'text'; text: string };

/** The kinds a coach adds in the editor. */
export type PartKind = 'text' | 'dry' | 'program';
export const PART_KINDS: PartKind[] = ['text', 'dry', 'program'];

/** True for a part only older templates hold: read-only in the editor. */
export function isLegacyExercise(ex: TemplateExercise): boolean {
  return ex.kind === 'depth' || ex.kind === 'pool' || ex.kind === 'fitness';
}

/** The exercises of a text part, one per line, blanks dropped. */
export function textLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

export interface TemplateBlock {
  id: string;
  /** A heading older templates gave a block ("Warm-up"). New parts have none. */
  name: string;
  /** Rounds of a table or programme; repetitions of an older exercise. A
   *  text part is always 1. */
  reps: number;
  exercise: TemplateExercise;
}

/** No longer shown or sent (Philipp, 2026-11-18: the app always asks for
 *  effort and always has a notes field). Still written, with its defaults,
 *  because builds before that read it. */
export interface TemplateAsk {
  effort: boolean;
  eq: boolean;
  notes: boolean;
}

export interface CoachTemplate {
  id: string;
  name: string;
  type: TemplateType;
  blocks: TemplateBlock[];
  /** Target effort 1-10, or null for none. Becomes PlannedSession.coachTarget. */
  effort: number | null;
  ask: TemplateAsk;
  /** Notes for the student. */
  notes: string;
  /** Dry only: how the timer runs the table. */
  trainingMode?: TrainingMode;
  sessionTag?: SessionTag | null;
  /** The session subtype the portal's plan builder shows (a session type id).
   *  Set there; the phone keeps it and passes it on to the session. */
  sessionType?: string;
  /** How many times the coach has sent it. */
  useCount: number;
  createdAt: string;
  updatedAt: string;
}

export const MAX_REPS = 50;
export const MAX_BLOCKS = 20;
export const MAX_PCT = 150;
export const MAX_NAME = 80;
export const MAX_TEXT = 500;
/** A text part: several exercises, one per line. */
export const MAX_PART_TEXT = 2000;
export const MAX_ITEMS = 20;
export const MAX_ITEM_SEC = 3600;
export const MAX_ITEM_REPS = 999;

let seq = 0;
/** Client-side id. Templates are created offline too, so the id cannot wait
 *  for the server. */
export function newId(prefix: string, now = Date.now()): string {
  seq += 1;
  return `${prefix}-${now.toString(36)}-${seq.toString(36)}${Math.floor(Math.random() * 1296)
    .toString(36)
    .padStart(2, '0')}`;
}

export const DEFAULT_ASK: TemplateAsk = { effort: true, eq: false, notes: true };

/** What "+ Exercise", "+ Dry table" and "+ Fitness" add. */
export function defaultPart(kind: PartKind): TemplateExercise {
  switch (kind) {
    case 'text':
      return { kind: 'text', text: '' };
    case 'dry':
      return {
        kind: 'dry',
        rows: [
          { type: 'Rest', seconds: 90 },
          { type: 'Hold', seconds: 120 },
        ],
        holdTarget: null,
        lungVol: null,
      };
    case 'program':
      return { kind: 'program', items: [{ name: '', workSec: 45, restSec: 15 }] };
  }
}

export function newPart(kind: PartKind): TemplateBlock {
  return { id: newId('b'), name: '', reps: kind === 'text' ? 1 : 3, exercise: defaultPart(kind) };
}

/** A new template: one empty Exercises part, since most templates are text
 *  only. The type is a label (it sets the session's mode); parts are free. */
export function blankTemplate(
  type: TemplateType,
  name = '',
  now = new Date().toISOString(),
): CoachTemplate {
  return {
    id: newId('tpl'),
    name,
    type,
    blocks: [newPart('text')],
    effort: null,
    ask: { ...DEFAULT_ASK },
    notes: '',
    useCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/** A copy with fresh ids that has never been sent. */
export function duplicateTemplate(
  t: CoachTemplate,
  name: string,
  now = new Date().toISOString(),
): CoachTemplate {
  return {
    ...t,
    id: newId('tpl'),
    name,
    blocks: t.blocks.map((b) => ({ ...b, id: newId('b') })),
    useCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/** True when any target depends on the athlete's PB. Drives the "relative to
 *  PB" tag and the per-athlete preview. */
export function usesPB(t: CoachTemplate): boolean {
  return t.blocks.some((b) => {
    const tg = blockTarget(b.exercise);
    return !!tg && tg.kind !== 'fixed';
  });
}

/** The target an exercise carries, if any. */
export function blockTarget(ex: TemplateExercise): TemplateTarget | null {
  if (ex.kind === 'depth' || ex.kind === 'pool') return ex.target;
  if (ex.kind === 'dry') return ex.holdTarget;
  return null;
}

// ─── Validation ─────────────────────────────────────────────────────────────

export type TemplateIssueCode =
  | 'name'
  | 'noBlocks'
  | 'tooManyBlocks'
  | 'reps'
  | 'items'
  | 'target'
  | 'rest'
  | 'dryRows'
  | 'text'
  | 'effort';

export interface TemplateIssue {
  code: TemplateIssueCode;
  blockId?: string;
}

function targetOk(t: TemplateTarget | null | undefined): boolean {
  if (!t || !Number.isFinite(t.value)) return false;
  if (t.kind === 'fixed') return t.value > 0;
  if (t.kind === 'pct') return t.value > 0 && t.value <= MAX_PCT;
  if (t.kind === 'minus') return t.value >= 0;
  return false;
}

function restOk(r: RestRule): boolean {
  if (r.kind === 'none') return true;
  if (r.kind === 'fixed') return Number.isFinite(r.sec) && r.sec > 0 && r.sec <= 3600;
  if (r.kind === 'diveTimes') return Number.isFinite(r.factor) && r.factor > 0 && r.factor <= 20;
  return false;
}

/** Everything that stops a template from being saved, in display order. An
 *  empty list means it is valid. */
export function validateTemplate(t: CoachTemplate): TemplateIssue[] {
  const out: TemplateIssue[] = [];
  if (!t.name.trim()) out.push({ code: 'name' });
  if (t.blocks.length === 0) out.push({ code: 'noBlocks' });
  if (t.blocks.length > MAX_BLOCKS) out.push({ code: 'tooManyBlocks' });
  if (t.effort != null && !(Number.isInteger(t.effort) && t.effort >= 1 && t.effort <= 10)) {
    out.push({ code: 'effort' });
  }
  for (const b of t.blocks) {
    const ex = b.exercise;
    if (!(Number.isInteger(b.reps) && b.reps >= 1 && b.reps <= MAX_REPS)) {
      out.push({ code: 'reps', blockId: b.id });
    }
    switch (ex.kind) {
      case 'depth':
        if (!DEPTH_DISCIPLINES.includes(ex.discipline) || !targetOk(ex.target)) {
          out.push({ code: 'target', blockId: b.id });
        }
        if (!restOk(ex.rest)) out.push({ code: 'rest', blockId: b.id });
        break;
      case 'pool':
        if (!POOL_DISCIPLINES.includes(ex.discipline) || !targetOk(ex.target)) {
          out.push({ code: 'target', blockId: b.id });
        }
        if (!restOk(ex.rest)) out.push({ code: 'rest', blockId: b.id });
        break;
      case 'dry':
        if (
          ex.rows.length === 0 ||
          ex.rows.some((r) => !Number.isFinite(r.seconds) || r.seconds < 0 || r.seconds > 3600) ||
          !ex.rows.some((r) => r.seconds > 0 || r.endMode === 'signal')
        ) {
          out.push({ code: 'dryRows', blockId: b.id });
        }
        if (ex.holdTarget && !targetOk(ex.holdTarget)) {
          out.push({ code: 'target', blockId: b.id });
        }
        break;
      case 'program':
        if (
          ex.items.length === 0 ||
          ex.items.length > MAX_ITEMS ||
          ex.items.some(
            (it) =>
              !it.name.trim() ||
              (it.reps != null
                ? !(Number.isInteger(it.reps) && it.reps >= 1 && it.reps <= MAX_ITEM_REPS)
                : !(Number.isFinite(it.workSec) && it.workSec > 0 && it.workSec <= MAX_ITEM_SEC)) ||
              !(Number.isFinite(it.restSec) && it.restSec >= 0 && it.restSec <= MAX_ITEM_SEC),
          )
        ) {
          out.push({ code: 'items', blockId: b.id });
        }
        break;
      case 'fitness':
        if (!ex.workout && !ex.text.trim()) out.push({ code: 'text', blockId: b.id });
        break;
      case 'text':
        if (!ex.text.trim()) out.push({ code: 'text', blockId: b.id });
        break;
    }
  }
  return out;
}

// ─── Cloud wire wrapper + defensive parsing ─────────────────────────────────

export interface TemplateDefinition {
  format: typeof TEMPLATE_FORMAT;
  version: number;
  template: CoachTemplate;
}

export function templateDefinition(t: CoachTemplate): TemplateDefinition {
  return { format: TEMPLATE_FORMAT, version: TEMPLATE_VERSION, template: t };
}

/** True for a plans.definition that holds a template, not a plan. The ONE
 *  test every plan list uses to drop template rows. */
export function isTemplateDefinition(def: unknown): boolean {
  return (
    !!def &&
    typeof def === 'object' &&
    !Array.isArray(def) &&
    (def as { format?: unknown }).format === TEMPLATE_FORMAT
  );
}

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const str = (v: unknown, max = MAX_TEXT): string => (typeof v === 'string' ? v.slice(0, max) : '');

function parseTarget(v: unknown): TemplateTarget | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const kind = o.kind === 'fixed' || o.kind === 'pct' || o.kind === 'minus' ? o.kind : null;
  if (!kind) return null;
  return { kind, value: num(o.value, 0) };
}

function parseRest(v: unknown): RestRule {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  if (o.kind === 'fixed') return { kind: 'fixed', sec: num(o.sec, 0) };
  if (o.kind === 'diveTimes') return { kind: 'diveTimes', factor: num(o.factor, 0) };
  return { kind: 'none' };
}

const ROW_TYPES = ['Rest', 'Hold', 'Recover', 'Attempt', 'Swim'];

function parseRows(v: unknown): TrainingBlock[] {
  if (!Array.isArray(v)) return [];
  const out: TrainingBlock[] = [];
  for (const r of v) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (!ROW_TYPES.includes(o.type as string)) continue;
    // Keep every TrainingBlock field the timer knows (label, cues, stepSec,
    // endMode...); only the two required ones are coerced.
    out.push({
      ...(o as unknown as TrainingBlock),
      seconds: Math.max(0, Math.round(num(o.seconds, 0))),
    });
  }
  return out;
}

function parseExercise(v: unknown): TemplateExercise | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  switch (o.kind) {
    case 'depth': {
      const target = parseTarget(o.target);
      const d = o.discipline as DepthDiscipline;
      if (!target || !DEPTH_DISCIPLINES.includes(d)) return null;
      return { kind: 'depth', discipline: d, target, rest: parseRest(o.rest) };
    }
    case 'pool': {
      const target = parseTarget(o.target);
      const d = o.discipline as PoolTplDiscipline;
      if (!target || !POOL_DISCIPLINES.includes(d)) return null;
      return { kind: 'pool', discipline: d, target, rest: parseRest(o.rest) };
    }
    case 'dry':
      return {
        kind: 'dry',
        rows: parseRows(o.rows),
        holdTarget: parseTarget(o.holdTarget),
        lungVol: o.lungVol === 'FL' || o.lungVol === 'FRC' || o.lungVol === 'RV' ? o.lungVol : null,
      };
    case 'fitness': {
      const w = FITNESS_WORKOUTS.find((x) => x.id === o.workout)?.id ?? null;
      return { kind: 'fitness', workout: w, text: str(o.text) };
    }
    case 'program': {
      const items: ProgramItem[] = [];
      for (const it of Array.isArray(o.items) ? o.items : []) {
        if (!it || typeof it !== 'object') continue;
        const io = it as Record<string, unknown>;
        items.push({
          name: str(io.name, MAX_NAME),
          workSec: Math.max(0, Math.round(num(io.workSec, 0))),
          restSec: Math.max(0, Math.round(num(io.restSec, 0))),
          ...(typeof io.reps === 'number' && Number.isFinite(io.reps)
            ? { reps: Math.max(0, Math.min(MAX_ITEM_REPS, Math.round(io.reps))) }
            : {}),
        });
      }
      return { kind: 'program', items: items.slice(0, MAX_ITEMS) };
    }
    case 'text':
      return { kind: 'text', text: str(o.text, MAX_PART_TEXT) };
    default:
      // A kind this build does not know: the block is skipped, the rest of
      // the template still reads.
      return null;
  }
}

/** Parse a template from untrusted JSON (a cloud row, the local cache).
 *  Returns null when it is not a template at all; repairs what it can. */
export function parseTemplate(v: unknown): CoachTemplate | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const type = TEMPLATE_TYPES.includes(o.type as TemplateType) ? (o.type as TemplateType) : null;
  const id = typeof o.id === 'string' && o.id ? o.id : null;
  if (!type || !id) return null;
  const blocks: TemplateBlock[] = [];
  if (Array.isArray(o.blocks)) {
    for (const b of o.blocks) {
      if (!b || typeof b !== 'object') continue;
      const bo = b as Record<string, unknown>;
      const exercise = parseExercise(bo.exercise);
      if (!exercise) continue;
      blocks.push({
        id: typeof bo.id === 'string' && bo.id ? bo.id : newId('b'),
        name: str(bo.name, MAX_NAME),
        reps: Math.max(1, Math.min(MAX_REPS, Math.round(num(bo.reps, 1)))),
        exercise,
      });
    }
  }
  const ask = (o.ask && typeof o.ask === 'object' ? o.ask : {}) as Record<string, unknown>;
  const effort = num(o.effort, NaN);
  const now = new Date().toISOString();
  return {
    id,
    name: str(o.name, MAX_NAME),
    type,
    blocks,
    effort: Number.isFinite(effort) && effort >= 1 && effort <= 10 ? Math.round(effort) : null,
    ask: {
      effort: ask.effort !== false,
      eq: ask.eq === true,
      notes: ask.notes !== false,
    },
    notes: str(o.notes, 2000),
    ...(o.trainingMode === 'static' ||
    o.trainingMode === 'breathwork' ||
    o.trainingMode === 'device'
      ? { trainingMode: o.trainingMode }
      : {}),
    ...(typeof o.sessionTag === 'string' ? { sessionTag: o.sessionTag as SessionTag } : {}),
    ...(typeof o.sessionType === 'string' && o.sessionType.trim()
      ? { sessionType: o.sessionType.trim().slice(0, MAX_NAME) }
      : {}),
    useCount: Math.max(0, Math.round(num(o.useCount, 0))),
    createdAt: typeof o.createdAt === 'string' ? o.createdAt : now,
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : now,
  };
}

/** The template inside a plans.definition, or null when the row is a plan. */
export function templateFromDefinition(def: unknown): CoachTemplate | null {
  if (!isTemplateDefinition(def)) return null;
  return parseTemplate((def as { template?: unknown }).template);
}

/** Library search + type filter. Matches the name, the notes and the block
 *  names, case-insensitively. */
export function filterTemplates(
  list: CoachTemplate[],
  query: string,
  type: TemplateType | 'all',
): CoachTemplate[] {
  const q = query.trim().toLowerCase();
  return list.filter((t) => {
    if (type !== 'all' && t.type !== type) return false;
    if (!q) return true;
    return (
      t.name.toLowerCase().includes(q) ||
      t.notes.toLowerCase().includes(q) ||
      t.blocks.some(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          (b.exercise.kind === 'text' && b.exercise.text.toLowerCase().includes(q)) ||
          (b.exercise.kind === 'program' &&
            b.exercise.items.some((it) => it.name.toLowerCase().includes(q))),
      )
    );
  });
}

/** Most used first, then most recently edited. */
export function sortTemplates(list: CoachTemplate[]): CoachTemplate[] {
  return [...list].sort(
    (a, b) => b.useCount - a.useCount || b.updatedAt.localeCompare(a.updatedAt),
  );
}
