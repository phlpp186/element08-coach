/**
 * The coach's plan library, shared with the ELEMENT | 08 app: every plan is one
 * row in the coach's `plans` table, and the row's definition is the app's Plan
 * shape (the app reads it as a Plan, as is). `definition.library` stamps where and when it was
 * last saved, carries a delete as a tombstone, and, when the web saved it, the
 * builder's own model (`portal`) so the plan reopens here exactly as built.
 * The app drops `portal` when it saves, and the builder then rebuilds its
 * model from the Plan (definitionToBuilder).
 *
 * The app keeps the same rules in src/lib/planLibrary/stamp.ts: change both
 * together.
 */
import {
  DEFAULT_INTENSITY,
  addDays,
  buildPlanFile,
  emptyWeek,
  mondayOf,
  normIntensity,
  normalizePlan,
  todayIso,
  uid,
  type BuilderPhase,
  type BuilderPlan,
  type BuilderSession,
  type BuilderWeek,
  type MesoType,
  type PlanMode,
} from './e08plan';

export type LibraryDevice = 'iphone' | 'ipad' | 'android' | 'web';

export interface LibraryStamp {
  v: 1;
  editedOn: LibraryDevice;
  editedAt: string;
  deletedAt?: string;
  portal?: BuilderPlan;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

export function stampOf(definition: unknown): LibraryStamp | null {
  if (!isObj(definition) || !isObj(definition.library)) return null;
  const s = definition.library as Partial<LibraryStamp>;
  return typeof s.editedOn === 'string' && typeof s.editedAt === 'string'
    ? (s as LibraryStamp)
    : null;
}

/** A plan row, not a coach template and not an athlete's "Sessions from"
 *  inbox (both share the table). */
export function isLibraryDefinition(definition: unknown): boolean {
  if (!isObj(definition)) return false;
  if (definition.format === 'e08template') return false;
  if (isObj(definition.coachInbox)) return false;
  return Array.isArray(definition.phases);
}

export function isTemplateDefinition(definition: unknown): boolean {
  return isObj(definition) && definition.format === 'e08template';
}

export const isDeletedDefinition = (definition: unknown): boolean =>
  !!stampOf(definition)?.deletedAt;

export function tombstone(definition: unknown, at: string): Obj {
  return {
    ...(isObj(definition) ? definition : {}),
    library: { v: 1, editedOn: 'web', editedAt: at, deletedAt: at },
  };
}

// ── App Plan → builder model ─────────────────────────────────────────────────

interface WireSession {
  id?: string;
  dayOfWeek?: number;
  label?: string;
  exercises?: { id?: string; description?: string }[];
  mode?: string;
  sessionType?: string;
  coachTarget?: number;
  sessionNotes?: string;
}
interface WireWeek {
  weekStart?: string;
  focus?: string;
  intensity?: unknown;
  notes?: string;
  plannedSessions?: WireSession[];
}
interface WirePhase {
  id?: string;
  name?: string;
  type?: string;
  weeks?: WireWeek[];
}

const MODES: PlanMode[] = ['depth', 'pool', 'dry', 'general'];
const MESO: MesoType[] = ['base', 'build', 'specific', 'taper', 'competition', 'transition'];

function toSession(s: WireSession, planMode: PlanMode): BuilderSession {
  return {
    id: s.id || uid('sess'),
    dayOfWeek: typeof s.dayOfWeek === 'number' ? Math.min(6, Math.max(0, s.dayOfWeek)) : 0,
    label: s.label ?? '',
    body: s.sessionNotes ?? '',
    exercises: (s.exercises ?? []).map((e) => ({
      id: e.id || uid('ex'),
      description: e.description ?? '',
    })),
    mode: MODES.includes(s.mode as PlanMode) ? (s.mode as PlanMode) : planMode,
    sessionType: s.sessionType ?? '',
    ...(typeof s.coachTarget === 'number' ? { coachTarget: s.coachTarget } : {}),
  };
}

function toWeek(w: WireWeek | undefined, planMode: PlanMode): BuilderWeek {
  if (!w) return emptyWeek();
  return {
    focus: w.focus ?? '',
    intensity: normIntensity(w.intensity) ?? DEFAULT_INTENSITY,
    notes: w.notes ?? '',
    sessions: (w.plannedSessions ?? []).map((s) => toSession(s, planMode)),
  };
}

/** The app's weeks keyed by their Monday, laid out from `firstMonday` with no
 *  gaps (an empty week fills a missing one), so every week keeps its date. */
function weeksFrom(weeks: WireWeek[], firstMonday: string, planMode: PlanMode): BuilderWeek[] {
  const byStart = new Map(weeks.filter((w) => w.weekStart).map((w) => [w.weekStart!, w]));
  const last = [...byStart.keys()].sort().pop();
  if (!last) return [emptyWeek()];
  const out: BuilderWeek[] = [];
  for (let d = firstMonday; d <= last; d = addDays(d, 7)) out.push(toWeek(byStart.get(d), planMode));
  return out;
}

/** The builder model for a library row: the web's own copy when the web saved
 *  last, else rebuilt from the app's Plan. */
export function definitionToBuilder(definition: unknown): BuilderPlan {
  const stamp = stampOf(definition);
  if (stamp?.portal) return normalizePlan(stamp.portal);
  const def = (isObj(definition) ? definition : {}) as Obj & {
    name?: string;
    author?: string;
    kind?: string;
    mode?: string;
    startDate?: string | null;
    competitionDate?: string | null;
    phases?: WirePhase[];
  };
  const phases = def.phases ?? [];
  const allWeeks = phases.flatMap((p) => p.weeks ?? []);
  const firstStart = allWeeks.map((w) => w.weekStart).filter(Boolean).sort()[0];
  const startDate = def.startDate || firstStart || todayIso();
  const firstMonday = mondayOf(firstStart ?? startDate);
  const mode: PlanMode = MODES.includes(def.mode as PlanMode) ? (def.mode as PlanMode) : 'depth';
  const season = def.kind === 'season';

  const base = normalizePlan({
    name: def.name ?? '',
    coach: def.author ?? '',
    description: '',
    mode,
    kind: season ? 'season' : 'training',
    startDate,
    competitionDate: def.competitionDate ?? '',
    structure: 'weeks',
  });
  if (!season) return { ...base, weeks: weeksFrom(allWeeks, firstMonday, mode) };

  // Phases run back to back in the builder, so each phase takes its weeks in
  // calendar order from where the previous one ended.
  let cursor = firstMonday;
  const built: BuilderPhase[] = phases.map((p) => {
    const ws = [...(p.weeks ?? [])].sort((a, b) =>
      (a.weekStart ?? '').localeCompare(b.weekStart ?? ''),
    );
    const lastStart = ws[ws.length - 1]?.weekStart;
    const weeks = lastStart ? weeksFrom(ws, cursor, mode) : [emptyWeek()];
    cursor = addDays(cursor, weeks.length * 7);
    const type = MESO.includes(p.type as MesoType) ? (p.type as MesoType) : 'base';
    return { id: p.id || uid('phase'), name: p.name ?? '', type, weeks };
  });
  return { ...base, phases: built.length ? built : base.phases };
}

// ── builder model → App Plan ─────────────────────────────────────────────────

/** Session and week fields the builder writes; anything else on the old row
 *  (set by the app: template links, run targets, filler...) is kept. */
const BUILDER_SESSION_KEYS = new Set([
  'id',
  'dayOfWeek',
  'label',
  'exercises',
  'mode',
  'sessionType',
  'coachTarget',
  'sessionNotes',
]);

function appOnly(o: unknown, keys: Set<string>): Obj {
  if (!isObj(o)) return {};
  return Object.fromEntries(Object.entries(o).filter(([k]) => !keys.has(k)));
}

/** The row definition for a web save. `old` is the row's current definition:
 *  what the app added that the builder doesn't know about survives. */
export function builderToDefinition(
  plan: BuilderPlan,
  defId: number,
  old: unknown,
  at: string,
): Obj {
  const file = buildPlanFile(plan);
  const prev = isObj(old) ? old : {};
  const oldWeeks = new Map<string, Obj>();
  const oldSessions = new Map<string, Obj>();
  for (const ph of (prev.phases as WirePhase[] | undefined) ?? []) {
    for (const w of ph.weeks ?? []) {
      if (w.weekStart) oldWeeks.set(w.weekStart, w as Obj);
      for (const s of w.plannedSessions ?? []) if (s.id) oldSessions.set(s.id, s as Obj);
    }
  }
  const phases = file.content.phases.map((ph) => ({
    ...ph,
    weeks: ph.weeks.map((w) => {
      const ow = oldWeeks.get(w.weekStart);
      const mix = isObj(ow?.targetMix) && !Object.keys(w.targetMix).length ? ow.targetMix : w.targetMix;
      return {
        ...w,
        targetMix: mix,
        plannedSessions: w.plannedSessions.map((s) => ({
          ...appOnly(oldSessions.get(s.id), BUILDER_SESSION_KEYS),
          ...s,
        })),
      };
    }),
  }));

  const stamp: LibraryStamp = { v: 1, editedOn: 'web', editedAt: at, portal: plan };
  return {
    ...appOnly(prev, new Set(['library', 'phases'])),
    ...file.content,
    phases,
    id: defId,
    active: false,
    createdAt: typeof prev.createdAt === 'string' ? prev.createdAt : at,
    author: file.metadata.author,
    lockedAt: typeof prev.lockedAt === 'string' ? prev.lockedAt : at,
    importedFrom: { coach: file.metadata.author, at },
    // A row the app wrote is already at the app's schema; a plan new from the
    // web is .e08plan v3 content, which the app migrates on load.
    schemaVersion: typeof prev.schemaVersion === 'number' ? prev.schemaVersion : 3,
    library: stamp,
  };
}

/** A fresh, stable app Plan id for a plan first saved on the web. */
export const newDefId = (): number => Date.now() + Math.floor(Math.random() * 1000);
