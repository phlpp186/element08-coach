import { describe, expect, it } from 'vitest';
import {
  accessories,
  addExercise,
  addLocalLine,
  blankSession,
  blockDefinition,
  canRemoveLine,
  copySession,
  currentWeekIndex,
  deleteSession,
  editCovers,
  flatPhases,
  flatWeeks,
  fmtClock,
  herState,
  insertEveryWeek,
  insertSession,
  isMonday,
  isThisWeek,
  itemLine,
  nextMonday,
  parseClock,
  phoneStatus,
  removedLines,
  removedSessionsInWeek,
  removeLine,
  removeLocalLine,
  phaseOfWeek,
  reportsBySession,
  sessionMetas,
  sessionSlot,
  sessionSources,
  sessionsByDay,
  slugId,
  testValue,
  toggleRemoved,
  undoDrop,
  withSwap,
  type BlockPlan,
  type BlockSession,
  type SetsItem,
} from '../appBlock';

// A made-up two-slot block, three weeks: a test week and two training weeks.
const sess = (week: number, slot: string, label: string, day: number, lines: { ref?: string; text: string; edit?: string }[]) => ({
  id: `sc-w${String(week).padStart(2, '0')}-${slot}`,
  dayOfWeek: day,
  label,
  exercises: lines.map((l, i) => ({
    id: `sc-w${String(week).padStart(2, '0')}-${slot}-${i + 1}`,
    description: l.text,
    ...(l.ref ? { ref: l.ref } : {}),
    ...(l.edit ? { edit: l.edit } : {}),
  })),
});

const planOf = (over: Partial<BlockPlan> = {}): BlockPlan => ({
  id: 7,
  name: 'Test block',
  phases: [
    {
      weeks: [
        { weekStart: '2026-11-09', flag: 'test', plannedSessions: [sess(0, 'd0-a', 'Session A', 0, [{ text: 'Test day' }])] },
        {
          weekStart: '2026-11-16',
          plannedSessions: [
            sess(1, 'd0-a', 'Session A', 0, [
              { ref: 'squat', text: 'Squat: 3 x 5' },
              { ref: 'row', text: 'Row: 3 x 8' },
              { text: 'Easy bike 10 min' },
            ]),
            { ...sess(1, 'fl-swim', 'Easy swim', 5, [{ text: 'Swim 20 min' }]), floating: true, placed: false },
          ],
        },
      ],
    },
    {
      weeks: [
        {
          weekStart: '2026-11-23',
          plannedSessions: [
            sess(2, 'd0-a', 'Session A', 0, [
              { ref: 'squat', text: 'Squat: 3 x 5' },
              { ref: 'row', text: 'Row: 3 x 8' },
            ]),
            sess(2, 'd2-b', 'Session B', 2, [{ ref: 'plank', text: 'Plank: 3 x 30 s' }]),
          ],
        },
      ],
    },
  ],
  source: { id: 'test-block', v: 1, start: '2026-11-09' },
  ...over,
});

const item = (over: Partial<SetsItem> = {}): SetsItem => ({
  id: 'curl',
  name: 'Curl',
  measure: 'reps',
  sets: 3,
  reps: 10,
  restSec: 60,
  ...over,
});

describe('slots and scopes', () => {
  it('reads week and slot from a block session id', () => {
    expect(sessionSlot('sc-w03-d0-str')).toEqual({ week: 3, slot: 'd0-str' });
    expect(sessionSlot('c-abc')).toBeNull();
  });

  it('a slot scope covers its slot from the week on', () => {
    expect(editCovers({ slot: 'd0-a', from: 2 }, 'sc-w02-d0-a')).toBe(true);
    expect(editCovers({ slot: 'd0-a', from: 2 }, 'sc-w01-d0-a')).toBe(false);
    expect(editCovers({ slot: 'd0-a', from: 2 }, 'sc-w02-d2-b')).toBe(false);
    expect(editCovers({ session: 'sc-w01-d0-a' }, 'sc-w01-d0-a')).toBe(true);
  });

  it('numbers weeks from the test week', () => {
    const w = flatWeeks(planOf());
    expect(w.map((x) => [x.index, x.number, x.isTest])).toEqual([
      [0, 0, true],
      [1, 1, false],
      [2, 2, false],
    ]);
    const noTest = planOf();
    noTest.phases[0].weeks[0].flag = undefined;
    expect(flatWeeks(noTest)[0].number).toBe(1);
  });

  it('opens on the week today falls in', () => {
    const w = flatWeeks(planOf());
    expect(currentWeekIndex(w, '2026-11-01')).toBe(0);
    expect(currentWeekIndex(w, '2026-11-18')).toBe(1);
    expect(currentWeekIndex(w, '2027-01-01')).toBe(2);
  });

  it('keeps unplaced floating sessions out of the days', () => {
    const week = flatWeeks(planOf())[1].week;
    expect(sessionsByDay(week).map((d) => [d.day, d.sessions.map((s) => s.label)])).toEqual([[0, ['Session A']]]);
  });
});

describe('removing a line', () => {
  const plan = planOf();
  const a1 = flatWeeks(plan)[1].week.plannedSessions[0] as BlockSession;

  it('only block lines with a ref (or added ones) can go from a block session', () => {
    expect(canRemoveLine(a1, a1.exercises[0])).toBe(true);
    expect(canRemoveLine(a1, a1.exercises[2])).toBe(false);
    const mine = blankSession('c-1', 'Mine', ['Anything'], 1);
    expect(canRemoveLine(mine, mine.exercises[0])).toBe(true);
  });

  it('drops a block line from this session or from the slot on', () => {
    expect(removeLine(undefined, a1, a1.exercises[1], null)).toEqual({
      drop: [{ session: 'sc-w01-d0-a', ex: 'row' }],
    });
    expect(removeLine(undefined, a1, a1.exercises[1], 1)).toEqual({
      drop: [{ slot: 'd0-a', from: 1, ex: 'row' }],
    });
  });

  it('a slot drop takes in the narrower drops of the same exercise', () => {
    const edits = {
      drop: [
        { session: 'sc-w02-d0-a', ex: 'row' },
        { slot: 'd0-a', from: 2, ex: 'row' },
        { session: 'sc-w02-d0-a', ex: 'squat' },
      ],
    };
    expect(removeLine(edits, a1, a1.exercises[1], 1).drop).toEqual([
      { session: 'sc-w02-d0-a', ex: 'squat' },
      { slot: 'd0-a', from: 1, ex: 'row' },
    ]);
  });

  it('an add for this session alone is deleted with its drops', () => {
    const edits = {
      add: [{ session: 'sc-w01-d0-a', id: 'a1', item: item() }],
      drop: [{ session: 'sc-w01-d0-a', ex: 'squat' }],
    };
    const line = { id: 'x', description: 'Curl: 3 x 10', ref: 'curl', edit: 'a1' };
    expect(removeLine(edits, a1, line, null)).toEqual({ drop: [{ session: 'sc-w01-d0-a', ex: 'squat' }] });
  });

  it('an add for the slot is dropped here only, or deleted when removed from its first week on', () => {
    const edits = { add: [{ slot: 'd0-a', from: 1, id: 'a1', item: item() }] };
    const line = { id: 'x', description: 'Curl: 3 x 10', ref: 'curl', edit: 'a1' };
    expect(removeLine(edits, a1, line, null)).toEqual({
      add: edits.add,
      drop: [{ session: 'sc-w01-d0-a', ex: 'a1' }],
    });
    expect(removeLine(edits, a1, line, 1)).toEqual({});
    const a2 = flatWeeks(plan)[2].week.plannedSessions[0] as BlockSession;
    expect(removeLine(edits, a2, line, 2)).toEqual({
      add: edits.add,
      drop: [{ slot: 'd0-a', from: 2, ex: 'a1' }],
    });
  });

  it('undo takes that one drop back', () => {
    const edits = { drop: [{ session: 'sc-w01-d0-a', ex: 'row' }, { slot: 'd0-a', from: 1, ex: 'row' }] };
    expect(undoDrop(edits, { slot: 'd0-a', from: 1, ex: 'row' })).toEqual({
      drop: [{ session: 'sc-w01-d0-a', ex: 'row' }],
    });
  });

  it('lists what was taken out of a session, named', () => {
    const p = planOf({
      source: {
        id: 'test-block',
        edits: {
          drop: [
            { slot: 'd0-a', from: 1, ex: 'row' },
            { session: 'sc-w02-d0-a', ex: 'a1' },
            { session: 'sc-w01-d0-a', ex: 'squat' },
          ],
          add: [{ slot: 'd0-a', from: 1, id: 'a1', item: item() }],
        },
      },
    });
    expect(removedLines(p, 'sc-w02-d0-a', { row: 'Row' })).toEqual([
      { drop: { slot: 'd0-a', from: 1, ex: 'row' }, name: 'Row', fromWeek: 1 },
      { drop: { session: 'sc-w02-d0-a', ex: 'a1' }, name: 'Curl', fromWeek: null },
    ]);
  });
});

describe('adding an exercise', () => {
  const a1 = flatWeeks(planOf())[1].week.plannedSessions[0] as BlockSession;

  it('adds for this session or for the slot from the week on', () => {
    expect(addExercise(undefined, a1, 'a1', item(), null)).toEqual({
      add: [{ session: 'sc-w01-d0-a', id: 'a1', item: item() }],
    });
    expect(addExercise({ drop: [{ session: 'x', ex: 'y' }] }, a1, 'a2', item(), 1)).toEqual({
      drop: [{ session: 'x', ex: 'y' }],
      add: [{ slot: 'd0-a', from: 1, id: 'a2', item: item() }],
    });
  });

  it('writes the line she sees', () => {
    expect(itemLine(item({ rpe: '7', restSec: 90 }))).toBe('Curl: 3 x 10, RPE 7, rest 1:30');
    expect(itemLine(item({ reps: 6, repsHigh: 8, pct: [70, 75], restSec: 120, note: 'slow' }))).toBe(
      'Curl: 3 x 6-8, 70-75% e1RM, rest 2:00 (slow)',
    );
    expect(itemLine(item({ measure: 'time', reps: undefined, sec: 30, perSide: true, restSec: 0 }))).toBe(
      'Curl: 3 x 30 s per side',
    );
    expect(itemLine(item({ kg: 12.5, restSec: 45 }))).toBe('Curl: 3 x 10, 12.5 kg, rest 0:45');
  });

  it('reads and writes rest times', () => {
    expect(parseClock('1:30')).toBe(90);
    expect(parseClock('90')).toBe(90);
    expect(parseClock('45s')).toBe(45);
    expect(parseClock('1:75')).toBeNull();
    expect(parseClock('soon')).toBeNull();
    expect(fmtClock(125)).toBe('2:05');
  });

  it('makes an id from a free name', () => {
    expect(slugId('Wall sit')).toBe('wall-sit');
    expect(slugId('  Böse Übung! ')).toBe('bose-ubung');
    expect(slugId('!!!')).toBe('exercise');
  });
});

describe('deleted block sessions', () => {
  it('shows a deleted session with its label and day, from what was seen or its slot', () => {
    const before = planOf();
    const known = sessionMetas(before);
    const after = deleteSession(planOf({ source: { id: 'test-block', removed: ['sc-w02-d2-b', 'sc-w05-d0-a'] } }), 'sc-w02-d2-b');
    expect(removedSessionsInWeek(after, 2, known)).toEqual([
      { id: 'sc-w02-d2-b', label: 'Session B', dayOfWeek: 2, floating: false },
    ]);
    // Never seen here: takes the slot's label and day from another week.
    expect(removedSessionsInWeek(after, 5, sessionMetas(after))).toEqual([
      { id: 'sc-w05-d0-a', label: 'Session A', dayOfWeek: 0, floating: false },
    ]);
  });

  it('toggles an id in source.removed', () => {
    expect(toggleRemoved(['a'], 'b', true)).toEqual(['a', 'b']);
    expect(toggleRemoved(['a', 'b'], 'a', false)).toEqual(['b']);
    expect(toggleRemoved(undefined, 'a', true)).toEqual(['a']);
  });
});

describe('sessions the coach adds', () => {
  it('copies a session with fresh ids and nothing of hers', () => {
    const src: BlockSession = {
      ...(flatWeeks(planOf())[1].week.plannedSessions[0] as BlockSession),
      completedAt: '2026-11-16T10:00:00Z',
      effort: 7,
      workout: { id: 'plan:sc-w01-d0-a', name: 'Session A', blocks: [{ kind: 'sets', items: [{ id: 'squat' }] }] },
    };
    src.exercises[0] = { ...src.exercises[0], completedAt: '2026-11-16T10:00:00Z', edit: 'a9' };
    const c = copySession(src, 'c-x', 'any');
    expect(c.id).toBe('c-x');
    expect(c.completedAt).toBeNull();
    expect(c.effort).toBeUndefined();
    expect(c.floating).toBe(true);
    expect(c.placed).toBe(false);
    expect(c.workout?.id).toBe('plan:c-x');
    expect(c.exercises.map((e) => [e.id, e.completedAt, e.edit])).toEqual([
      ['c-x-1', null, undefined],
      ['c-x-2', null, undefined],
      ['c-x-3', null, undefined],
    ]);
    expect(c.exercises[0].ref).toBe('squat');
    // The original is untouched.
    expect(src.exercises[0].id).toBe('sc-w01-d0-a-1');
    expect(copySession(src, 'c-y', 3)).toMatchObject({ dayOfWeek: 3 });
    expect(copySession({ ...src, floating: true, placed: false }, 'c-z', 3).floating).toBeUndefined();
  });

  it('makes a blank session from text lines', () => {
    expect(blankSession('c-1', ' Mine ', ['Run 5 km', '', ' Stretch '], 4)).toEqual({
      id: 'c-1',
      dayOfWeek: 4,
      label: 'Mine',
      mode: 'general',
      completedAt: null,
      exercises: [
        { id: 'c-1-1', description: 'Run 5 km', completedAt: null },
        { id: 'c-1-2', description: 'Stretch', completedAt: null },
      ],
    });
  });

  it('inserts into a week and deletes again', () => {
    const s = blankSession('c-1', 'Mine', ['Run'], 1);
    const p = insertSession(planOf(), 2, s);
    expect(flatWeeks(p)[2].week.plannedSessions.map((x) => x.id)).toEqual(['sc-w02-d0-a', 'sc-w02-d2-b', 'c-1']);
    expect(flatWeeks(deleteSession(p, 'c-1'))[2].week.plannedSessions).toHaveLength(2);
  });

  it('adds and removes lines, keeping the workout in step', () => {
    const s: BlockSession = {
      ...blankSession('c-1', 'Mine', ['Warm up'], 1),
      workout: { id: 'plan:c-1', name: 'Mine', blocks: [{ kind: 'sets', items: [{ id: 'squat' }] }] },
    };
    let p = insertSession(planOf(), 1, s);
    p = addLocalLine(p, 'c-1', item({ pct: [60, 70] }), ['squat']);
    let got = flatWeeks(p)[1].week.plannedSessions.find((x) => x.id === 'c-1')!;
    expect(got.exercises[1]).toEqual({ id: 'c-1-2', description: 'Curl: 3 x 10, rest 1:00', completedAt: null, ref: 'curl' });
    expect(got.workout?.blocks).toEqual([{ kind: 'sets', items: [{ id: 'squat' }, item()] }]);
    p = removeLocalLine(p, 'c-1', 'c-1-2');
    got = flatWeeks(p)[1].week.plannedSessions.find((x) => x.id === 'c-1')!;
    expect(got.exercises).toHaveLength(1);
    expect(got.workout?.blocks).toEqual([{ kind: 'sets', items: [{ id: 'squat' }] }]);
  });
});

describe('how it works', () => {
  it('lists the accessories in the plan and those switched off', () => {
    const p = planOf({ source: { id: 'test-block', swaps: { squat: 'goblet' }, excluded: ['band'] } });
    expect(accessories(p, ['squat'])).toEqual(['row', 'plank', 'band']);
  });

  it('sets and clears one swap, keeping the others', () => {
    expect(withSwap({ squat: 'goblet', pull: 'band-pull' }, 'squat', null)).toEqual({ pull: 'band-pull' });
    expect(withSwap({ pull: 'band-pull' }, 'squat', 'goblet')).toEqual({ pull: 'band-pull', squat: 'goblet' });
  });
});

describe('her side', () => {
  const rows = [
    { exercise_id: 'sc-w01-d0-a', completed_at: '2026-11-16T09:00:00Z', rating: 7 },
    { exercise_id: 'sc-w01-d2-b', completed_at: null, rating: null },
    {
      exercise_id: '__plan',
      completed_at: null,
      updated_at: '2026-11-16T10:00:00Z',
      session: {
        kind: 'planState',
        v: 1,
        at: '2026-11-16T10:00:00Z',
        planUpdatedAt: '2026-11-15T08:00:00+00:00',
        testResults: { baseline: { squat3rm: { kg: 80, bad: 'x' } }, retest: {} },
        lifts: [{ id: 'squat', name: 'Squat', e1rm: 90, working: 70, next: 72.5 }, 'junk'],
      },
    },
  ];

  it('reads her reports by session', () => {
    const m = reportsBySession(rows);
    expect([...m.keys()]).toEqual(['sc-w01-d0-a']);
    expect(m.get('sc-w01-d0-a')).toEqual({ at: '2026-11-16T09:00:00Z', rating: 7 });
  });

  it('reads what her phone reported', () => {
    expect(herState(rows)).toEqual({
      at: '2026-11-16T10:00:00Z',
      planUpdatedAt: '2026-11-15T08:00:00+00:00',
      baseline: { squat3rm: { kg: 80 } },
      retest: {},
      lifts: [{ id: 'squat', name: 'Squat', e1rm: 90, working: 70, next: 72.5 }],
    });
    expect(herState(rows.slice(0, 2))).toBeNull();
  });

  it('says whether her phone has this version', () => {
    const s = herState(rows);
    expect(phoneStatus(s, '2026-11-15T08:00:00.000Z')).toBe('onPhone');
    expect(phoneStatus(s, '2026-11-15T09:00:00Z')).toBe('waiting');
    expect(phoneStatus(null, '2026-11-15T08:00:00Z')).toBe('none');
  });

  it('writes a test result with its unit', () => {
    const test = { id: 't', name: 'Squat 3RM', fields: [{ key: 'kg', unit: 'kg' }] };
    expect(testValue(test, { kg: 80 })).toBe('80 kg');
    expect(testValue(test, undefined)).toBeNull();
    const two = { id: 'h', name: 'Heart', fields: [{ key: 'rest', unit: 'bpm', label: 'Resting' }, { key: 'v', unit: 'ms', label: 'HRV' }] };
    expect(testValue(two, { rest: 52, v: 60 })).toBe('Resting 52 bpm · HRV 60 ms');
  });
});

describe('saving and creating', () => {
  it('stamps the definition for the web without a builder model', () => {
    const p = { ...planOf(), library: { v: 1, editedOn: 'iphone', editedAt: 'x', portal: {} } } as BlockPlan;
    const d = blockDefinition(p, { studentId: 's1', name: 'Ana' }, '2026-11-07T10:00:00Z');
    expect(d.library).toEqual({ v: 1, editedOn: 'web', editedAt: '2026-11-07T10:00:00Z' });
    expect(d.coachFor).toEqual({ studentId: 's1', name: 'Ana' });
    expect(d.phases).toBe(p.phases);
  });

  it('picks and checks the test-week Monday', () => {
    expect(nextMonday('2026-11-07')).toBe('2026-11-09');
    expect(nextMonday('2026-11-09')).toBe('2026-11-09');
    expect(isMonday('2026-11-09')).toBe(true);
    expect(isMonday('2026-11-10')).toBe(false);
    expect(isMonday('nope')).toBe(false);
  });
});

describe('phases', () => {
  it('lays the weeks out by phase with their dates', () => {
    const p = planOf();
    p.phases[0].name = 'Start';
    p.phases[1].type = 'build';
    const ph = flatPhases(p);
    expect(ph.map((x) => [x.index, x.name, x.type, x.weeks.map((w) => w.number), x.start, x.end])).toEqual([
      [0, 'Start', null, [0, 1], '2026-11-09', '2026-11-22'],
      [1, '', 'build', [2], '2026-11-23', '2026-11-29'],
    ]);
    expect(phaseOfWeek(ph, 2)).toBe(1);
    expect(phaseOfWeek(ph, 9)).toBe(0);
  });

  it('knows whether today falls in a week', () => {
    const w = flatWeeks(planOf())[1];
    expect(isThisWeek(w, '2026-11-16')).toBe(true);
    expect(isThisWeek(w, '2026-11-22')).toBe(true);
    expect(isThisWeek(w, '2026-11-23')).toBe(false);
  });
});

describe('a session in every week', () => {
  const now = Date.UTC(2026, 10, 7);
  const base = `c-${now.toString(36)}`;

  it('gives each week from the start its own copy and ids', () => {
    const src: BlockSession = {
      ...(flatWeeks(planOf())[1].week.plannedSessions[0] as BlockSession),
      workout: { id: 'plan:sc-w01-d0-a', blocks: [] },
    };
    const p = insertEveryWeek(planOf(), 1, (id) => copySession(src, id, 2), now);
    const added = flatWeeks(p).map((w) => w.week.plannedSessions.filter((s) => s.id.startsWith('c-')));
    expect(added[0]).toEqual([]);
    expect(added[1].map((s) => [s.id, s.dayOfWeek, s.workout?.id, s.exercises[0].id])).toEqual([
      [`${base}-w1`, 2, `plan:${base}-w1`, `${base}-w1-1`],
    ]);
    expect(added[2].map((s) => s.id)).toEqual([`${base}-w2`]);
    // Deleting one leaves the other weeks' copies.
    const after = deleteSession(p, `${base}-w1`);
    expect(flatWeeks(after).flatMap((w) => w.week.plannedSessions.map((s) => s.id)).filter((id) => id.startsWith('c-'))).toEqual([
      `${base}-w2`,
    ]);
  });

  it('makes blank ones of a kind, floating when any day', () => {
    const p = insertEveryWeek(planOf(), 2, (id) => blankSession(id, 'Swim', ['Easy 20 min'], 'any', 'pool'), now);
    const s = flatWeeks(p)[2].week.plannedSessions.find((x) => x.id === `${base}-w2`)!;
    expect(s).toMatchObject({ mode: 'pool', floating: true, placed: false, label: 'Swim' });
  });
});

describe('sessions to copy from', () => {
  it('one per label, this week first, dry ones first', () => {
    const p = planOf();
    const w2 = p.phases[1].weeks[0].plannedSessions;
    w2.push({ ...blankSession('sc-w02-d4-t', 'Table', ['Hold table'], 4), mode: 'dry' });
    w2.push({ ...blankSession('sc-w02-d5-p', 'session a', ['Dup by label'], 5), mode: 'pool' });
    const got = sessionSources(p, 2).map((g) => [g.mode, g.sessions.map((s) => s.id)]);
    expect(got).toEqual([
      ['dry', ['sc-w02-d4-t']],
      ['general', ['sc-w02-d0-a', 'sc-w02-d2-b', 'sc-w01-fl-swim']],
    ]);
  });
});
