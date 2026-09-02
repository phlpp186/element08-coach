import { describe, it, expect } from 'vitest';
import { rangeStats, type RangePoint } from '../analytics/rangeStats';

/** A dive to 40 m: 1 m/s down, 20 s hang at 40 m, 1.25 m/s up. */
function dive(): RangePoint[] {
  const p: RangePoint[] = [];
  for (let t = 0; t <= 40; t++) p.push({ t, d: t, hr: 70 - t * 0.5 });
  for (let t = 41; t <= 60; t++) p.push({ t, d: 40, hr: 50 });
  for (let t = 61; t <= 92; t++) p.push({ t, d: 40 - (t - 60) * 1.25, hr: 50 + (t - 60) });
  return p;
}

describe('rangeStats', () => {
  it('returns null when the range holds fewer than two samples', () => {
    expect(rangeStats(dive(), 10, 10.4)).toBeNull();
    expect(rangeStats([], 0, 100)).toBeNull();
  });

  it('reads a descent the way a coach would say it', () => {
    const r = rangeStats(dive(), 10, 30)!;
    expect(r.direction).toBe('descent');
    expect(r.startDepth).toBe(10);
    expect(r.endDepth).toBe(30);
    expect(r.deltaDepth).toBe(20);
    expect(r.dt).toBe(20);
    expect(r.avgSpeed).toBeCloseTo(1.0);
  });

  it('reads an ascent, and keeps the sign of the depth change', () => {
    const r = rangeStats(dive(), 64, 80)!;
    expect(r.direction).toBe('ascent');
    expect(r.deltaDepth).toBeLessThan(0);
    expect(r.avgSpeed).toBeCloseTo(1.25);
  });

  it('calls a flat stretch a hang and refuses a net speed for it', () => {
    const r = rangeStats(dive(), 42, 58)!;
    expect(r.direction).toBe('hang');
    expect(r.avgSpeed).toBeNull();
    expect(r.pathSpeed).toBe(0);
  });

  it('refuses a net speed across the turn, where it would report a diver standing still', () => {
    const r = rangeStats(dive(), 30, 75)!;
    expect(r.direction).toBe('mixed');
    // Net displacement here is ~ -11 m over 45 s, which would read as a slow
    // drift and hide a 10 m descent, a 20 s hang and an 18 m ascent.
    expect(r.avgSpeed).toBeNull();
    expect(r.pathDistance).toBeGreaterThan(25);
    expect(r.pathSpeed).toBeGreaterThan(0);
  });

  it('treats kick-glide wobble as one-way, not as a turn', () => {
    // A descent that backs up 10 cm every other sample.
    const p: RangePoint[] = [];
    for (let t = 0; t <= 20; t++) p.push({ t, d: t + (t % 2 === 0 ? 0.1 : 0) });
    const r = rangeStats(p, 0, 20)!;
    expect(r.direction).toBe('descent');
    expect(r.avgSpeed).toBeCloseTo(1.0, 1);
  });

  it('path distance exceeds net displacement once the dive turns around', () => {
    const r = rangeStats(dive(), 0, 92)!;
    expect(r.pathDistance).toBeCloseTo(80, 0);
    expect(Math.abs(r.deltaDepth)).toBeLessThan(1);
  });

  it('carries HR and the fastest instantaneous speed through the range', () => {
    const p: RangePoint[] = [
      { t: 0, d: 0, v: -0.5, hr: 80 },
      { t: 1, d: 1, v: -1.4, hr: 70 },
      { t: 2, d: 2.2, v: -1.1, hr: 60 },
    ];
    const r = rangeStats(p, 0, 2)!;
    expect(r.maxSpeed).toBeCloseTo(1.4);
    expect(r.avgHr).toBeCloseTo(70);
    expect(r.minHr).toBe(60);
    expect(r.maxHr).toBe(80);
    expect(r.samples).toBe(3);
  });

  it('does not care which way round the two handles were dragged', () => {
    const a = rangeStats(dive(), 10, 30)!;
    const b = rangeStats(dive(), 30, 10)!;
    expect(b).toEqual(a);
  });
});
