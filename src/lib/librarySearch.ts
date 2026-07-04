/**
 * librarySearch — ranking + look-alike detection for the exercise library.
 *
 * Ranking drives every picker (builder palette, session autocomplete,
 * add-to-block): text match quality first, then pinned, then how much the
 * coach actually uses the exercise. No result caps anywhere — callers render
 * incrementally instead of slicing.
 */
import type { LibraryExercise } from './library';

/** Match quality: 3 = starts with, 2 = a word starts with, 1 = contains. */
function matchScore(description: string, q: string): number {
  const d = description.toLowerCase();
  if (!q) return 1;
  if (d.startsWith(q)) return 3;
  const at = d.indexOf(q);
  if (at < 0) return 0;
  return at > 0 && /[\s·(,/·×-]/.test(d[at - 1]) ? 2 : 1;
}

/** Filter to matches and sort: match quality → pinned → most used → most
 *  recently used → alphabetical. Archived exercises never match. */
export function rankExercises(exercises: LibraryExercise[], query: string): LibraryExercise[] {
  const q = query.trim().toLowerCase();
  const scored: { ex: LibraryExercise; s: number }[] = [];
  for (const ex of exercises) {
    if (ex.archived) continue;
    const s = matchScore(ex.description, q);
    if (s > 0) scored.push({ ex, s });
  }
  return scored
    .sort((a, b) => {
      if (a.s !== b.s) return b.s - a.s;
      const pin = Number(!!b.ex.pinned) - Number(!!a.ex.pinned);
      if (pin) return pin;
      const use = (b.ex.useCount ?? 0) - (a.ex.useCount ?? 0);
      if (use) return use;
      const rec = (b.ex.lastUsedAt ?? '').localeCompare(a.ex.lastUsedAt ?? '');
      if (rec) return rec;
      return a.ex.description.localeCompare(b.ex.description);
    })
    .map((x) => x.ex);
}

/** Normalize a description down to its "movement": lowercase, numbers, times,
 *  rep counts, units and week-suffixes stripped. Two entries with the same key
 *  are almost certainly the same exercise at different doses. */
export function lookAlikeKey(description: string): string {
  return description
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ') // "(wk2)", "(easy)"
    .replace(/\d+[:.]\d+/g, ' ') // times 2:00 / 2.30
    .replace(/\d+\s*(m|km|s|min|sec|x|×|%)?/g, ' ') // counts, distances, percents
    .replace(/[×x*@·,;:/+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface LookAlikeGroup {
  key: string;
  items: LibraryExercise[];
}

/** Groups of 2+ non-archived exercises that normalize to the same movement.
 *  Very short keys are skipped — they group unrelated one-word entries. */
export function findLookAlikes(exercises: LibraryExercise[]): LookAlikeGroup[] {
  const byKey = new Map<string, LibraryExercise[]>();
  for (const ex of exercises) {
    if (ex.archived) continue;
    const key = lookAlikeKey(ex.description);
    if (key.length < 8) continue;
    const arr = byKey.get(key);
    if (arr) arr.push(ex);
    else byKey.set(key, [ex]);
  }
  return [...byKey.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([key, items]) => ({
      key,
      items: [...items].sort((a, b) => (b.useCount ?? 0) - (a.useCount ?? 0)),
    }))
    .sort((a, b) => b.items.length - a.items.length);
}
