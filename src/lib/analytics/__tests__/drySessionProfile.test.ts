import { describe, expect, it } from 'vitest';
import { extractDrySessionData } from '../drySessionProfile';

const hr = (tMs: number, h: number) => ({ t: tMs, h, s: 0, p: 0 });

describe('the time axis of an attached session', () => {
  it('a strength workout with a heart rate strap spans its heart rate', () => {
    // Jinseul, 2026-11-23: no block timeline, no SpO2, 81 minutes of heart
    // rate drawn as one flat second.
    const readings = [hr(280, 71), hr(1811, 73), hr(2_400_000, 120), hr(4_888_049, 131)];
    const d = extractDrySessionData({ oxyReadings: readings, playStart: 0, blockTimeline: [] } as never);
    expect(d.startT).toBe(0);
    expect(d.endT).toBeCloseTo(4888.049, 3);
    expect(d.hrSeries.at(-1)?.[1]).toBe(131);
    expect(d.hasOxy).toBe(true);
  });

  it('a breath-hold table still spans its timeline', () => {
    const readings = [
      { t: 0, h: 70, s: 98, p: 1 },
      { t: 1000, h: 71, s: 98, p: 1 },
      { t: 500_000, h: 65, s: 90, p: 1 },
    ];
    const d = extractDrySessionData({
      oxyReadings: readings,
      playStart: 0,
      blockTimeline: [
        { type: 'Rest', seconds: 120 },
        { type: 'Hold', seconds: 90 },
      ],
    } as never);
    expect(d.endT).toBe(210);
  });

  it('nothing recorded keeps the axis at 0', () => {
    expect(extractDrySessionData({} as never).endT).toBe(0);
  });
});
