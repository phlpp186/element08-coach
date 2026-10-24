import { describe, expect, it } from 'vitest';
import { blockDuration, doseSeconds, isStale, moveItem, parseDuration, whereUsed } from '../exerciseInsights';

const NOW = Date.parse('2026-10-24T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

describe('isStale', () => {
  it('is stale when never used or not used for 30+ days', () => {
    expect(isStale({ id: 'a', description: 'x' }, NOW)).toBe(true);
    expect(isStale({ id: 'a', description: 'x', useCount: 3, lastUsedAt: daysAgo(31) }, NOW)).toBe(true);
    expect(isStale({ id: 'a', description: 'x', useCount: 3, lastUsedAt: daysAgo(5) }, NOW)).toBe(false);
  });
});

describe('parseDuration', () => {
  it('reads unambiguous durations only', () => {
    expect(parseDuration('1:30')).toBe(90);
    expect(parseDuration('10:00')).toBe(600);
    expect(parseDuration('90s')).toBe(90);
    expect(parseDuration('45 sec')).toBe(45);
    expect(parseDuration('10 min')).toBe(600);
    expect(parseDuration('2,5 min')).toBe(150);
    expect(parseDuration("5'")).toBe(300);
    expect(parseDuration('8')).toBeNull();
    expect(parseDuration('max')).toBeNull();
  });
});

describe('doseSeconds / blockDuration', () => {
  it('multiplies hold and rest by sets and adds plain time once', () => {
    expect(
      doseSeconds([
        { unit: 'sets', value: '8' },
        { unit: 'hold', value: '1:30' },
        { unit: 'rest', value: '2:00' },
      ]),
    ).toBe(8 * 210);
    expect(doseSeconds([{ unit: 'time', value: '10:00' }])).toBe(600);
    expect(doseSeconds([{ unit: 'sets', value: '4' }, { unit: 'distance', value: '50' }])).toBeNull();
    expect(doseSeconds(undefined)).toBeNull();
  });

  it('sums only the timed exercises and says how many there were', () => {
    expect(
      blockDuration([[{ unit: 'time', value: '10 min' }], undefined, [{ unit: 'sets', value: '2' }, { unit: 'hold', value: '1:00' }]]),
    ).toEqual({ seconds: 720, timed: 2, total: 3 });
  });
});

describe('whereUsed', () => {
  it('finds blocks by id and templates by text', () => {
    const ex = { id: 'x1', description: 'CO2 table' };
    const used = whereUsed(
      ex,
      [
        { id: 'b1', name: 'Pool combo', exerciseIds: ['x1'] },
        { id: 'b2', name: 'Other', exerciseIds: ['x2'] },
      ],
      [{ id: 's', name: 'Tuesday dry', label: '', body: '', mode: 'dry', sessionType: '', exercises: [{ description: ' co2 TABLE ' }] }],
      [
        {
          id: 'w',
          name: 'Base week',
          focus: '',
          intensity: 3,
          notes: '',
          sessions: [{ dayOfWeek: 1, label: '', body: '', mode: 'dry', sessionType: '', exercises: [{ description: 'CO2 table' }] }],
        },
      ],
    );
    expect(used).toEqual({ blocks: ['Pool combo'], sessionTemplates: ['Tuesday dry'], weekTemplates: ['Base week'] });
  });
});

describe('moveItem', () => {
  it('moves and clamps', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, -5)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a'], 3, 0)).toEqual(['a']);
  });
});
