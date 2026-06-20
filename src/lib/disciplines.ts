/**
 * The freediving disciplines an athlete logs PBs / goals against. Mirrors the
 * mobile app's discipline model (depth: CWT/CWTB/CNF/FIM/VWT, pool: DYN/DYNB/DNF,
 * static: STA). Depth + pool values are metres; static is a duration in seconds.
 */

export type DisciplineUnit = 'depth' | 'distance' | 'time';
export type DisciplineGroup = 'Depth' | 'Pool' | 'Static';

export interface Discipline {
  id: string;
  /** Short code shown in tables, e.g. "CWT". */
  label: string;
  /** Full name for tooltips / longer surfaces. */
  full: string;
  group: DisciplineGroup;
  unit: DisciplineUnit;
}

export const DISCIPLINES: Discipline[] = [
  { id: 'CWT', label: 'CWT', full: 'Constant Weight (bi-fins)', group: 'Depth', unit: 'depth' },
  { id: 'CWTB', label: 'CWTB', full: 'Constant Weight Bi-fins', group: 'Depth', unit: 'depth' },
  { id: 'CNF', label: 'CNF', full: 'Constant Weight No-Fins', group: 'Depth', unit: 'depth' },
  { id: 'FIM', label: 'FIM', full: 'Free Immersion', group: 'Depth', unit: 'depth' },
  { id: 'VWT', label: 'VWT', full: 'Variable Weight', group: 'Depth', unit: 'depth' },
  { id: 'DYN', label: 'DYN', full: 'Dynamic With Fins', group: 'Pool', unit: 'distance' },
  { id: 'DYNB', label: 'DYNB', full: 'Dynamic Bi-fins', group: 'Pool', unit: 'distance' },
  { id: 'DNF', label: 'DNF', full: 'Dynamic No-Fins', group: 'Pool', unit: 'distance' },
  { id: 'STA', label: 'STA', full: 'Static Apnea', group: 'Static', unit: 'time' },
];

export const DISCIPLINE_GROUPS: DisciplineGroup[] = ['Depth', 'Pool', 'Static'];

export function disciplineById(id: string): Discipline | undefined {
  return DISCIPLINES.find((d) => d.id === id);
}

// ── Value formatting / parsing ────────────────────────────────────────────────
// All PB values are stored as a single number: metres for depth/distance,
// seconds for time. The helpers below convert to/from what the coach types.

export function formatSeconds(total: number): string {
  const s = Math.max(0, Math.round(total));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/** Parse "m:ss", "mm:ss", or a plain seconds/minutes number into seconds.
 *  A bare number with no colon is treated as seconds. Returns null if unparseable. */
export function parseSeconds(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  if (t.includes(':')) {
    const [mm, ss] = t.split(':');
    const m = Number(mm);
    const s = Number(ss);
    if (!Number.isFinite(m) || !Number.isFinite(s)) return null;
    return m * 60 + s;
  }
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Format a stored PB value for display, with unit. */
export function formatValue(d: Discipline, value: number): string {
  return d.unit === 'time' ? formatSeconds(value) : `${value} m`;
}

/** Compact value (no unit suffix) for tight spots like sparkline labels. */
export function formatValueShort(d: Discipline, value: number): string {
  return d.unit === 'time' ? formatSeconds(value) : `${value}m`;
}

/** Parse coach input for a discipline into a stored value, or null if invalid. */
export function parseValue(d: Discipline, input: string): number | null {
  if (d.unit === 'time') return parseSeconds(input);
  const n = Number(input.trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The placeholder/hint for an input of this discipline. */
export function valueHint(d: Discipline): string {
  return d.unit === 'time' ? 'm:ss, e.g. 5:30' : 'metres, e.g. 62';
}
