process.env.TZ = 'Europe/Berlin';

import { describe, expect, it } from 'vitest';
import {
  completionEvent,
  groupByDay,
  isUnread,
  missedSessions,
  needsALook,
  planEnd,
  planSessions,
  remarkedThisWeek,
  thisWeekSummary,
  type CompletionLike,
} from '../activity';

// Two dated weeks: Mon 28 Sep and Mon 5 Oct 2026; the plan starts Wed 30 Sep.
const plan = {
  startDate: '2026-09-30',
  phases: [
    {
      weeks: [
        {
          weekStart: '2026-09-28',
          plannedSessions: [
            { id: 'w1-mon', dayOfWeek: 0, label: 'Before start' },
            { id: 'w1-wed', dayOfWeek: 2, label: 'CO2 table' },
            { id: 'w1-sat', dayOfWeek: 5, sessionType: 'Depth' },
          ],
        },
        {
          weekStart: '2026-10-05',
          plannedSessions: [
            { id: 'w2-tue', dayOfWeek: 1, label: 'Pool' },
            { id: 'w2-thu', dayOfWeek: 3, label: '' },
          ],
        },
      ],
    },
  ],
};

const comp = (p: Partial<CompletionLike>): CompletionLike => ({
  assignment_id: 'a1',
  exercise_id: 'x',
  completed_at: '2026-10-01T08:00:00Z',
  updated_at: '2026-10-01T08:00:01Z',
  rating: null,
  ...p,
});

describe('completionEvent', () => {
  it('is a completion when updated_at is just write latency', () => {
    expect(completionEvent(comp({}))).toEqual({ at: '2026-10-01T08:00:00Z', kind: 'completed' });
  });
  it('is an update, timed at updated_at, when the row changed later', () => {
    expect(completionEvent(comp({ updated_at: '2026-10-02T19:30:00Z' }))).toEqual({
      at: '2026-10-02T19:30:00Z',
      kind: 'updated',
    });
  });
  it('ignores rows that are not completed', () => {
    expect(completionEvent(comp({ completed_at: null }))).toBeNull();
  });
});

describe('isUnread', () => {
  it('compares instants, not strings', () => {
    expect(isUnread('2026-10-01T08:00:00+00:00', '2026-10-01T07:59:59.000Z')).toBe(true);
    expect(isUnread('2026-10-01T08:00:00+00:00', '2026-10-01T08:00:01.000Z')).toBe(false);
    expect(isUnread('2026-10-01T08:00:00Z', '')).toBe(true);
  });
});

describe('planSessions / planEnd', () => {
  it('numbers weeks across the plan and dates each session', () => {
    const s = planSessions(plan);
    expect(s.map((x) => [x.id, x.week, x.date, x.label])).toEqual([
      ['w1-mon', 1, '2026-09-28', 'Before start'],
      ['w1-wed', 1, '2026-09-30', 'CO2 table'],
      ['w1-sat', 1, '2026-10-03', 'Depth'],
      ['w2-tue', 2, '2026-10-06', 'Pool'],
      ['w2-thu', 2, '2026-10-08', null],
    ]);
    expect(planEnd(plan)).toBe('2026-10-11');
    expect(planEnd({ phases: [{ weeks: [{}] }] })).toBeNull();
  });
});

describe('missedSessions', () => {
  it('counts only ended weeks, and nothing before the plan start', () => {
    // Sunday of week 1: week 1 has not ended yet.
    expect(missedSessions(plan, new Set(), '2026-10-04')).toBe(0);
    // Week 1 over: Wed + Sat missed, the Monday before the start is ignored.
    expect(missedSessions(plan, new Set(), '2026-10-05')).toBe(2);
    expect(missedSessions(plan, new Set(['w1-wed']), '2026-10-05')).toBe(1);
    expect(missedSessions(plan, new Set(), '2026-10-12')).toBe(4);
  });
  it('skips undated plans', () => {
    expect(missedSessions({ phases: [{ weeks: [{ plannedSessions: [{ id: 'a' }] }] }] }, new Set(), '2030-01-01')).toBe(0);
  });
});

describe('groupByDay', () => {
  it('labels today and yesterday on the local calendar', () => {
    const items = ['2026-10-13T06:00:00Z', '2026-10-12T21:59:00Z', '2026-10-12T22:30:00Z', '2026-10-10T10:00:00Z'];
    // Newest first as the feed would pass them.
    const sorted = [...items].sort().reverse();
    const g = groupByDay(sorted, (x) => x, '2026-10-13');
    // 22:30Z on the 12th is 00:30 on the 13th in Berlin.
    expect(g.map((x) => [x.day, x.rel, x.items.length])).toEqual([
      ['2026-10-13', 'today', 2],
      ['2026-10-12', 'yesterday', 1],
      ['2026-10-10', null, 1],
    ]);
  });
});

describe('needsALook', () => {
  const now = Date.parse('2026-10-13T12:00:00Z');
  const base = {
    athletes: [
      { studentId: 's1', name: 'Lena' },
      { studentId: 's2', name: 'Marco' },
    ],
    todayIso: '2026-10-13',
    nowMs: now,
  };

  it('flags an athlete without an active assignment', () => {
    const r = needsALook({ ...base, assignments: [{ id: 'a1', studentId: 's1', assignedAt: null, plan }], completions: [] });
    expect(r.find((x) => x.studentId === 's2')?.reasons).toEqual([{ kind: 'noPlan' }]);
  });

  it('flags missed sessions; the plan has ended so quiet does not apply', () => {
    const r = needsALook({
      ...base,
      athletes: [base.athletes[0]],
      assignments: [{ id: 'a1', studentId: 's1', assignedAt: '2026-09-20T00:00:00Z', plan }],
      completions: [comp({ exercise_id: 'w1-wed' })],
    });
    expect(r).toEqual([{ studentId: 's1', name: 'Lena', reasons: [{ kind: 'missed', count: 3 }] }]);
  });

  it('flags quiet on a running plan, counted from the last event', () => {
    const undated = { phases: [{ weeks: [{ plannedSessions: [{ id: 'u1' }] }] }] };
    const r = needsALook({
      ...base,
      athletes: [base.athletes[0]],
      assignments: [{ id: 'a1', studentId: 's1', assignedAt: '2026-09-01T00:00:00Z', plan: undated }],
      completions: [comp({ exercise_id: 'u1', completed_at: '2026-10-01T08:00:00Z', updated_at: '2026-10-05T12:00:00Z' })],
    });
    // The edit on the 5th counts as activity: 8 days ago.
    expect(r[0].reasons).toEqual([{ kind: 'quiet', days: 8 }]);
  });

  it('is not quiet on a plan assigned recently', () => {
    const undated = { phases: [{ weeks: [{ plannedSessions: [{ id: 'u1' }] }] }] };
    const r = needsALook({
      ...base,
      athletes: [base.athletes[0]],
      assignments: [{ id: 'a1', studentId: 's1', assignedAt: '2026-10-10T00:00:00Z', plan: undated }],
      completions: [],
    });
    expect(r).toEqual([]);
  });

  it('flags effort rising only when strictly increasing and ending at 7+', () => {
    const undated = { phases: [{ weeks: [{ plannedSessions: [] }] }] };
    const mk = (ratings: number[]) =>
      ratings.map((rating, i) =>
        comp({ exercise_id: `e${i}`, rating, completed_at: `2026-10-1${i}T08:00:00Z`, updated_at: `2026-10-1${i}T08:00:00Z` }),
      );
    const run = (ratings: number[]) =>
      needsALook({
        ...base,
        athletes: [base.athletes[0]],
        assignments: [{ id: 'a1', studentId: 's1', assignedAt: null, plan: undated }],
        completions: mk(ratings),
      })[0]?.reasons ?? [];
    expect(run([4, 5, 6, 7])).toEqual([{ kind: 'effortRising', ratings: [5, 6, 7] }]);
    expect(run([5, 6, 6])).toEqual([]);
    expect(run([3, 4, 6])).toEqual([]);
  });

  it('flags the worst recent hypoxia report with its effort', () => {
    const undated = { phases: [{ weeks: [{ plannedSessions: [] }] }] };
    const run = (completions: CompletionLike[]) =>
      needsALook({
        ...base,
        athletes: [base.athletes[0]],
        assignments: [{ id: 'a1', studentId: 's1', assignedAt: null, plan: undated }],
        completions,
      })[0]?.reasons ?? [];
    const at = (d: string) => ({ completed_at: `${d}T08:00:00Z`, updated_at: `${d}T08:00:00Z` });
    // LMC rated 7 beats a later session with symptoms.
    expect(
      run([
        comp({ exercise_id: 'e1', rating: 7, hypoxia: 3, ...at('2026-10-08') }),
        comp({ exercise_id: 'e2', rating: 5, hypoxia: 2, ...at('2026-10-12') }),
        comp({ exercise_id: 'e3', rating: 6, hypoxia: 1, ...at('2026-10-13') }),
      ]),
    ).toEqual([{ kind: 'hypoxia', level: 3, rating: 7 }]);
    // Clean, unreported or older than two weeks: nothing.
    expect(
      run([
        comp({ exercise_id: 'e1', rating: 6, hypoxia: 1, ...at('2026-10-12') }),
        comp({ exercise_id: 'e2', rating: 6, ...at('2026-10-12') }),
        comp({ exercise_id: 'e3', rating: 6, hypoxia: 4, ...at('2026-09-20') }),
      ]),
    ).toEqual([]);
  });
});

describe('thisWeekSummary', () => {
  it('counts planned vs done in the current calendar week and plans ending soon', () => {
    const s = thisWeekSummary({
      assignments: [{ id: 'a1', studentId: 's1', assignedAt: null, plan }],
      completions: [comp({ exercise_id: 'w2-tue' }), comp({ exercise_id: 'w1-wed' })],
      todayIso: '2026-10-07',
    });
    expect(s).toEqual({ planned: 2, done: 1, endingSoon: 1 });
  });
  it('has no planned line without dated weeks this week', () => {
    const s = thisWeekSummary({
      assignments: [{ id: 'a1', studentId: 's1', assignedAt: null, plan }],
      completions: [],
      todayIso: '2026-11-20',
    });
    expect(s.planned).toBeNull();
    expect(s.endingSoon).toBe(0);
  });
});

describe('remarkedThisWeek', () => {
  it('counts remarked events since Monday', () => {
    expect(
      remarkedThisWeek(
        [
          { at: '2026-10-13T08:00:00Z', hasRemark: true },
          { at: '2026-10-12T08:00:00Z', hasRemark: false },
          { at: '2026-10-11T08:00:00Z', hasRemark: true },
        ],
        '2026-10-13',
      ),
    ).toBe(1);
  });
});
