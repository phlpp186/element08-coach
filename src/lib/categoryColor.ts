/**
 * categoryColor — the colour a category shows everywhere (Exercises tab,
 * builder palette, plan rows). Each category can carry an explicitly assigned
 * colour (picked in the library's category editor, persisted per browser);
 * anything unassigned falls back to a deterministic hash into the palette so
 * existing libraries look unchanged until the coach starts assigning.
 *
 * The palette has 16 distinct hues drawn from the Open Water themes plus
 * mid-saturation neighbours — every hue reads on both the white Caribbean
 * panels and the dark Chalk surfaces. Uncategorized falls back to dim grey.
 */
import { useSyncExternalStore } from 'react';

export const CAT_PALETTE = [
  '#1bafe0', // sky cyan (Chalk Dark accent)
  '#1fb894', // sea green (Caribbean recover)
  '#e8a93a', // golden sand (Caribbean highlight)
  '#e84393', // pink (Chalk Dark highlight)
  '#f2764f', // coral (Caribbean accent)
  '#3dc96b', // leaf green (Chalk Dark recover)
  '#9b7bf5', // violet
  '#f0a500', // amber (Chalk Dark amber)
  '#7aa7ff', // periwinkle
  '#3fd0c0', // turquoise
  '#e05c5c', // brick red
  '#5e8f5a', // moss
  '#b58a5f', // driftwood
  '#8a6fd1', // iris
  '#4f96b8', // steel blue
  '#c96fb0', // orchid
];

const KEY = 'element08.coach.categoryColors';

function read(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const obj: unknown = JSON.parse(raw);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

let assigned: Record<string, string> = read();
const listeners = new Set<() => void>();

function commit(next: Record<string, string>) {
  assigned = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage blocked — keep working in-memory */
  }
  listeners.forEach((l) => l());
}

/** Reactive read of the assigned-colour map (for the category editor). */
export function useCategoryColors(): Record<string, string> {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => assigned,
  );
}

/** Assign a colour to a category, or pass null to return it to the hash. */
export function setCategoryColor(name: string, color: string | null): void {
  const next = { ...assigned };
  if (color) next[name] = color;
  else delete next[name];
  commit(next);
}

/** Keep the assigned colour when a category is renamed. */
export function moveCategoryColor(oldName: string, newName: string): void {
  if (!(oldName in assigned) || oldName === newName) return;
  const next = { ...assigned };
  next[newName] = next[oldName];
  delete next[oldName];
  commit(next);
}

/** Drop the assignment when a category is deleted. */
export function dropCategoryColor(name: string): void {
  if (!(name in assigned)) return;
  const next = { ...assigned };
  delete next[name];
  commit(next);
}

/** The hash fallback, exposed so the editor can show "default" swatches. */
export function hashedCategoryColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CAT_PALETTE[h % 10]; // legacy hash stays over the original 10 hues
}

export function categoryColor(name?: string | null): string {
  if (!name) return 'rgb(var(--c-textDim))';
  return assigned[name] ?? hashedCategoryColor(name);
}
