/**
 * A dry table row's end and its change per round, as the app's builder sets
 * them (DraggableBlockList, lib/training/progression in the app). A coach
 * asked for a hold that ends on the athlete's signal (2026-11-24); the app's
 * player already runs all of this, the portal could not set it. Pure.
 */
import type { TrainingBlock } from './coachTemplates/deps';

export type EndMode = 'timed' | 'signal' | 'signalPlus';

/** An open hold stops by itself here (the app's OPEN_HOLD_CAP_SEC, 11:35). */
export const OPEN_HOLD_CAP_SEC = 695;
/** The app's "each round" stepper: 5 s at a time, at most 10 min either way. */
export const STEP_SEC = 5;
export const MAX_STEP_SEC = 600;

/** Holds and recoveries can end on the athlete's signal; rests always run. */
export const hasEndMode = (r: TrainingBlock): boolean => r.type === 'Hold' || r.type === 'Recover';

export const endModeOf = (r: TrainingBlock): EndMode => r.endMode ?? 'timed';

/** Only a row with a target time changes per round: not a distance row, not
 *  an open one. */
export const canProgress = (r: TrainingBlock): boolean =>
  r.type !== 'Attempt' && r.type !== 'Swim' && endModeOf(r) === 'timed';

/** The row with another end. An open row has no time to change per round,
 *  so its step goes; `seconds` stays (the tail of "signal plus"). */
export function withEndMode(r: TrainingBlock, mode: EndMode): TrainingBlock {
  const { endMode: _e, stepSec, ...rest } = r;
  void _e;
  if (mode === 'timed') return { ...rest, ...(stepSec ? { stepSec } : {}) };
  return { ...rest, endMode: mode };
}

/** The row as another type: a rest has no signal end. */
export function withRowType(r: TrainingBlock, type: TrainingBlock['type']): TrainingBlock {
  const next = { ...r, type };
  return hasEndMode(next) ? next : withEndMode(next, 'timed');
}

/** The change per round, in 5 s steps within ±10 min; 0 = the same each round. */
export function withStep(r: TrainingBlock, step: number): TrainingBlock {
  const { stepSec: _s, ...rest } = r;
  void _s;
  const s = Math.max(-MAX_STEP_SEC, Math.min(MAX_STEP_SEC, Math.round(step / STEP_SEC) * STEP_SEC));
  return s ? { ...rest, stepSec: s } : rest;
}

/** "+15 s", "−1:30"; empty for no change. */
export function stepLabel(step: number | undefined): string {
  if (!step) return '';
  const a = Math.abs(step);
  const t = a < 60 ? `${a} s` : `${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
  return `${step > 0 ? '+' : '−'}${t}`;
}
