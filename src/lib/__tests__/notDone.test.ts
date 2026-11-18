import { describe, expect, it } from 'vitest';
import { isNotDone, isPastGrace, SKIP_REASON_LABEL } from '../notDone';
import { needsALook } from '../activity';

describe('not-done reports', () => {
  it('reads a row with not_done_at and no completion as not done', () => {
    expect(isNotDone({ completed_at: null, not_done_at: '2026-11-18T10:00:00Z' })).toBe(true);
    expect(isNotDone({ completed_at: '2026-11-19T08:00:00Z', not_done_at: '2026-11-18T10:00:00Z' })).toBe(false);
    expect(isNotDone({ completed_at: null })).toBe(false);
  });
  it('is past grace from the fifth day', () => {
    expect(isPastGrace('2026-11-18', '2026-11-22')).toBe(false);
    expect(isPastGrace('2026-11-18', '2026-11-23')).toBe(true);
  });
  it('labels every reason the app can send', () => {
    expect(Object.keys(SKIP_REASON_LABEL).sort()).toEqual(['injury', 'noPool', 'noTime', 'other', 'sick', 'tired']);
  });
});

describe('needs a look: missed', () => {
  const plan = {
    startDate: '2026-10-05',
    phases: [
      {
        weeks: [
          {
            weekStart: '2026-10-05',
            plannedSessions: [
              { id: 'a', dayOfWeek: 0 },
              { id: 'b', dayOfWeek: 1 },
            ],
          },
        ],
      },
    ],
  };
  const base = {
    athletes: [{ studentId: 's1', name: 'Anna' }],
    assignments: [{ id: 'as1', studentId: 's1', plan, assignedAt: '2026-10-01T00:00:00Z' }],
    todayIso: '2026-10-20',
    nowMs: Date.parse('2026-10-20T12:00:00Z'),
  };
  const missedOf = (completions: Parameters<typeof needsALook>[0]['completions']) =>
    needsALook({ ...base, completions })
      .flatMap((f) => f.reasons)
      .find((r) => r.kind === 'missed');

  it('flags two silent misses', () => {
    expect(missedOf([])).toBeTruthy();
  });
  // An athlete who told the coach why is not a silent miss.
  it('does not count a session reported as not done', () => {
    const row = {
      assignment_id: 'as1',
      exercise_id: 'a',
      completed_at: null,
      not_done_at: '2026-10-06T08:00:00Z',
      updated_at: '2026-10-06T08:00:00Z',
      rating: null,
    };
    expect(missedOf([row])).toBeFalsy();
  });
});
