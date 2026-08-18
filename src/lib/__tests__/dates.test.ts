/**
 * The date bugs an Australian coach hit on 2026-08-18: a season plan started on
 * Monday 17 August drew its week as "Mon 16", every weekday one day off.
 *
 * Two independent off-by-ones, at the two edges where a bare calendar date meets
 * a real instant. Everything in between (addDays, mondayOf, dowOf) is UTC and
 * was never wrong.
 */
process.env.TZ = 'America/Los_Angeles'; // west of Greenwich: the display case

import { describe, expect, it, vi, afterEach } from 'vitest';
import { addDays, calendarFormat, dowOf, formatIso, mondayOf, todayIso } from '../e08plan';

const DAY = calendarFormat({ day: 'numeric' });

describe('calendar dates render as themselves, in any time zone', () => {
  it('shows the day that was stored, not the day before it', () => {
    // The naive version — the same formatter without timeZone: 'UTC' — is what
    // shipped, and it is wrong here by exactly one day.
    const naive = new Intl.DateTimeFormat(undefined, { day: 'numeric' });
    expect(naive.format(new Date('2026-08-17T00:00:00Z'))).toBe('16');
    expect(formatIso(DAY, '2026-08-17')).toBe('17');
  });

  it('keeps a whole week of dates under their own weekday labels', () => {
    const monday = mondayOf('2026-08-17'); // already a Monday
    expect(monday).toBe('2026-08-17');
    expect(dowOf(monday)).toBe(0); // 0 = Mon
    const week = [0, 1, 2, 3, 4, 5, 6].map((d) => formatIso(DAY, addDays(monday, d)));
    expect(week).toEqual(['17', '18', '19', '20', '21', '22', '23']);
  });
});

describe("today is the coach's own calendar day", () => {
  afterEach(() => vi.useRealTimers());

  it('does not roll back over the date line in a UTC+ zone', () => {
    // 08:00 Monday 17 August in Sydney is still Sunday the 16th in UTC, and a
    // new plan used to default to STARTING on the 16th — which, snapped to its
    // Monday, put the whole season in the week before the one intended.
    process.env.TZ = 'Australia/Sydney';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-16T22:00:00Z')); // = Mon 17th, 08:00 AEST
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-08-16'); // the old answer
    expect(todayIso()).toBe('2026-08-17');
    expect(mondayOf(todayIso())).toBe('2026-08-17');
  });

  it('does not run ahead in a UTC- zone either', () => {
    process.env.TZ = 'America/Los_Angeles';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-18T02:00:00Z')); // = Mon 17th, 19:00 PDT
    expect(todayIso()).toBe('2026-08-17');
  });
});
