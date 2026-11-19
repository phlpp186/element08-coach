/**
 * The coach's unsent weeks as something the phone and the portal share
 * (step 3 of docs/mockups/week-plan-and-portal.html, option 2A: "a draft that
 * follows your account"). Until now a week lived on the phone it was planned
 * on until Send.
 *
 * STORAGE, and why it looks like this: ONE row in the coach's own `plans`,
 *   { format: 'e08template', version, kind: 'weekDrafts', athletes }
 * with no `template` in it. Every reader of that table, in every build that
 * is out, already drops a row with that format from its plan lists
 * (isTemplateDefinition) and skips it in its template lists (it does not
 * parse as a template), so no build can mistake it for a plan or a template
 * and no migration is needed. Never assigned, so no athlete can read it.
 *
 * MERGE: two devices may each have changed the draft. Per session the last
 * save wins: every item has a stamp with the time it last changed, and a
 * removed item leaves its stamp behind marked `deleted`, so "I removed it
 * here" beats "it is still there" on the other device instead of coming back.
 *
 * Pure. Shared with the coach portal (scripts/shared-templates.txt).
 */
import { TEMPLATE_FORMAT, TEMPLATE_VERSION } from './model';
import { parseDraftItems, type WeekDraftItem } from './week';

export const WEEK_DRAFTS_KIND = 'weekDrafts';
/** Stamps of removed items are kept this long, then both sides forget them. */
export const STAMP_KEEP_DAYS = 28;

export interface DraftStamp {
  /** ISO time the item last changed (or was removed). */
  at: string;
  deleted?: true;
}

/** One athlete's unsent week items with when each last changed. */
export interface AthleteDraft {
  items: WeekDraftItem[];
  stamps: Record<string, DraftStamp>;
}

/** Every athlete's draft, by student id. */
export type DraftSet = Record<string, AthleteDraft>;

/** The draft after the coach changed it on this device: changed and new
 *  items get `now`, removed ones leave a `deleted` stamp. */
export function stampChanges(
  prev: AthleteDraft | undefined,
  items: WeekDraftItem[],
  now: string,
): AthleteDraft {
  const before = new Map((prev?.items ?? []).map((i) => [i.id, JSON.stringify(i)]));
  const stamps: Record<string, DraftStamp> = { ...(prev?.stamps ?? {}) };
  const ids = new Set<string>();
  for (const it of items) {
    ids.add(it.id);
    if (before.get(it.id) !== JSON.stringify(it) || !stamps[it.id] || stamps[it.id].deleted) {
      stamps[it.id] = { at: now };
    }
  }
  for (const id of before.keys()) if (!ids.has(id)) stamps[id] = { at: now, deleted: true };
  return { items, stamps };
}

const byDayThenId = (x: WeekDraftItem, y: WeekDraftItem) =>
  x.date.localeCompare(y.date) || x.id.localeCompare(y.id);

function mergeAthlete(a: AthleteDraft | undefined, b: AthleteDraft | undefined): AthleteDraft {
  const items = new Map<string, WeekDraftItem>();
  const stamps: Record<string, DraftStamp> = {};
  const ids = new Set([
    ...Object.keys(a?.stamps ?? {}),
    ...Object.keys(b?.stamps ?? {}),
    ...(a?.items ?? []).map((i) => i.id),
    ...(b?.items ?? []).map((i) => i.id),
  ]);
  for (const id of ids) {
    const sa = a?.stamps[id];
    const sb = b?.stamps[id];
    const ia = a?.items.find((i) => i.id === id);
    const ib = b?.items.find((i) => i.id === id);
    // An item with no stamp is older than any stamped change; `a` wins a tie,
    // so merging a set with itself changes nothing.
    const aWins = (sa?.at ?? '') >= (sb?.at ?? '') && !!(sa || ia);
    const stamp = aWins ? sa : sb;
    const item = aWins ? ia : ib;
    if (stamp) stamps[id] = stamp;
    if (item && !stamp?.deleted) items.set(id, item);
  }
  // One order on every device (by day, then by id, which starts with the
  // time the item was made): two devices that merged the same things must end
  // with the same list, or each would keep "correcting" the other's order.
  const out = [...items.values()].sort(byDayThenId);
  return { items: out, stamps };
}

/** Both sets as one, per item the newer save. */
export function mergeDraftSets(a: DraftSet, b: DraftSet): DraftSet {
  const out: DraftSet = {};
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const m = mergeAthlete(a[id], b[id]);
    if (m.items.length || Object.keys(m.stamps).length) out[id] = m;
  }
  return out;
}

/** Forget items of weeks long past and stamps of removals nobody can still
 *  be behind on. `today` is YYYY-MM-DD. */
export function pruneDraftSet(set: DraftSet, today: string, keepDays = STAMP_KEEP_DAYS): DraftSet {
  const cut = new Date(`${today}T00:00:00Z`);
  cut.setUTCDate(cut.getUTCDate() - keepDays);
  const cutDay = cut.toISOString().slice(0, 10);
  const cutAt = cut.toISOString();
  const out: DraftSet = {};
  for (const [id, d] of Object.entries(set)) {
    const items = d.items.filter((i) => i.date >= cutDay);
    const kept = new Set(items.map((i) => i.id));
    const stamps: Record<string, DraftStamp> = {};
    for (const [k, st] of Object.entries(d.stamps)) {
      if (kept.has(k) || (st.deleted && st.at >= cutAt)) stamps[k] = st;
    }
    if (items.length || Object.keys(stamps).length) out[id] = { items, stamps };
  }
  return out;
}

/** True when two sets hold the same items and stamps (order of athletes and
 *  of stamp keys aside). */
export function sameDraftSet(a: DraftSet, b: DraftSet): boolean {
  const norm = (s: DraftSet) =>
    JSON.stringify(
      Object.keys(s)
        .sort()
        .map((id) => [
          id,
          [...s[id].items].sort(byDayThenId),
          Object.keys(s[id].stamps)
            .sort()
            .map((k) => [k, s[id].stamps[k].at, !!s[id].stamps[k].deleted]),
        ]),
    );
  return norm(a) === norm(b);
}

// ─── The row ────────────────────────────────────────────────────────────────

export interface WeekDraftsDefinition {
  format: typeof TEMPLATE_FORMAT;
  version: number;
  kind: typeof WEEK_DRAFTS_KIND;
  athletes: DraftSet;
}

export function weekDraftsDefinition(set: DraftSet): WeekDraftsDefinition {
  return {
    format: TEMPLATE_FORMAT,
    version: TEMPLATE_VERSION,
    kind: WEEK_DRAFTS_KIND,
    athletes: set,
  };
}

export function isWeekDraftsDefinition(def: unknown): boolean {
  return (
    !!def &&
    typeof def === 'object' &&
    (def as { format?: unknown }).format === TEMPLATE_FORMAT &&
    (def as { kind?: unknown }).kind === WEEK_DRAFTS_KIND
  );
}

/** The drafts in a row, read defensively (it comes from the cloud). Null when
 *  the row is not the drafts row. */
export function draftSetFromDefinition(def: unknown): DraftSet | null {
  if (!isWeekDraftsDefinition(def)) return null;
  const raw = (def as { athletes?: unknown }).athletes;
  const out: DraftSet = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const o = v as { items?: unknown; stamps?: unknown };
    const stamps: Record<string, DraftStamp> = {};
    if (o.stamps && typeof o.stamps === 'object') {
      for (const [k, st] of Object.entries(o.stamps as Record<string, unknown>)) {
        const at = (st as { at?: unknown } | null)?.at;
        if (typeof at !== 'string' || !at) continue;
        stamps[k] = (st as { deleted?: unknown }).deleted === true ? { at, deleted: true } : { at };
      }
    }
    out[id] = { items: parseDraftItems(o.items), stamps };
  }
  return out;
}
