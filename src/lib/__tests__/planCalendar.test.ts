import { describe, expect, it } from 'vitest';
import {
  buildPlanFile,
  emptyDay,
  emptyPhase,
  emptyWeek,
  initialPlan,
  newSession,
  type BuilderPlan,
  type BuilderSession,
} from '../e08plan';
import {
  beforeStart,
  calWeeks,
  clearWeek,
  copyToNextWeek,
  copyToWeeks,
  copySessionTo,
  deleteWeek,
  findSession,
  insertWeek,
  isBlankSession,
  isPastSession,
  keepBoth,
  moveSession,
  nextMonday,
  phaseFrom,
  planCompetitions,
  sessionDate,
  suggestPhases,
  weekIndexOf,
  weeksToReach,
  withCalWeeks,
  withCompetitions,
  withoutPhases,
  type CalWeek,
} from '../planCalendar';

const sess = (label: string, day: number, id = `s-${label}`): BuilderSession => ({
  ...newSession(day, 'pool'),
  id,
  label,
  exercises: [{ id: `e-${label}`, description: `${label} line` }],
});

function training(weeks: BuilderSession[][], start = '2026-11-23'): BuilderPlan {
  return { ...initialPlan(), name: 'P', coach: 'C', startDate: start, weeks: weeks.map((sessions) => ({ ...emptyWeek(), sessions })) };
}

const types = (rows: CalWeek[]) => rows.map((r) => r.phase?.type ?? '-').join(' ');

describe('reading and writing the builder shape', () => {
  it('a training plan is its weeks, without phases, and comes back unchanged', () => {
    const p = training([[sess('a', 0)], [sess('b', 2)]]);
    const rows = calWeeks(p);
    expect(rows.map((r) => r.phase)).toEqual([null, null]);
    const back = withCalWeeks(p, rows);
    expect(back.kind).toBe('training');
    expect(back.weeks).toEqual(p.weeks);
    expect(buildPlanFile(back).content.phases[0].weeks.map((w) => w.plannedSessions.map((s) => s.id))).toEqual([['s-a'], ['s-b']]);
  });

  it('a season plan flattens to its weeks with their phase and groups back into the same phases', () => {
    const p: BuilderPlan = {
      ...training([]),
      kind: 'season',
      phases: [
        { ...emptyPhase('base', 2), id: 'p1', name: 'Base camp' },
        { ...emptyPhase('build', 1), id: 'p2' },
      ],
    };
    const rows = calWeeks(p);
    expect(types(rows)).toBe('base base build');
    const back = withCalWeeks(p, rows);
    expect(back.kind).toBe('season');
    expect(back.phases.map((ph) => [ph.id, ph.name, ph.type, ph.weeks.length])).toEqual([
      ['p1', 'Base camp', 'base', 2],
      ['p2', 'Build', 'build', 1],
    ]);
  });

  it('a plan of numbered days opens as the weeks its dates fall in, sessions on their weekday', () => {
    const p: BuilderPlan = {
      ...training([], '2026-11-25'), // a Wednesday
      structure: 'days',
      days: [
        { ...emptyDay(), sessions: [sess('d1', 0)] }, // Wed 25 Nov
        { ...emptyDay(), sessions: [] },
        { ...emptyDay(), date: '2026-12-01', sessions: [sess('d3', 0)] }, // Tue of the next week
      ],
    };
    const rows = calWeeks(p);
    expect(rows).toHaveLength(2);
    expect(rows[0].week.sessions.map((s) => [s.id, s.dayOfWeek])).toEqual([['s-d1', 2]]);
    expect(rows[1].week.sessions.map((s) => [s.id, s.dayOfWeek])).toEqual([['s-d3', 1]]);
    expect(withCalWeeks(p, rows).structure).toBe('weeks');
  });

  it('days before the start date in week 1 take no sessions', () => {
    const p = training([[]], '2026-11-25');
    expect([0, 1, 2, 3].map((d) => beforeStart(p, 0, d))).toEqual([true, true, false, false]);
    expect(beforeStart(p, 1, 0)).toBe(false);
  });
});

describe('phases', () => {
  const rows8 = () => calWeeks(training(Array.from({ length: 8 }, () => [])));

  it('the first phase in a plan without any starts at its week; the weeks before become Base', () => {
    const r = phaseFrom(rows8(), 3, 'build');
    expect(types(r)).toBe('base base base build build build build build');
    expect(withCalWeeks(training([]), r).phases.map((p) => [p.type, p.weeks.length])).toEqual([
      ['base', 3],
      ['build', 5],
    ]);
  });

  it('a phase set on week 1 of a plan without phases covers it all', () => {
    expect(types(phaseFrom(rows8(), 0, 'build'))).toBe('build build build build build build build build');
  });

  it('a new phase runs from its week to where the old phase ended, the next phase stays', () => {
    let r = phaseFrom(rows8(), 4, 'specific'); // base x4, specific x4
    r = phaseFrom(r, 2, 'build'); // base x2, build x2, specific x4
    expect(types(r)).toBe('base base build build specific specific specific specific');
    expect(withCalWeeks(training([]), r).phases.map((p) => [p.type, p.weeks.length])).toEqual([
      ['base', 2],
      ['build', 2],
      ['specific', 4],
    ]);
  });

  it('a run next to one of the same type joins it', () => {
    let r = phaseFrom(rows8(), 4, 'specific');
    r = phaseFrom(r, 4, 'base'); // back to all base
    expect(types(r)).toBe('base base base base base base base base');
    expect(new Set(r.map((x) => x.phase!.id)).size).toBe(1);
  });

  it('no phases makes it a training plan again', () => {
    const r = withoutPhases(phaseFrom(rows8(), 2, 'build'));
    expect(withCalWeeks(training([]), r).kind).toBe('training');
  });

  it('suggested phases cover every week, Base first, ending in the peak', () => {
    const r = suggestPhases(rows8());
    expect(r).toHaveLength(8);
    expect(r[0].phase!.type).toBe('base');
    expect(r[7].phase!.type).toBe('competition');
  });
});

describe('weeks', () => {
  const rows = () => calWeeks(training([[sess('a', 0)], [sess('b', 1)], [sess('c', 2)]]));

  it('deleting a week moves the later weeks one earlier; the last week stays', () => {
    const r = deleteWeek(rows(), 0);
    expect(r.map((x) => x.week.sessions[0].label)).toEqual(['b', 'c']);
    expect(deleteWeek(deleteWeek(r, 0), 0)).toHaveLength(1);
  });

  it('inserting a week pushes the later weeks one later', () => {
    const r = insertWeek(rows(), 1);
    expect(r.map((x) => x.week.sessions[0]?.label ?? '')).toEqual(['a', '', 'b', 'c']);
  });

  it('a week inserted into a phase belongs to that phase', () => {
    const r = insertWeek(phaseFrom(rows(), 1, 'build'), 2);
    expect(types(r)).toBe('base build build build');
  });

  it('copy to next week adds copies with new ids; at the end it grows the plan', () => {
    const r = copyToNextWeek(rows(), 2);
    expect(r).toHaveLength(4);
    expect(r[3].week.sessions[0].label).toBe('c');
    expect(r[3].week.sessions[0].id).not.toBe('s-c');
    const mid = copyToNextWeek(rows(), 0);
    expect(mid[1].week.sessions.map((s) => s.label)).toEqual(['b', 'a']);
  });

  it('clearing a week empties it and keeps it', () => {
    const r = clearWeek(rows(), 1);
    expect(r[1].week.sessions).toEqual([]);
    expect(r).toHaveLength(3);
  });
});

describe('sessions: move and copy', () => {
  const rows = () => calWeeks(training([[sess('a', 0)], [sess('b', 1)]]));

  it('moving keeps the id (her ticks follow it) and changes week and day', () => {
    const r = moveSession(rows(), 's-a', 1, 4);
    expect(r[0].week.sessions).toEqual([]);
    expect(findSession(r, 's-a')).toMatchObject({ week: 1, session: { dayOfWeek: 4 } });
  });

  it('copying leaves the original and gives the copy new session and exercise ids', () => {
    const r = copySessionTo(rows(), 's-a', 1, 4);
    expect(findSession(r, 's-a')!.week).toBe(0);
    const copy = r[1].week.sessions.find((s) => s.label === 'a')!;
    expect(copy.id).not.toBe('s-a');
    expect(copy.exercises[0].id).not.toBe('e-a');
    expect(copy.dayOfWeek).toBe(4);
  });

  it('copy to weeks puts one copy on the same weekday of each picked week, never its own', () => {
    const base = calWeeks(training([[sess('a', 3)], [], [], []]));
    const r = copyToWeeks(base, 's-a', [0, 2, 3, 3]);
    expect(r.map((w) => w.week.sessions.length)).toEqual([1, 0, 1, 1]);
    expect(r[2].week.sessions[0].dayOfWeek).toBe(3);
  });

  it('"keep it on the old day too" leaves the original there and puts a fresh copy on the new day', () => {
    // Sarang, 2026-11-22: the old "keep" put the copy on the old day, so her
    // report (stored under the original id) moved into the new week.
    const moved = moveSession(rows(), 's-a', 1, 4);
    const r = keepBoth(moved, 's-a', { week: 0, day: 0 }, { week: 1, day: 4 });
    expect(findSession(r, 's-a')).toMatchObject({ week: 0, session: { dayOfWeek: 0 } });
    const copy = r[1].week.sessions.find((s) => s.label === 'a')!;
    expect(copy.id).not.toBe('s-a');
    expect(copy.dayOfWeek).toBe(4);
  });

  it('a session before today is past, today and later is not', () => {
    const p = training([[sess('a', 0), sess('b', 3)]], '2026-11-16');
    const r = calWeeks(p);
    expect(sessionDate(p, r, 's-a')).toBe('2026-11-16');
    expect(isPastSession(p, r, 's-a', '2026-11-19')).toBe(true);
    expect(isPastSession(p, r, 's-b', '2026-11-19')).toBe(false); // Thu 19 = today
    expect(isPastSession(p, r, 'nope', '2026-11-19')).toBe(false);
  });

  it('a session with nothing in it counts as blank', () => {
    expect(isBlankSession(newSession(0, 'pool'))).toBe(true);
    expect(isBlankSession(sess('a', 0))).toBe(false);
  });
});

describe('competitions', () => {
  it('several, sorted; the last is the one the plan file carries, also on a training plan', () => {
    const p = withCompetitions(training([[sess('a', 0)]]), [
      { id: 'b', date: '2027-03-14', name: 'Nationals' },
      { id: 'a', date: '2027-01-23', name: 'Club comp' },
    ]);
    expect(planCompetitions(p).map((c) => c.name)).toEqual(['Club comp', 'Nationals']);
    expect(p.competitionDate).toBe('2027-03-14');
    expect(buildPlanFile(p).content.competitionDate).toBe('2027-03-14');
  });

  it('an older training plan with a left-over competition date does not show one', () => {
    const p = { ...training([[sess('a', 0)]]), competitionDate: '2027-01-01' };
    expect(planCompetitions(p)).toEqual([]);
    expect(buildPlanFile(p).content.competitionDate).toBeNull();
  });

  it('an older season plan has its one competition', () => {
    const p: BuilderPlan = { ...training([]), kind: 'season', competitionDate: '2027-02-07' };
    expect(planCompetitions(p)).toEqual([{ id: 'comp-main', date: '2027-02-07', name: '' }]);
  });

  it('removing the last competition clears the date', () => {
    expect(withCompetitions(training([[]]), []).competitionDate).toBe('');
  });

  it('weeks to reach a date count from week 1 Monday', () => {
    const p = training([[]], '2026-11-25');
    expect(weekIndexOf(p, '2026-11-23')).toBe(0);
    expect(weeksToReach(p, '2026-11-29')).toBe(1);
    expect(weeksToReach(p, '2026-11-30')).toBe(2);
    expect(weeksToReach(p, '2027-03-14')).toBe(16);
  });
});

describe('a new plan', () => {
  it('starts on the next Monday, or today when it is one', () => {
    expect(nextMonday('2026-11-22')).toBe('2026-11-23');
    expect(nextMonday('2026-11-23')).toBe('2026-11-23');
    expect(nextMonday('2026-11-24')).toBe('2026-11-30');
  });
});
