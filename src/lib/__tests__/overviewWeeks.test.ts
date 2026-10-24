import { describe, expect, it } from 'vitest';
import { recentDone, weekBlocks } from '../overviewWeeks';
import { effortRising } from '../activity';

// Mondays: 2026-10-05, 10-12, 10-19 (today's week), 10-26 (ahead).
const TODAY = '2026-10-21';
const plan = {
  startDate: '2026-10-07', // a Wednesday: the Monday session of week 1 is before the start
  phases: [
    {
      weeks: [
        { weekStart: '2026-10-05', plannedSessions: [{ id: 'a', dayOfWeek: 0 }, { id: 'b', dayOfWeek: 2 }, { id: 'c', dayOfWeek: 4 }] },
        { weekStart: '2026-10-12', plannedSessions: [{ id: 'd', dayOfWeek: 1 }, { id: 'e', dayOfWeek: 3 }] },
      ],
    },
    {
      weeks: [
        { weekStart: '2026-10-19', plannedSessions: [{ id: 'f', dayOfWeek: 0 }, { id: 'g', dayOfWeek: 4 }] },
        { weekStart: '2026-10-26', plannedSessions: [{ id: 'h', dayOfWeek: 0 }] },
      ],
    },
  ],
};

describe('weekBlocks', () => {
  it('numbers weeks across phases and colours them by what was done', () => {
    const blocks = weekBlocks(plan, new Set(['b', 'c', 'd', 'f']), TODAY);
    expect(blocks.map((b) => [b.week, b.weekStart, b.planned, b.done, b.state])).toEqual([
      [1, '2026-10-05', 2, 2, 'done'], // 'a' is before the plan start, not counted
      [2, '2026-10-12', 2, 1, 'partial'],
      [3, '2026-10-19', 2, 1, 'current'],
      [4, '2026-10-26', 1, 0, 'ahead'],
    ]);
  });

  it('marks a past week with nothing done as missed and an empty one as rest', () => {
    const p = {
      phases: [
        {
          weeks: [
            { weekStart: '2026-10-05', plannedSessions: [{ id: 'x', dayOfWeek: 1 }] },
            { weekStart: '2026-10-12', plannedSessions: [] },
          ],
        },
      ],
    };
    expect(weekBlocks(p, new Set(), TODAY).map((b) => b.state)).toEqual(['missed', 'rest']);
  });

  it('skips undated weeks but keeps the numbering', () => {
    const p = { phases: [{ weeks: [{ plannedSessions: [{ id: 'x' }] }, { weekStart: '2026-10-12', plannedSessions: [] }] }] };
    expect(weekBlocks(p, new Set(), TODAY).map((b) => b.week)).toEqual([2]);
  });

  it('survives junk', () => {
    expect(weekBlocks(null, new Set(), TODAY)).toEqual([]);
    expect(weekBlocks({ phases: [{}] }, new Set(), TODAY)).toEqual([]);
  });
});

describe('recentDone', () => {
  it('counts sessions dated in the last 28 days up to today, from the plan start', () => {
    // b c d e f (f = Mon 10-19, g = Fri 10-23 is after today, a before the start)
    expect(recentDone(plan, new Set(['b', 'd', 'f', 'g']), TODAY)).toEqual({ planned: 5, done: 3 });
  });

  it('honours a shorter window', () => {
    // 7 days: 10-15..10-21 → e (Thu 10-15), f (Mon 10-19)
    expect(recentDone(plan, new Set(['f']), TODAY, 7)).toEqual({ planned: 2, done: 1 });
  });
});

describe('effortRising', () => {
  it('needs three strictly rising ratings ending at 7 or harder', () => {
    expect(effortRising([3, 5, 6, 7])).toEqual([5, 6, 7]);
    expect(effortRising([5, 6, 6])).toBeNull();
    expect(effortRising([4, 5, 6])).toBeNull();
    expect(effortRising([8, 9])).toBeNull();
    expect(effortRising([7, 8, 9, 6])).toBeNull();
  });
});
