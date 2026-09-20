/**
 * Group saved templates by training mode for the picker, so a coach with
 * forty of them sees four short columns side by side instead of one long
 * dropdown. Pure, so the grouping and ordering are testable.
 */
import type { PlanMode } from "./e08plan";

export interface PickableTemplate {
  id: string;
  name: string;
  mode: PlanMode;
  /** Secondary line: a session's type, a week's focus. */
  sub?: string;
  /** Exercises in a session, sessions in a week. */
  count?: number;
  useCount?: number;
}

/** Column order. Matches how the rest of the portal orders disciplines. */
export const MODE_ORDER: PlanMode[] = ["depth", "pool", "dry", "general"];

/** Most-used first, then by name, so the template a coach reaches for every
 *  week sits at the top of its column rather than wherever it was saved. */
export function sortTemplates<T extends PickableTemplate>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      (b.useCount ?? 0) - (a.useCount ?? 0) || a.name.localeCompare(b.name),
  );
}

/** Columns in MODE_ORDER, each sorted; empty modes omitted so a coach who
 *  never writes pool sessions does not get an empty Pool column. */
export function groupTemplates<T extends PickableTemplate>(
  items: T[],
  query = "",
): { mode: PlanMode; items: T[] }[] {
  const q = query.trim().toLowerCase();
  const matches = (x: T) =>
    !q ||
    x.name.toLowerCase().includes(q) ||
    (x.sub ?? "").toLowerCase().includes(q);
  return MODE_ORDER.map((mode) => ({
    mode,
    items: sortTemplates(items.filter((x) => x.mode === mode && matches(x))),
  })).filter((g) => g.items.length > 0);
}

/** A week has no mode of its own; it is the mode most of its sessions use.
 *  Ties break toward MODE_ORDER, and a week with no sessions is 'general'. */
export function dominantMode(sessions: { mode: PlanMode }[]): PlanMode {
  const counts = new Map<PlanMode, number>();
  for (const s of sessions) counts.set(s.mode, (counts.get(s.mode) ?? 0) + 1);
  let best: PlanMode = "general";
  let bestN = 0;
  for (const mode of MODE_ORDER) {
    const n = counts.get(mode) ?? 0;
    if (n > bestN) {
      best = mode;
      bestN = n;
    }
  }
  return best;
}
