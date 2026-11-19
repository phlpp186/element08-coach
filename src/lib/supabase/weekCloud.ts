/**
 * The coach's week for one athlete on the portal (option 2A of the app
 * repo's docs/mockups/week-plan-and-portal.html): what the athlete already
 * has, the unsent draft shared with the phone, sending, and taking a sent
 * session back. The logic is the app's (lib/coachTemplates/week.ts,
 * weekDrafts.ts, deliver.ts, shared files); this file is the portal's cloud
 * and browser side, the counterpart of the app's coachWeek.ts,
 * weekDraftsCloud.ts and useCoachWeek.
 */
import { useSyncExternalStore } from 'react';
import {
  isInboxFor,
  mergeIntoInbox,
  newInboxPlan,
  removeFromInbox,
  type Tr,
} from '../coachTemplates/deliver';
import type { Plan } from '../coachTemplates/deps';
import type {
  AssignedPlanLite,
  CompletionLite,
  WeekDelivery,
  WeekDraftItem,
} from '../coachTemplates/week';
import {
  draftSetFromDefinition,
  mergeDraftSets,
  pruneDraftSet,
  sameDraftSet,
  stampChanges,
  weekDraftsDefinition,
  WEEK_DRAFTS_KIND,
  type DraftSet,
} from '../coachTemplates/weekDrafts';
import { todayIso } from '../e08plan';
import { supabase } from './client';
import { assignPlan, createPlan, listMyPlans, updatePlan, type Json } from './coachData';

export interface AthleteWeekData {
  /** The athlete's "Sessions from <coach>" plan, if anything was ever sent. */
  inbox: AssignedPlanLite | null;
  /** Every plan of this coach assigned to the athlete (the inbox included). */
  plans: AssignedPlanLite[];
  completions: CompletionLite[];
}

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export async function loadAthleteWeek(studentId: string): Promise<AthleteWeekData> {
  const rows = await listMyPlans();
  const ids = rows.map((r) => r.id);
  const assignments = ids.length
    ? (unwrap(
        await supabase
          .from('assignments')
          .select('id, plan_id')
          .eq('student_id', studentId)
          .eq('active', true)
          .in('plan_id', ids),
      ) as unknown as { id: string; plan_id: string }[])
    : [];
  const byPlan = new Map(assignments.map((a) => [a.plan_id, a.id]));
  const completions = assignments.length
    ? (unwrap(
        await supabase
          .from('completions')
          .select('assignment_id, exercise_id, completed_at, rating')
          .in(
            'assignment_id',
            assignments.map((a) => a.id),
          ),
      ) as unknown as CompletionLite[])
    : [];
  let inbox: AssignedPlanLite | null = null;
  const plans: AssignedPlanLite[] = [];
  for (const r of rows) {
    const plan = r.definition as unknown as Plan;
    if (!plan || typeof plan !== 'object' || !Array.isArray(plan.phases)) continue;
    const assignmentId = byPlan.get(r.id) ?? null;
    if (isInboxFor(r.definition, studentId)) {
      inbox = { plan, assignmentId };
      if (assignmentId) plans.push(inbox);
    } else if (assignmentId) {
      plans.push({ plan, assignmentId });
    }
  }
  return { inbox, plans, completions };
}

/** Send a week: the deliveries go into the athlete's "Sessions from" plan in
 *  one save, and the plan is (re)assigned, which is what their app listens
 *  to. Returns how many sessions were added or changed. */
export async function sendWeek(params: {
  studentId: string;
  delivery: WeekDelivery;
  coachName: string;
  t: Tr;
}): Promise<number> {
  const { studentId, delivery, coachName, t } = params;
  if (!delivery.deliveries.length) throw new Error('Nothing to send.');
  const title = coachName.trim()
    ? t('deliver.inboxTitle', { coach: coachName.trim() })
    : t('deliver.inboxTitleNoName');
  const rows = await listMyPlans();
  const row = rows.find((r) => isInboxFor(r.definition, studentId));
  const current = row ? (row.definition as unknown as Plan) : newInboxPlan(studentId, title);
  const { plan, added } = mergeIntoInbox(current, delivery.deliveries);
  const definition = plan as unknown as Json;
  const saved = row
    ? await updatePlan(row.id, { title: row.title || plan.name, definition })
    : await createPlan(plan.name, definition);
  if (!saved) throw new Error('The athlete’s plan could not be saved.');
  await assignPlan(saved.id, studentId);
  return added;
}

/** Take one sent session back out of the athlete's plan. */
export async function removeSentSession(studentId: string, sessionId: string): Promise<void> {
  const rows = await listMyPlans();
  const row = rows.find((r) => isInboxFor(r.definition, studentId));
  if (!row) return;
  const { plan, removed } = removeFromInbox(row.definition as unknown as Plan, sessionId);
  if (!removed) return;
  await updatePlan(row.id, { title: row.title, definition: plan as unknown as Json });
  await assignPlan(row.id, studentId);
}

// ── The unsent week: this browser's copy and the account's ──────────────────

const KEY = 'element08.coach.weekDrafts';
let drafts: DraftSet = read();
const listeners = new Set<() => void>();

function read(): DraftSet {
  try {
    // The same reader as for the cloud row: nothing malformed gets in.
    return draftSetFromDefinition(weekDraftsDefinition(JSON.parse(localStorage.getItem(KEY) ?? '{}'))) ?? {};
  } catch {
    return {};
  }
}

function commit(next: DraftSet) {
  drafts = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* in memory for this visit */
  }
  listeners.forEach((l) => l());
}

const NONE: WeekDraftItem[] = [];

/** One athlete's unsent week items, live. */
export function useWeekDraft(studentId: string): WeekDraftItem[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => drafts[studentId]?.items ?? NONE,
  );
}

export const weekDraftOf = (studentId: string): WeekDraftItem[] => drafts[studentId]?.items ?? NONE;

/** Change an athlete's draft here; it goes to the account shortly after. */
export function setWeekDraft(studentId: string, items: WeekDraftItem[]): void {
  commit({ ...drafts, [studentId]: stampChanges(drafts[studentId], items, new Date().toISOString()) });
  scheduleDraftSync();
}

export type DraftSyncState = 'idle' | 'saving' | 'saved' | 'offline';
let syncState: DraftSyncState = 'idle';
const stateListeners = new Set<() => void>();
function setSyncState(s: DraftSyncState) {
  syncState = s;
  stateListeners.forEach((l) => l());
}
/** Whether the draft has reached the account, for the week's status pill. */
export function useDraftSyncState(): DraftSyncState {
  return useSyncExternalStore(
    (l) => {
      stateListeners.add(l);
      return () => stateListeners.delete(l);
    },
    () => syncState,
  );
}

let running: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/** One round with the account: read its copy, merge per session (the last
 *  save wins), write back whichever side was behind. Same rule and same row
 *  as the phone app (weekDraftsCloud.ts there). */
export function syncWeekDrafts(): Promise<void> {
  if (running) return running;
  running = (async () => {
    setSyncState('saving');
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return setSyncState('idle');
      const before = drafts;
      const rows = unwrap(
        await supabase
          .from('plans')
          .select('id, definition')
          .eq('coach_id', uid)
          .eq('definition->>kind', WEEK_DRAFTS_KIND)
          .order('updated_at', { ascending: false }),
      ) as unknown as { id: string; definition: unknown }[];
      let remote: DraftSet = {};
      for (const r of rows) remote = mergeDraftSets(remote, draftSetFromDefinition(r.definition) ?? {});
      const merged = pruneDraftSet(mergeDraftSets(before, remote), todayIso());
      if (!sameDraftSet(merged, remote) || rows.length > 1) {
        const definition = weekDraftsDefinition(merged) as unknown as Json;
        if (rows[0]) {
          unwrap(
            await supabase
              .from('plans')
              .update({ definition, updated_at: new Date().toISOString() })
              .eq('id', rows[0].id)
              .select('id'),
          );
          for (const extra of rows.slice(1)) await supabase.from('plans').delete().eq('id', extra.id);
        } else if (Object.keys(merged).length) {
          await createPlan('Week drafts', definition);
        }
      }
      // Changed here while the round was in flight: keep that, go again.
      if (drafts !== before) scheduleDraftSync(500);
      else if (!sameDraftSet(merged, before)) commit(merged);
      setSyncState('saved');
    } catch {
      setSyncState('offline');
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

export function scheduleDraftSync(delayMs = 1500): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void syncWeekDrafts();
  }, delayMs);
}
