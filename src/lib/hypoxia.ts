/**
 * The hypoxia rating on a student's report: the app's symptom scale
 * (HypoxiaLevel), 1 clean, 2 symptoms, 3 LMC / samba, 4 blackout. The labels
 * are i18n keys; anything outside 1-4 (older reports) reads as not reported.
 */
export type HypoxiaLevel = 1 | 2 | 3 | 4;

export const HYPOXIA_LABEL: Record<HypoxiaLevel, string> = {
  1: 'Clean',
  2: 'Symptoms',
  3: 'LMC / Samba',
  4: 'Blackout',
};

/** From this level up a report is flagged to the coach. */
export const HYPOXIA_FLAG_MIN = 2;
/** How far back Needs a look keeps a hypoxia report. */
export const HYPOXIA_DAYS = 14;

export function hypoxiaLevel(v: unknown): HypoxiaLevel | null {
  return typeof v === 'number' && v >= 1 && v <= 4 ? (Math.round(v) as HypoxiaLevel) : null;
}

/** Chip colours: symptoms amber, LMC and blackout red. */
export function hypoxiaTone(level: HypoxiaLevel): string {
  return level >= 3 ? 'bg-red/15 text-red' : level === 2 ? 'bg-amber/15 text-amber' : 'bg-abyss text-textDim';
}
