import { describe, expect, it } from 'vitest';
import { buildDigest, matchesFilter, sessionBars, sessionBests, sessionPBs } from '../activityDigest';
import { isNewFor } from '../completionsSeen';
import type { FeedEntry } from '../activity';

const depth = {
  mode: 'depth',
  dives: [
    { discipline: 'FIM', depth: 30 },
    { discipline: 'FIM', depth: 42 },
    { discipline: 'CWT', depth: 50, diveType: 'excluded' },
    { discipline: 'CWT', depth: 35 },
  ],
};
const pool = {
  mode: 'pool',
  dives: [
    { discipline: 'DYN', distance: 75 },
    { discipline: 'STA', diveTime: 300 },
    { discipline: 'DNF', distance: 50 },
  ],
};
const dry = { mode: 'dry', blockTimeline: [{ type: 'Rest', seconds: 120 }, { type: 'Hold', seconds: 150 }, { type: 'Hold', seconds: 212 }] };

describe('sessionBests', () => {
  it('takes the best per discipline with the app rules, skipping excluded dives', () => {
    expect(sessionBests(depth)).toEqual([
      { discipline: 'FIM', unit: 'm', value: 42 },
      { discipline: 'CWT', unit: 'm', value: 35 },
    ]);
    expect(sessionBests(pool)).toEqual([
      { discipline: 'DYN', unit: 'm', value: 75 },
      { discipline: 'STA', unit: 's', value: 300 },
      { discipline: 'DNF', unit: 'm', value: 50 },
    ]);
  });
  it('does not count dry holds or junk', () => {
    expect(sessionBests(dry)).toEqual([]);
    expect(sessionBests(null)).toEqual([]);
  });
});

describe('sessionPBs', () => {
  it('reports the disciplines that reach the current PB', () => {
    const pbs = [
      { discipline: 'FIM', unit: 'm' as const, value: 42 },
      { discipline: 'CWT', unit: 'm' as const, value: 60 },
    ];
    expect(sessionPBs(depth, pbs).map((b) => b.discipline)).toEqual(['FIM']);
    expect(sessionPBs(depth, [])).toEqual([]);
  });
});

describe('sessionBars', () => {
  it('draws one bar per dive or hold', () => {
    expect(sessionBars(depth)).toEqual({ mode: 'depth', values: [30, 42, 35] });
    expect(sessionBars(pool)).toEqual({ mode: 'pool', values: [75, 300, 50] });
    expect(sessionBars(dry)).toEqual({ mode: 'dry', values: [150, 212] });
    expect(sessionBars({ mode: 'depth', dives: [] })).toBeNull();
    expect(sessionBars({ mode: 'other' })).toBeNull();
  });
});

const NOW = Date.parse('2026-10-24T12:00:00Z');
const hAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const entry = (id: string, at: string, more: Partial<FeedEntry> = {}): FeedEntry => ({
  id,
  assignmentId: 'a',
  planId: 'p',
  planTitle: 'Plan',
  studentId: 's1',
  studentName: 'Lena',
  sessionId: id,
  sessionLabel: null,
  week: null,
  at,
  kind: 'completed',
  rating: null,
  remarks: null,
  session: null,
  ...more,
});

describe('buildDigest', () => {
  const feed = [
    entry('e1', hAgo(2), { session: depth, rating: 8 }),
    entry('e2', hAgo(5), { remarks: 'Tired legs' }),
    entry('e3', hAgo(24 * 3), { rating: 9, session: { mode: 'dry', blockTimeline: [{ type: 'Hold', seconds: 90, note: 'ok' }] } }),
    entry('e4', hAgo(24 * 10), { rating: 9 }),
  ];
  const pbsByStudent = new Map([['s1', [{ discipline: 'FIM', unit: 'm' as const, value: 42 }]]]);

  it('covers what is new since the seen stamp', () => {
    const seen = { at: hAgo(6), ids: {} };
    const d = buildDigest({ feed, pbsByStudent, isNew: (e) => isNewFor(seen, e.id, e.at), nowMs: NOW });
    expect(d.scope).toBe('new');
    expect(d.pbs.map((p) => p.entry.id)).toEqual(['e1']);
    expect(d.remarks.map((e) => e.id)).toEqual(['e2']);
    expect(d.hard.map((e) => e.id)).toEqual(['e1']);
  });

  it('falls back to the last 7 days when nothing is new', () => {
    const d = buildDigest({ feed, pbsByStudent, isNew: () => false, nowMs: NOW });
    expect(d.scope).toBe('week');
    expect(d.remarks.map((e) => e.id)).toEqual(['e2', 'e3']);
    expect(d.hard.map((e) => e.id)).toEqual(['e1', 'e3']);
  });

  it('filters the feed', () => {
    const isNew = (e: FeedEntry) => e.id === 'e1';
    const ids = (f: Parameters<typeof matchesFilter>[1]) => feed.filter((e) => matchesFilter(e, f, isNew)).map((e) => e.id);
    expect(ids('all')).toEqual(['e1', 'e2', 'e3', 'e4']);
    expect(ids('new')).toEqual(['e1']);
    expect(ids('remarks')).toEqual(['e2', 'e3']);
    expect(ids('hard')).toEqual(['e1', 'e3', 'e4']);
  });
});

describe('isNewFor', () => {
  it('honours the stamp and single marks, and an edit after a mark is new again', () => {
    const seen = { at: hAgo(10), ids: { e2: hAgo(5) } };
    expect(isNewFor(seen, 'e1', hAgo(12))).toBe(false);
    expect(isNewFor(seen, 'e1', hAgo(2))).toBe(true);
    expect(isNewFor(seen, 'e2', hAgo(5))).toBe(false);
    expect(isNewFor(seen, 'e2', hAgo(1))).toBe(true);
    expect(isNewFor({ at: '', ids: {} }, 'e9', hAgo(400))).toBe(true);
  });
});
