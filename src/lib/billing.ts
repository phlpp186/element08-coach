/**
 * Monthly-retainer ledger arithmetic.
 *
 * The database stores two facts: the arrangement (what an athlete pays monthly,
 * from when) and the payments that actually arrived. Everything a coach wants to
 * see — who owes what, who is late, by how many days — is DERIVED here rather
 * than stored, so it can never go stale the way a generated schedule would.
 *
 * Pure and date-injected: `today` is always a parameter, never `new Date()`
 * inside a function, so the overdue arithmetic can be tested at a chosen date
 * instead of only on the day someone runs the tests.
 *
 * Money is integer minor units (cents) throughout. Currency formatting happens
 * once, at the edge, in `formatMoney`.
 */

export interface BillingTerms {
  studentId: string;
  amountCents: number;
  currency: string;
  /** 1-28. Capped in the schema so every month actually has the day. */
  dueDay: number;
  /** ISO date; the first month billed. */
  startedOn: string;
  /** ISO date or null while the arrangement is live. */
  endedOn: string | null;
}

export interface PaymentRow {
  studentId: string;
  /** ISO date, first of the month the payment covers. */
  period: string;
  amountCents: number;
  currency: string;
  paidOn: string;
}

/** One billable month for one athlete. */
export interface BillingMonth {
  /** ISO date, first of the month. */
  period: string;
  dueOn: string;
  amountCents: number;
  paid: PaymentRow | null;
  /** Whole days past due; 0 when paid or not yet due. */
  daysOverdue: number;
}

export interface AthleteBilling {
  studentId: string;
  terms: BillingTerms;
  months: BillingMonth[];
  /** Sum of everything unpaid whose due date has passed. */
  overdueCents: number;
  /** Unpaid months whose due date has passed. */
  overdueCount: number;
  /** Worst case across the athlete's unpaid months. */
  maxDaysOverdue: number;
  /** The next month that will fall due, or null when the arrangement has ended. */
  nextDueOn: string | null;
}

/** `YYYY-MM-DD` for the first of the month `d` falls in. */
export function monthKey(d: string): string {
  return `${d.slice(0, 7)}-01`;
}

/** Add `n` months to a `YYYY-MM-01` key. */
function addMonths(periodKey: string, n: number): string {
  const y = Number(periodKey.slice(0, 4));
  const m = Number(periodKey.slice(5, 7)) - 1 + n;
  const year = y + Math.floor(m / 12);
  const month = ((m % 12) + 12) % 12;
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

/** The due date inside a given month. `dueDay` is 1-28, so this never overflows. */
function dueDateFor(periodKey: string, dueDay: number): string {
  return `${periodKey.slice(0, 7)}-${String(dueDay).padStart(2, '0')}`;
}

/** Whole days between two ISO dates (b - a). Both are treated as UTC midnight,
 *  so daylight-saving transitions cannot turn a day into 23 or 25 hours. */
export function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/**
 * Expand one athlete's arrangement into its billable months and settle each
 * against the payments received.
 *
 * A month is owed when it falls on or after `startedOn` and on or before both
 * today's month and `endedOn`. The CURRENT month counts as owed — it is simply
 * not overdue until its due date passes, which is what keeps "outstanding" and
 * "late" separate.
 */
export function buildAthleteBilling(
  terms: BillingTerms,
  payments: PaymentRow[],
  today: string,
): AthleteBilling {
  const byPeriod = new Map<string, PaymentRow>();
  for (const p of payments) {
    if (p.studentId === terms.studentId) byPeriod.set(monthKey(p.period), p);
  }

  const first = monthKey(terms.startedOn);
  const thisMonth = monthKey(today);
  const last = terms.endedOn
    ? // An ended arrangement still owes the month it ended in.
      [monthKey(terms.endedOn), thisMonth].sort()[0]
    : thisMonth;

  const months: BillingMonth[] = [];
  // Guard against a start date in the future: nothing is owed yet.
  for (let p = first; p <= last; p = addMonths(p, 1)) {
    const dueOn = dueDateFor(p, terms.dueDay);
    const paid = byPeriod.get(p) ?? null;
    const late = !paid && dueOn < today ? daysBetween(dueOn, today) : 0;
    months.push({ period: p, dueOn, amountCents: terms.amountCents, paid, daysOverdue: late });
  }

  const overdue = months.filter((m) => m.daysOverdue > 0);
  // The next month that has not been paid yet and is not already overdue — what
  // a coach means by "next due".
  const upcoming = months.find((m) => !m.paid && m.daysOverdue === 0);
  const nextDueOn = upcoming
    ? upcoming.dueOn
    : terms.endedOn
      ? null
      : dueDateFor(addMonths(thisMonth, 1), terms.dueDay);

  return {
    studentId: terms.studentId,
    terms,
    months,
    overdueCents: overdue.reduce((sum, m) => sum + m.amountCents, 0),
    overdueCount: overdue.length,
    maxDaysOverdue: overdue.reduce((max, m) => Math.max(max, m.daysOverdue), 0),
    nextDueOn,
  };
}

/**
 * The whole roster, worst first: most days overdue at the top, then anything
 * else outstanding, then everyone who is square. A coach opening this page is
 * looking for a problem, so the problems come to them.
 */
export function buildLedger(
  terms: BillingTerms[],
  payments: PaymentRow[],
  today: string,
): AthleteBilling[] {
  return terms
    .map((t) => buildAthleteBilling(t, payments, today))
    .sort((a, b) => {
      if (a.maxDaysOverdue !== b.maxDaysOverdue) return b.maxDaysOverdue - a.maxDaysOverdue;
      if (a.overdueCents !== b.overdueCents) return b.overdueCents - a.overdueCents;
      return a.studentId.localeCompare(b.studentId);
    });
}

/** Totals for the header strip. */
export function ledgerTotals(ledger: AthleteBilling[]): {
  overdueCents: number;
  overdueAthletes: number;
  monthCents: number;
} {
  return {
    overdueCents: ledger.reduce((s, a) => s + a.overdueCents, 0),
    overdueAthletes: ledger.filter((a) => a.overdueCount > 0).length,
    // What the roster is worth per month, counting only live arrangements.
    monthCents: ledger.reduce((s, a) => s + (a.terms.endedOn ? 0 : a.terms.amountCents), 0),
  };
}

/** Cents → a localised amount. Falls back to a plain number if the currency
 *  code is one Intl does not know, rather than throwing inside a render. */
export function formatMoney(cents: number, currency: string, locale?: string): string {
  const value = cents / 100;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

/** Today as `YYYY-MM-DD` in the viewer's own timezone — "overdue" is a question
 *  about the coach's calendar, not UTC's. */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
