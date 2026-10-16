import { describe, it, expect } from 'vitest';
import { extractDiveData, withDerivedSpeed } from '../diveProfile';

const dive = (profile: { t: number; d: number; v?: number }[]) => ({
  profile,
  diveTime: profile[profile.length - 1].t,
  depth: Math.max(...profile.map((p) => p.d)),
});

describe('speed for dives without a stored v', () => {
  const noV = [
    { t: 0, d: 0 },
    { t: 1, d: 1 },
    { t: 2, d: 2 },
    { t: 3, d: 2 },
    { t: 4, d: 1 },
    { t: 5, d: 0 },
  ];

  it('derives speed from depth, negative while descending', () => {
    const data = extractDiveData(dive(noV));
    expect(data.hasSpeed).toBe(true);
    const v = data.speedSeries.map(([, s]) => s);
    expect(v[1]).toBeCloseTo(-1); // going down at 1 m/s
    expect(v[4]).toBeCloseTo(1); // coming up at 1 m/s
  });

  it('puts the speed on the points too (speed-by-depth reads them)', () => {
    expect(extractDiveData(dive(noV)).points.every((p) => p.v != null)).toBe(true);
  });

  it('leaves a stored speed untouched', () => {
    const withV = noV.map((p, i) => ({ ...p, v: i === 1 ? -0.7 : 0 }));
    expect(withDerivedSpeed(withV)[1].v).toBe(-0.7);
  });
});
