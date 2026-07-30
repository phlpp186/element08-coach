/**
 * Fixed colour per mesocycle type, shared by the season map (and reusable by
 * the Overview Gantt later). Deliberately theme-agnostic saturated mid-tones:
 * they read on every portal theme, and the escalation Base→Peak follows the
 * hue ramp cyan→periwinkle→pink→amber→coral; Transition is the recovery green.
 */
import type { MesoType } from './e08plan';

export const PHASE_HEX: Record<MesoType, string> = {
  base: '#1bafe0',
  build: '#7c83f2',
  specific: '#e84393',
  taper: '#f0a500',
  competition: '#ff6b5e',
  transition: '#3dc96b',
};

/** Ink that stays readable on every PHASE_HEX tone, on light and dark themes. */
export const PHASE_INK = '#10222b';

/** `rgba()` of a `#rrggbb` hex at the given alpha. */
export function hexTint(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
