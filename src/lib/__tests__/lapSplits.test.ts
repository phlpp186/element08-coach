import { describe, it, expect } from 'vitest';
import { lapSplits } from '../analytics/lapSplits';

describe('lapSplits', () => {
  it('returns nothing for a dive with no laps', () => {
    expect(lapSplits({})).toEqual([]);
    expect(lapSplits({ lapTimes: [] })).toEqual([]);
  });

  it('numbers the laps and keeps their times', () => {
    const l = lapSplits({ lapTimes: [26, 27, 28, 31] });
    expect(l.map((x) => x.lap)).toEqual([1, 2, 3, 4]);
    expect(l.map((x) => x.seconds)).toEqual([26, 27, 28, 31]);
  });

  it('leaves strokes unattributed when the diver has not confirmed a trace', () => {
    expect(lapSplits({ lapTimes: [26, 27] }).every((l) => l.strokes === null)).toBe(true);
  });

  it('assigns confirmed strokes to the lap they fall in', () => {
    // Two laps, one turn at t=30, dive from 0 to 60.
    const l = lapSplits({
      lapTimes: [30, 30],
      traceEdits: { startT: 0, endT: 60, turns: [30], strokes: [2, 8, 14, 22, 34, 40, 46, 52, 58] },
    });
    expect(l[0].strokes).toBe(4);
    expect(l[1].strokes).toBe(5);
  });

  it('counts a stroke landing exactly on the dive end into the last lap', () => {
    const l = lapSplits({
      lapTimes: [30, 30],
      traceEdits: { startT: 0, endT: 60, turns: [30], strokes: [10, 60] },
    });
    expect(l[1].strokes).toBe(1);
  });

  it('refuses to attribute strokes when the turn count disagrees with the lap count', () => {
    // Four laps need three turns. Two turns means somebody is wrong about the
    // dive, and every count after the disagreement would land on a wrong lap.
    const l = lapSplits({
      lapTimes: [26, 27, 28, 31],
      traceEdits: { startT: 0, endT: 112, turns: [26, 53], strokes: [1, 2, 3, 4, 5] },
    });
    expect(l.every((x) => x.strokes === null)).toBe(true);
    expect(l).toHaveLength(4);
  });

  it('handles a single-lap dive, which needs no turns at all', () => {
    const l = lapSplits({
      lapTimes: [25],
      traceEdits: { startT: 0, endT: 25, turns: [], strokes: [3, 9, 15, 21] },
    });
    expect(l[0].strokes).toBe(4);
  });

  it('sorts turns before slicing, so an out-of-order mark cannot invert a lap', () => {
    const l = lapSplits({
      lapTimes: [30, 30, 30],
      traceEdits: { startT: 0, endT: 90, turns: [60, 30], strokes: [5, 35, 36, 65, 70, 75] },
    });
    expect(l.map((x) => x.strokes)).toEqual([1, 2, 3]);
  });
});
