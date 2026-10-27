/**
 * A pop-up when the portal opens on a day someone's coaching fee is due, or
 * still open from before: each athlete with what is owed, Mark paid (the oldest
 * open month) and Copy reminder. "Later" hides it until the next day. Philipp
 * asked for it after losing track of who had paid (2026-10-27).
 */
import { useCallback, useEffect, useState } from 'react';
import { fill, useT } from '../i18n';
import { useAuth } from '../lib/supabase/AuthProvider';
import { listBillingTerms, listPayments, markPaid } from '../lib/supabase/coachBilling';
import { listMyStudents } from '../lib/supabase/coachData';
import { buildLedger, dueReminders, formatMoney, monthList, todayISO, type DueReminder } from '../lib/billing';
import { navigate } from '../hooks/useHashRoute';

const SEEN_KEY = 'element08.coach.billingDueSeen';

function seenToday(today: string): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === today;
  } catch {
    return false;
  }
}

function markSeen(today: string) {
  try {
    localStorage.setItem(SEEN_KEY, today);
  } catch {
    /* private mode: it asks again next time, which is harmless */
  }
}

export function BillingDueReminder() {
  const t = useT();
  const { session, isCoach } = useAuth();
  const today = todayISO();
  const [due, setDue] = useState<DueReminder[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [terms, payments, students] = await Promise.all([
      listBillingTerms(),
      listPayments(),
      listMyStudents(),
    ]);
    setNames(new Map(students.map((s) => [s.student_id, s.student?.display_name?.trim() || ''])));
    return dueReminders(buildLedger(terms, payments, today), today);
  }, [today]);

  useEffect(() => {
    if (!session || !isCoach || seenToday(today)) return;
    let alive = true;
    load()
      .then((r) => {
        if (!alive || r.length === 0) return;
        setDue(r);
        setOpen(true);
      })
      .catch(() => {
        /* the Billing page shows the error; a pop-up that fails stays away */
      });
    return () => {
      alive = false;
    };
  }, [session, isCoach, today, load]);

  if (!open) return null;

  const close = () => {
    markSeen(today);
    setOpen(false);
  };
  const nameOf = (id: string) => names.get(id) || t('Athlete');

  const pay = async (r: DueReminder) => {
    const m = r.months[0];
    setBusy(r.studentId);
    try {
      await markPaid({
        studentId: r.studentId,
        period: m.period,
        amountCents: m.amountCents,
        currency: r.currency,
        paidOn: today,
      });
      const next = await load();
      setDue(next);
      if (next.length === 0) close();
    } finally {
      setBusy(null);
    }
  };

  const copy = async (r: DueReminder) => {
    const text = fill(
      t('Hi {name}, a friendly reminder: the coaching fee for {months} ({amount}) is still open. Thank you!'),
      {
        name: nameOf(r.studentId).split(' ')[0],
        months: monthList(r.months.map((m) => m.period)),
        amount: formatMoney(r.amountCents, r.currency),
      },
    );
    try {
      await navigator.clipboard.writeText(text);
      setCopied(r.studentId);
      setTimeout(() => setCopied((c) => (c === r.studentId ? null : c)), 2500);
    } catch {
      window.prompt(t('Copy this reminder:'), text);
    }
  };

  return (
    <DueReminderDialog
      due={due}
      nameOf={nameOf}
      busy={busy}
      copied={copied}
      onPay={(r) => void pay(r)}
      onCopy={(r) => void copy(r)}
      onClose={close}
      onOpenBilling={() => {
        close();
        navigate('/billing');
      }}
    />
  );
}

/** The dialog itself, from already-loaded data (also driven by a dev preview). */
export function DueReminderDialog({
  due,
  nameOf,
  busy,
  copied,
  onPay,
  onCopy,
  onClose,
  onOpenBilling,
}: {
  due: DueReminder[];
  nameOf: (studentId: string) => string;
  busy: string | null;
  copied: string | null;
  onPay: (r: DueReminder) => void;
  onCopy: (r: DueReminder) => void;
  onClose: () => void;
  onOpenBilling: () => void;
}) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t('Coaching fees due')}
        onClick={(e) => e.stopPropagation()}
        className="board w-full max-w-md space-y-3 p-5"
      >
        <h2 className="font-heading text-lg text-text">{t('Coaching fees due')}</h2>
        <ul className="space-y-2">
          {due.map((r) => {
            const late = r.months.length > 1 || !r.dueToday;
            return (
              <li key={r.studentId} className="rounded-lg border border-border bg-abyss p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-text">{nameOf(r.studentId)}</span>
                  <span className={`font-num text-sm ${late ? 'text-red' : 'text-amber'}`}>
                    {formatMoney(r.amountCents, r.currency)}
                  </span>
                </div>
                <p className="text-xs text-textDim">
                  {r.dueToday && r.months.length === 1
                    ? fill(t('Due today for {months}'), { months: monthList(r.months.map((m) => m.period)) })
                    : fill(t('Open: {months}'), { months: monthList(r.months.map((m) => m.period)) })}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={() => onPay(r)}
                    disabled={busy === r.studentId}
                    className="pill pill-on btn-raised px-3 py-1 text-sm disabled:opacity-50"
                  >
                    {r.months.length > 1
                      ? fill(t('Mark {month} paid'), { month: monthList([r.months[0].period]) })
                      : t('Mark paid')}
                  </button>
                  <button onClick={() => onCopy(r)} className="pill px-3 py-1 text-sm">
                    {copied === r.studentId ? t('Copied') : t('Copy reminder')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between border-t border-border pt-3">
          <button
            onClick={onOpenBilling}
            className="text-sm font-bold text-accent hover:underline"
          >
            {t('Open Billing')}
          </button>
          <button onClick={onClose} className="pill px-4 py-1.5 text-sm">
            {t('Later')}
          </button>
        </div>
      </section>
    </div>
  );
}
