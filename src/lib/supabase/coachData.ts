/**
 * Cloud data layer for the portal — mirrors the app's
 * Deeptimerapp/src/services/coachStudent/dataAccess.ts coach-side queries against
 * the SAME tables + RLS, so the website and the app read/write one dataset. Keep
 * this in lockstep with the app's dataAccess.ts (same discipline as the existing
 * .e08plan schema-mirroring). Query logic lives here; views consume via hooks.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './client';

export type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

export interface ProfileRow {
  id: string;
  display_name: string;
  is_coach: boolean;
  is_student: boolean;
}
export interface CoachStudentRow {
  id: string;
  coach_id: string;
  student_id: string;
  status: string;
  created_at: string;
}
export interface PlanRow {
  id: string;
  coach_id: string;
  title: string;
  definition: Json;
  created_at: string;
  updated_at: string;
}
export interface AssignmentRow {
  id: string;
  plan_id: string;
  student_id: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}
export interface CompletionRow {
  id: string;
  assignment_id: string;
  exercise_id: string;
  completed_at: string | null;
  rating: number | null;
  remarks: string | null;
  session: Json | null;
  updated_at: string;
}
export interface AthleteProfileRow {
  student_id: string;
  pbs: Json;
  goals: Json;
  competitions: Json;
  updated_at: string;
}

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// ─── Roster (the coach's paired students) ───────────────────────────────────

export async function listMyStudents(): Promise<(CoachStudentRow & { student: ProfileRow })[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const data = unwrap(
    await supabase
      .from('coach_student')
      .select('*, student:profiles!coach_student_student_id_fkey(*)')
      .eq('coach_id', uid)
      .eq('status', 'active'),
  );
  return data as unknown as (CoachStudentRow & { student: ProfileRow })[];
}

// ─── Pairing ────────────────────────────────────────────────────────────────

const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I

function makeInviteCode(len = 8): string {
  let out = '';
  for (let i = 0; i < len; i++) out += INVITE_CHARS[Math.floor(Math.random() * INVITE_CHARS.length)];
  return out;
}

/** Coach creates a pairing code (the student redeems it in the app). */
export async function createInvite(): Promise<string> {
  const uid = await currentUserId();
  if (!uid) throw new Error('Not signed in.');
  for (let attempt = 0; attempt < 2; attempt++) {
    const code = makeInviteCode();
    const { error } = await supabase.from('invites').insert({ coach_id: uid, code });
    if (!error) return code;
    if (!error.message.toLowerCase().includes('duplicate')) throw new Error(error.message);
  }
  throw new Error('Could not generate a unique invite code.');
}

/** Sever a coach↔student link (migration 0006 RPC). */
export async function disconnect(linkId: string): Promise<void> {
  const { error } = await supabase.rpc('disconnect_link', { link_id: linkId });
  if (error) throw new Error(error.message);
}

// ─── Plans (coach owns) ─────────────────────────────────────────────────────

export async function listMyPlans(): Promise<PlanRow[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  return unwrap(
    await supabase
      .from('plans')
      .select('*')
      .eq('coach_id', uid)
      .order('updated_at', { ascending: false }),
  );
}

export async function getPlan(id: string): Promise<PlanRow | null> {
  const { data, error } = await supabase.from('plans').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function createPlan(title: string, definition: Json): Promise<PlanRow> {
  const uid = await currentUserId();
  if (!uid) throw new Error('Not signed in.');
  return unwrap(
    await supabase.from('plans').insert({ coach_id: uid, title, definition }).select().single(),
  );
}

export async function updatePlan(
  id: string,
  patch: { title?: string; definition?: Json },
): Promise<PlanRow> {
  return unwrap(
    await supabase
      .from('plans')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single(),
  );
}

export async function deletePlan(id: string): Promise<void> {
  const { error } = await supabase.from('plans').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Assignments (coach pushes a plan to a student) ─────────────────────────

export async function assignPlan(planId: string, studentId: string): Promise<AssignmentRow> {
  return unwrap(
    await supabase
      .from('assignments')
      .upsert(
        { plan_id: planId, student_id: studentId, active: true },
        { onConflict: 'plan_id,student_id' },
      )
      .select()
      .single(),
  );
}

export async function deleteAssignment(id: string): Promise<void> {
  const { error } = await supabase.from('assignments').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export interface CoachAssignment {
  id: string;
  planId: string;
  planTitle: string;
  studentId: string;
  studentName: string;
  doneCount: number;
}

/** Who the coach has assigned which plan to, with completion counts. Scoped to
 *  the coach's own plans (titles resolved locally). */
export async function listCoachAssignments(): Promise<CoachAssignment[]> {
  const plans = await listMyPlans();
  if (!plans.length) return [];
  const titleById = new Map(plans.map((p) => [p.id, p.title]));
  const rows = unwrap(
    await supabase
      .from('assignments')
      .select('id, plan_id, student_id, student:profiles!assignments_student_id_fkey(display_name)')
      .in(
        'plan_id',
        plans.map((p) => p.id),
      )
      .eq('active', true),
  ) as unknown as {
    id: string;
    plan_id: string;
    student_id: string;
    student: { display_name: string } | null;
  }[];

  const ids = rows.map((r) => r.id);
  const counts = new Map<string, number>();
  if (ids.length) {
    const comps = unwrap(
      await supabase
        .from('completions')
        .select('assignment_id')
        .in('assignment_id', ids)
        .not('completed_at', 'is', null),
    ) as unknown as { assignment_id: string }[];
    comps.forEach((c) => counts.set(c.assignment_id, (counts.get(c.assignment_id) ?? 0) + 1));
  }

  return rows.map((r) => ({
    id: r.id,
    planId: r.plan_id,
    planTitle: titleById.get(r.plan_id) ?? 'Plan',
    studentId: r.student_id,
    studentName: r.student?.display_name?.trim() || 'Athlete',
    doneCount: counts.get(r.id) ?? 0,
  }));
}

// ─── Completions + athlete profile (student owns; linked coach reads) ───────

export async function listCompletions(assignmentId: string): Promise<CompletionRow[]> {
  return unwrap(
    await supabase.from('completions').select('*').eq('assignment_id', assignmentId),
  );
}

export async function getAthleteProfile(studentId: string): Promise<AthleteProfileRow | null> {
  const { data, error } = await supabase
    .from('athlete_profiles')
    .select('*')
    .eq('student_id', studentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// ─── Realtime (live updates; RLS scopes events to what the coach can see) ────

let _chanSeq = 0;

/** Fire `cb` on any change to the given tables. One channel, multiple table
 *  listeners. RLS applies to Realtime, so a coach only receives events for rows
 *  they can read (their students' completions, their links, etc.). */
export function subscribeToTables(tables: string[], cb: () => void): RealtimeChannel {
  _chanSeq += 1;
  let chan = supabase.channel(`portal-${_chanSeq}`);
  for (const table of tables) {
    chan = chan.on('postgres_changes', { event: '*', schema: 'public', table }, () => cb());
  }
  return chan.subscribe();
}

export function unsubscribeChannel(ch: RealtimeChannel): void {
  void supabase.removeChannel(ch);
}
