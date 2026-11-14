import { describe, expect, it } from 'vitest';
import {
  buildCycleCells,
  cycleFetchSince,
  cycleSummary,
  cycleWindowStart,
  foldSessions,
  type CycleDay,
} from '../cycleView';

const day = (date: string, p: Partial<CycleDay> = {}): CycleDay => ({
  date,
  period: false,
  symptoms: [],
  note: null,
  felt: null,
  ...p,
});

// 2026-11-14 is a Saturday.
const TODAY = '2026-11-14';

describe('cycle window', () => {
  it('starts on the Monday four weeks before this week', () => {
    expect(cycleWindowStart(TODAY)).toBe('2026-10-12');
    expect(cycleWindowStart('2026-11-09')).toBe('2026-10-12'); // a Monday
    expect(cycleWindowStart('2026-11-15')).toBe('2026-10-12'); // a Sunday
  });
  it('fetches 60 days before the window', () => {
    expect(cycleFetchSince(TODAY)).toBe('2026-08-13');
  });
});

describe('buildCycleCells', () => {
  const days = [
    day('2026-10-14', { period: true }),
    day('2026-10-15', { period: true }),
    day('2026-11-10', { period: true }),
    day('2026-11-11', { period: true, felt: 1 }),
  ];
  const cells = buildCycleCells(days, [{ date: '2026-11-11', label: 'STA', effort: 7, count: 1 }], TODAY);
  const at = (k: string) => cells.find((c) => c.key === k)!;

  it('covers 35 days and marks the future', () => {
    expect(cells).toHaveLength(35);
    expect(cells[0].key).toBe('2026-10-12');
    expect(at(TODAY).future).toBe(false);
    expect(at('2026-11-15').future).toBe(true);
  });
  it('counts cycle days from logged period starts only', () => {
    expect(at('2026-10-13').cycleDay).toBeNull(); // before any logged start
    expect(at('2026-10-14').cycleDay).toBe(1);
    expect(at('2026-10-15').cycleDay).toBe(2); // second period day is not a start
    expect(at('2026-11-09').cycleDay).toBe(27);
    expect(at('2026-11-10').cycleDay).toBe(1);
    expect(at(TODAY).cycleDay).toBe(5);
  });
  it('numbers the window from a start logged before it', () => {
    const c = buildCycleCells([day('2026-10-05', { period: true })], [], TODAY);
    expect(c[0].cycleDay).toBe(8);
  });
  it('attaches the shared day and the session', () => {
    expect(at('2026-11-11').day?.felt).toBe(1);
    expect(at('2026-11-11').session?.label).toBe('STA');
  });
  it('summarises starts, length and harder days', () => {
    expect(cycleSummary(days, cells, TODAY)).toEqual({
      lastStart: '2026-11-10',
      cycleLength: 27,
      sessionDays: 1,
      harderDays: 1,
    });
  });
  it('has no length with a single logged period', () => {
    const one = [day('2026-11-10', { period: true })];
    expect(cycleSummary(one, buildCycleCells(one, [], TODAY), TODAY).cycleLength).toBeNull();
  });
});

describe('foldSessions', () => {
  it('keeps one entry per day, named by the hardest session', () => {
    expect(
      foldSessions([
        { date: '2026-11-11', label: 'CO2 table', effort: 5 },
        { date: '2026-11-11', label: 'STA', effort: 8 },
        { date: '2026-11-09', label: 'DYN', effort: null },
      ]),
    ).toEqual([
      { date: '2026-11-09', label: 'DYN', effort: null, count: 1 },
      { date: '2026-11-11', label: 'STA', effort: 8, count: 2 },
    ]);
  });
});
