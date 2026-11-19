/**
 * The coach's week builder: one athlete, one week, templates placed on days.
 *
 * The draft is a list of items, each a template on a calendar date with this
 * athlete's own adjustments (a hand-set target value, an extra note). Items
 * carry their own date, not a week key, so a draft keeps its days when the
 * coach switches the week start between Monday and Sunday.
 *
 * Sending builds the same PlannedSessions as the template send sheet
 * (buildPlannedSessions) and appends them to the athlete's "Sessions from
 * <coach>" plan with mergeIntoInbox, so ids stay stable and a retried send
 * adds nothing twice. Sessions already in that plan show as sent rows; the
 * draft only ever adds.
 *
 * Dates are local calendar days as YYYY-MM-DD strings, like the rest of the
 * planner. Pure: the screen lives in app/coach/week.tsx, the cloud reads in
 * services/coachStudent/coachWeek.ts. Shared with the coach portal
 * (scripts/shared-templates.txt), whose athlete page has the same week.
 */
import { addDays, type MesoType, type Plan, type PlannedSession, type WeekStart } from './deps';
import { buildPlannedSessions, type DeliveredSession, type Tr } from './deliver';
import { newId, type CoachTemplate, type TemplateType } from './model';
import { missingTargets, resolveTemplate, type PBMap, type ResolvedTarget } from './resolve';

/** More than this on one day is almost certainly a mis-tap. */
export const MAX_PER_DAY = 6;

// ─── Week dates ─────────────────────────────────────────────────────────────

const DAY_MS = 86400000;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 0=Sun..6=Sat for an ISO date, independent of the phone's time zone. */
function jsDay(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/** The first day of the week containing `iso`, for the user's week start
 *  (0 = Sunday, 1 = Monday; src/lib/dateWeek.ts). */
export function weekStartOf(iso: string, weekStartsOn: WeekStart): string {
  return addDays(`${iso}T00:00:00Z`, -((jsDay(iso) - weekStartsOn + 7) % 7));
}

/** The seven dates of the week containing `iso`, in display order. */
export function weekDays(iso: string, weekStartsOn: WeekStart): string[] {
  const start = weekStartOf(iso, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDays(`${start}T00:00:00Z`, i));
}

/** The same weekday `n` weeks later (earlier for a negative n). */
export function shiftWeeks(iso: string, n: number): string {
  return addDays(`${iso}T00:00:00Z`, 7 * n);
}

/** ISO-8601 week number of a date. */
export function isoWeekOf(iso: string): number {
  const x = new Date(`${iso}T00:00:00Z`);
  const dow = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - dow);
  const y0 = Date.UTC(x.getUTCFullYear(), 0, 1);
  return Math.ceil(((x.getTime() - y0) / DAY_MS + 1) / 7);
}

/** The week's number for the header: the ISO week of its middle day, so a
 *  Sunday-first week reads the same number as the Monday-first one it mostly
 *  overlaps. */
export function weekNumber(days: string[]): number {
  return isoWeekOf(days[3]);
}

const inDays = (date: string, days: string[]) => date >= days[0] && date <= days[days.length - 1];

// ─── The draft ──────────────────────────────────────────────────────────────

export interface WeekDraftItem {
  /** Draft-local id; the delivered session gets its own at send time. */
  id: string;
  templateId: string;
  date: string;
  /** Hand-set target values for this athlete only, blockId → m or s. They win
   *  over the PB-derived value (and fill a missing PB). */
  overrides: Record<string, number>;
  /** Extra note for this athlete, put before the template's own notes. */
  note: string;
  /** The session as the coach wrote it for this athlete (Philipp, 2026-11-19:
   *  tap the day, write the session, a template is only a starting point that
   *  must stay changeable). When set it is what gets sent; `templateId` then
   *  only says which template it started from ('' for none). An item without
   *  it is a template placed as it is, from before this. */
  session?: PlannedSession;
  /** The id of a session already sent that this one changes. It is sent
   *  under that id and takes its place, so the athlete has one session, not
   *  the old one and a corrected copy. */
  replaces?: string;
}

/** A session with nothing in it yet: no name, no exercise, nothing to start. */
export function isEmptySession(s: PlannedSession): boolean {
  return (
    !s.label.trim() &&
    !(s.exercises ?? []).some((e) => e.description.trim()) &&
    !s.coachRun &&
    !s.workout &&
    !(s.sessionNotes ?? '').trim()
  );
}

/** A new, empty session on a day, for the editor to open. Null when the day
 *  is full. */
export function addSessionItem(
  items: WeekDraftItem[],
  date: string,
): { items: WeekDraftItem[]; id: string } | null {
  if (!ISO_RE.test(date)) return null;
  if (items.filter((i) => i.date === date).length >= MAX_PER_DAY) return null;
  const id = newId('wd');
  const session: PlannedSession = {
    id: `ts-${id}`,
    dayOfWeek: (jsDay(date) + 6) % 7,
    label: '',
    exercises: [],
  };
  return { items: [...items, { id, templateId: '', date, overrides: {}, note: '', session }], id };
}

/** A sent session the athlete has not reported on, taken into the draft to
 *  be changed. Tapping it again opens the same draft item, not a second one. */
export function editSentItem(
  items: WeekDraftItem[],
  sent: Pick<SentSession, 'session' | 'date'>,
): { items: WeekDraftItem[]; id: string } {
  const have = items.find((i) => i.replaces === sent.session.id);
  if (have) return { items, id: have.id };
  const id = newId('wd');
  const item: WeekDraftItem = {
    id,
    templateId: sent.session.templateRef?.id ?? '',
    date: sent.date,
    overrides: {},
    note: '',
    session: { ...sent.session },
    replaces: sent.session.id,
  };
  return { items: [...items, item], id };
}

export function setItemSession(
  items: WeekDraftItem[],
  id: string,
  fn: (s: PlannedSession) => PlannedSession,
): WeekDraftItem[] {
  return items.map((i) => (i.id === id && i.session ? { ...i, session: fn(i.session) } : i));
}

/** A template (resolved for this athlete) as the item's session, to edit
 *  from there. The session keeps the item's own id, so a send that is
 *  retried never adds it twice. */
export function fillItemFromTemplate(
  items: WeekDraftItem[],
  id: string,
  template: CoachTemplate,
  session: PlannedSession,
): WeekDraftItem[] {
  return items.map((i) =>
    i.id === id
      ? { ...i, templateId: template.id, overrides: {}, session: stampSession(session, i) }
      : i,
  );
}

/** The session under the item's stable id, on the item's weekday, with its
 *  lines and its workout numbered after that id. */
function stampSession(
  s: PlannedSession,
  item: Pick<WeekDraftItem, 'id' | 'date' | 'replaces'>,
): PlannedSession {
  const id = item.replaces ?? `ts-${item.id}`;
  const out: PlannedSession = {
    ...s,
    id,
    dayOfWeek: (jsDay(item.date) + 6) % 7,
    completedAt: null,
    exercises: (s.exercises ?? [])
      .filter((e) => e.description.trim())
      .map((e, i) => ({ ...e, id: `${id}-${i + 1}`, completedAt: null })),
  };
  // The fitness player finds a session's workout by `plan:<session id>`.
  if (out.workout) out.workout = { ...out.workout, id: `plan:${id}` };
  return out;
}

export function placeItem(
  items: WeekDraftItem[],
  templateId: string,
  date: string,
): WeekDraftItem[] {
  if (!ISO_RE.test(date)) return items;
  if (items.filter((i) => i.date === date).length >= MAX_PER_DAY) return items;
  return [...items, { id: newId('wd'), templateId, date, overrides: {}, note: '' }];
}

export function removeItem(items: WeekDraftItem[], id: string): WeekDraftItem[] {
  return items.filter((i) => i.id !== id);
}

/** Another template in the same slot. Overrides belong to the old template's
 *  blocks, so they go; the date and the note stay. */
export function replaceTemplate(
  items: WeekDraftItem[],
  id: string,
  templateId: string,
): WeekDraftItem[] {
  return items.map((i) => (i.id === id ? { ...i, templateId, overrides: {} } : i));
}

export function moveItem(items: WeekDraftItem[], id: string, date: string): WeekDraftItem[] {
  if (!ISO_RE.test(date)) return items;
  const full = items.filter((i) => i.date === date && i.id !== id).length >= MAX_PER_DAY;
  return full ? items : items.map((i) => (i.id === id ? { ...i, date } : i));
}

/** Set (value > 0) or clear (null) one block's hand-set value. */
export function setOverride(
  items: WeekDraftItem[],
  id: string,
  blockId: string,
  value: number | null,
): WeekDraftItem[] {
  return items.map((i) => {
    if (i.id !== id) return i;
    const overrides = { ...i.overrides };
    if (value != null && Number.isFinite(value) && value > 0) overrides[blockId] = value;
    else delete overrides[blockId];
    return { ...i, overrides };
  });
}

export function setNote(items: WeekDraftItem[], id: string, note: string): WeekDraftItem[] {
  return items.map((i) => (i.id === id ? { ...i, note } : i));
}

/** The draft items on the shown week, in day order (stable within a day). */
export function itemsInWeek(items: WeekDraftItem[], days: string[]): WeekDraftItem[] {
  return items
    .map((it, n) => ({ it, n }))
    .filter(({ it }) => inDays(it.date, days))
    .sort((a, b) => a.it.date.localeCompare(b.it.date) || a.n - b.n)
    .map(({ it }) => it);
}

/** Old items are dead weight: a draft for a week long past was never sent. */
export function pruneDraft(items: WeekDraftItem[], today: string, keepDays = 28): WeekDraftItem[] {
  const cutoff = addDays(`${today}T00:00:00Z`, -keepDays);
  return items.filter((i) => i.date >= cutoff);
}

/** One draft item as this athlete would get it: template, resolved targets,
 *  and what still blocks it. */
export interface ResolvedItem {
  item: WeekDraftItem;
  template: CoachTemplate | null;
  resolved: ResolvedTarget[];
  /** Targets with no PB and no hand-set value. */
  missing: ResolvedTarget[];
}

export function resolveItem(
  item: WeekDraftItem,
  templates: CoachTemplate[],
  pbs: PBMap,
): ResolvedItem {
  const template = templates.find((t) => t.id === item.templateId) ?? null;
  // A written session has its numbers in it already: nothing left to resolve.
  const resolved = template && !item.session ? resolveTemplate(template, pbs, item.overrides) : [];
  return { item, template, resolved, missing: missingTargets(resolved) };
}

// ─── What was already sent ──────────────────────────────────────────────────

/** A completion as the week view needs it (the completions row, trimmed). */
export interface CompletionLite {
  assignment_id: string;
  exercise_id: string;
  completed_at: string | null;
  rating: number | null;
}

/** One of this coach's plans assigned to the athlete. */
export interface AssignedPlanLite {
  plan: Plan;
  /** Null when the plan is not (or no longer) assigned. */
  assignmentId: string | null;
}

export interface SentSession {
  session: PlannedSession;
  date: string;
  done: boolean;
  rating: number | null;
}

/** Every session of a plan with its calendar date. Plan weeks are
 *  Monday-anchored and dayOfWeek is 0=Mon, whatever the user's week start. */
export function datedSessions(plan: Plan): { session: PlannedSession; date: string }[] {
  const out: { session: PlannedSession; date: string }[] = [];
  for (const ph of plan.phases ?? []) {
    for (const w of ph.weeks ?? []) {
      if (!w.weekStart || !ISO_RE.test(w.weekStart)) continue;
      for (const s of w.plannedSessions ?? []) {
        const d = Number.isInteger(s.dayOfWeek) ? Math.max(0, Math.min(6, s.dayOfWeek)) : 0;
        out.push({ session: s, date: addDays(`${w.weekStart}T00:00:00Z`, d) });
      }
    }
  }
  return out;
}

function doneMap(completions: CompletionLite[], assignmentId: string | null) {
  const m = new Map<string, CompletionLite>();
  if (!assignmentId) return m;
  for (const c of completions) {
    if (c.assignment_id === assignmentId && c.completed_at) m.set(c.exercise_id, c);
  }
  return m;
}

/** The sessions of a plan on the shown days, with done ticks, in day order
 *  (the plan's own order within a day). */
export function sentInWeek(
  inbox: AssignedPlanLite | null,
  days: string[],
  completions: CompletionLite[],
): SentSession[] {
  if (!inbox) return [];
  const done = doneMap(completions, inbox.assignmentId);
  return datedSessions(inbox.plan)
    .filter((x) => inDays(x.date, days))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ session, date }) => {
      const c = done.get(session.id);
      return { session, date, done: !!c, rating: c?.rating ?? null };
    });
}

/** The template type a delivered session reads as (for its chip colour). */
export function typeOfSession(s: PlannedSession): TemplateType {
  if (s.mode === 'depth' || s.mode === 'pool' || s.mode === 'dry') return s.mode;
  return 'general';
}

// ─── The header lines ───────────────────────────────────────────────────────

export interface WeekStatus {
  planned: number;
  done: number;
  /** Mean rating of the done sessions that have one, one decimal; null when
   *  none was rated. */
  effortAvg: number | null;
}

/** A session of one of the athlete's regular plans on a day of the week. */
export interface PlanDaySession {
  session: PlannedSession;
  date: string;
  planId: number;
  planName: string;
  done: boolean;
}

/**
 * What the athlete's regular plans (every assigned plan of this coach except
 * the "Sessions from" one) already ask on the shown days, in day order, so a
 * coach planning the week sees the load each day carries (option 1A of
 * docs/mockups/week-plan-and-portal.html). Read-only here: a plan's sessions
 * are changed in the plan.
 */
export function planInWeek(
  plans: AssignedPlanLite[],
  days: string[],
  completions: CompletionLite[],
): PlanDaySession[] {
  const out: PlanDaySession[] = [];
  for (const p of plans) {
    if (p.plan.coachInbox) continue;
    const done = doneMap(completions, p.assignmentId);
    for (const { session, date } of datedSessions(p.plan)) {
      if (!inDays(date, days)) continue;
      out.push({
        session,
        date,
        planId: p.plan.id,
        planName: p.plan.name,
        done: done.has(session.id),
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** How a week went across every plan this coach has assigned the athlete:
 *  sessions planned on those days, how many are done, the effort they rated. */
export function weekStatus(
  plans: AssignedPlanLite[],
  completions: CompletionLite[],
  days: string[],
): WeekStatus {
  let planned = 0;
  let done = 0;
  const ratings: number[] = [];
  for (const p of plans) {
    const m = doneMap(completions, p.assignmentId);
    for (const { session, date } of datedSessions(p.plan)) {
      if (!inDays(date, days)) continue;
      planned++;
      const c = m.get(session.id);
      if (!c) continue;
      done++;
      if (typeof c.rating === 'number' && c.rating >= 1 && c.rating <= 10) ratings.push(c.rating);
    }
  }
  const effortAvg = ratings.length
    ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
    : null;
  return { planned, done, effortAvg };
}

/** The phase of an assigned season plan the week falls in (by its middle
 *  day), or null. With several, the first plan wins. */
export function phaseForWeek(
  plans: AssignedPlanLite[],
  days: string[],
): { name: string; type: MesoType } | null {
  const mid = days[3];
  for (const { plan } of plans) {
    if (plan.kind !== 'season' || plan.coachInbox) continue;
    for (const ph of plan.phases ?? []) {
      for (const w of ph.weeks ?? []) {
        if (w.weekStart <= mid && mid < addDays(`${w.weekStart}T00:00:00Z`, 7)) {
          return { name: ph.name, type: ph.type };
        }
      }
    }
  }
  return null;
}

// ─── Copy last week ─────────────────────────────────────────────────────────

export interface CopyResult {
  items: WeekDraftItem[];
  copied: number;
  /** Sessions that could not be copied: no template behind them (sent before
   *  templates, or the template was deleted), a day already past, or a day
   *  that already has the same template. */
  skipped: number;
}

/**
 * Put last week's sessions from this coach into the draft, a week later on
 * the same weekday. Only sessions sent from a template can be copied (their
 * templateRef); they come in with no hand-set values, so relative targets
 * resolve from today's PBs at send time. Days before `today` are skipped, and
 * so is a day that already has the same template (sent or in the draft).
 */
export function copyLastWeek(params: {
  previous: SentSession[];
  current: SentSession[];
  draft: WeekDraftItem[];
  templates: CoachTemplate[];
  today: string;
}): CopyResult {
  const { previous, current, templates, today } = params;
  let items = params.draft;
  let copied = 0;
  let skipped = 0;
  for (const p of previous) {
    const tplId = p.session.templateRef?.id;
    const date = shiftWeeks(p.date, 1);
    const exists = !!tplId && templates.some((t) => t.id === tplId);
    const taken =
      !!tplId &&
      (current.some((c) => c.date === date && c.session.templateRef?.id === tplId) ||
        items.some((i) => i.date === date && i.templateId === tplId));
    if (date < today || taken) {
      skipped++;
      continue;
    }
    if (!tplId || !exists) {
      // No template to place again (a session written for the athlete, or
      // its template is gone): the session itself is copied.
      const same = (x: PlannedSession) => x.label === p.session.label;
      const there =
        current.some((c) => c.date === date && same(c.session)) ||
        items.some((i) => i.date === date && !!i.session && same(i.session));
      const added = there ? null : addSessionItem(items, date);
      if (!added) {
        skipped++;
        continue;
      }
      items = setItemSession(added.items, added.id, (blank) => ({
        ...p.session,
        id: blank.id,
        dayOfWeek: blank.dayOfWeek,
        completedAt: null,
        effort: null,
      }));
      copied++;
      continue;
    }
    const next = placeItem(items, tplId, date);
    if (next === items) {
      skipped++;
      continue;
    }
    items = next;
    copied++;
  }
  return { items, copied, skipped };
}

// ─── Sending ────────────────────────────────────────────────────────────────

export interface WeekDelivery {
  /** What goes to the athlete, one per sendable item. */
  deliveries: DeliveredSession[];
  /** The draft items those came from, in the same order. */
  itemIds: string[];
  /** Items that cannot go: a target still needs a value, or the template is
   *  gone from the library. */
  blocked: { itemId: string; reason: 'missing' | 'noTemplate' }[];
}

/**
 * The sessions a week send delivers, built exactly like a template send
 * (buildPlannedSessions), one date per item. An item's note goes first in
 * the session notes. Nothing is delivered while any item is blocked is the
 * CALLER's rule: this returns both lists.
 */
export function buildWeekDelivery(
  items: WeekDraftItem[],
  templates: CoachTemplate[],
  pbs: PBMap,
  opts: { imperial: boolean; author: string; t: Tr },
): WeekDelivery {
  const out: WeekDelivery = { deliveries: [], itemIds: [], blocked: [] };
  for (const item of items) {
    if (item.session) {
      // Written for this athlete: sent as it is. One nobody wrote anything
      // into is not a session to send.
      if (isEmptySession(item.session)) continue;
      const session = stampSession(item.session, item);
      const note = item.note.trim();
      if (note) {
        session.sessionNotes = [note, session.sessionNotes ?? ''].filter(Boolean).join('\n\n');
      }
      out.deliveries.push({
        date: item.date,
        session,
        ...(item.replaces ? { replace: true } : {}),
      });
      out.itemIds.push(item.id);
      continue;
    }
    const r = resolveItem(item, templates, pbs);
    if (!r.template) {
      out.blocked.push({ itemId: item.id, reason: 'noTemplate' });
      continue;
    }
    if (r.missing.length) {
      out.blocked.push({ itemId: item.id, reason: 'missing' });
      continue;
    }
    const [d] = buildPlannedSessions(r.template, r.resolved, [item.date], opts);
    const note = item.note.trim();
    if (note) {
      d.session.sessionNotes = [note, d.session.sessionNotes ?? ''].filter(Boolean).join('\n\n');
    }
    out.deliveries.push(d);
    out.itemIds.push(item.id);
  }
  return out;
}

// ─── Reading a stored draft ─────────────────────────────────────────────────

/** A written session as a draft stores it: enough shape for the editor and
 *  the send not to trip over. */
function isSession(v: unknown): v is PlannedSession {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.label === 'string' &&
    Array.isArray(o.exercises) &&
    o.exercises.every(
      (e) =>
        !!e &&
        typeof e === 'object' &&
        typeof (e as { description?: unknown }).description === 'string',
    )
  );
}

/** Keep what parses as a draft item (from the device or the cloud); drop the
 *  rest. */
export function parseDraftItems(v: unknown): WeekDraftItem[] {
  if (!Array.isArray(v)) return [];
  const out: WeekDraftItem[] = [];
  for (const x of v) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.templateId !== 'string') continue;
    if (typeof o.date !== 'string' || !ISO_RE.test(o.date)) continue;
    const overrides: Record<string, number> = {};
    if (o.overrides && typeof o.overrides === 'object') {
      for (const [k, val] of Object.entries(o.overrides as Record<string, unknown>)) {
        if (typeof val === 'number' && Number.isFinite(val) && val > 0) overrides[k] = val;
      }
    }
    out.push({
      id: o.id,
      templateId: o.templateId,
      date: o.date,
      overrides,
      note: typeof o.note === 'string' ? o.note.slice(0, 2000) : '',
      ...(isSession(o.session) ? { session: o.session } : {}),
      ...(typeof o.replaces === 'string' && o.replaces ? { replaces: o.replaces } : {}),
    });
  }
  return out;
}
