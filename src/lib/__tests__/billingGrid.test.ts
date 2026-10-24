import { describe, expect, it } from 'vitest';
import {
  billingCsv,
  buildAthleteBilling,
  buildLedger,
  cellFor,
  monthWindow,
  overdueMonths,
  periodTotals,
  type BillingTerms,
  type PaymentRow,
} from '../billing';

const TODAY = '2026-08-12';
const lena: BillingTerms = { studentId: 'a1', amountCents: 12000, currency: 'EUR', dueDay: 1, startedOn: '2026-05-01', endedOn: null };
const marco: BillingTerms = { studentId: 'a2', amountCents: 9000, currency: 'EUR', dueDay: 15, startedOn: '2026-07-01', endedOn: null };
const pay = (studentId: string, period: string, paidOn: string, amountCents: number): PaymentRow => ({
  studentId,
  period,
  amountCents,
  currency: 'EUR',
  paidOn,
});
const payments = [pay('a1', '2026-05-01', '2026-05-02', 12000), pay('a1', '2026-07-01', '2026-07-03', 12000), pay('a2', '2026-07-01', '2026-07-20', 9000)];

describe('monthWindow', () => {
  it('lists n months ending at the given one, across a year boundary', () => {
    expect(monthWindow('2026-02-17', 4)).toEqual(['2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01']);
  });
});

describe('cellFor', () => {
  it('tells paid, overdue, open and not billed apart', () => {
    const b = buildAthleteBilling(lena, payments, TODAY);
    expect(cellFor(b, '2026-05-01').state).toBe('paid');
    expect(cellFor(b, '2026-06-01').state).toBe('overdue');
    expect(cellFor(b, '2026-04-01').state).toBe('none');
    expect(cellFor(b, '2026-09-01').state).toBe('none');
    const m = buildAthleteBilling(marco, payments, TODAY);
    expect(cellFor(m, '2026-08-01').state).toBe('open'); // due the 15th
  });
});

describe('periodTotals', () => {
  it('sums owed and paid per month', () => {
    const ledger = buildLedger([lena, marco], payments, TODAY);
    expect(periodTotals(ledger, ['2026-06-01', '2026-07-01', '2026-08-01'])).toEqual([
      { owedCents: 12000, paidCents: 0 },
      { owedCents: 21000, paidCents: 21000 },
      { owedCents: 21000, paidCents: 0 },
    ]);
  });
});

describe('overdueMonths', () => {
  it('lists only months past their due date and unpaid', () => {
    const b = buildAthleteBilling(lena, payments, TODAY);
    expect(overdueMonths(b).map((m) => m.period)).toEqual(['2026-06-01', '2026-08-01']);
  });
});

describe('billingCsv', () => {
  it('writes one line per billed month, names sorted, quoting when needed', () => {
    const ledger = buildLedger([lena, marco], payments, TODAY);
    const names: Record<string, string> = { a1: 'Lena, the "fish"', a2: 'Marco' };
    const lines = billingCsv(ledger, (id) => names[id]).trim().split('\n');
    expect(lines[0]).toBe('Athlete,Month,Amount,Currency,Due,Status,Paid on');
    expect(lines[1]).toBe('"Lena, the ""fish""",2026-05,120.00,EUR,2026-05-01,paid,2026-05-02');
    expect(lines[2]).toBe('"Lena, the ""fish""",2026-06,120.00,EUR,2026-06-01,overdue,');
    expect(lines.filter((l) => l.startsWith('Marco'))).toEqual([
      'Marco,2026-07,90.00,EUR,2026-07-15,paid,2026-07-20',
      'Marco,2026-08,90.00,EUR,2026-08-15,open,',
    ]);
  });
});
