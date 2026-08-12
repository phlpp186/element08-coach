/**
 * Billing — the coach's monthly-retainer ledger, everyone on one page.
 *
 * A record book, not a payment system: it says who owes what and who is late,
 * and a coach ticks a month off when the money arrives. Nothing here requests or
 * processes a payment.
 *
 * Layout follows what the page is FOR: a coach opens it to find a problem, so
 * the overdue total leads and the roster is sorted worst-first (see buildLedger).
 * Everything else — history, editing the arrangement — is behind a row.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from '../i18n';
import { useRoster } from '../lib/supabase/useRoster';
import { useAuth } from '../lib/supabase/AuthProvider';
import {
  listBillingTerms,
  listPayments,
  markPaid,
  removeBillingTerms,
  saveBillingTerms,
  unmarkPaid,
} from '../lib/supabase/coachBilling';
import {
  buildLedger,
  formatMoney,
  ledgerTotals,
  monthKey,
  todayISO,
  type AthleteBilling,
  type BillingTerms,
  type PaymentRow,
} from '../lib/billing';

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'THB', 'AUD'];

export function BillingView() {
  const t = useT();
  const { session } = useAuth();
  const { athletes } = useRoster();
  const [terms, setTerms] = useState<BillingTerms[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const today = todayISO();

  const refresh = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const [ts, ps] = await Promise.all([listBillingTerms(), listPayments()]);
      setTerms(ts);
      setPayments(ps);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const nameOf = useCallback(
    (id: string) => athletes.find((a) => a.studentId === id)?.name ?? t('Athlete'),
    [athletes, t],
  );

  const ledger = useMemo(() => buildLedger(terms, payments, today), [terms, payments, today]);
  const totals = useMemo(() => ledgerTotals(ledger), [ledger]);
  // Currency is per-arrangement, but a mixed-currency total would be a lie, so
  // the header only totals when the whole roster shares one.
  const currencies = new Set(terms.map((x) => x.currency));
  const oneCurrency = currencies.size === 1 ? [...currencies][0] : null;

  const unbilled = athletes.filter((a) => !terms.some((x) => x.studentId === a.studentId));

  if (!session) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-10">
        <p className="text-textDim">{t('Sign in to see your billing ledger.')}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-5 py-6 space-y-6">
      <header className="space-y-1">
        <h2 className="font-heading text-xl tracking-wide">{t('Billing')}</h2>
        <p className="text-sm text-textDim">
          {t('A private record of monthly fees. Nothing here charges anyone.')}
        </p>
      </header>

      {error && <p className="text-sm text-red">{error}</p>}

      {/* The number a coach came for. */}
      <div className="grid grid-cols-3 gap-3">
        <Stat
          label={t('Overdue')}
          value={oneCurrency ? formatMoney(totals.overdueCents, oneCurrency) : String(totals.overdueCents / 100)}
          tone={totals.overdueCents > 0 ? 'alert' : 'calm'}
        />
        <Stat
          label={t('Athletes late')}
          value={`${totals.overdueAthletes}`}
          tone={totals.overdueAthletes > 0 ? 'alert' : 'calm'}
        />
        <Stat
          label={t('Per month')}
          value={oneCurrency ? formatMoney(totals.monthCents, oneCurrency) : String(totals.monthCents / 100)}
          tone="calm"
        />
      </div>

      {loading && <p className="text-sm text-textDim">{t('Loading…')}</p>}

      <div className="space-y-2">
        {ledger.map((a) => (
          <AthleteRow
            key={a.studentId}
            billing={a}
            name={nameOf(a.studentId)}
            open={openId === a.studentId}
            onToggle={() => setOpenId(openId === a.studentId ? null : a.studentId)}
            onChanged={refresh}
            today={today}
            t={t}
          />
        ))}
        {ledger.length === 0 && !loading && (
          <p className="rounded-lg border border-dashed border-border bg-panel px-5 py-8 text-center text-sm text-textDim">
            {t('No fees set up yet. Add one below to start tracking.')}
          </p>
        )}
      </div>

      {unbilled.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-textDim">
            {t('Not billed')}
          </h3>
          {unbilled.map((a) => (
            <TermsEditor
              key={a.studentId}
              studentId={a.studentId}
              name={a.name}
              existing={null}
              onSaved={refresh}
              t={t}
            />
          ))}
        </section>
      )}
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'alert' | 'calm' }) {
  return (
    <div className="rounded-lg border border-border bg-panel px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-textDim">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${tone === 'alert' ? 'text-red' : 'text-text'}`}>
        {value}
      </div>
    </div>
  );
}

type TFn = (s: string) => string;

function AthleteRow({
  billing,
  name,
  open,
  onToggle,
  onChanged,
  today,
  t,
}: {
  billing: AthleteBilling;
  name: string;
  open: boolean;
  onToggle: () => void;
  onChanged: () => void;
  today: string;
  t: TFn;
}) {
  const [busy, setBusy] = useState(false);
  const { terms } = billing;
  const late = billing.overdueCount > 0;
  // The oldest unpaid month is the one a coach settles first.
  const nextUnpaid = billing.months.find((m) => !m.paid);

  const pay = async (period: string) => {
    setBusy(true);
    try {
      await markPaid({
        studentId: billing.studentId,
        period,
        amountCents: terms.amountCents,
        currency: terms.currency,
        paidOn: today,
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`rounded-lg border bg-panel ${late ? 'border-red/50' : 'border-border'}`}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <button onClick={onToggle} className="min-w-0 flex-1 text-left">
          <span className="font-semibold">{name}</span>
          <span className="ml-2 text-sm text-textDim">
            {formatMoney(terms.amountCents, terms.currency)} {t('/ month')}
          </span>
        </button>

        {late ? (
          <span className="rounded-full bg-red/15 px-2.5 py-1 font-mono text-[11px] text-red">
            {billing.overdueCount === 1
              ? `${t('Overdue')} · ${billing.maxDaysOverdue}${t('d')}`
              : `${billing.overdueCount} × ${t('overdue')} · ${billing.maxDaysOverdue}${t('d')}`}
          </span>
        ) : (
          <span className="font-mono text-[11px] text-textDim">
            {billing.nextDueOn ? `${t('Next')} ${billing.nextDueOn}` : t('Ended')}
          </span>
        )}

        {nextUnpaid && (
          <button
            disabled={busy}
            onClick={() => void pay(nextUnpaid.period)}
            className="rounded-md bg-accent px-3 py-1.5 text-sm text-ink disabled:opacity-50"
          >
            {t('Mark paid')} · {nextUnpaid.period.slice(0, 7)}
          </button>
        )}
      </div>

      {open && (
        <div className="space-y-4 border-t border-border px-4 py-4">
          <MonthHistory billing={billing} onChanged={onChanged} t={t} />
          <TermsEditor
            studentId={billing.studentId}
            name={name}
            existing={terms}
            onSaved={onChanged}
            t={t}
          />
        </div>
      )}
    </div>
  );
}

/** Every billable month, newest first — the ledger a coach scans back through. */
function MonthHistory({
  billing,
  onChanged,
  t,
}: {
  billing: AthleteBilling;
  onChanged: () => void;
  t: TFn;
}) {
  const months = [...billing.months].reverse();
  return (
    <div className="space-y-1">
      {months.map((m) => (
        <div key={m.period} className="flex items-center gap-3 text-sm">
          <span className="w-20 font-mono text-textDim">{m.period.slice(0, 7)}</span>
          {m.paid ? (
            <>
              <span className="text-green">{t('Paid')}</span>
              <span className="text-textDim">{m.paid.paidOn}</span>
              <button
                onClick={async () => {
                  await unmarkPaid(billing.studentId, m.period);
                  onChanged();
                }}
                className="ml-auto text-xs text-textDim underline hover:text-text"
              >
                {t('Undo')}
              </button>
            </>
          ) : (
            <>
              <span className={m.daysOverdue > 0 ? 'text-red' : 'text-textDim'}>
                {m.daysOverdue > 0
                  ? `${t('Overdue')} · ${m.daysOverdue}${t('d')}`
                  : `${t('Due')} ${m.dueOn}`}
              </span>
              <span className="ml-auto font-mono text-textDim">
                {formatMoney(m.amountCents, billing.terms.currency)}
              </span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/** Create or edit one athlete's arrangement. Amounts are typed in whole units
 *  and stored as cents — the input never sees a float. */
function TermsEditor({
  studentId,
  name,
  existing,
  onSaved,
  t,
}: {
  studentId: string;
  name: string;
  existing: BillingTerms | null;
  onSaved: () => void;
  t: TFn;
}) {
  const [amount, setAmount] = useState(existing ? String(existing.amountCents / 100) : '');
  const [currency, setCurrency] = useState(existing?.currency ?? 'EUR');
  const [dueDay, setDueDay] = useState(String(existing?.dueDay ?? 1));
  const [startedOn, setStartedOn] = useState(existing?.startedOn ?? monthKey(todayISO()));
  const [endedOn, setEndedOn] = useState(existing?.endedOn ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const value = Number(amount.replace(',', '.'));
    if (!Number.isFinite(value) || value < 0) return;
    setBusy(true);
    try {
      await saveBillingTerms({
        studentId,
        amountCents: Math.round(value * 100),
        currency,
        // 1-28: every month has those days, so a due date never silently shifts.
        dueDay: Math.min(28, Math.max(1, Number(dueDay) || 1)),
        startedOn: monthKey(startedOn),
        endedOn: endedOn || null,
      });
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-deep/40 px-4 py-3">
      {!existing && <div className="mb-2 text-sm font-semibold">{name}</div>}
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('Amount')}>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="120"
            className="w-24 rounded border border-border bg-panel px-2 py-1 text-sm"
          />
        </Field>
        <Field label={t('Currency')}>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="rounded border border-border bg-panel px-2 py-1 text-sm"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('Due day')}>
          <input
            value={dueDay}
            onChange={(e) => setDueDay(e.target.value)}
            inputMode="numeric"
            className="w-14 rounded border border-border bg-panel px-2 py-1 text-sm"
          />
        </Field>
        <Field label={t('From')}>
          <input
            type="date"
            value={startedOn}
            onChange={(e) => setStartedOn(e.target.value)}
            className="rounded border border-border bg-panel px-2 py-1 text-sm"
          />
        </Field>
        <Field label={t('Until')}>
          <input
            type="date"
            value={endedOn}
            onChange={(e) => setEndedOn(e.target.value)}
            className="rounded border border-border bg-panel px-2 py-1 text-sm"
          />
        </Field>
        <button
          disabled={busy}
          onClick={() => void save()}
          className="rounded-md bg-accent px-3 py-1.5 text-sm text-ink disabled:opacity-50"
        >
          {existing ? t('Save') : t('Add fee')}
        </button>
        {existing && (
          <button
            disabled={busy}
            onClick={async () => {
              await removeBillingTerms(studentId);
              onSaved();
            }}
            className="text-xs text-textDim underline hover:text-red"
          >
            {t('Remove')}
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-textDim">
        {t('Leave "Until" empty while the athlete is active. Ending it keeps the history.')}
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-textDim">{label}</span>
      {children}
    </label>
  );
}
