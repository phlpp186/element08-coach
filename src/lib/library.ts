/**
 * Coach's personal exercise library + categories. Persisted in the browser via
 * localStorage (no account, so it's per-browser) — Export/Import a file to back
 * it up or move it between machines.
 *
 * An exercise is a free-text description with an OPTIONAL category. Categories
 * are the coach's own system: a default set ships on first run, but they can be
 * renamed, added, or removed. Exercises live in the Exercises tab and get
 * assigned into plan sessions from the builder.
 *
 * A tiny module-level store exposed via useSyncExternalStore, so the Exercises
 * tab and the builder's picker stay in sync.
 */
import { useSyncExternalStore } from 'react';
import {
  normDose,
  uid,
  type BuilderSession,
  type BuilderWeek,
  type DosePart,
  type Intensity,
  type PlanMode,
} from './e08plan';
import { dropCategoryColor, moveCategoryColor } from './categoryColor';

/** Max categories an exercise can carry. */
export const MAX_CATEGORIES = 3;

export interface LibraryExercise {
  id: string;
  description: string;
  /** Up to MAX_CATEGORIES category names from the coach's list. Empty/undefined
   *  = uncategorized. */
  categories?: string[];
  /** How many times this exercise has been placed into a plan session. */
  useCount?: number;
  /** ISO timestamp of the last time it was placed into a plan session. */
  lastUsedAt?: string;
  /** Pinned exercises surface in the builder palette's Pinned shelf. */
  pinned?: boolean;
  /** Archived exercises leave every picker/list but keep their history.
   *  They live under the library's Archived view and can be restored. */
  archived?: boolean;
  /** Optional default dose, copied onto the exercise when it's placed into a
   *  session (where the coach tweaks it per week). Any mix of parts. */
  defaultDose?: DosePart[];
}

/** Trim, drop empties, de-dupe (case-insensitive), and cap at MAX_CATEGORIES. */
function normCats(input: unknown): string[] {
  const arr = Array.isArray(input) ? input : typeof input === 'string' && input ? [input] : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of arr) {
    const s = typeof c === 'string' ? c.trim() : '';
    const key = s.toLowerCase();
    if (s && !seen.has(key)) {
      seen.add(key);
      out.push(s);
    }
    if (out.length >= MAX_CATEGORIES) break;
  }
  return out;
}

/** A reusable, named group of exercises (referenced by id, so edits/renames to
 *  the underlying exercises flow through). Dropped into a plan session in one go. */
export interface ExerciseBlock {
  id: string;
  name: string;
  exerciseIds: string[];
}

/** A reusable whole session: label, notes, mode/type, exercises with doses.
 *  Applied into a plan day via "+ from template" (fresh ids on every use). */
export interface SessionTemplate {
  id: string;
  name: string;
  label: string;
  body: string;
  mode: PlanMode;
  sessionType: string;
  exercises: { description: string; dose?: DosePart[] }[];
  /** How many times it's been dropped into a plan. */
  useCount?: number;
}

/** A reusable whole week: focus/intensity/notes plus sessions on weekdays. */
export interface WeekTemplate {
  id: string;
  name: string;
  focus: string;
  intensity: Intensity;
  notes: string;
  sessions: {
    dayOfWeek: number;
    label: string;
    body: string;
    mode: PlanMode;
    sessionType: string;
    exercises: { description: string; dose?: DosePart[] }[];
  }[];
  useCount?: number;
}

const EX_KEY = 'element08.coach.library';
const CAT_KEY = 'element08.coach.exerciseCategories';
const BLK_KEY = 'element08.coach.exerciseBlocks';
const STPL_KEY = 'element08.coach.sessionTemplates';
const WTPL_KEY = 'element08.coach.weekTemplates';

/** Pre-shipped categories (editable). A practical freediving starter set. */
export const DEFAULT_CATEGORIES = ['Warm-up', 'CO₂', 'O₂', 'Technique', 'Depth', 'Pool', 'Dry'];

// ── persistence ────────────────────────────────────────────────────────────

function readExercises(): LibraryExercise[] {
  try {
    const raw = localStorage.getItem(EX_KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is LibraryExercise => !!x && typeof (x as LibraryExercise).description === 'string')
      .map((x) => {
        // Migrate the legacy single `category` string into the `categories` array.
        const legacy = (x as { category?: unknown }).category;
        const cats = normCats((x as LibraryExercise).categories ?? legacy);
        const use = typeof x.useCount === 'number' && x.useCount > 0 ? Math.floor(x.useCount) : 0;
        const dose = normDose((x as LibraryExercise).defaultDose);
        return {
          id: x.id || uid('lib'),
          description: x.description,
          ...(cats.length ? { categories: cats } : {}),
          ...(use ? { useCount: use } : {}),
          ...(typeof x.lastUsedAt === 'string' && x.lastUsedAt ? { lastUsedAt: x.lastUsedAt } : {}),
          ...(x.pinned ? { pinned: true } : {}),
          ...(x.archived ? { archived: true } : {}),
          ...(dose ? { defaultDose: dose } : {}),
        };
      });
  } catch {
    return [];
  }
}

function readCategories(): string[] {
  try {
    const raw = localStorage.getItem(CAT_KEY);
    if (raw) {
      const arr: unknown = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.filter((x): x is string => typeof x === 'string' && !!x.trim());
    }
  } catch {
    /* fall through to seed */
  }
  // First run (key absent / unreadable): seed the defaults and persist once, so
  // a coach who later deletes them all keeps an empty list (we don't re-seed).
  try {
    localStorage.setItem(CAT_KEY, JSON.stringify(DEFAULT_CATEGORIES));
  } catch {
    /* storage blocked */
  }
  return [...DEFAULT_CATEGORIES];
}

function readBlocks(): ExerciseBlock[] {
  try {
    const raw = localStorage.getItem(BLK_KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is ExerciseBlock => !!x && typeof (x as ExerciseBlock).name === 'string' && Array.isArray((x as ExerciseBlock).exerciseIds))
      .map((x) => ({ id: x.id || uid('blk'), name: x.name, exerciseIds: x.exerciseIds.filter((i) => typeof i === 'string') }));
  } catch {
    return [];
  }
}

function tplExercises(input: unknown): { description: string; dose?: DosePart[] }[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((x): x is { description: string } => !!x && typeof (x as { description?: unknown }).description === 'string')
    .map((x) => {
      const dose = normDose((x as { dose?: unknown }).dose);
      return { description: x.description, ...(dose ? { dose } : {}) };
    });
}

function readSessionTemplates(): SessionTemplate[] {
  try {
    const raw = localStorage.getItem(STPL_KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is SessionTemplate => !!x && typeof (x as SessionTemplate).name === 'string')
      .map((x) => ({
        id: x.id || uid('stpl'),
        name: x.name,
        label: typeof x.label === 'string' ? x.label : '',
        body: typeof x.body === 'string' ? x.body : '',
        mode: x.mode ?? 'general',
        sessionType: typeof x.sessionType === 'string' ? x.sessionType : '',
        exercises: tplExercises(x.exercises),
        ...(typeof x.useCount === 'number' && x.useCount > 0 ? { useCount: Math.floor(x.useCount) } : {}),
      }));
  } catch {
    return [];
  }
}

function readWeekTemplates(): WeekTemplate[] {
  try {
    const raw = localStorage.getItem(WTPL_KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is WeekTemplate => !!x && typeof (x as WeekTemplate).name === 'string')
      .map((x) => ({
        id: x.id || uid('wtpl'),
        name: x.name,
        focus: typeof x.focus === 'string' ? x.focus : '',
        intensity: x.intensity ?? 'medium',
        notes: typeof x.notes === 'string' ? x.notes : '',
        sessions: Array.isArray(x.sessions)
          ? x.sessions.map((s) => ({
              dayOfWeek: typeof s.dayOfWeek === 'number' ? Math.min(6, Math.max(0, s.dayOfWeek)) : 0,
              label: typeof s.label === 'string' ? s.label : '',
              body: typeof s.body === 'string' ? s.body : '',
              mode: s.mode ?? 'general',
              sessionType: typeof s.sessionType === 'string' ? s.sessionType : '',
              exercises: tplExercises(s.exercises),
            }))
          : [],
        ...(typeof x.useCount === 'number' && x.useCount > 0 ? { useCount: Math.floor(x.useCount) } : {}),
      }));
  } catch {
    return [];
  }
}

let exercises: LibraryExercise[] = readExercises();
let categories: string[] = readCategories();
let blocks: ExerciseBlock[] = readBlocks();
let sessionTemplates: SessionTemplate[] = readSessionTemplates();
let weekTemplates: WeekTemplate[] = readWeekTemplates();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function commitExercises(next: LibraryExercise[]) {
  exercises = next;
  try {
    localStorage.setItem(EX_KEY, JSON.stringify(next));
  } catch {
    /* storage full / blocked — keep working in-memory */
  }
  emit();
}
function commitCategories(next: string[]) {
  categories = next;
  try {
    localStorage.setItem(CAT_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked */
  }
  emit();
}
function commitBlocks(next: ExerciseBlock[]) {
  blocks = next;
  try {
    localStorage.setItem(BLK_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked */
  }
  emit();
}
function commitSessionTemplates(next: SessionTemplate[]) {
  sessionTemplates = next;
  try {
    localStorage.setItem(STPL_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked */
  }
  emit();
}
function commitWeekTemplates(next: WeekTemplate[]) {
  weekTemplates = next;
  try {
    localStorage.setItem(WTPL_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked */
  }
  emit();
}

// ── reactive reads ─────────────────────────────────────────────────────────

export function useExercises(): LibraryExercise[] {
  return useSyncExternalStore(subscribe, () => exercises);
}
export function useCategories(): string[] {
  return useSyncExternalStore(subscribe, () => categories);
}
export function useBlocks(): ExerciseBlock[] {
  return useSyncExternalStore(subscribe, () => blocks);
}
export function useSessionTemplates(): SessionTemplate[] {
  return useSyncExternalStore(subscribe, () => sessionTemplates);
}
export function useWeekTemplates(): WeekTemplate[] {
  return useSyncExternalStore(subscribe, () => weekTemplates);
}

/** Resolve a block's exercise ids to current library exercises, in order,
 *  skipping any that have since been deleted. */
export function blockExercises(block: ExerciseBlock): LibraryExercise[] {
  return block.exerciseIds
    .map((id) => exercises.find((e) => e.id === id))
    .filter((e): e is LibraryExercise => !!e);
}

/** Non-reactive snapshot (used by the type-ahead in plan-session rows). */
export function loadLibrary(): LibraryExercise[] {
  return exercises;
}

// ── exercise mutations ─────────────────────────────────────────────────────

export function addExercise(description: string, categories?: string[]): void {
  const d = description.trim();
  if (!d) return;
  const cats = normCats(categories);
  commitExercises([...exercises, { id: uid('lib'), description: d, ...(cats.length ? { categories: cats } : {}) }]);
}

/** Bulk add (import), de-duped against existing descriptions (case-insensitive).
 *  Any category that isn't already known is added to the category list.
 *  Returns how many fresh exercises were added. */
export function addManyExercises(items: { description: string; categories?: string[] }[]): number {
  const seen = new Set(exercises.map((i) => i.description.toLowerCase()));
  const known = new Set(categories.map((c) => c.toLowerCase()));
  const newCats: string[] = [];
  const fresh: LibraryExercise[] = [];
  for (const it of items) {
    const d = it.description.trim();
    if (!d || seen.has(d.toLowerCase())) continue;
    seen.add(d.toLowerCase());
    const cats = normCats(it.categories);
    for (const c of cats) {
      if (!known.has(c.toLowerCase())) {
        known.add(c.toLowerCase());
        newCats.push(c);
      }
    }
    fresh.push({ id: uid('lib'), description: d, ...(cats.length ? { categories: cats } : {}) });
  }
  if (newCats.length) commitCategories([...categories, ...newCats]);
  if (fresh.length) commitExercises([...exercises, ...fresh]);
  return fresh.length;
}

export function updateExercise(id: string, patch: Partial<Omit<LibraryExercise, 'id'>>): void {
  commitExercises(
    exercises.map((e) => {
      if (e.id !== id) return e;
      const next: LibraryExercise = { ...e, ...patch };
      if (patch.categories !== undefined) {
        const cats = normCats(patch.categories);
        if (cats.length) next.categories = cats;
        else delete next.categories;
      }
      if (patch.defaultDose !== undefined) {
        const dose = normDose(patch.defaultDose);
        if (dose) next.defaultDose = dose;
        else delete next.defaultDose;
      }
      return next;
    }),
  );
}

/** A fresh copy of the library default dose for this description (or none).
 *  Matched case-insensitively, same as usage recording. */
export function defaultDoseFor(description: string): DosePart[] | undefined {
  const key = description.trim().toLowerCase();
  if (!key) return undefined;
  const ex = exercises.find((e) => !e.archived && e.description.trim().toLowerCase() === key);
  return ex?.defaultDose ? ex.defaultDose.map((p) => ({ ...p })) : undefined;
}

export function removeExercise(id: string): void {
  removeExercises([id]);
}

export function removeExercises(ids: string[]): void {
  const drop = new Set(ids);
  commitExercises(exercises.filter((e) => !drop.has(e.id)));
  if (blocks.some((b) => b.exerciseIds.some((x) => drop.has(x)))) {
    commitBlocks(blocks.map((b) => ({ ...b, exerciseIds: b.exerciseIds.filter((x) => !drop.has(x)) })));
  }
}

// ── usage, pinning, archive, bulk ops ────────────────────────────────────────

/** Record that these exercises were just placed into a plan session. The
 *  builder works with description strings (chips, drag payloads, autocomplete),
 *  so usage is matched case-insensitively on the description. */
export function recordUseByDescription(descriptions: string[]): void {
  if (!descriptions.length) return;
  const wanted = new Set(descriptions.map((d) => d.trim().toLowerCase()).filter(Boolean));
  if (!wanted.size) return;
  let hit = false;
  const now = new Date().toISOString();
  const next = exercises.map((e) => {
    if (!wanted.has(e.description.trim().toLowerCase())) return e;
    hit = true;
    return { ...e, useCount: (e.useCount ?? 0) + 1, lastUsedAt: now };
  });
  if (hit) commitExercises(next);
}

export function togglePinned(id: string): void {
  commitExercises(
    exercises.map((e) => {
      if (e.id !== id) return e;
      const next = { ...e };
      if (next.pinned) delete next.pinned;
      else next.pinned = true;
      return next;
    }),
  );
}

export function setArchived(ids: string[], archived: boolean): void {
  const want = new Set(ids);
  commitExercises(
    exercises.map((e) => {
      if (!want.has(e.id)) return e;
      const next = { ...e };
      if (archived) {
        next.archived = true;
        delete next.pinned; // archived exercises leave the palette shelves
      } else delete next.archived;
      return next;
    }),
  );
}

/** Add one category to every given exercise (existing categories kept, capped). */
export function addCategoryToExercises(ids: string[], category: string): void {
  const want = new Set(ids);
  commitExercises(
    exercises.map((e) => {
      if (!want.has(e.id)) return e;
      const cats = normCats([...(e.categories ?? []), category]);
      return cats.length ? { ...e, categories: cats } : e;
    }),
  );
}

export function addExercisesToBlockBulk(blockId: string, ids: string[]): void {
  commitBlocks(
    blocks.map((b) =>
      b.id === blockId
        ? { ...b, exerciseIds: [...b.exerciseIds, ...ids.filter((id) => !b.exerciseIds.includes(id))] }
        : b,
    ),
  );
}

/** Merge look-alike exercises into one: block references move to the keeper,
 *  usage adds up, categories union (capped), pin survives; the rest delete. */
export function mergeExercises(keepId: string, dropIds: string[]): void {
  const keep = exercises.find((e) => e.id === keepId);
  if (!keep) return;
  const drop = new Set(dropIds.filter((id) => id !== keepId));
  if (!drop.size) return;
  const dropped = exercises.filter((e) => drop.has(e.id));
  const merged: LibraryExercise = { ...keep };
  merged.useCount = dropped.reduce((n, e) => n + (e.useCount ?? 0), keep.useCount ?? 0) || undefined;
  const lastUsed = [keep.lastUsedAt, ...dropped.map((e) => e.lastUsedAt)].filter((x): x is string => !!x).sort().pop();
  if (lastUsed) merged.lastUsedAt = lastUsed;
  if (!merged.useCount) delete merged.useCount;
  if (dropped.some((e) => e.pinned) || keep.pinned) merged.pinned = true;
  if (!merged.defaultDose) {
    const dose = dropped.find((e) => e.defaultDose)?.defaultDose;
    if (dose) merged.defaultDose = dose.map((p) => ({ ...p }));
  }
  const cats = normCats([...(keep.categories ?? []), ...dropped.flatMap((e) => e.categories ?? [])]);
  if (cats.length) merged.categories = cats;
  commitExercises(exercises.filter((e) => !drop.has(e.id)).map((e) => (e.id === keepId ? merged : e)));
  if (blocks.some((b) => b.exerciseIds.some((x) => drop.has(x)))) {
    commitBlocks(
      blocks.map((b) => {
        if (!b.exerciseIds.some((x) => drop.has(x))) return b;
        const ids: string[] = [];
        for (const x of b.exerciseIds) {
          const mapped = drop.has(x) ? keepId : x;
          if (!ids.includes(mapped)) ids.push(mapped);
        }
        return { ...b, exerciseIds: ids };
      }),
    );
  }
}

// ── category mutations ─────────────────────────────────────────────────────

export function addCategory(name: string): void {
  const n = name.trim();
  if (!n || categories.some((c) => c.toLowerCase() === n.toLowerCase())) return;
  commitCategories([...categories, n]);
}

export function renameCategory(oldName: string, newName: string): void {
  const n = newName.trim();
  if (!n || oldName === n) return;
  if (categories.some((c) => c.toLowerCase() === n.toLowerCase() && c !== oldName)) return;
  moveCategoryColor(oldName, n);
  commitCategories(categories.map((c) => (c === oldName ? n : c)));
  commitExercises(
    exercises.map((e) =>
      e.categories?.includes(oldName)
        ? { ...e, categories: e.categories.map((c) => (c === oldName ? n : c)) }
        : e,
    ),
  );
}

/** Remove a category; it's dropped from any exercise that used it. */
export function removeCategory(name: string): void {
  dropCategoryColor(name);
  commitCategories(categories.filter((c) => c !== name));
  if (exercises.some((e) => e.categories?.includes(name))) {
    commitExercises(
      exercises.map((e) => {
        if (!e.categories?.includes(name)) return e;
        const cats = e.categories.filter((c) => c !== name);
        const next: LibraryExercise = { ...e };
        if (cats.length) next.categories = cats;
        else delete next.categories;
        return next;
      }),
    );
  }
}

// ── block mutations ────────────────────────────────────────────────────────

export function addBlock(name: string): string {
  const id = uid('blk');
  commitBlocks([...blocks, { id, name: name.trim() || 'Block', exerciseIds: [] }]);
  return id;
}
export function renameBlock(id: string, name: string): void {
  const n = name.trim();
  if (!n) return;
  commitBlocks(blocks.map((b) => (b.id === id ? { ...b, name: n } : b)));
}
export function removeBlock(id: string): void {
  commitBlocks(blocks.filter((b) => b.id !== id));
}
export function addExerciseToBlock(blockId: string, exerciseId: string): void {
  commitBlocks(
    blocks.map((b) =>
      b.id === blockId && !b.exerciseIds.includes(exerciseId)
        ? { ...b, exerciseIds: [...b.exerciseIds, exerciseId] }
        : b,
    ),
  );
}
export function removeExerciseFromBlock(blockId: string, exerciseId: string): void {
  commitBlocks(
    blocks.map((b) => (b.id === blockId ? { ...b, exerciseIds: b.exerciseIds.filter((x) => x !== exerciseId) } : b)),
  );
}

// ── session + week templates ─────────────────────────────────────────────────

const copyDose = (dose?: DosePart[]) => (dose?.length ? dose.map((p) => ({ ...p })) : undefined);
const copyTplExercises = (exs: { description: string; dose?: DosePart[] }[]) =>
  exs
    .filter((e) => e.description.trim() || e.dose?.length)
    .map((e) => {
      const dose = copyDose(e.dose);
      return { description: e.description, ...(dose ? { dose } : {}) };
    });

/** Snapshot a built session as a reusable template. */
export function saveSessionTemplate(name: string, from: BuilderSession): string {
  const id = uid('stpl');
  commitSessionTemplates([
    ...sessionTemplates,
    {
      id,
      name: name.trim() || from.label.trim() || 'Session template',
      label: from.label,
      body: from.body,
      mode: from.mode,
      sessionType: from.sessionType,
      exercises: copyTplExercises(from.exercises),
    },
  ]);
  return id;
}

export function removeSessionTemplate(id: string): void {
  commitSessionTemplates(sessionTemplates.filter((t) => t.id !== id));
}

/** Snapshot a built week (focus/intensity/notes + all sessions) as a template. */
export function saveWeekTemplate(name: string, from: BuilderWeek): string {
  const id = uid('wtpl');
  commitWeekTemplates([
    ...weekTemplates,
    {
      id,
      name: name.trim() || from.focus.trim() || 'Week template',
      focus: from.focus,
      intensity: from.intensity,
      notes: from.notes,
      sessions: from.sessions.map((s) => ({
        dayOfWeek: s.dayOfWeek,
        label: s.label,
        body: s.body,
        mode: s.mode,
        sessionType: s.sessionType,
        exercises: copyTplExercises(s.exercises),
      })),
    },
  ]);
  return id;
}

export function removeWeekTemplate(id: string): void {
  commitWeekTemplates(weekTemplates.filter((t) => t.id !== id));
}

/** Turn a session template into a live session (fresh ids) at a weekday. */
export function materializeSessionTemplate(tpl: SessionTemplate, dayOfWeek: number): BuilderSession {
  commitSessionTemplates(
    sessionTemplates.map((t) => (t.id === tpl.id ? { ...t, useCount: (t.useCount ?? 0) + 1 } : t)),
  );
  recordUseByDescription(tpl.exercises.map((e) => e.description));
  return {
    id: uid('sess'),
    dayOfWeek,
    label: tpl.label,
    body: tpl.body,
    mode: tpl.mode,
    sessionType: tpl.sessionType,
    exercises: tpl.exercises.map((e) => {
      const dose = copyDose(e.dose);
      return { id: uid('ex'), description: e.description, ...(dose ? { dose } : {}) };
    }),
  };
}

/** Merge a week template into an existing week: sessions append; focus,
 *  intensity, and notes only fill in when the target's are still empty. */
export function applyWeekTemplate(tpl: WeekTemplate, week: BuilderWeek): BuilderWeek {
  commitWeekTemplates(weekTemplates.map((t) => (t.id === tpl.id ? { ...t, useCount: (t.useCount ?? 0) + 1 } : t)));
  recordUseByDescription(tpl.sessions.flatMap((s) => s.exercises.map((e) => e.description)));
  return {
    focus: week.focus.trim() ? week.focus : tpl.focus,
    intensity: week.sessions.length === 0 ? tpl.intensity : week.intensity,
    notes: week.notes.trim() ? week.notes : tpl.notes,
    sessions: [
      ...week.sessions,
      ...tpl.sessions.map((s) => ({
        id: uid('sess'),
        dayOfWeek: s.dayOfWeek,
        label: s.label,
        body: s.body,
        mode: s.mode,
        sessionType: s.sessionType,
        exercises: s.exercises.map((e) => {
          const dose = copyDose(e.dose);
          return { id: uid('ex'), description: e.description, ...(dose ? { dose } : {}) };
        }),
      })),
    ],
  };
}

/** A block is a proto-session: promote it to a session template in one click. */
export function blockToSessionTemplate(block: ExerciseBlock): string {
  const items = blockExercises(block);
  const id = uid('stpl');
  commitSessionTemplates([
    ...sessionTemplates,
    {
      id,
      name: block.name,
      label: block.name,
      body: '',
      mode: 'general',
      sessionType: '',
      exercises: items.map((e) => {
        const dose = copyDose(e.defaultDose);
        return { description: e.description, ...(dose ? { dose } : {}) };
      }),
    },
  ]);
  return id;
}

// ── import / export ────────────────────────────────────────────────────────

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Split a category cell into up to MAX_CATEGORIES names (separated by ; or /). */
function parseCatCell(cell: string): string[] {
  return normCats(cell.split(/[;/]/));
}

/** Parse a .csv or .xlsx into exercises: column 1 = description, optional column
 *  2 = categories (up to 3, separated by ; or /). SheetJS is loaded from a CDN on
 *  demand so it never bloats the normal bundle. */
export async function parseExerciseFile(file: File): Promise<{ description: string; categories?: string[] }[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || file.type === 'text/csv') {
    const text = await file.text();
    return text
      .split(/\r?\n/)
      .map((l) => splitCsvLine(l))
      .map((cols) => ({ description: (cols[0] ?? '').trim(), categories: parseCatCell(cols[1] ?? '') }))
      .filter((r) => r.description);
  }
  const xlsxUrl = 'https://esm.sh/xlsx@0.18.5';
  const XLSX = (await import(/* @vite-ignore */ xlsxUrl)) as {
    read: (data: ArrayBuffer, opts: { type: string }) => { SheetNames: string[]; Sheets: Record<string, unknown> };
    utils: { sheet_to_json: (sheet: unknown, opts: { header: 1 }) => unknown[][] };
  };
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  return rows
    .map((r) => ({
      description: r && r[0] != null ? String(r[0]).trim() : '',
      categories: r && r[1] != null ? parseCatCell(String(r[1])) : [],
    }))
    .filter((r) => r.description);
}

/** Download the library as a 2-column CSV (description, categories joined by "; ")
 *  — re-importable. */
export function exportLibraryCsv(items: LibraryExercise[]): void {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const body = items.map((i) => `${esc(i.description)},${esc((i.categories ?? []).join('; '))}`).join('\n');
  const blob = new Blob([body], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'element08-exercises.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
