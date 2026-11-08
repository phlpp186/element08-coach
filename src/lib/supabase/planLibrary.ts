/**
 * The plan library in this browser (rules in ../planLibrary.ts): the saved
 * plans here are a working copy of the coach's library rows.
 *
 * - syncLibrary pulls the rows: new ones become saved plans, changed ones
 *   replace the copy here, deleted ones go; drafts that never reached the
 *   library are uploaded.
 * - saveToLibrary sends a builder save. It only goes through while the row is
 *   still the version this browser last saw (`base`); otherwise the coach
 *   picks a version (resolveConflict).
 * - keepPreviousFor gives chosen athletes a frozen copy of the plan before an
 *   edit, so only the others get it.
 *
 * Per-plan state (`base`, unsent `dirty`) lives in localStorage next to the
 * cloud links (cloudPlanLinks.ts). Every write for one plan goes through
 * `lock` (../planLock.ts), one at a time.
 */
import { useEffect, useSyncExternalStore } from 'react';
import {
  builderToDefinition,
  definitionToBuilder,
  isAppPlan,
  isDeletedDefinition,
  isLibraryDefinition,
  isTemplateDefinition,
  isUsablePlanId,
  newDefId,
  stampOf,
  tombstone,
} from '../planLibrary';
import { createPlanLock } from '../planLock';
import type { BuilderPlan } from '../e08plan';
import { deletePlan, getSavedPlans, newPlanId, putLibraryPlan } from '../store';
import { supabase } from './client';
import { subscribeToTables, unsubscribeChannel, type Json } from './coachData';
import {
  getCloudPlanLink,
  getCloudPlanLinks,
  removeCloudPlanLink,
  setCloudPlanLink,
} from './cloudPlanLinks';

export interface LibraryRow {
  id: string;
  title: string;
  definition: Json;
  updated_at: string;
}

const COLUMNS = 'id, title, definition, updated_at';
const META_KEY = 'element08.coach.libraryMeta';

const lock = createPlanLock();
/** What this browser last wrote to each plan's row, so the same save twice
 *  (Save, then Assign) does not send a second version to the athletes. */
const lastSent = new Map<string, { json: string; at: string }>();

/** After a write: still unsent only if a newer save of the plan is waiting. */
function written(savedId: string, plan: BuilderPlan, row: LibraryRow, n: number): void {
  writeMeta(savedId, { base: row.updated_at, dirty: !lock.latest(savedId, n) });
  lastSent.set(savedId, { json: JSON.stringify(plan), at: row.updated_at });
}

interface Meta {
  base?: string;
  dirty?: boolean;
}

function readMeta(): Record<string, Meta> {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? '{}') as Record<string, Meta>;
  } catch {
    return {};
  }
}
function writeMeta(id: string, m: Meta | null): void {
  try {
    const all = readMeta();
    if (m) all[id] = m;
    else delete all[id];
    localStorage.setItem(META_KEY, JSON.stringify(all));
  } catch {
    /* storage blocked: the next sync treats the plan as unknown and sorts it out */
  }
}

// ── Reactive state for the views ─────────────────────────────────────────────

export interface LibraryState {
  status: 'idle' | 'syncing' | 'offline' | 'signedOut';
  lastSyncAt: string | null;
  /** cloud id → row, live plans only */
  rows: Record<string, LibraryRow>;
  templates: LibraryRow[];
  /** saved plan id → the newer row it clashed with */
  conflicts: Record<string, LibraryRow>;
  /** saved plan ids with an unsent save */
  pending: string[];
}

let state: LibraryState = {
  status: 'idle',
  lastSyncAt: null,
  rows: {},
  templates: [],
  conflicts: {},
  pending: Object.entries(readMeta())
    .filter(([, m]) => m.dirty)
    .map(([id]) => id),
};
const subs = new Set<() => void>();
function setState(patch: Partial<LibraryState>): void {
  state = { ...state, ...patch };
  subs.forEach((s) => s());
}
function refreshPending(): void {
  setState({
    pending: Object.entries(readMeta())
      .filter(([, m]) => m.dirty)
      .map(([id]) => id),
  });
}

export function useLibrary(): LibraryState {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => state,
    () => state,
  );
}

// ── Rows ─────────────────────────────────────────────────────────────────────

async function userId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

async function fetchRow(id: string): Promise<LibraryRow | null> {
  const { data, error } = await supabase.from('plans').select(COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as LibraryRow | null) ?? null;
}

function remember(row: LibraryRow): void {
  const rows = { ...state.rows };
  if (isDeletedDefinition(row.definition)) delete rows[row.id];
  else rows[row.id] = row;
  setState({ rows });
}

/** A saved plan's title as the row carries it. */
const titleOf = (plan: BuilderPlan) => plan.name.trim();

function savedFromRow(savedId: string, row: LibraryRow, athleteId: string | null): void {
  putLibraryPlan({
    id: savedId,
    athleteId,
    plan: definitionToBuilder(row.definition),
    updatedAt: stampOf(row.definition)?.editedAt ?? row.updated_at,
  });
}

async function createRow(savedId: string, plan: BuilderPlan, n: number): Promise<LibraryRow> {
  const uid = await userId();
  if (!uid) throw new Error('Not signed in.');
  const defId = getCloudPlanLink(savedId)?.defId ?? newDefId();
  const at = new Date().toISOString();
  const { data, error } = await supabase
    .from('plans')
    .insert({
      coach_id: uid,
      title: titleOf(plan),
      definition: builderToDefinition(plan, defId, null, at) as Json,
    })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  const row = data as LibraryRow;
  setCloudPlanLink(savedId, { cloudPlanId: row.id, defId });
  written(savedId, plan, row, n);
  remember(row);
  return row;
}

/** Save over the row if it is still `base`. Null = it moved on. */
async function pushRow(
  savedId: string,
  plan: BuilderPlan,
  cloudId: string,
  defId: number,
  base: string,
  n: number,
): Promise<LibraryRow | null> {
  const current = state.rows[cloudId] ?? (await fetchRow(cloudId));
  const at = new Date().toISOString();
  const { data, error } = await supabase
    .from('plans')
    .update({
      title: titleOf(plan),
      definition: builderToDefinition(plan, defId, current?.definition ?? null, at) as Json,
      updated_at: at,
    })
    .eq('id', cloudId)
    .eq('updated_at', base)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as LibraryRow;
  written(savedId, plan, row, n);
  remember(row);
  return row;
}

export type SaveResult =
  | { ok: true; cloudId: string }
  | { ok: false; conflict: LibraryRow }
  | { ok: false; offline: true }
  | { ok: false; appPlan: true };

/** Send a saved plan to the library. The local save already happened; on
 *  failure the plan stays marked unsent and the next sync retries. Saves of
 *  one plan run one after another (`lock`). */
export function saveToLibrary(savedId: string, plan: BuilderPlan): Promise<SaveResult> {
  const n = lock.want(savedId);
  writeMeta(savedId, { ...readMeta()[savedId], dirty: true });
  refreshPending();
  return lock.run(savedId, () => saveNow(savedId, plan, n));
}

async function saveNow(savedId: string, plan: BuilderPlan, n: number): Promise<SaveResult> {
  // Read inside the lock: the save before this one may have moved `base` on.
  const meta = readMeta()[savedId] ?? {};
  try {
    if (!(await userId())) return { ok: false, offline: true };
    // Deleted while this save waited: sending it would bring it back.
    if (!getSavedPlans().some((p) => p.id === savedId)) return { ok: false, offline: true };
    const link = getCloudPlanLink(savedId);
    if (!link) return { ok: true, cloudId: (await createRow(savedId, plan, n)).id };
    const row = await fetchRow(link.cloudPlanId);
    if (!row) return { ok: true, cloudId: (await createRow(savedId, plan, n)).id };
    // The builder would drop what makes it an app plan (workouts, loads,
    // tests) for every athlete on it. The builder says so and saves nothing.
    if (isAppPlan(row.definition)) {
      if (lock.latest(savedId, n)) writeMeta(savedId, { ...meta, dirty: false });
      return { ok: false, appPlan: true };
    }
    const sent = lastSent.get(savedId);
    if (sent && sent.at === row.updated_at && sent.json === JSON.stringify(plan)) {
      writeMeta(savedId, { base: row.updated_at, dirty: !lock.latest(savedId, n) });
      return { ok: true, cloudId: row.id };
    }
    // Unknown base: a plan this browser assigned before the library existed.
    const base = meta.base ?? row.updated_at;
    if (row.updated_at !== base && !isDeletedDefinition(row.definition)) {
      setState({ conflicts: { ...state.conflicts, [savedId]: row } });
      return { ok: false, conflict: row };
    }
    const saved = await pushRow(savedId, plan, link.cloudPlanId, link.defId, row.updated_at, n);
    if (!saved) {
      const now = await fetchRow(link.cloudPlanId);
      if (now) {
        setState({ conflicts: { ...state.conflicts, [savedId]: now } });
        return { ok: false, conflict: now };
      }
      return { ok: true, cloudId: (await createRow(savedId, plan, n)).id };
    }
    return { ok: true, cloudId: saved.id };
  } catch {
    setState({ status: 'offline' });
    return { ok: false, offline: true };
  } finally {
    refreshPending();
  }
}

export type ConflictChoice = 'theirs' | 'mine' | 'copy';

export async function resolveConflict(
  savedId: string,
  choice: ConflictChoice,
  copyName: string,
): Promise<void> {
  const row = state.conflicts[savedId];
  if (!row) return;
  const { [savedId]: _c, ...conflicts } = state.conflicts;
  setState({ conflicts });
  const local = getSavedPlans().find((p) => p.id === savedId);
  if (choice === 'mine' && local) {
    writeMeta(savedId, { base: row.updated_at, dirty: true });
    await saveToLibrary(savedId, local.plan);
    return;
  }
  if (choice === 'copy' && local) {
    const copyId = newPlanId();
    const plan = { ...local.plan, name: copyName };
    putLibraryPlan({ id: copyId, athleteId: local.athleteId, plan, updatedAt: new Date().toISOString() });
    await saveToLibrary(copyId, plan);
  }
  savedFromRow(savedId, row, local?.athleteId ?? null);
  writeMeta(savedId, { base: row.updated_at, dirty: false });
  refreshPending();
}

/** Delete from the library: a tombstone, so athletes who have the plan keep
 *  it and the app removes its copy. */
export async function deleteFromLibrary(savedId: string): Promise<void> {
  const link = getCloudPlanLink(savedId);
  deletePlan(savedId);
  writeMeta(savedId, null);
  removeCloudPlanLink(savedId);
  refreshPending();
  lastSent.delete(savedId);
  if (!link) return;
  await lock.run(savedId, async () => {
    const row = await fetchRow(link.cloudPlanId).catch(() => null);
    if (!row) return;
    const at = new Date().toISOString();
    await supabase
      .from('plans')
      .update({ definition: tombstone(row.definition, at) as Json, updated_at: at })
      .eq('id', link.cloudPlanId);
  });
  const rows = { ...state.rows };
  delete rows[link.cloudPlanId];
  setState({ rows });
}

/** Before an edit reaches a plan's athletes: move the athletes in
 *  `assignmentIds` onto a frozen copy of the plan as it is now, so they keep
 *  that version (their logged sessions move with the assignment). */
export async function keepPreviousFor(
  cloudId: string,
  assignmentIds: string[],
  copyTitle: string,
): Promise<void> {
  if (!assignmentIds.length) return;
  const uid = await userId();
  const row = await fetchRow(cloudId);
  if (!uid || !row) throw new Error('Plan not found.');
  const def = row.definition as Record<string, unknown>;
  const at = new Date().toISOString();
  const stamp = stampOf(def);
  const { data, error } = await supabase
    .from('plans')
    .insert({
      coach_id: uid,
      title: copyTitle,
      definition: {
        ...def,
        id: newDefId(),
        name: copyTitle,
        library: {
          v: 1,
          editedOn: 'web',
          editedAt: at,
          ...(stamp?.portal ? { portal: { ...stamp.portal, name: copyTitle } } : {}),
          copyOf: cloudId,
        },
      } as unknown as Json,
    })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  const { error: e2 } = await supabase
    .from('assignments')
    .update({ plan_id: (data as LibraryRow).id, updated_at: at })
    .in('id', assignmentIds);
  if (e2) throw new Error(e2.message);
}

// ── Sync ─────────────────────────────────────────────────────────────────────

/** One listed row against this browser's copy, inside the plan's lock.
 *  `listedBase` is the plan's base when the rows were listed: if a save has
 *  moved it on since, the listed row is older than this browser's copy and
 *  the next sync looks again. */
async function syncRow(
  sid: string,
  row: LibraryRow,
  deleted: boolean,
  listedBase: string | undefined,
): Promise<void> {
  const m = readMeta()[sid] ?? {};
  if (m.base !== listedBase) return;
  if (state.conflicts[sid]) return;
  const link = getCloudPlanLink(sid);
  if (!link || link.cloudPlanId !== row.id) return;
  const local = getSavedPlans().find((p) => p.id === sid);
  const n = lock.current(sid);
  if (deleted) {
    if (m.dirty && local) {
      await pushRow(sid, local.plan, row.id, link.defId, row.updated_at, n);
    } else {
      if (local) deletePlan(sid);
      removeCloudPlanLink(sid);
      writeMeta(sid, null);
    }
    return;
  }
  if (!local) {
    // The copy here was lost (cleared storage): take the library's.
    savedFromRow(sid, row, null);
    writeMeta(sid, { base: row.updated_at, dirty: false });
    return;
  }
  if (m.base === undefined) {
    // Assigned before the library existed. The web wrote that row, so the
    // copy here is the newer one, unless the library has been at it since.
    if (stampOf(row.definition)) {
      savedFromRow(sid, row, local.athleteId);
      writeMeta(sid, { base: row.updated_at, dirty: false });
    } else {
      await pushRow(sid, local.plan, row.id, link.defId, row.updated_at, n);
    }
  } else if (row.updated_at !== m.base) {
    if (m.dirty) setState({ conflicts: { ...state.conflicts, [sid]: row } });
    else {
      savedFromRow(sid, row, local.athleteId);
      writeMeta(sid, { base: row.updated_at, dirty: false });
    }
  } else if (m.dirty) {
    await pushRow(sid, local.plan, row.id, link.defId, row.updated_at, n);
  }
}

let running: Promise<void> | null = null;

export function syncLibrary(): Promise<void> {
  if (!running) {
    running = runSync().finally(() => {
      running = null;
    });
  }
  return running;
}

async function runSync(): Promise<void> {
  const uid = await userId();
  if (!uid) {
    setState({ status: 'signedOut' });
    return;
  }
  setState({ status: 'syncing' });
  let all: LibraryRow[];
  try {
    const { data, error } = await supabase
      .from('plans')
      .select(COLUMNS)
      .eq('coach_id', uid)
      .order('updated_at', { ascending: false });
    if (error) throw new Error(error.message);
    all = (data ?? []) as LibraryRow[];
  } catch {
    setState({ status: 'offline' });
    return;
  }

  const lib = all.filter((r) => isLibraryDefinition(r.definition));
  setState({
    rows: Object.fromEntries(
      lib.filter((r) => !isDeletedDefinition(r.definition)).map((r) => [r.id, r]),
    ),
    templates: all.filter((r) => isTemplateDefinition(r.definition)),
  });

  const listedLinks = getCloudPlanLinks();
  const listedMeta = readMeta();
  const seen = new Set<string>();

  for (const row of lib) {
    const deleted = isDeletedDefinition(row.definition);
    // Read now, not at the listing: a save may have linked a new row since.
    const sid = Object.entries(getCloudPlanLinks()).find(([, l]) => l.cloudPlanId === row.id)?.[0];
    try {
      if (!sid) {
        if (deleted) continue;
        const id = newPlanId();
        const defId = (row.definition as { id?: unknown }).id;
        savedFromRow(id, row, null);
        setCloudPlanLink(id, {
          cloudPlanId: row.id,
          defId: isUsablePlanId(defId) ? defId : newDefId(),
        });
        writeMeta(id, { base: row.updated_at, dirty: false });
        seen.add(id);
        continue;
      }
      seen.add(sid);
      await lock.run(sid, () => syncRow(sid, row, deleted, listedMeta[sid]?.base));
    } catch {
      /* one row failing must not stop the rest; the next sync retries it */
    }
  }

  // Drafts that never reached the library, or whose row is gone.
  for (const p of getSavedPlans()) {
    if (seen.has(p.id)) continue;
    try {
      await lock.run(p.id, async () => {
        // A save created its row while this sync ran: nothing to upload.
        const link = getCloudPlanLink(p.id);
        if (link && link.cloudPlanId !== listedLinks[p.id]?.cloudPlanId) return;
        const now = getSavedPlans().find((x) => x.id === p.id);
        if (now) await createRow(p.id, now.plan, lock.current(p.id));
      });
    } catch {
      /* retried next sync */
    }
  }
  refreshPending();
  setState({ status: 'idle', lastSyncAt: new Date().toISOString() });
}

/** Keep the library in sync while a coach is signed in: now, when the tab
 *  comes back into view, and when any device saves a plan. */
export function useLibrarySync(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    void syncLibrary();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const soon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void syncLibrary(), 800);
    };
    const ch = subscribeToTables(['plans'], soon);
    const onVisible = () => {
      if (document.visibilityState === 'visible') soon();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribeChannel(ch);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [active]);
}
