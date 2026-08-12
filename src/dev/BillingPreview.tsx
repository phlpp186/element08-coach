/** Dev-only harness for the billing ledger's presentation: real arithmetic from
 *  src/lib/billing, fixed fake roster, no Supabase. Not routed in a build. */
import {
  buildLedger,
  formatMoney,
  ledgerTotals,
  type BillingTerms,
  type PaymentRow,
} from '../lib/billing';

const TODAY = '2026-08-12';
const NAMES: Record<string, string> = { a1: 'Lena', a2: 'Marco', a3: 'Sofia', a4: 'Tom' };

const terms: BillingTerms[] = [
  { studentId: 'a1', amountCents: 12000, currency: 'EUR', dueDay: 1, startedOn: '2026-05-01', endedOn: null },
  { studentId: 'a2', amountCents: 9000, currency: 'EUR', dueDay: 15, startedOn: '2026-07-01', endedOn: null },
  { studentId: 'a3', amountCents: 15000, currency: 'EUR', dueDay: 1, startedOn: '2026-06-01', endedOn: null },
  { studentId: 'a4', amountCents: 8000, currency: 'EUR', dueDay: 1, startedOn: '2026-02-01', endedOn: '2026-04-30' },
];
const payments: PaymentRow[] = [
  { studentId: 'a1', period: '2026-05-01', amountCents: 12000, currency: 'EUR', paidOn: '2026-05-02' },
  { studentId: 'a1', period: '2026-06-01', amountCents: 12000, currency: 'EUR', paidOn: '2026-06-01' },
  { studentId: 'a3', period: '2026-06-01', amountCents: 15000, currency: 'EUR', paidOn: '2026-06-03' },
  { studentId: 'a3', period: '2026-07-01', amountCents: 15000, currency: 'EUR', paidOn: '2026-07-02' },
  { studentId: 'a3', period: '2026-08-01', amountCents: 15000, currency: 'EUR', paidOn: '2026-08-01' },
  { studentId: 'a4', period: '2026-02-01', amountCents: 8000, currency: 'EUR', paidOn: '2026-02-01' },
  { studentId: 'a4', period: '2026-03-01', amountCents: 8000, currency: 'EUR', paidOn: '2026-03-01' },
  { studentId: 'a4', period: '2026-04-01', amountCents: 8000, currency: 'EUR', paidOn: '2026-04-02' },
];

export function BillingPreview() {
  const ledger = buildLedger(terms, payments, TODAY);
  const totals = ledgerTotals(ledger);
  return (
    <main className="mx-auto max-w-4xl px-5 py-6 space-y-6">
      <header className="space-y-1">
        <h2 className="font-heading text-xl tracking-wide">Billing</h2>
        <p className="text-sm text-textDim">A private record of monthly fees. Nothing here charges anyone.</p>
      </header>
      <div className="grid grid-cols-3 gap-3">
        {[
          ['Overdue', formatMoney(totals.overdueCents, 'EUR'), totals.overdueCents > 0],
          ['Athletes late', String(totals.overdueAthletes), totals.overdueAthletes > 0],
          ['Per month', formatMoney(totals.monthCents, 'EUR'), false],
        ].map(([label, value, alert]) => (
          <div key={label as string} className="rounded-lg border border-border bg-panel px-4 py-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-textDim">{label}</div>
            <div className={`mt-1 text-xl font-semibold ${alert ? 'text-red' : 'text-text'}`}>{value}</div>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {ledger.map((a) => {
          const late = a.overdueCount > 0;
          const nextUnpaid = a.months.find((m) => !m.paid);
          return (
            <div key={a.studentId} className={`rounded-lg border bg-panel ${late ? 'border-red/50' : 'border-border'}`}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1 text-left">
                  <span className="font-semibold">{NAMES[a.studentId]}</span>
                  <span className="ml-2 text-sm text-textDim">
                    {formatMoney(a.terms.amountCents, a.terms.currency)} / month
                  </span>
                </div>
                {late ? (
                  <span className="rounded-full bg-red/15 px-2.5 py-1 font-mono text-[11px] text-red">
                    {a.overdueCount === 1 ? `Overdue · ${a.maxDaysOverdue}d` : `${a.overdueCount} × overdue · ${a.maxDaysOverdue}d`}
                  </span>
                ) : (
                  <span className="font-mono text-[11px] text-textDim">
                    {a.nextDueOn ? `Next ${a.nextDueOn}` : 'Ended'}
                  </span>
                )}
                {nextUnpaid && (
                  <button className="rounded-md bg-accent px-3 py-1.5 text-sm text-ink">
                    Mark paid · {nextUnpaid.period.slice(0, 7)}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
