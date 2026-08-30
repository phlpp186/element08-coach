/**
 * "Invalid Date", shown to a coach on every session an athlete uploaded.
 *
 * The card assumed a session date was a bare calendar date and appended
 * `T00:00:00Z` to it, which is right for a PLAN date and nonsense for the full
 * ISO instant the app actually stores:
 *
 *   '2026-06-09T17:05:00.000Z' + 'T00:00:00Z' → Invalid Date
 *
 * Run west of Greenwich, because the reason that `T00:00:00Z` exists at all is
 * a real bug in the other direction: a calendar date read in local time shows
 * the day before.
 */
process.env.TZ = 'America/Los_Angeles';

import { describe, expect, it } from 'vitest';
import { formatSessionDate } from '../sessionDate';

const DAY: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit' };

describe('a full ISO instant, which is what the app uploads', () => {
  it('formats instead of producing "Invalid Date"', () => {
    const out = formatSessionDate('2026-06-09T17:05:00.000Z', DAY, 'en-GB');
    expect(out).not.toBeNull();
    expect(out).not.toMatch(/invalid/i);
    expect(out).toBe('09/06/2026');
  });

  it('handles one with no milliseconds and one with an offset', () => {
    expect(formatSessionDate('2026-06-09T17:05:00Z', DAY, 'en-GB')).toBe('09/06/2026');
    expect(formatSessionDate('2026-06-09T19:05:00+02:00', DAY, 'en-GB')).toBe('09/06/2026');
  });
});

describe('a bare calendar date still renders as itself', () => {
  it('does not slip to the previous day west of Greenwich', () => {
    // The whole reason the UTC pinning exists. Without it this is the 16th.
    expect(formatSessionDate('2026-08-17', { day: 'numeric' }, 'en-GB')).toBe('17');
  });
});

describe('anything unusable shows nothing at all', () => {
  it('returns null rather than the words a coach should never see', () => {
    for (const junk of ['', '   ', 'not a date', '2026-13-45', undefined, null]) {
      expect(formatSessionDate(junk as string | null | undefined, DAY)).toBeNull();
    }
  });

  it('never returns a string containing "Invalid"', () => {
    const inputs = ['2026-06-09T17:05:00.000Z', '2026-08-17', 'rubbish', ''];
    for (const i of inputs) {
      const out = formatSessionDate(i, DAY);
      if (out !== null) expect(out).not.toMatch(/invalid/i);
    }
  });
});
