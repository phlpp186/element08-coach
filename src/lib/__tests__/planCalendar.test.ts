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
  dayOrder,
  deleteWeek,
  findSession,
  insertWeek,
  isBlankSession,
  isPastSession,
  keepBoth,
  linkedDays,
  moveSession,
  nextMonday,
  patchSession,
  phaseFrom,
  placeSession,
  planCompetitions,
  sessionDate,
  startShiftWeeks,
  suggestPhases,
  syncLinked,
  toggleLinkedDay,
  weekIndexOf,
  weekStarted,
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

  it('a week has started from its first day; week 1 from the start date', () => {
    // Inserting before or deleting a started week would shift reported
    // sessions by a week (Sarang's plan, 2026-11-22), so the menu locks both.
    const p = training([[], [], []], '2026-11-11'); // a Wednesday
    expect(weekStarted(p, 0, '2026-11-10')).toBe(false); // Tue before the start
    expect(weekStarted(p, 0, '2026-11-11')).toBe(true);
    expect(weekStarted(p, 1, '2026-11-15')).toBe(false); // Sun before week 2
    expect(weekStarted(p, 1, '2026-11-16')).toBe(true); // its Monday = today
    expect(weekStarted(p, 2, '2026-11-22')).toBe(false);
    expect(weekStarted({ startDate: '' }, 0, '2026-11-22')).toBe(false);
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

  it('a day reorders: a session goes before another, or last, and keeps its id', () => {
    // Philipp, 2026-11-22. The athlete's app lists a day in this order.
    const day = () => calWeeks(training([[sess('a', 2), sess('x', 4), sess('b', 2), sess('c', 2)]]));
    expect(dayOrder(day(), 0, 2)).toEqual(['s-a', 's-b', 's-c']);
    expect(dayOrder(placeSession(day(), 's-c', 0, 2, 's-a'), 0, 2)).toEqual(['s-c', 's-a', 's-b']);
    expect(dayOrder(placeSession(day(), 's-a', 0, 2, null), 0, 2)).toEqual(['s-b', 's-c', 's-a']);
    expect(dayOrder(placeSession(day(), 's-b', 0, 2, 's-b'), 0, 2)).toEqual(['s-a', 's-b', 's-c']);
    expect(dayOrder(placeSession(day(), 's-c', 0, 2, 's-a'), 0, 4)).toEqual(['s-x']);
  });

  it('"keep it on the old day too" keeps both places in their days', () => {
    const rows = calWeeks(training([[sess('a', 0), sess('b', 0)], [sess('c', 3), sess('d', 3)]]));
    const moved = placeSession(rows, 's-a', 1, 3, 's-d');
    const r = keepBoth(moved, 's-a', { week: 0, day: 0, before: 's-b' }, { week: 1, day: 3 });
    expect(dayOrder(r, 0, 0)).toEqual(['s-a', 's-b']);
    const day = dayOrder(r, 1, 3);
    expect([day[0], day[2]]).toEqual(['s-c', 's-d']);
    expect(day[1]).not.toBe('s-a');
  });

  it('a session moved or copied to another day lands where it was dropped', () => {
    const rows = () => calWeeks(training([[sess('a', 0)], [sess('b', 3), sess('c', 3)]]));
    const moved = placeSession(rows(), 's-a', 1, 3, 's-c');
    expect(dayOrder(moved, 1, 3)).toEqual(['s-b', 's-a', 's-c']);
    expect(findSession(moved, 's-a')).toMatchObject({ week: 1, session: { dayOfWeek: 3 } });
    const copied = copySessionTo(rows(), 's-a', 1, 3, 's-b');
    expect(dayOrder(copied, 1, 3)).toHaveLength(3);
    expect(dayOrder(copied, 1, 3).slice(1)).toEqual(['s-b', 's-c']);
    expect(findSession(copied, 's-a')!.week).toBe(0);
  });

  it('a session with nothing in it counts as blank', () => {
    expect(isBlankSession(newSession(0, 'pool'))).toBe(true);
    expect(isBlankSession(sess('a', 0))).toBe(false);
  });
});

describe('the week order the app gets (Entrenamiento Gonzalo, 2026-11-24)', () => {
  it('is Monday to Sunday, whatever order the sessions were added in', () => {
    // Monday's session was added last: the app showed it after Friday.
    const p = training([[sess('tue', 1), sess('wed', 2), sess('thu', 3), sess('fri', 4), sess('mon', 0)]]);
    const week = buildPlanFile(p).content.phases[0].weeks[0];
    expect(week.plannedSessions.map((x) => x.dayOfWeek)).toEqual([0, 1, 2, 3, 4]);
    expect(week.plannedSessions[0].id).toBe('s-mon');
  });

  it('keeps the coach’s order within a day', () => {
    const p = training([[sess('b', 2), sess('x', 0), sess('a', 2), sess('c', 2)]]);
    const ids = buildPlanFile(p).content.phases[0].weeks[0].plannedSessions.map((x) => x.id);
    expect(ids).toEqual(['s-x', 's-b', 's-a', 's-c']);
  });
});

describe('one session on several days (Philipp, 2026-11-22)', () => {
  const rows = () => calWeeks(training([[sess('a', 0)], []]));
  const start = { anchor: 's-a', ids: [] as string[] };

  it('a day it is not on gets a copy of its own; clicking that day again takes it off', () => {
    let r = toggleLinkedDay(rows(), start, 2);
    r = toggleLinkedDay(r.rows, r.link, 4);
    expect(linkedDays(r.rows, r.link)).toEqual([0, 2, 4]);
    const ids = r.rows[0].week.sessions.map((s) => s.id);
    expect(new Set(ids).size).toBe(3);
    expect(r.rows[0].week.sessions.every((s) => s.label === 'a')).toBe(true);
    const off = toggleLinkedDay(r.rows, r.link, 2);
    expect(linkedDays(off.rows, off.link)).toEqual([0, 4]);
    expect(off.rows[0].week.sessions).toHaveLength(2);
  });

  it('its own day: the session takes its first copy\'s place, and one day always stays', () => {
    const r = toggleLinkedDay(rows(), start, 3);
    const moved = toggleLinkedDay(r.rows, r.link, 0);
    expect(linkedDays(moved.rows, moved.link)).toEqual([3]);
    expect(findSession(moved.rows, 's-a')).toMatchObject({ week: 0, session: { dayOfWeek: 3 } });
    expect(moved.rows[0].week.sessions).toHaveLength(1);
    expect(toggleLinkedDay(moved.rows, moved.link, 3).rows).toBe(moved.rows);
  });

  it('an edit goes to every linked day, each keeping its own ids and day', () => {
    const r = toggleLinkedDay(rows(), start, 1);
    const copyId = r.link.ids[0];
    const copyExId = findSession(r.rows, copyId)!.session.exercises[0].id;
    const edited = syncLinked(patchSession(r.rows, 's-a', { label: 'Gym', exercises: [{ id: 'e-a', description: 'Squat 3x5' }, { id: 'e-new', description: 'Plank' }] }), r.link);
    const copy = findSession(edited, copyId)!.session;
    expect(copy).toMatchObject({ id: copyId, dayOfWeek: 1, label: 'Gym' });
    expect(copy.exercises.map((e) => e.description)).toEqual(['Squat 3x5', 'Plank']);
    expect(copy.exercises[0].id).toBe(copyExId);
    expect(copy.exercises[1].id).not.toBe('e-new');
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

describe('moving the start date', () => {
  it('moves sessions by whole weeks; a new start in the same week moves nothing', () => {
    // The calendar warns when this is not 0 on a plan athletes already train on.
    expect(startShiftWeeks('2026-11-16', '2026-11-18')).toBe(0);
    expect(startShiftWeeks('2026-11-16', '2026-11-23')).toBe(1);
    expect(startShiftWeeks('2026-11-18', '2026-11-02')).toBe(-2);
    expect(startShiftWeeks('', '2026-11-02')).toBe(0);
  });
});

describe('a new plan', () => {
  it('starts on the next Monday, or today when it is one', () => {
    expect(nextMonday('2026-11-22')).toBe('2026-11-23');
    expect(nextMonday('2026-11-23')).toBe('2026-11-23');
    expect(nextMonday('2026-11-24')).toBe('2026-11-30');
  });
});
