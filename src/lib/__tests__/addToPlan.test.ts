import { describe, expect, it } from 'vitest';
import { addExercises, addSession, applyToWeek, planRows, targetExists } from '../addToPlan';
import { emptyWeek, newSession, normalizePlan, type BuilderPlan } from '../e08plan';

const sess = (id: string, day: number, lines: string[] = []) => ({
  ...newSession(day, 'pool'),
  id,
  label: id,
  exercises: lines.map((description, i) => ({ id: `${id}-e${i}`, description })),
});

function weeksPlan(): BuilderPlan {
  return normalizePlan({
    name: 'P',
    mode: 'pool',
    kind: 'training',
    structure: 'weeks',
    weeks: [
      { ...emptyWeek(), sessions: [sess('a', 0, ['warm up']), sess('b', 2)] },
      { ...emptyWeek(), sessions: [sess('c', 2)] },
    ],
  });
}
function seasonPlan(): BuilderPlan {
  return normalizePlan({
    name: 'S',
    mode: 'depth',
    kind: 'season',
    phases: [
      { id: 'p1', name: 'Base', type: 'base', weeks: [{ ...emptyWeek(), sessions: [sess('a', 1)] }] },
      { id: 'p2', name: 'Build', type: 'build', weeks: [emptyWeek(), { ...emptyWeek(), sessions: [sess('b', 5)] }] },
    ],
  });
}
function dayPlan(): BuilderPlan {
  return normalizePlan({
    name: 'D',
    mode: 'dry',
    kind: 'training',
    structure: 'days',
    days: [
      { id: 'd1', sessions: [sess('a', 0)] },
      { id: 'd2', sessions: [] },
    ],
  });
}

describe('planRows', () => {
  it('lists a training plan week by week, Monday to Sunday', () => {
    const rows = planRows(weeksPlan());
    expect(rows).toHaveLength(2);
    const first = rows[0];
    expect(first.kind === 'week' && first.days.map((d) => d.map((s) => s.id))).toEqual([['a'], [], ['b'], [], [], [], []]);
  });
  it('numbers the weeks of a season through its phases', () => {
    const rows = planRows(seasonPlan());
    expect(rows.map((r) => r.kind === 'week' && [r.number, r.ref.phase, r.ref.week])).toEqual([
      [1, 0, 0],
      [2, 1, 0],
      [3, 1, 1],
    ]);
  });
  it('lists a day-based plan day by day', () => {
    expect(planRows(dayPlan()).map((r) => r.kind)).toEqual(['day', 'day']);
  });
});

describe('addExercises', () => {
  const picked = [{ description: '4×50m bi-fins', dose: [{ unit: 'reps' as const, value: '4' }] }, { description: 'CO₂ table' }];

  it('appends to the chosen session in the picked order and leaves the others alone', () => {
    const before = weeksPlan();
    const after = addExercises(before, { kind: 'session', sessionId: 'a' }, picked);
    const a = after.weeks[0].sessions[0];
    expect(a.exercises.map((e) => e.description)).toEqual(['warm up', '4×50m bi-fins', 'CO₂ table']);
    expect(after.weeks[0].sessions[1]).toBe(before.weeks[0].sessions[1]);
    expect(before.weeks[0].sessions[0].exercises).toHaveLength(1);
  });
  it('gives every added exercise an id of its own and a dose that is a copy', () => {
    const after = addExercises(weeksPlan(), { kind: 'session', sessionId: 'b' }, picked);
    const ex = after.weeks[0].sessions[1].exercises;
    expect(new Set(ex.map((e) => e.id)).size).toBe(2);
    expect(ex[0].dose).toEqual(picked[0].dose);
    expect(ex[0].dose).not.toBe(picked[0].dose);
  });
  it('finds a session inside a season phase', () => {
    const after = addExercises(seasonPlan(), { kind: 'session', sessionId: 'b' }, picked);
    expect(after.phases[1].weeks[1].sessions[0].exercises).toHaveLength(2);
  });
  it('makes a new session on a free weekday, in the plan mode', () => {
    const after = addExercises(weeksPlan(), { kind: 'weekDay', ref: { phase: null, week: 1 }, dayOfWeek: 4 }, picked);
    const added = after.weeks[1].sessions[1];
    expect([added.dayOfWeek, added.mode, added.exercises.length]).toEqual([4, 'pool', 2]);
  });
  it('makes a new session on a day of a day-based plan, or on a new last day', () => {
    const onDay = addExercises(dayPlan(), { kind: 'day', index: 1 }, picked);
    expect(onDay.days[1].sessions).toHaveLength(1);
    const onNew = addExercises(dayPlan(), { kind: 'newDay' }, picked);
    expect(onNew.days).toHaveLength(3);
    expect(onNew.days[2].sessions[0].exercises).toHaveLength(2);
  });
  it('changes nothing for an empty pick', () => {
    const p = weeksPlan();
    expect(addExercises(p, { kind: 'session', sessionId: 'a' }, [])).toBe(p);
  });
});

describe('addSession', () => {
  it('hands the weekday to the maker and appends after the day\'s other sessions', () => {
    const after = addSession(seasonPlan(), { kind: 'weekDay', ref: { phase: 1, week: 1 }, dayOfWeek: 5 }, (d) => sess('new', d));
    expect(after.phases[1].weeks[1].sessions.map((s) => [s.id, s.dayOfWeek])).toEqual([
      ['b', 5],
      ['new', 5],
    ]);
  });
});

describe('applyToWeek', () => {
  const stamp = (w: ReturnType<typeof emptyWeek>) => ({ ...w, focus: 'from template', sessions: [...w.sessions, sess('t', 3)] });

  it('applies to the chosen week only', () => {
    const after = applyToWeek(weeksPlan(), { phase: null, week: 1 }, stamp);
    expect(after.weeks[0].focus).toBe('');
    expect(after.weeks[1].sessions.map((s) => s.id)).toEqual(['c', 't']);
  });
  it('adds a new last week, in a season to its last phase', () => {
    expect(applyToWeek(weeksPlan(), 'new', stamp).weeks).toHaveLength(3);
    const season = applyToWeek(seasonPlan(), 'new', stamp);
    expect(season.phases[1].weeks).toHaveLength(3);
    expect(season.phases[1].weeks[2].focus).toBe('from template');
  });
  it('leaves a day-based plan as it is', () => {
    const p = dayPlan();
    expect(applyToWeek(p, 'new', stamp)).toBe(p);
  });
});

describe('targetExists', () => {
  it('knows a session, a week and a day that are gone', () => {
    const p = weeksPlan();
    expect(targetExists(p, { kind: 'session', sessionId: 'c' })).toBe(true);
    expect(targetExists(p, { kind: 'session', sessionId: 'zz' })).toBe(false);
    expect(targetExists(p, { kind: 'weekDay', ref: { phase: null, week: 5 }, dayOfWeek: 0 })).toBe(false);
    expect(targetExists(dayPlan(), { kind: 'day', index: 1 })).toBe(true);
    expect(targetExists(p, { kind: 'newDay' })).toBe(false);
  });
});
