/**
 * Billing ledger data access (coach_billing_terms + coach_payments).
 *
 * Record-keeping only — nothing here moves money. Both tables are coach-scoped
 * by RLS (see supabase/migrations/0011_coach_billing.sql in the app repo), and
 * an athlete can never read them: money owed is not something to surface in a
 * training app by accident.
 *
 * All arithmetic — who is overdue, by how long — lives in src/lib/billing.ts as
 * pure functions. This file only reads and writes rows.
 */
import { supabase } from './client';
import type { BillingTerms, PaymentRow } from '../billing';

interface TermsRow {
  coach_id: string;
  student_id: string;
  amount_cents: number;
  currency: string;
  due_day: number;
  started_on: string;
  ended_on: string | null;
  note: string | null;
}

interface PayRow {
  id: string;
  student_id: string;
  period: string;
  amount_cents: number;
  currency: string;
  paid_on: string;
  note: string | null;
}

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as T;
}

async function coachId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error('Not signed in.');
  return uid;
}

const toTerms = (r: TermsRow): BillingTerms => ({
  studentId: r.student_id,
  amountCents: r.amount_cents,
  currency: r.currency,
  dueDay: r.due_day,
  startedOn: r.started_on,
  endedOn: r.ended_on,
});

const toPayment = (r: PayRow): PaymentRow => ({
  studentId: r.student_id,
  period: r.period,
  amountCents: r.amount_cents,
  currency: r.currency,
  paidOn: r.paid_on,
});

export async function listBillingTerms(): Promise<BillingTerms[]> {
  const rows = unwrap<TermsRow[]>(await supabase.from('coach_billing_terms').select('*'));
  return rows.map(toTerms);
}

export async function listPayments(): Promise<PaymentRow[]> {
  const rows = unwrap<PayRow[]>(
    await supabase.from('coach_payments').select('*').order('period', { ascending: false }),
  );
  return rows.map(toPayment);
}

/** Create or replace one athlete's arrangement. */
export async function saveBillingTerms(t: BillingTerms & { note?: string | null }): Promise<void> {
  const uid = await coachId();
  const { error } = await supabase.from('coach_billing_terms').upsert(
    {
      coach_id: uid,
      student_id: t.studentId,
      amount_cents: Math.round(t.amountCents),
      currency: t.currency,
      due_day: t.dueDay,
      started_on: t.startedOn,
      ended_on: t.endedOn,
      note: t.note ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'coach_id,student_id' },
  );
  if (error) throw new Error(error.message);
}

export async function removeBillingTerms(studentId: string): Promise<void> {
  const uid = await coachId();
  const { error } = await supabase
    .from('coach_billing_terms')
    .delete()
    .eq('coach_id', uid)
    .eq('student_id', studentId);
  if (error) throw new Error(error.message);
}

/**
 * Record a month as paid. Upsert on (coach, student, period) so a double tap
 * cannot double-count — the unique constraint and this clause agree.
 */
export async function markPaid(args: {
  studentId: string;
  /** First of the month being paid for. */
  period: string;
  amountCents: number;
  currency: string;
  paidOn: string;
  note?: string | null;
}): Promise<void> {
  const uid = await coachId();
  const { error } = await supabase.from('coach_payments').upsert(
    {
      coach_id: uid,
      student_id: args.studentId,
      period: args.period,
      amount_cents: Math.round(args.amountCents),
      currency: args.currency,
      paid_on: args.paidOn,
      note: args.note ?? null,
    },
    { onConflict: 'coach_id,student_id,period' },
  );
  if (error) throw new Error(error.message);
}

/** Undo a "mark paid" — the month goes back to outstanding. */
export async function unmarkPaid(studentId: string, period: string): Promise<void> {
  const uid = await coachId();
  const { error } = await supabase
    .from('coach_payments')
    .delete()
    .eq('coach_id', uid)
    .eq('student_id', studentId)
    .eq('period', period);
  if (error) throw new Error(error.message);
}
