/**
 * App blocks in the portal: a plan an app block built (the S&C base block),
 * coached here for one athlete. The block itself is never in this repo (the
 * site is public): the `app-block` edge function builds and rebuilds it, and
 * this module only reads the plan it returns and writes the coach's edits in
 * the shape that function takes (`source.edits`, `source.removed`).
 *
 * Pure: no React, no Supabase, so every rule here has a test.
 */

// ── The plan, as far as the editor reads it ──────────────────────────────────

export type Focus = 'depth' | 'pool' | 'both';
export type Pull = 'weighted' | 'bodyweight' | 'assisted';

export interface BlockExercise {
  id: string;
  description: string;
  /** The exercise id a block line came from. A line without one (plain
   *  text) cannot be taken out of a block session. */
  ref?: string;
  /** The PlanEdits `add` that put this line in: the coach added it. */
  edit?: string;
  target?: unknown;
  completedAt?: string | null;
  [k: string]: unknown;
}

export interface BlockWorkout {
  id: string;
  name?: string;
  blocks?: unknown[];
  [k: string]: unknown;
}

export interface BlockSession {
  id: string;
  /** 0 = Monday. */
  dayOfWeek: number;
  label: string;
  exercises: BlockExercise[];
  workout?: BlockWorkout;
  /** "Any day this week": she places it herself. */
  floating?: boolean;
  placed?: boolean;
  optional?: boolean;
  completedAt?: string | null;
  [k: string]: unknown;
}

export interface BlockWeek {
  /** Monday, YYYY-MM-DD. */
  weekStart: string;
  flag?: string;
  plannedSessions: BlockSession[];
  [k: string]: unknown;
}

export interface BlockPhase {
  weeks: BlockWeek[];
  [k: string]: unknown;
}

/** One session, or every session of a slot from a week on. */
export interface PlanEditScope {
  session?: string;
  slot?: string;
  from?: number;
}

export interface SetsItem {
  id: string;
  name: string;
  measure: 'reps' | 'time';
  sets: number;
  reps?: number;
  repsHigh?: number;
  sec?: number;
  rpe?: string;
  pct?: [number, number];
  kg?: number;
  restSec: number;
  note?: string;
  perSide?: boolean;
}

export type DropEdit = PlanEditScope & { ex: string };
export type AddEdit = PlanEditScope & { id: string; item: SetsItem };

export interface PlanEdits {
  drop?: DropEdit[];
  add?: AddEdit[];
}

export interface BlockSource {
  id: string;
  v?: number;
  start?: string;
  focus?: Focus;
  kgStep?: number;
  swaps?: Record<string, string>;
  excluded?: string[];
  cycle?: boolean;
  setup?: boolean;
  removed?: string[];
  edits?: PlanEdits;
  [k: string]: unknown;
}

export interface BlockTest {
  id: string;
  name: string;
  fields: { key: string; unit: string; label?: string }[];
}

export interface CoachFor {
  studentId: string;
  name: string;
}

export interface BlockPlan {
  id?: number;
  name?: string;
  phases: BlockPhase[];
  source?: BlockSource;
  tests?: BlockTest[];
  coachFor?: CoachFor;
  [k: string]: unknown;
}

/** What the block service says the editor can offer for a plan. */
export interface BlockInfo {
  block: string;
  v: number;
  exercises: Record<string, string>;
  /** Lifts a "% e1RM" load can use. */
  tested: string[];
  mainLifts: string[];
  swaps: Record<string, string[]>;
  kgSteps: number[];
  pull: Pull | null;
}

export type BlockPatch = Partial<{
  focus: Focus;
  kgStep: number;
  pull: Pull;
  swaps: Record<string, string>;
  excluded: string[];
  cycle: boolean;
  edits: PlanEdits;
  removed: string[];
  start: string;
}>;

export interface BlockAnswers {
  focus?: Focus;
  kgStep?: number;
  pull?: Pull;
  cycle?: boolean;
}

/** The block's weight jump when the plan does not name one. */
export const DEFAULT_KG_STEP = 2.5;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** `o` without some optional keys. */
function without<T extends object>(o: T, ...keys: string[]): T {
  const out = { ...o } as Record<string, unknown>;
  for (const k of keys) delete out[k];
  return out as T;
}

/** The plan, when a definition has the shape the editor needs. */
export function asBlockPlan(definition: unknown): BlockPlan | null {
  if (!isObj(definition) || !Array.isArray(definition.phases)) return null;
  return definition as BlockPlan;
}

// ── Sessions, slots, weeks ───────────────────────────────────────────────────

/** Week and slot of a block session id: `sc-w03-d0-str` is week 3, slot
 *  `d0-str` (the same slot every week). Null for an id the block did not make. */
export function sessionSlot(id: string): { week: number; slot: string } | null {
  const m = /^sc-w(\d+)-(.+)$/.exec(id);
  return m ? { week: Number(m[1]), slot: m[2] } : null;
}

/** The block made it (a coach-added one has another id): its edits go
 *  through the block service, a coach-added one changes here. */
export const isBlockSession = (id: string): boolean => id.startsWith('sc-');

/** An edit's scope covers this session (the app's rule). */
export function editCovers(e: PlanEditScope, sessionId: string): boolean {
  if (e.session) return e.session === sessionId;
  const at = sessionSlot(sessionId);
  return !!at && !!e.slot && at.slot === e.slot && at.week >= (e.from ?? 0);
}

export interface FlatWeek {
  /** Position in the plan, 0-based. */
  index: number;
  /** The week number the plan's session ids use: the test week is 0. */
  number: number;
  isTest: boolean;
  week: BlockWeek;
}

export function flatWeeks(plan: BlockPlan): FlatWeek[] {
  const all = plan.phases.flatMap((p) => (Array.isArray(p.weeks) ? p.weeks : []));
  const firstIsTest = all[0]?.flag === 'test';
  return all.map((week, index) => ({
    index,
    number: firstIsTest ? index : index + 1,
    isTest: index === 0 && firstIsTest,
    week,
  }));
}

/** The week to open on: the one today falls in, else the nearest end. */
export function currentWeekIndex(weeks: FlatWeek[], today: string): number {
  if (!weeks.length) return 0;
  for (let i = weeks.length - 1; i >= 0; i--) if (weeks[i].week.weekStart <= today) return i;
  return 0;
}

/** Floating sessions she has not placed go under "Any day this week". */
export const isUnplaced = (s: BlockSession): boolean => !!s.floating && !s.placed;

/** A week's placed sessions by weekday (0 = Monday), each day in plan order. */
export function sessionsByDay(week: BlockWeek): { day: number; sessions: BlockSession[] }[] {
  const days = new Map<number, BlockSession[]>();
  for (const s of week.plannedSessions ?? []) {
    if (isUnplaced(s)) continue;
    const d = Math.min(6, Math.max(0, Math.floor(s.dayOfWeek ?? 0)));
    days.set(d, [...(days.get(d) ?? []), s]);
  }
  return [...days.entries()].sort((a, b) => a[0] - b[0]).map(([day, sessions]) => ({ day, sessions }));
}

export function findSession(plan: BlockPlan, id: string): BlockSession | null {
  for (const w of flatWeeks(plan)) for (const s of w.week.plannedSessions ?? []) if (s.id === id) return s;
  return null;
}

/** A copy of the plan with one week's sessions replaced. */
function mapSessions(plan: BlockPlan, fn: (s: BlockSession[], week: FlatWeek) => BlockSession[]): BlockPlan {
  let at = 0;
  return {
    ...plan,
    phases: plan.phases.map((ph) => ({
      ...ph,
      weeks: (ph.weeks ?? []).map((w) => {
        const flat: FlatWeek = { index: at++, number: 0, isTest: false, week: w };
        const next = fn(w.plannedSessions ?? [], flat);
        return next === w.plannedSessions ? w : { ...w, plannedSessions: next };
      }),
    })),
  };
}

// ── Removing and adding exercise lines (source.edits) ────────────────────────

/** A line the coach can take out: in a block session only one the block or
 *  the coach put in (plain text lines are part of the block); in a session
 *  the coach added, any line. */
export function canRemoveLine(session: BlockSession, line: BlockExercise): boolean {
  return !isBlockSession(session.id) || !!line.ref || !!line.edit;
}

const sameScope = (a: PlanEditScope, b: PlanEditScope) =>
  (a.session ?? null) === (b.session ?? null) &&
  (a.slot ?? null) === (b.slot ?? null) &&
  (a.from ?? null) === (b.from ?? null);

/** `inner` covers no session `outer` does not: a drop under a wider one. */
function within(inner: PlanEditScope, outer: PlanEditScope): boolean {
  if (outer.session) return inner.session === outer.session;
  if (inner.session) return editCovers(outer, inner.session);
  return inner.slot === outer.slot && (inner.from ?? 0) >= (outer.from ?? 0);
}

function withDrop(drops: DropEdit[], d: DropEdit): DropEdit[] {
  // Narrower drops of the same exercise are part of the new one now.
  const kept = drops.filter((x) => !(x.ex === d.ex && within(x, d)));
  return [...kept, d];
}

const clean = (e: PlanEdits): PlanEdits => ({
  ...(e.drop?.length ? { drop: e.drop } : {}),
  ...(e.add?.length ? { add: e.add } : {}),
});

/** The edits with a line taken out of a block session: from this session
 *  only (`everyFrom` null) or from every session of its slot from week
 *  `everyFrom` on. A line the coach added for this session alone loses its
 *  add; one added for the slot gets a drop instead, so the other weeks keep it. */
export function removeLine(
  edits: PlanEdits | undefined,
  session: BlockSession,
  line: BlockExercise,
  everyFrom: number | null,
): PlanEdits {
  const drops = [...(edits?.drop ?? [])];
  const adds = [...(edits?.add ?? [])];
  const slot = sessionSlot(session.id);
  const scope: PlanEditScope =
    everyFrom != null && slot ? { slot: slot.slot, from: everyFrom } : { session: session.id };

  if (line.edit) {
    const add = adds.find((a) => a.id === line.edit);
    const whole =
      add && (add.session ? add.session === session.id : !!scope.slot && (add.from ?? 0) >= (scope.from ?? 0));
    if (add && whole) {
      return clean({
        drop: drops.filter((d) => d.ex !== add.id),
        add: adds.filter((a) => a.id !== add.id),
      });
    }
    return clean({ drop: withDrop(drops, { ...scope, ex: line.edit }), add: adds });
  }
  if (!line.ref) return clean({ drop: drops, add: adds });
  return clean({ drop: withDrop(drops, { ...scope, ex: line.ref }), add: adds });
}

/** The edits without one drop: its exercise is back where the drop took it. */
export function undoDrop(edits: PlanEdits | undefined, drop: DropEdit): PlanEdits {
  return clean({
    drop: (edits?.drop ?? []).filter((d) => !(d.ex === drop.ex && sameScope(d, drop))),
    add: edits?.add ?? [],
  });
}

/** The edits with an exercise added to this session, or to every session of
 *  its slot from week `everyFrom` on. */
export function addExercise(
  edits: PlanEdits | undefined,
  session: BlockSession,
  id: string,
  item: SetsItem,
  everyFrom: number | null,
): PlanEdits {
  const slot = sessionSlot(session.id);
  const scope: PlanEditScope =
    everyFrom != null && slot ? { slot: slot.slot, from: everyFrom } : { session: session.id };
  return clean({ drop: edits?.drop ?? [], add: [...(edits?.add ?? []), { ...scope, id, item }] });
}

export interface RemovedLine {
  drop: DropEdit;
  name: string;
  /** Set when the drop covers the slot from a week on, not only here. */
  fromWeek: number | null;
}

/** What the coach took out of a session, for the struck-through lines with
 *  Undo: every drop covering it, named from the block's exercises or the
 *  add it took out. */
export function removedLines(
  plan: BlockPlan,
  sessionId: string,
  names: Record<string, string> = {},
): RemovedLine[] {
  const edits = plan.source?.edits;
  const adds = new Map((edits?.add ?? []).map((a) => [a.id, a]));
  return (edits?.drop ?? [])
    .filter((d) => editCovers(d, sessionId))
    .map((drop) => ({
      drop,
      name: adds.get(drop.ex)?.item.name ?? names[drop.ex] ?? drop.ex,
      fromWeek: drop.session ? null : (drop.from ?? 0),
    }));
}

// ── The line text she sees ───────────────────────────────────────────────────

/** Seconds as "m:ss" ("1:30", "2:00"). */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "1:30", "90" or "90s" as seconds; null when it is not a duration. */
export function parseClock(text: string): number | null {
  const t = text.trim().replace(/s$/i, '').trim();
  if (!t) return null;
  const mm = /^(\d+):(\d{1,2})$/.exec(t);
  if (mm) {
    const sec = Number(mm[2]);
    return sec < 60 ? Number(mm[1]) * 60 + sec : null;
  }
  return /^\d+$/.test(t) ? Number(t) : null;
}

/** The exercise line as the app writes it: "Squat: 3 x 5, 40 kg, RPE 7,
 *  rest 2:00 (slow lowering)". */
export function itemLine(it: SetsItem): string {
  const dose =
    it.measure === 'time'
      ? `${it.sec ?? 0} s`
      : it.repsHigh
        ? `${it.reps ?? 0}-${it.repsHigh}`
        : `${it.reps ?? 0}`;
  const parts = [`${it.sets} x ${dose}${it.perSide ? ' per side' : ''}`];
  if (it.kg != null) parts.push(`${it.kg} kg`);
  if (it.rpe) parts.push(`RPE ${it.rpe}`);
  if (it.pct) parts.push(`${it.pct[0]}-${it.pct[1]}% e1RM`);
  if (it.restSec) parts.push(`rest ${fmtClock(it.restSec)}`);
  return `${it.name}: ${parts.join(', ')}${it.note ? ` (${it.note})` : ''}`;
}

/** An exercise id for a name the block does not know ("Wall sit" →
 *  "wall-sit"). */
export function slugId(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'exercise';
}

export const newAddId = (now = Date.now()): string => `a${now.toString(36)}`;
export const newSessionId = (now = Date.now()): string => `c-${now.toString(36)}`;

// ── Deleted block sessions (source.removed) ──────────────────────────────────

export interface SessionMeta {
  id: string;
  label: string;
  dayOfWeek: number;
  floating: boolean;
}

/** Label and day of every session in a plan, so a deleted one can still be
 *  shown (with Undo) after the block left it out. */
export function sessionMetas(plan: BlockPlan, into = new Map<string, SessionMeta>()): Map<string, SessionMeta> {
  for (const w of flatWeeks(plan))
    for (const s of w.week.plannedSessions ?? [])
      into.set(s.id, { id: s.id, label: s.label, dayOfWeek: s.dayOfWeek, floating: isUnplaced(s) });
  return into;
}

/** The block sessions deleted from week `weekNumber`. One not seen in this
 *  editor takes its label and day from the same slot in another week (a
 *  slot is the same session every week). */
export function removedSessionsInWeek(
  plan: BlockPlan,
  weekNumber: number,
  known: Map<string, SessionMeta>,
): SessionMeta[] {
  const out: SessionMeta[] = [];
  for (const id of plan.source?.removed ?? []) {
    const at = sessionSlot(id);
    if (!at || at.week !== weekNumber) continue;
    const seen = known.get(id);
    if (seen) {
      out.push(seen);
      continue;
    }
    const twin = [...known.values()].find((m) => sessionSlot(m.id)?.slot === at.slot);
    out.push({
      id,
      label: twin?.label ?? id,
      dayOfWeek: twin?.dayOfWeek ?? 0,
      floating: twin?.floating ?? false,
    });
  }
  return out;
}

/** source.removed with a session added or taken back out. */
export function toggleRemoved(removed: string[] | undefined, id: string, on: boolean): string[] {
  const rest = (removed ?? []).filter((x) => x !== id);
  return on ? [...rest, id] : rest;
}

// ── Sessions the coach adds (kept by every rebuild, changed here) ────────────

export type DayChoice = number | 'any';

function placeOn(s: BlockSession, day: DayChoice): BlockSession {
  const rest = without(s, 'floating', 'placed');
  return day === 'any'
    ? { ...rest, floating: true, placed: false }
    : { ...rest, dayOfWeek: day };
}

/** A copy of one of the plan's sessions as a new, untouched session. */
export function copySession(from: BlockSession, id: string, day: DayChoice): BlockSession {
  // Her ticks, effort and edit marks belong to the original.
  const base = without(structuredCloneSafe(from), 'userEdited', 'effort');
  const copy: BlockSession = {
    ...base,
    id,
    completedAt: null,
    exercises: base.exercises.map((e, i) => ({ ...without(e, 'edit'), id: `${id}-${i + 1}`, completedAt: null })),
  };
  if (from.workout) copy.workout = { ...structuredCloneSafe(from.workout), id: `plan:${id}` };
  return placeOn(copy, day);
}

/** A new session of plain text lines. */
export function blankSession(id: string, label: string, lines: string[], day: DayChoice): BlockSession {
  return placeOn(
    {
      id,
      dayOfWeek: day === 'any' ? 0 : day,
      label: label.trim(),
      mode: 'general',
      completedAt: null,
      exercises: lines
        .map((l) => l.trim())
        .filter(Boolean)
        .map((description, i) => ({ id: `${id}-${i + 1}`, description, completedAt: null })),
    },
    day,
  );
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function insertSession(plan: BlockPlan, weekIndex: number, session: BlockSession): BlockPlan {
  return mapSessions(plan, (ss, w) => (w.index === weekIndex ? [...ss, session] : ss));
}

export function deleteSession(plan: BlockPlan, sessionId: string): BlockPlan {
  return mapSessions(plan, (ss) => (ss.some((s) => s.id === sessionId) ? ss.filter((s) => s.id !== sessionId) : ss));
}

const isSetsBlock = (b: unknown): b is { kind: 'sets'; items: { id?: string }[] } =>
  isObj(b) && b.kind === 'sets' && Array.isArray(b.items);

/** A coach-added session without one line (and its exercise in the workout
 *  the player runs, when no other line uses it). */
export function removeLocalLine(plan: BlockPlan, sessionId: string, lineId: string): BlockPlan {
  return mapSessions(plan, (ss) =>
    ss.some((s) => s.id === sessionId)
      ? ss.map((s) => {
          if (s.id !== sessionId) return s;
          const line = s.exercises.find((e) => e.id === lineId);
          const exercises = s.exercises.filter((e) => e.id !== lineId);
          const ref = line?.ref;
          if (!ref || !s.workout || exercises.some((e) => e.ref === ref)) return { ...s, exercises };
          const blocks = (s.workout.blocks ?? [])
            .map((b) => (isSetsBlock(b) ? { ...b, items: b.items.filter((it) => it.id !== ref) } : b))
            .filter((b) => !isSetsBlock(b) || b.items.length > 0);
          return blocks.length
            ? { ...s, exercises, workout: { ...s.workout, blocks } }
            : { ...without(s, 'workout'), exercises };
        })
      : ss,
  );
}

/** A coach-added session with one more exercise: a line, and a set in its
 *  workout when it has one. "% e1RM" stays only for a tested lift. */
export function addLocalLine(plan: BlockPlan, sessionId: string, item: SetsItem, tested: string[]): BlockPlan {
  const it: SetsItem = item.pct && !tested.includes(item.id) ? without(item, 'pct') : item;
  return mapSessions(plan, (ss) =>
    ss.some((s) => s.id === sessionId)
      ? ss.map((s) => {
          if (s.id !== sessionId) return s;
          const used = new Set(s.exercises.map((e) => e.id));
          let n = s.exercises.length + 1;
          while (used.has(`${s.id}-${n}`)) n++;
          const line: BlockExercise = {
            id: `${s.id}-${n}`,
            description: itemLine(it),
            completedAt: null,
            ref: it.id,
            ...(it.pct ? { target: { e1rm: { ex: it.id, pct: it.pct } } } : {}),
          };
          if (!s.workout) return { ...s, exercises: [...s.exercises, line] };
          const blocks = [...(s.workout.blocks ?? [])];
          let last = -1;
          for (let i = blocks.length - 1; i >= 0; i--)
            if (isSetsBlock(blocks[i])) {
              last = i;
              break;
            }
          if (last >= 0) {
            const b = blocks[last] as { kind: 'sets'; items: unknown[] };
            blocks[last] = { ...b, items: [...b.items, it] };
          } else blocks.push({ kind: 'sets', items: [it] });
          return { ...s, exercises: [...s.exercises, line], workout: { ...s.workout, blocks } };
        })
      : ss,
  );
}

// ── How it works ─────────────────────────────────────────────────────────────

/** The exercises "Not for me" can switch: every block line in the plan that
 *  is not a main lift (or what one was swapped for), plus those already
 *  switched off (the block leaves them out, so they are no longer in it). */
export function accessories(plan: BlockPlan, mainLifts: string[]): string[] {
  const skip = new Set([...mainLifts, ...Object.values(plan.source?.swaps ?? {})]);
  const out = new Set<string>();
  for (const w of flatWeeks(plan))
    for (const s of w.week.plannedSessions ?? []) {
      if (!isBlockSession(s.id)) continue;
      for (const e of s.exercises ?? []) if (e.ref && !e.edit && !skip.has(e.ref)) out.add(e.ref);
    }
  for (const x of plan.source?.excluded ?? []) out.add(x);
  return [...out];
}

/** The swaps with one main lift set back to the plan (`to` null) or swapped. */
export function withSwap(swaps: Record<string, string> | undefined, lift: string, to: string | null): Record<string, string> {
  const rest = without(swaps ?? {}, lift);
  return to ? { ...rest, [lift]: to } : rest;
}

// ── Her side ─────────────────────────────────────────────────────────────────

export interface Report {
  at: string;
  rating: number | null;
}

interface CompletionLike {
  exercise_id: string;
  completed_at: string | null;
  rating?: number | null;
  session?: unknown;
  updated_at?: string;
}

/** Her reports by session id: done sessions only. */
export function reportsBySession(rows: CompletionLike[]): Map<string, Report> {
  const m = new Map<string, Report>();
  for (const r of rows)
    if (r.completed_at && r.exercise_id !== PLAN_STATE_ID)
      m.set(r.exercise_id, { at: r.completed_at, rating: typeof r.rating === 'number' ? r.rating : null });
  return m;
}

/** Completion row her phone writes the plan's state to. */
export const PLAN_STATE_ID = '__plan';

export interface HerLift {
  id: string;
  name: string;
  e1rm: number | null;
  working: number | null;
  next: number | null;
}

type Results = Record<string, Record<string, number>>;

export interface HerState {
  at: string;
  planUpdatedAt: string | null;
  baseline: Results;
  retest: Results;
  lifts: HerLift[];
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function results(v: unknown): Results {
  if (!isObj(v)) return {};
  const out: Results = {};
  for (const [test, fields] of Object.entries(v)) {
    if (!isObj(fields)) continue;
    const vals: Record<string, number> = {};
    for (const [k, x] of Object.entries(fields)) if (num(x) != null) vals[k] = x as number;
    if (Object.keys(vals).length) out[test] = vals;
  }
  return out;
}

/** What her phone last reported about the plan, or null when it has not. */
export function herState(rows: CompletionLike[]): HerState | null {
  const row = rows.find((r) => r.exercise_id === PLAN_STATE_ID);
  const s = row?.session;
  if (!isObj(s) || s.kind !== 'planState') return null;
  const tr = isObj(s.testResults) ? s.testResults : {};
  return {
    at: typeof s.at === 'string' ? s.at : (row?.updated_at ?? ''),
    planUpdatedAt: typeof s.planUpdatedAt === 'string' ? s.planUpdatedAt : null,
    baseline: results(tr.baseline),
    retest: results(tr.retest),
    lifts: (Array.isArray(s.lifts) ? s.lifts : []).filter(isObj).map((l) => ({
      id: String(l.id ?? ''),
      name: String(l.name ?? l.id ?? ''),
      e1rm: num(l.e1rm),
      working: num(l.working),
      next: num(l.next),
    })),
  };
}

export type PhoneStatus = 'none' | 'waiting' | 'onPhone';

/** Her phone has this version of the plan when it reported the row's
 *  updated_at back; a later save waits until it syncs. Both are compared as
 *  instants, since Postgres and JS spell the same time differently. */
export function phoneStatus(state: HerState | null, rowUpdatedAt: string | null): PhoneStatus {
  if (!state) return 'none';
  if (!rowUpdatedAt || !state.planUpdatedAt) return 'waiting';
  const a = Date.parse(state.planUpdatedAt);
  const b = Date.parse(rowUpdatedAt);
  return a === b || state.planUpdatedAt === rowUpdatedAt ? 'onPhone' : 'waiting';
}

/** "95 kg", or "label 52 bpm · label 60 ms" for a test with several fields. */
export function testValue(test: BlockTest, values: Record<string, number> | undefined): string | null {
  if (!values) return null;
  const parts = test.fields
    .filter((f) => values[f.key] != null)
    .map((f) => {
      const v = `${values[f.key]}${f.unit === 'pass' || f.unit === 'split' ? '' : ` ${f.unit}`}`;
      return test.fields.length > 1 && f.label ? `${f.label} ${v}` : v;
    });
  return parts.length ? parts.join(' · ') : null;
}

// ── Saving ───────────────────────────────────────────────────────────────────

/** The `plans.definition` for an app block the web saves: the plan, who it
 *  is for, and a library stamp without the builder's `portal` model (only
 *  the builder's own plans carry one). */
export function blockDefinition(plan: BlockPlan, coachFor: CoachFor | undefined, at: string): Obj {
  return {
    ...without(plan, 'library'),
    ...(coachFor ? { coachFor } : {}),
    library: { v: 1, editedOn: 'web', editedAt: at },
  };
}

/** A Monday on or after `today`, the default test week. */
export function nextMonday(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  const add = (8 - d.getUTCDay()) % 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
}

export function isMonday(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.getUTCDay() === 1;
}
