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

export interface LibraryExercise {
  id: string;
  description: string;
  /** A category name from the coach's list, or undefined (uncategorized). */
  category?: string;
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
      .map((x) => ({
        id: x.id || uid('lib'),
        description: x.description,
        category: typeof x.category === 'string' && x.category ? x.category : undefined,
      }));
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

export function addExercise(description: string, category?: string): void {
  const d = description.trim();
  if (!d) return;
  commitExercises([...exercises, { id: uid('lib'), description: d, category: category || undefined }]);
}

/** Bulk add (import), de-duped against existing descriptions (case-insensitive).
 *  Any non-empty category that isn't already known is added to the category list.
 *  Returns how many fresh exercises were added. */
export function addManyExercises(items: { description: string; category?: string }[]): number {
  const seen = new Set(exercises.map((i) => i.description.toLowerCase()));
  const newCats = new Set<string>();
  const fresh: LibraryExercise[] = [];
  for (const it of items) {
    const d = it.description.trim();
    if (!d || seen.has(d.toLowerCase())) continue;
    seen.add(d.toLowerCase());
    const cat = it.category?.trim() || undefined;
    if (cat && !categories.includes(cat)) newCats.add(cat);
    fresh.push({ id: uid('lib'), description: d, category: cat });
  }
  if (newCats.size) commitCategories([...categories, ...newCats]);
  if (fresh.length) commitExercises([...exercises, ...fresh]);
  return fresh.length;
}

export function updateExercise(id: string, patch: Partial<Omit<LibraryExercise, 'id'>>): void {
  commitExercises(
    exercises.map((e) =>
      e.id === id
        ? {
            ...e,
            ...patch,
            ...(patch.category !== undefined ? { category: patch.category || undefined } : {}),
          }
        : e,
    ),
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
  commitExercises(exercises.map((e) => (e.category === oldName ? { ...e, category: n } : e)));
}

/** Remove a category; exercises that used it become uncategorized. */
export function removeCategory(name: string): void {
  commitCategories(categories.filter((c) => c !== name));
  if (exercises.some((e) => e.category === name)) {
    commitExercises(exercises.map((e) => (e.category === name ? { ...e, category: undefined } : e)));
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

/** Parse a .csv or .xlsx into exercises: column 1 = description, optional column
 *  2 = category. SheetJS is loaded from a CDN on demand so it never bloats the
 *  normal bundle. */
export async function parseExerciseFile(file: File): Promise<{ description: string; category?: string }[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || file.type === 'text/csv') {
    const text = await file.text();
    return text
      .split(/\r?\n/)
      .map((l) => splitCsvLine(l))
      .map((cols) => ({ description: (cols[0] ?? '').trim(), category: (cols[1] ?? '').trim() || undefined }))
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
      category: r && r[1] != null ? String(r[1]).trim() || undefined : undefined,
    }))
    .filter((r) => r.description);
}

/** Download the library as a 2-column CSV (description, category) — re-importable. */
export function exportLibraryCsv(items: LibraryExercise[]): void {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const body = items.map((i) => `${esc(i.description)},${esc(i.category ?? '')}`).join('\n');
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
