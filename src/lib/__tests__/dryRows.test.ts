import { describe, expect, it } from 'vitest';
import { canProgress, endModeOf, hasEndMode, stepLabel, withEndMode, withRowType, withStep } from '../dryRows';

const hold = { type: 'Hold' as const, seconds: 120 };

describe('a dry table row’s end (a coach’s request, 2026-11-24)', () => {
  it('a hold or a recovery can end on the signal, a rest cannot', () => {
    expect(hasEndMode(hold)).toBe(true);
    expect(hasEndMode({ type: 'Recover', seconds: 30 })).toBe(true);
    expect(hasEndMode({ type: 'Rest', seconds: 90 })).toBe(false);
  });

  it('on signal keeps the time for later, signal plus uses it as the tail', () => {
    const open = withEndMode({ ...hold, stepSec: 15 }, 'signal');
    expect(open).toEqual({ type: 'Hold', seconds: 120, endMode: 'signal' });
    expect(endModeOf(withEndMode(open, 'signalPlus'))).toBe('signalPlus');
    expect(withEndMode(open, 'timed')).toEqual({ type: 'Hold', seconds: 120 });
  });

  it('a row turned into a rest runs on the clock again', () => {
    expect(withRowType({ ...hold, endMode: 'signal' }, 'Rest')).toEqual({ type: 'Rest', seconds: 120 });
    expect(withRowType({ ...hold, endMode: 'signal' }, 'Recover').endMode).toBe('signal');
  });
});

describe('a dry table row’s change per round', () => {
  it('only a timed row with a time changes', () => {
    expect(canProgress(hold)).toBe(true);
    expect(canProgress({ ...hold, endMode: 'signal' })).toBe(false);
    expect(canProgress({ type: 'Attempt', seconds: 0, meters: 50 })).toBe(false);
  });

  it('steps in 5 s within ten minutes; 0 removes it', () => {
    expect(withStep(hold, 15).stepSec).toBe(15);
    expect(withStep(hold, -17).stepSec).toBe(-15);
    expect(withStep(hold, 900).stepSec).toBe(600);
    expect('stepSec' in withStep({ ...hold, stepSec: 15 }, 0)).toBe(false);
  });

  it('reads as "+15 s" or "−1:30"', () => {
    expect(stepLabel(15)).toBe('+15 s');
    expect(stepLabel(-90)).toBe('−1:30');
    expect(stepLabel(0)).toBe('');
  });
});
