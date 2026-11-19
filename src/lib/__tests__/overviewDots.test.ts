import { describe, expect, it } from 'vitest';
import { athleteDots, dotColumns, dotSummary, type DotCompletion, type DotPlan } from '../overviewDots';

const TODAY = '2026-11-19'; // a Thursday; its Monday is 2026-11-16

/** Weeks from 2026-10-26, sessions Mon / Wed / Sat with ids like w1d0. */
function def(weeks: number, startDate = '2026-10-26') {
  const mondays = ['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'];
  return {
    startDate,
    phases: [
      {
        weeks: mondays.slice(0, weeks).map((weekStart, w) => ({
          weekStart,
          plannedSessions: [0, 2, 5].map((d) => ({
            id: `w${w + 1}d${d}`,
            dayOfWeek: d,
            label: `S${w + 1}.${d}`,
            exercises: [{ id: `w${w + 1}d${d}-e1` }, { id: `w${w + 1}d${d}-e2` }],
          })),
        })),
      },
    ],
  };
}
const done = (id: string, day: string, rating: number | null = null): DotCompletion => ({
  exercise_id: id,
  completed_at: `${day}T12:00:00`,
  rating,
});
const plan = (completions: DotCompletion[], over: Partial<DotPlan> = {}): DotPlan => ({
  title: 'Pool block',
  def: def(6),
  active: true,
  completions,
  ...over,
});
const kindOf = (dots: ReturnType<typeof athleteDots>, label: string) => dots.find((d) => d.label === label)?.kind;

describe('athleteDots', () => {
  it('puts a reported session on the day it was done, coloured by effort', () => {
    const dots = athleteDots([plan([done('w1d0', '2026-10-28', 8), done('w1d2', '2026-10-28', 9), done('w1d5', '2026-10-31')])], TODAY);
    const s = (l: string) => dots.find((d) => d.label === l)!;
    expect([s('S1.0').day, s('S1.0').planned, s('S1.0').kind]).toEqual(['2026-10-28', '2026-10-26', 'hard']);
    expect(s('S1.2').kind).toBe('max');
    expect(s('S1.5').kind).toBe('done');
  });

  it('never calls an unreported session missed: open inside the grace, no report after it, planned ahead', () => {
    const dots = athleteDots([plan([])], TODAY);
    expect(kindOf(dots, 'S3.5')).toBe('noReport'); // Sat 14 Nov, five days ago
    expect(kindOf(dots, 'S4.0')).toBe('open'); // Mon 16 Nov, three days ago
    expect(kindOf(dots, 'S4.2')).toBe('open'); // Wed 18 Nov
    expect(kindOf(dots, 'S4.5')).toBe('planned'); // Sat 21 Nov
  });

  it('shows a "not done" answer as its own state on the planned day', () => {
    const dots = athleteDots(
      [plan([{ exercise_id: 'w1d2', completed_at: null, not_done_at: '2026-10-29T08:00:00' }])],
      TODAY,
    );
    const d = dots.find((x) => x.label === 'S1.2')!;
    expect([d.kind, d.day]).toEqual(['notDone', '2026-10-28']);
  });

  it('counts a report filed per exercise (older app builds) for its session', () => {
    const dots = athleteDots([plan([done('w2d0-e1', '2026-11-02', 5), done('w2d0-e2', '2026-11-03', 7)])], TODAY);
    const d = dots.find((x) => x.label === 'S2.0')!;
    expect([d.kind, d.day]).toEqual(['hard', '2026-11-03']);
  });

  it('keeps only what was reported on a plan the athlete no longer has', () => {
    const dots = athleteDots([plan([done('w1d0', '2026-10-26', 5)], { active: false })], TODAY);
    expect(dots.map((d) => d.label)).toEqual(['S1.0']);
  });

  it('leaves out the days of the first week before the plan starts', () => {
    const dots = athleteDots([plan([], { def: def(1, '2026-10-28') })], TODAY);
    expect(dots.map((d) => d.label)).toEqual(['S1.2', 'S1.5']);
  });

  it('merges several plans in day order', () => {
    const dots = athleteDots(
      [plan([done('w1d0', '2026-10-27')], { title: 'Old', active: false }), plan([], { title: 'New', def: def(1) })],
      TODAY,
    );
    expect(dots.map((d) => d.plan)).toEqual(['New', 'Old', 'New', 'New']);
  });
});

describe('dotSummary', () => {
  it('counts the last four weeks and says how far the plan reaches', () => {
    const dots = athleteDots(
      [plan([done('w1d0', '2026-10-26', 6), done('w2d0', '2026-11-02', 6), done('w4d0', '2026-11-17', 6)])],
      TODAY,
    );
    const s = dotSummary(dots, TODAY);
    // Due up to today: weeks 1 to 3 (9 sessions) and Mon + Wed of week 4.
    expect(s.due).toBe(11);
    expect(s.done).toBe(3);
    expect(s.noReport).toBe(7);
    expect(s.plannedUntil).toBe('2026-12-05');
    expect(s.weeksAhead).toBe(3);
  });
  it('reports nothing ahead for a plan that is over', () => {
    const s = dotSummary(athleteDots([plan([], { def: def(3) })], TODAY), TODAY);
    expect([s.plannedUntil, s.weeksAhead]).toEqual([null, 0]);
  });
});

describe('dotColumns', () => {
  it('sorts dots into day columns and drops the ones outside the window', () => {
    const dots = athleteDots([plan([done('w3d0', '2026-11-09'), done('w3d2', '2026-11-09')])], TODAY);
    const cols = dotColumns(dots, '2026-11-09', 7);
    expect(cols).toHaveLength(7);
    expect(cols[0]).toHaveLength(2);
    expect(cols[5].map((d) => d.kind)).toEqual(['noReport']);
  });
});
