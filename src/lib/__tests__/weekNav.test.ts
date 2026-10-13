import { describe, expect, it } from 'vitest';
import { currentWeekIndex, weekSlots } from '../weekNav';
import { copyWeek, type BuilderWeek } from '../e08plan';

describe('currentWeekIndex', () => {
  // 2026-10-14 is a Wednesday; week 1 runs Mon 12 to Sun 18.
  it('anchors weeks on the Monday of the start date', () => {
    expect(currentWeekIndex('2026-10-14', 4, '2026-10-12')).toBe(0);
    expect(currentWeekIndex('2026-10-14', 4, '2026-10-18')).toBe(0);
    expect(currentWeekIndex('2026-10-14', 4, '2026-10-19')).toBe(1);
  });
  it('is -1 before the start, after the end, or without a date', () => {
    expect(currentWeekIndex('2026-10-14', 4, '2026-10-11')).toBe(-1);
    expect(currentWeekIndex('2026-10-14', 2, '2026-10-26')).toBe(-1);
    expect(currentWeekIndex('', 4, '2026-10-14')).toBe(-1);
  });
});

describe('weekSlots', () => {
  const none = new Set<number>();
  it('never folds a short plan', () => {
    expect(weekSlots(4, { current: -1, expanded: none, showAll: false })).toHaveLength(4);
  });
  it('folds everything but the last three into one row', () => {
    expect(weekSlots(18, { current: -1, expanded: none, showAll: false })).toEqual([
      { kind: 'folded', from: 0, to: 14 },
      { kind: 'week', index: 15 },
      { kind: 'week', index: 16 },
      { kind: 'week', index: 17 },
    ]);
  });
  it('keeps the current week and jumped-to weeks open, splitting the fold', () => {
    expect(weekSlots(10, { current: 3, expanded: new Set([0]), showAll: false })).toEqual([
      { kind: 'week', index: 0 },
      { kind: 'folded', from: 1, to: 2 },
      { kind: 'week', index: 3 },
      { kind: 'folded', from: 4, to: 6 },
      { kind: 'week', index: 7 },
      { kind: 'week', index: 8 },
      { kind: 'week', index: 9 },
    ]);
  });
  it('showAll opens every week', () => {
    expect(weekSlots(18, { current: -1, expanded: none, showAll: true }).every((s) => s.kind === 'week')).toBe(true);
  });
});

describe('copyWeek', () => {
  it('deep copies with fresh session and exercise ids', () => {
    const w: BuilderWeek = {
      focus: 'CO2',
      intensity: 7,
      notes: 'n',
      sessions: [
        {
          id: 'sess-a',
          dayOfWeek: 2,
          label: 'Tables',
          body: '',
          mode: 'dry',
          sessionType: '',
          exercises: [{ id: 'ex-a', description: 'CO2 table', dose: [{ unit: 'sets', value: '8' }] }],
        },
      ],
    };
    const c = copyWeek(w);
    expect(c.focus).toBe('CO2');
    expect(c.sessions[0].id).not.toBe('sess-a');
    expect(c.sessions[0].exercises[0].id).not.toBe('ex-a');
    expect(c.sessions[0].exercises[0].dose).toEqual([{ unit: 'sets', value: '8' }]);
    c.sessions[0].exercises[0].dose![0].value = '9';
    c.sessions[0].label = 'changed';
    expect(w.sessions[0].exercises[0].dose![0].value).toBe('8');
    expect(w.sessions[0].label).toBe('Tables');
  });
});
