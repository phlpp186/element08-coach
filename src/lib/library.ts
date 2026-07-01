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
import { uid } from './e08plan';

/** Max categories an exercise can carry. */
export const MAX_CATEGORIES = 3;

export interface LibraryExercise {
  id: string;
  description: string;
  /** Up to MAX_CATEGORIES category names from the coach's list. Empty/undefined
   *  = uncategorized. */
  categories?: string[];
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

const EX_KEY = 'element08.coach.library';
const CAT_KEY = 'element08.coach.exerciseCategories';
const BLK_KEY = 'element08.coach.exerciseBlocks';

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
        return {
          id: x.id || uid('lib'),
          description: x.description,
          ...(cats.length ? { categories: cats } : {}),
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

let exercises: LibraryExercise[] = readExercises();
let categories: string[] = readCategories();
let blocks: ExerciseBlock[] = readBlocks();
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
      return next;
    }),
  );
}

export function removeExercise(id: string): void {
  commitExercises(exercises.filter((e) => e.id !== id));
  if (blocks.some((b) => b.exerciseIds.includes(id))) {
    commitBlocks(blocks.map((b) => ({ ...b, exerciseIds: b.exerciseIds.filter((x) => x !== id) })));
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
