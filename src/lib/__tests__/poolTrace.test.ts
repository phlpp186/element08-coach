import { describe, it, expect } from 'vitest';
import { extractPoolTraceData } from '../analytics/poolTrace';

const ramp = (n: number) => Array.from({ length: n }, (_, i) => i / 10);

describe('extractPoolTraceData', () => {
  it('returns null for a dive with no trace', () => {
    expect(extractPoolTraceData({})).toBeNull();
  });

  it('refuses a trace with no usable sample rate rather than guessing one', () => {
    // The marks are in real seconds and the channels in samples, so a guessed
    // rate draws convincing turn lines in the wrong places.
    expect(extractPoolTraceData({ trace: { accel: ramp(50), turns: [3], hz: 0 } })).toBeNull();
    expect(extractPoolTraceData({ trace: { accel: ramp(50), turns: [3] } })).toBeNull();
  });

  it('puts sample i at i / hz seconds', () => {
    const d = extractPoolTraceData({ trace: { accel: ramp(50), hz: 5 } })!;
    expect(d.accel[0]).toEqual([0, 0]);
    expect(d.accel[10][0]).toBeCloseTo(2);
    expect(d.endT).toBeCloseTo(9.8);
  });

  it("shows the detector's turns, unconfirmed, when the diver has not edited", () => {
    const d = extractPoolTraceData({ trace: { accel: ramp(50), turns: [2, 4], hz: 5 } })!;
    expect(d.turns).toEqual([2, 4]);
    expect(d.confirmed).toBe(false);
    expect(d.bracket).toBeNull();
  });

  it("prefers the diver's marks over the detector's once edited", () => {
    const d = extractPoolTraceData({
      trace: { accel: ramp(50), turns: [2, 4], strokes: [1, 3], hz: 5 },
      traceEdits: { startT: 1, endT: 8, turns: [2.5], strokes: [1.2], kicks: [1.4] },
    })!;
    expect(d.turns).toEqual([2.5]);
    expect(d.strokes).toEqual([1.2]);
    expect(d.kicks).toEqual([1.4]);
    expect(d.confirmed).toBe(true);
    expect(d.bracket).toEqual({ start: 1, end: 8 });
  });

  it('lets a diver correct a dive to zero turns without the detector coming back', () => {
    const d = extractPoolTraceData({
      trace: { accel: ramp(50), turns: [2, 4], hz: 5 },
      traceEdits: { startT: 0, endT: 9, turns: [], strokes: [], kicks: [] },
    })!;
    expect(d.turns).toEqual([]);
  });

  it("never surfaces the detector's own strokes", () => {
    const d = extractPoolTraceData({ trace: { accel: ramp(50), strokes: [1, 2, 3], hz: 5 } })!;
    expect(d.strokes).toEqual([]);
  });

  it('reports the heading source so a drifting baseline can be read as the instrument', () => {
    expect(extractPoolTraceData({ trace: { heading: ramp(50), hz: 5 } })!.headingSource).toBe('gyro');
    expect(extractPoolTraceData({ trace: { heading: ramp(50), hz: 5, hs: 1 } })!.headingSource).toBe(
      'compass',
    );
  });

  it('returns null when a trace carries a rate but no channels', () => {
    expect(extractPoolTraceData({ trace: { hz: 5, turns: [1, 2] } })).toBeNull();
  });
});
