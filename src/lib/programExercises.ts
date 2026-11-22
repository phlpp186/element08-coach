/**
 * The programme editor's link to the app's exercise list (Philipp,
 * 2026-11-22): a typed name the app knows runs in the app as that exercise,
 * with its name in the athlete's language and its clip. The list and the
 * matching are the app's (coachTemplates/exercises.ts); the names in all nine
 * languages come with the shared strings (scripts/sync-shared-templates.mjs).
 */
import { COACH_EXERCISES, recognizeExercise } from './coachTemplates/exercises';
import { repsText, type ProgramItem } from './coachTemplates/model';
import strings from './coachTemplates/strings.json';

const ALL = strings as Record<string, Record<string, string>>;
const key = (id: string) => `fitness:exercise.${id}`;

/** An exercise's names, every language, without repeats. */
export function exerciseNames(id: string): string[] {
  return [...new Set(Object.values(ALL).map((d) => d[key(id)]).filter((n): n is string => !!n))];
}

/** The name the editor shows for an exercise: the coach's language, else English. */
export function exerciseLabel(id: string, lang: string): string {
  return ALL[lang]?.[key(id)] ?? ALL.en?.[key(id)] ?? id;
}

export function hasMedia(id: string | undefined): boolean {
  return !!id && !!COACH_EXERCISES.find((e) => e.id === id)?.media;
}

/** Suggestions for the name field: the coach's language first, English too. */
export function exerciseSuggestions(lang: string): { id: string; name: string; media: boolean }[] {
  const out: { id: string; name: string; media: boolean }[] = [];
  const seen = new Set<string>();
  for (const l of [lang, 'en']) {
    for (const e of COACH_EXERCISES) {
      const name = ALL[l]?.[key(e.id)];
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push({ id: e.id, name, media: e.media });
    }
  }
  return out;
}

/** A programme exercise renamed: it is the app's exercise while the name is
 *  one of that exercise's names, else the coach's own. */
export function renamedItem(it: ProgramItem, name: string): ProgramItem {
  const { exerciseId: _was, ...rest } = it;
  void _was;
  const id = recognizeExercise(name, exerciseNames);
  return id ? { ...rest, name, exerciseId: id } : { ...rest, name };
}

/** "10" or "8-12" (a hyphen or an en dash), 1 to 999. Null while incomplete. */
export function parseReps(text: string): { reps: number; repsHigh?: number } | null {
  const m = /^\s*(\d{1,3})\s*(?:[-–]\s*(\d{1,3}))?\s*$/.exec(text);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] != null ? Number(m[2]) : a;
  // "12-8" is the range 8 to 12.
  const [reps, high] = [Math.min(a, b), Math.max(a, b)];
  if (reps < 1) return null;
  return high !== reps ? { reps, repsHigh: high } : { reps };
}

/** What the reps field shows: what was typed while it is incomplete ("8-")
 *  or means the stored count, else the stored count. */
export function shownReps(typed: string, stored: Pick<ProgramItem, 'reps' | 'repsHigh'>): string {
  const p = parseReps(typed);
  if (!p) return typed.trim() === '' || /^\s*\d{1,3}\s*[-–]?\s*$/.test(typed) ? typed : repsText(stored);
  return p.reps === stored.reps && p.repsHigh === stored.repsHigh ? typed : repsText(stored);
}
