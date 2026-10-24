/** Dev-only harness for the billing page: the real BillingBody and billing
 *  arithmetic over a fixed fake roster held in memory, no Supabase. Ticking a
 *  month, undoing it and editing a fee all work against that local state. Not
 *  routed in a build. */
import { useMemo, useState } from 'react';
import { BillingBody, type BillingActions } from '../views/BillingView';
import { addMonths, monthKey, todayISO, type BillingTerms, type PaymentRow } from '../lib/billing';

const TODAY = todayISO();
const m = (n: number) => addMonths(monthKey(TODAY), n);
const athletes = [
  { studentId: 'a1', name: 'Lena Fischer' },
  { studentId: 'a2', name: 'Marco' },
  { studentId: 'a3', name: 'Sofia' },
  { studentId: 'a4', name: 'Tom' },
  { studentId: 'a5', name: 'Ana' },
];
const startTerms: BillingTerms[] = [
  { studentId: 'a1', amountCents: 12000, currency: 'EUR', dueDay: 1, startedOn: m(-6), endedOn: null },
  { studentId: 'a2', amountCents: 9000, currency: 'EUR', dueDay: 15, startedOn: m(-4), endedOn: null },
  { studentId: 'a3', amountCents: 15000, currency: 'EUR', dueDay: 1, startedOn: m(-3), endedOn: null },
  { studentId: 'a4', amountCents: 8000, currency: 'EUR', dueDay: 1, startedOn: m(-9), endedOn: m(-5) },
];
const paid = (studentId: string, n: number, amountCents: number): PaymentRow => ({
  studentId,
  period: m(n),
  amountCents,
  currency: 'EUR',
  paidOn: `${m(n).slice(0, 8)}03`,
});
const startPayments: PaymentRow[] = [
  paid('a1', -6, 12000), paid('a1', -5, 12000), paid('a1', -2, 12000),
  paid('a2', -4, 9000), paid('a2', -3, 9000), paid('a2', -1, 9000),
  paid('a3', -3, 15000), paid('a3', -2, 15000), paid('a3', -1, 15000), paid('a3', 0, 15000),
  paid('a4', -9, 8000), paid('a4', -8, 8000), paid('a4', -7, 8000), paid('a4', -6, 8000), paid('a4', -5, 8000),
];

export function BillingPreview() {
  const [terms, setTerms] = useState(startTerms);
  const [payments, setPayments] = useState(startPayments);
  const actions = useMemo<BillingActions>(
    () => ({
      pay: async (b, period) =>
        setPayments((ps) => [
          ...ps.filter((p) => !(p.studentId === b.studentId && p.period === period)),
          { studentId: b.studentId, period, amountCents: b.terms.amountCents, currency: b.terms.currency, paidOn: TODAY },
        ]),
      unpay: async (studentId, period) =>
        setPayments((ps) => ps.filter((p) => !(p.studentId === studentId && p.period === period))),
      saveTerms: async (x) => setTerms((ts) => [...ts.filter((t) => t.studentId !== x.studentId), x]),
      removeTerms: async (studentId) => setTerms((ts) => ts.filter((t) => t.studentId !== studentId)),
    }),
    [],
  );
  return (
    <BillingBody
      terms={terms}
      payments={payments}
      athletes={athletes}
      today={TODAY}
      loading={false}
      error={null}
      actions={actions}
    />
  );
}
