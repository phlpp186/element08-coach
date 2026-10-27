/**
 * Billing — the coach's monthly-retainer ledger, everyone on one page.
 *
 * A record book, not a payment system: it says who owes what and who is late,
 * and a coach ticks a month off when the money arrives. Nothing here requests or
 * processes a payment.
 *
 * Layout (Philipp's option A, 2026-10-24): the money that is late leads, then a
 * month grid, athletes down the side and months across, the spreadsheet coaches
 * already keep. A cell is paid, overdue (with its days), due soon, or not
 * billed; clicking it ticks the month paid or undoes it. Late athletes get a
 * "Copy reminder" with a friendly message to paste anywhere, and the whole
 * ledger exports as CSV. Rows stay sorted worst-first (see buildLedger).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { fill, useT } from '../i18n';
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
  addMonths,
  billingCsv,
  buildLedger,
  cellFor,
  formatMoney,
  ledgerTotals,
  monthKey,
  monthList,
  monthWindow,
  overdueMonths,
  periodTotals,
  todayISO,
  type AthleteBilling,
  type BillingTerms,
  type PaymentRow,
} from '../lib/billing';

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'THB', 'AUD'];
const WINDOW = 6;
/** The name column stays put while the months scroll sideways on a phone. */
const PIN = 'sticky left-0 z-10 -ml-3 bg-panel pl-3 pr-1 sm:-ml-4 sm:pl-4';

type TFn = (s: string) => string;

export interface BillingActions {
  pay: (b: AthleteBilling, period: string) => Promise<void>;
  unpay: (studentId: string, period: string) => Promise<void>;
  saveTerms: (terms: BillingTerms) => Promise<void>;
  removeTerms: (studentId: string) => Promise<void>;
}

export function BillingView() {
  const t = useT();
  const { session } = useAuth();
  const { athletes } = useRoster();
  const [terms, setTerms] = useState<BillingTerms[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const actions = useMemo<BillingActions>(
    () => ({
      pay: async (b, period) => {
        await markPaid({
          studentId: b.studentId,
          period,
          amountCents: b.terms.amountCents,
          currency: b.terms.currency,
          paidOn: todayISO(),
        });
        await refresh();
      },
      unpay: async (studentId, period) => {
        await unmarkPaid(studentId, period);
        await refresh();
      },
      saveTerms: async (x) => {
        await saveBillingTerms(x);
        await refresh();
      },
      removeTerms: async (studentId) => {
        await removeBillingTerms(studentId);
        await refresh();
      },
    }),
    [refresh],
  );

  if (!session) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-10">
        <p className="text-textDim">{t('Sign in to see your billing ledger.')}</p>
      </main>
    );
  }

  return (
    <BillingBody
      terms={terms}
      payments={payments}
      athletes={athletes.map((a) => ({ studentId: a.studentId, name: a.name }))}
      today={today}
      loading={loading}
      error={error}
      actions={actions}
    />
  );
}

/** The page itself, from already-loaded data (also driven by a dev preview). */
export function BillingBody({
  terms,
  payments,
  athletes,
  today,
  loading,
  error,
  actions,
}: {
  terms: BillingTerms[];
  payments: PaymentRow[];
  athletes: { studentId: string; name: string }[];
  today: string;
  loading: boolean;
  error: string | null;
  actions: BillingActions;
}) {
  const t = useT();
  const [openId, setOpenId] = useState<string | null>(null);
  const [end, setEnd] = useState(() => monthKey(today));
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const gridRef = useRef<HTMLElement>(null);
  // On a narrow screen the grid scrolls sideways; start at the newest months.
  const hasRows = terms.length > 0;
  useEffect(() => {
    const el = gridRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [hasRows, end]);

  const nameOf = useCallback(
    (id: string) => athletes.find((a) => a.studentId === id)?.name || t('Athlete'),
    [athletes, t],
  );

  const ledger = useMemo(() => buildLedger(terms, payments, today), [terms, payments, today]);
  const totals = useMemo(() => ledgerTotals(ledger, today), [ledger, today]);
  // Currency is per-arrangement, but a mixed-currency total would be a lie, so
  // totals only show when the whole roster shares one.
  const currencies = new Set(terms.map((x) => x.currency));
  const oneCurrency = currencies.size === 1 ? [...currencies][0] : null;
  const money = (cents: number) => (oneCurrency ? formatMoney(cents, oneCurrency) : '·');

  const thisMonth = monthKey(today);
  const periods = monthWindow(end, WINDOW);
  const sums = periodTotals(ledger, periods);
  const [paidNow] = periodTotals(ledger, [thisMonth]);
  const earliest = terms.reduce((min, x) => (monthKey(x.startedOn) < min ? monthKey(x.startedOn) : min), thisMonth);
  const unbilled = athletes.filter((a) => !terms.some((x) => x.studentId === a.studentId));

  const monthLabel = (p: string, withYear: boolean) =>
    new Date(`${p}T12:00:00`).toLocaleDateString(undefined, withYear ? { month: 'short', year: '2-digit' } : { month: 'short' });

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const copyReminder = async (b: AthleteBilling) => {
    const months = overdueMonths(b);
    const text = fill(
      t('Hi {name}, a friendly reminder: the coaching fee for {months} ({amount}) is still open. Thank you!'),
      {
        name: nameOf(b.studentId).split(' ')[0],
        months: monthList(months.map((m) => m.period)),
        amount: formatMoney(b.overdueCents, b.terms.currency),
      },
    );
    try {
      await navigator.clipboard.writeText(text);
      setCopied(b.studentId);
      setTimeout(() => setCopied((c) => (c === b.studentId ? null : c)), 2500);
    } catch {
      // Clipboard blocked (permissions, insecure context): let the coach copy it.
      window.prompt(t('Copy this reminder:'), text);
    }
  };

  const exportCsv = () => {
    // The BOM makes Excel read the names (umlauts, accents) as UTF-8.
    const blob = new Blob(['﻿' + billingCsv(ledger, nameOf)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `element08-billing-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const tiles: { label: string; value: string; tone: string }[] = [
    {
      label: t('Overdue'),
      value: money(totals.overdueCents),
      tone: totals.overdueCents > 0 ? 'var(--c-red)' : 'var(--c-recover)',
    },
    {
      label: t('Athletes late'),
      value: String(totals.overdueAthletes),
      tone: totals.overdueAthletes > 0 ? 'var(--c-amber)' : 'var(--c-recover)',
    },
    {
      label: fill(t('Paid for {month}'), { month: monthLabel(thisMonth, false) }),
      value: `${money(paidNow.paidCents)}`,
      tone: 'var(--c-recover)',
    },
    { label: t('Per month'), value: money(totals.monthCents), tone: 'var(--c-highlight)' },
  ];

  const cols = { gridTemplateColumns: `9.5rem repeat(${WINDOW}, minmax(3.25rem, 1fr))` };

  return (
    <main className="mx-auto max-w-5xl px-5 py-6 space-y-6">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="text-lg">{t('Billing')}</h2>
          <p className="text-sm text-textDim">{t('A private record of monthly fees. Nothing here charges anyone.')}</p>
        </div>
        {ledger.length > 0 && (
          <button onClick={exportCsv} className="pill px-3 py-1.5 text-sm" title={t('Every billed month, for your accountant or tax return')}>
            ⤓ {t('Export CSV')}
          </button>
        )}
      </header>

      {error && <p className="text-sm text-red">{error}</p>}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {tiles.map((x) => (
          <div key={x.label} className="tile px-3 py-2.5" style={{ '--tone': `rgb(${x.tone})` } as CSSProperties}>
            <div className="tile-value font-num text-xl font-bold leading-tight">{x.value}</div>
            <div className="tile-label text-xs font-bold">{x.label}</div>
          </div>
        ))}
      </div>

      {loading && ledger.length === 0 && <p className="text-sm text-textDim">{t('Loading…')}</p>}

      {ledger.length === 0 && !loading ? (
        <p className="rounded-lg border border-dashed border-border bg-panel px-5 py-8 text-center text-sm text-textDim">
          {t('No fees set up yet. Add one below to start tracking.')}
        </p>
      ) : (
        ledger.length > 0 && (
          <section ref={gridRef} className="board overflow-x-auto py-3 sm:py-4">
            <div className="min-w-[34rem] space-y-1.5 px-3 sm:px-4">
              {/* Month header with the window arrows. */}
              <div className="grid items-center gap-1.5" style={cols}>
                <div className={`${PIN} flex items-center gap-1 self-stretch`}>
                  <button
                    onClick={() => setEnd(addMonths(end, -WINDOW))}
                    disabled={periods[0] <= earliest}
                    className="pill h-7 w-7 justify-center text-sm disabled:opacity-40"
                    title={t('Earlier months')}
                  >
                    ‹
                  </button>
                  <button
                    onClick={() => setEnd(addMonths(end, WINDOW) > thisMonth ? thisMonth : addMonths(end, WINDOW))}
                    disabled={end >= thisMonth}
                    className="pill h-7 w-7 justify-center text-sm disabled:opacity-40"
                    title={t('Later months')}
                  >
                    ›
                  </button>
                </div>
                {periods.map((p, i) => (
                  <div
                    key={p}
                    className={`text-center text-xs font-bold ${p === thisMonth ? 'text-highlight' : 'text-textDim'}`}
                  >
                    {monthLabel(p, i === 0 || p.endsWith('-01-01'))}
                  </div>
                ))}
              </div>

              {ledger.map((b) => {
                const late = b.overdueCount > 0;
                const open = openId === b.studentId;
                return (
                  <div key={b.studentId} className="space-y-1.5">
                    <div className="grid items-center gap-1.5" style={cols}>
                      <div className={`${PIN} min-w-0 self-stretch`}>
                        <button
                          onClick={() => setOpenId(open ? null : b.studentId)}
                          aria-expanded={open}
                          className="block max-w-full truncate text-left text-sm font-bold text-text hover:text-accent"
                        >
                          {nameOf(b.studentId)} <span className="text-textDim">{open ? '▴' : '▾'}</span>
                        </button>
                        <div className="truncate text-xs text-textDim">
                          {formatMoney(b.terms.amountCents, b.terms.currency)} {t('/ month')}
                          {b.terms.endedOn ? ` · ${t('Ended')}` : ''}
                        </div>
                        {late && (
                          <button
                            onClick={() => void copyReminder(b)}
                            className={`text-xs font-bold hover:underline ${copied === b.studentId ? 'text-recover' : 'text-amber'}`}
                          >
                            {copied === b.studentId ? t('Copied ✓') : t('Copy reminder')}
                          </button>
                        )}
                      </div>
                      {periods.map((p) => (
                        <MonthCell
                          key={p}
                          billing={b}
                          period={p}
                          busy={busy === `${b.studentId}|${p}`}
                          onPay={() => void run(`${b.studentId}|${p}`, () => actions.pay(b, p))}
                          onUnpay={() => {
                            if (!confirm(fill(t('Undo the payment for {month}?'), { month: monthLabel(p, true) }))) return;
                            void run(`${b.studentId}|${p}`, () => actions.unpay(b.studentId, p));
                          }}
                          t={t}
                        />
                      ))}
                    </div>
                    {open && (
                      <TermsEditor
                        name={nameOf(b.studentId)}
                        studentId={b.studentId}
                        existing={b.terms}
                        onSave={actions.saveTerms}
                        onRemove={() => actions.removeTerms(b.studentId)}
                        t={t}
                      />
                    )}
                  </div>
                );
              })}

              {oneCurrency && (
                <div className="grid items-center gap-1.5 border-t border-border pt-2" style={cols}>
                  <div className={`${PIN} self-stretch text-xs font-bold text-textDim`}>{t('Paid / owed')}</div>
                  {sums.map((x, i) => (
                    <div key={periods[i]} className="text-center font-num text-[11px] leading-tight text-textDim">
                      {x.owedCents === 0 ? (
                        '·'
                      ) : (
                        <>
                          <span className={x.paidCents >= x.owedCents ? 'text-recover' : 'text-text'}>
                            {formatMoney(x.paidCents, oneCurrency).replace(/[.,]00(?!\d)/, '')}
                          </span>
                          <br />
                          {formatMoney(x.owedCents, oneCurrency).replace(/[.,]00(?!\d)/, '')}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 text-[11px] text-textDim">
                <Legend className="bg-recover text-ink">✓</Legend> {t('Paid')}
                <Legend className="border border-red bg-red/15 text-red">d</Legend> {t('Overdue, days late')}
                <Legend className="border-2 border-highlight text-highlight" /> {t('Owed, not yet due')}
                <span>{t('Click a month to tick it paid (dated today) or to undo it.')}</span>
              </p>
            </div>
          </section>
        )
      )}

      {unbilled.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-heading uppercase tracking-wide text-textDim">{t('Not billed')}</h3>
          {unbilled.map((a) => (
            <TermsEditor
              key={a.studentId}
              studentId={a.studentId}
              name={a.name}
              existing={null}
              onSave={actions.saveTerms}
              t={t}
            />
          ))}
        </section>
      )}
    </main>
  );
}

function Legend({ className, children }: { className: string; children?: ReactNode }) {
  return (
    <span
      className={`inline-flex h-4 w-6 items-center justify-center rounded text-[10px] font-bold ${className}`}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

function MonthCell({
  billing,
  period,
  busy,
  onPay,
  onUnpay,
  t,
}: {
  billing: AthleteBilling;
  period: string;
  busy: boolean;
  onPay: () => void;
  onUnpay: () => void;
  t: TFn;
}) {
  const { state, month } = cellFor(billing, period);
  const base = 'flex h-9 w-full items-center justify-center rounded-md text-xs font-bold tabular-nums transition-colors';
  if (state === 'none' || !month) {
    return <span className={`${base} text-textDim/40`} aria-label={t('Not billed')}>·</span>;
  }
  const amount = formatMoney(month.amountCents, billing.terms.currency);
  if (state === 'paid') {
    return (
      <button
        onClick={onUnpay}
        disabled={busy}
        className={`${base} bg-recover text-ink hover:opacity-80`}
        title={fill(t('Paid on {date}. Click to undo.'), { date: month.paid!.paidOn })}
      >
        {busy ? '…' : '✓'}
      </button>
    );
  }
  if (state === 'overdue') {
    return (
      <button
        onClick={onPay}
        disabled={busy}
        className={`${base} border border-red bg-red/15 text-red hover:bg-red/25`}
        title={fill(t('{amount} overdue by {n} days. Click to mark paid.'), { amount, n: month.daysOverdue })}
      >
        {busy ? '…' : `${month.daysOverdue} ${t('d')}`}
      </button>
    );
  }
  return (
    <button
      onClick={onPay}
      disabled={busy}
      className={`${base} border-2 border-highlight text-highlight hover:bg-highlight/10`}
      title={fill(t('{amount} due {date}. Click to mark paid.'), { amount, date: month.dueOn })}
    >
      {busy ? '…' : fill(t('due {day}'), { day: Number(month.dueOn.slice(8)) })}
    </button>
  );
}

/** Create or edit one athlete's arrangement. Amounts are typed in whole units
 *  and stored as cents, so the input never sees a float. */
function TermsEditor({
  studentId,
  name,
  existing,
  onSave,
  onRemove,
  t,
}: {
  studentId: string;
  name: string;
  existing: BillingTerms | null;
  onSave: (terms: BillingTerms) => Promise<void>;
  onRemove?: () => Promise<void>;
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
      await onSave({
        studentId,
        amountCents: Math.round(value * 100),
        currency,
        // 1-28: every month has those days, so a due date never silently shifts.
        dueDay: Math.min(28, Math.max(1, Number(dueDay) || 1)),
        startedOn: monthKey(startedOn),
        endedOn: endedOn || null,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-abyss/60 px-4 py-3">
      {!existing && <div className="mb-2 text-sm font-bold">{name}</div>}
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('Amount')}>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="120"
            className="field w-24"
          />
        </Field>
        <Field label={t('Currency')}>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="field w-auto">
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('Due day')}>
          <input value={dueDay} onChange={(e) => setDueDay(e.target.value)} inputMode="numeric" className="field w-16" />
        </Field>
        <Field label={t('From')}>
          <input type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} className="field w-auto" />
        </Field>
        <Field label={t('Until')}>
          <input type="date" value={endedOn} onChange={(e) => setEndedOn(e.target.value)} className="field w-auto" />
        </Field>
        <button disabled={busy} onClick={() => void save()} className="pill pill-on btn-raised px-3 py-1.5 text-sm">
          {existing ? t('Save') : t('Add fee')}
        </button>
        {existing && onRemove && (
          <button
            disabled={busy}
            onClick={async () => {
              if (!confirm(fill(t('Remove the fee for {name}? Recorded payments are kept and show again if you add a fee later.'), { name }))) return;
              setBusy(true);
              try {
                await onRemove();
              } finally {
                setBusy(false);
              }
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-bold text-textDim">{label}</span>
      {children}
    </label>
  );
}
