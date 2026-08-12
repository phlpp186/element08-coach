import { describe, it, expect } from 'vitest';
import {
  buildAthleteBilling,
  buildLedger,
  daysBetween,
  formatMoney,
  ledgerTotals,
  monthKey,
  todayISO,
  type BillingTerms,
  type PaymentRow,
} from '../billing';

const terms = (over: Partial<BillingTerms> = {}): BillingTerms => ({
  studentId: 'a1',
  amountCents: 12000, // €120.00
  currency: 'EUR',
  dueDay: 1,
  startedOn: '2026-05-01',
  endedOn: null,
  ...over,
});

const paid = (period: string, on: string, studentId = 'a1'): PaymentRow => ({
  studentId,
  period,
  amountCents: 12000,
  currency: 'EUR',
  paidOn: on,
});

describe('buildAthleteBilling', () => {
  it('bills every month from the start date up to and including this one', () => {
    const b = buildAthleteBilling(terms(), [], '2026-08-09');
    expect(b.months.map((m) => m.period)).toEqual([
      '2026-05-01',
      '2026-06-01',
      '2026-07-01',
      '2026-08-01',
    ]);
  });

  it('counts a month as overdue only once its due date has passed', () => {
    // Due on the 10th; on the 9th it is outstanding but NOT late.
    const b = buildAthleteBilling(terms({ dueDay: 10, startedOn: '2026-08-01' }), [], '2026-08-09');
    expect(b.months).toHaveLength(1);
    expect(b.months[0].paid).toBeNull();
    expect(b.months[0].daysOverdue).toBe(0);
    expect(b.overdueCents).toBe(0);

    const later = buildAthleteBilling(
      terms({ dueDay: 10, startedOn: '2026-08-01' }),
      [],
      '2026-08-15',
    );
    expect(later.months[0].daysOverdue).toBe(5);
    expect(later.overdueCents).toBe(12000);
  });

  it('settles paid months and leaves the gaps outstanding', () => {
    const b = buildAthleteBilling(
      terms(),
      [paid('2026-05-01', '2026-05-02'), paid('2026-07-01', '2026-07-03')],
      '2026-08-09',
    );
    // June and August are unpaid; only June is late (August is due on the 1st…)
    expect(b.months.filter((m) => m.paid).map((m) => m.period)).toEqual([
      '2026-05-01',
      '2026-07-01',
    ]);
    expect(b.overdueCount).toBe(2); // June, and August (due the 1st, today is the 9th)
    expect(b.overdueCents).toBe(24000);
    expect(b.maxDaysOverdue).toBe(daysBetween('2026-06-01', '2026-08-09'));
  });

  it('matches a payment by its month, not the day it arrived', () => {
    // Paid on the 3rd of the following month, recorded against July.
    const b = buildAthleteBilling(terms(), [paid('2026-07-15', '2026-08-03')], '2026-07-20');
    const july = b.months.find((m) => m.period === '2026-07-01')!;
    expect(july.paid).not.toBeNull();
  });

  it('stops billing after the arrangement ends, keeping the history', () => {
    const b = buildAthleteBilling(terms({ endedOn: '2026-06-30' }), [], '2026-08-09');
    expect(b.months.map((m) => m.period)).toEqual(['2026-05-01', '2026-06-01']);
    expect(b.nextDueOn).toBeNull();
  });

  it('owes nothing when the arrangement starts in the future', () => {
    const b = buildAthleteBilling(terms({ startedOn: '2026-12-01' }), [], '2026-08-09');
    expect(b.months).toEqual([]);
    expect(b.overdueCents).toBe(0);
  });

  it('rolls next-due into the following month once everything is settled', () => {
    const b = buildAthleteBilling(
      terms({ dueDay: 5, startedOn: '2026-08-01' }),
      [paid('2026-08-01', '2026-08-04')],
      '2026-08-09',
    );
    expect(b.overdueCount).toBe(0);
    expect(b.nextDueOn).toBe('2026-09-05');
  });

  it('ignores another athlete’s payments', () => {
    const b = buildAthleteBilling(terms(), [paid('2026-05-01', '2026-05-02', 'someone-else')], '2026-05-09');
    expect(b.months[0].paid).toBeNull();
  });

  it('crosses a year boundary without losing a month', () => {
    const b = buildAthleteBilling(terms({ startedOn: '2025-11-01' }), [], '2026-01-15');
    expect(b.months.map((m) => m.period)).toEqual(['2025-11-01', '2025-12-01', '2026-01-01']);
  });
});

describe('buildLedger', () => {
  it('puts the worst debt first, so a coach sees the problem on open', () => {
    const roster: BillingTerms[] = [
      terms({ studentId: 'ok', startedOn: '2026-08-01' }),
      terms({ studentId: 'late-a-bit', startedOn: '2026-07-01' }),
      terms({ studentId: 'late-a-lot', startedOn: '2026-05-01' }),
    ];
    const pays = [paid('2026-08-01', '2026-08-02', 'ok')];
    const ledger = buildLedger(roster, pays, '2026-08-09');
    expect(ledger.map((a) => a.studentId)).toEqual(['late-a-lot', 'late-a-bit', 'ok']);
  });

  it('totals only live arrangements for the monthly figure', () => {
    const ledger = buildLedger(
      [terms({ studentId: 'a' }), terms({ studentId: 'b', endedOn: '2026-06-30' })],
      [],
      '2026-08-09',
    );
    expect(ledgerTotals(ledger).monthCents).toBe(12000);
    expect(ledgerTotals(ledger).overdueAthletes).toBe(2);
  });
});

describe('helpers', () => {
  it('normalises any date to its month key', () => {
    expect(monthKey('2026-08-31')).toBe('2026-08-01');
  });

  it('counts days across a daylight-saving boundary correctly', () => {
    // Europe/Berlin springs forward on 2026-03-29.
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
  });

  it('formats money from cents', () => {
    expect(formatMoney(12000, 'EUR', 'de-DE')).toContain('120');
    // Intl handles any well-formed 3-letter code, known or not — it prints the
    // code rather than a symbol. The schema constrains currency to 3 chars, so
    // this is the normal path for anything unusual.
    // Normalise the separator: Intl puts a NON-BREAKING space between the code
    // and the number, which is invisible in a diff and would make this assertion
    // a puzzle for the next person.
    expect(formatMoney(4990, 'XYZ').replace(/\u00a0/g, ' ')).toBe('XYZ 49.90');
  });

  it('falls back instead of throwing inside a render on a malformed code', () => {
    // Intl throws RangeError for anything that is not 3 letters. Old or
    // hand-edited data must not take the page down.
    expect(formatMoney(4990, 'EU')).toBe('49.90 EU');
  });

  it('reads today in local time, not UTC', () => {
    // 00:30 local on the 9th is still the 8th in UTC; the ledger must say the 9th.
    expect(todayISO(new Date(2026, 7, 9, 0, 30))).toBe('2026-08-09');
  });
});
