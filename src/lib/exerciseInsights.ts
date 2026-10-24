/**
 * What the Exercises page shows about the library (Philipp's option B + C,
 * 2026-10-24), PURE: which exercises have gone stale, where an exercise is
 * used (blocks, templates), and a rough duration for a block from its doses.
 *
 * Dose values are free text the coach typed ("1:30", "90s", "10 min", "8"),
 * so durations are only read where the text is unambiguous; anything else
 * leaves that exercise untimed rather than guessing.
 */
import type { DosePart } from './e08plan';
import type { ExerciseBlock, LibraryExercise, SessionTemplate, WeekTemplate } from './library';

/** Not placed into a plan for this long (or never) = stale. */
export const STALE_DAYS = 30;

export function isStale(ex: LibraryExercise, nowMs: number): boolean {
  if (!ex.useCount || !ex.lastUsedAt) return true;
  const at = Date.parse(ex.lastUsedAt);
  return !Number.isFinite(at) || nowMs - at > STALE_DAYS * 86_400_000;
}

export interface WhereUsed {
  blocks: string[];
  sessionTemplates: string[];
  weekTemplates: string[];
}

const norm = (s: string) => s.trim().toLowerCase();

/** Blocks hold exercise ids; templates hold copied descriptions, so those are
 *  matched by text (case and outer spaces ignored). */
export function whereUsed(
  ex: LibraryExercise,
  blocks: readonly ExerciseBlock[],
  sessionTemplates: readonly SessionTemplate[],
  weekTemplates: readonly WeekTemplate[],
): WhereUsed {
  const d = norm(ex.description);
  const has = (exs: { description: string }[]) => exs.some((e) => norm(e.description) === d);
  return {
    blocks: blocks.filter((b) => b.exerciseIds.includes(ex.id)).map((b) => b.name),
    sessionTemplates: sessionTemplates.filter((t) => has(t.exercises)).map((t) => t.name),
    weekTemplates: weekTemplates.filter((t) => t.sessions.some((s) => has(s.exercises))).map((t) => t.name),
  };
}

/** Seconds in a duration text: "1:30", "0:45", "90s", "90 sec", "10 min",
 *  "10'". A bare number is ambiguous (seconds or minutes?) and returns null. */
export function parseDuration(text: string): number | null {
  const v = text.trim().toLowerCase();
  let m = /^(\d{1,3}):([0-5]\d)$/.exec(v);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(\d+(?:[.,]\d+)?)\s*(s|sec|secs|seconds?)$/.exec(v);
  if (m) return Math.round(Number(m[1].replace(',', '.')));
  m = /^(\d+(?:[.,]\d+)?)\s*(m|min|mins|minutes?|')$/.exec(v);
  if (m) return Math.round(Number(m[1].replace(',', '.')) * 60);
  return null;
}

/** One exercise's duration from its dose: sets × (hold + rest) + time. Null
 *  when no part of it is a readable duration. */
export function doseSeconds(dose: readonly DosePart[] | undefined): number | null {
  if (!dose?.length) return null;
  let sets = 1;
  let perSet = 0;
  let once = 0;
  let timed = false;
  for (const p of dose) {
    if (p.unit === 'sets') {
      const n = Number(p.value.trim());
      if (Number.isInteger(n) && n > 0) sets = n;
    } else if (p.unit === 'hold' || p.unit === 'rest' || p.unit === 'time') {
      const s = parseDuration(p.value);
      if (s == null) continue;
      timed = true;
      if (p.unit === 'time') once += s;
      else perSet += s;
    }
  }
  return timed ? sets * perSet + once : null;
}

/** A block's rough length: the sum over the exercises whose dose has a
 *  readable duration, and how many of them that was. */
export function blockDuration(doses: readonly (readonly DosePart[] | undefined)[]): {
  seconds: number;
  timed: number;
  total: number;
} {
  let seconds = 0;
  let timed = 0;
  for (const d of doses) {
    const s = doseSeconds(d);
    if (s == null) continue;
    seconds += s;
    timed += 1;
  }
  return { seconds, timed, total: doses.length };
}

/** A copy of `arr` with the item at `from` moved to `to` (clamped). */
export function moveItem<T>(arr: readonly T[], from: number, to: number): T[] {
  const out = [...arr];
  if (from < 0 || from >= out.length) return out;
  const [x] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, x);
  return out;
}
