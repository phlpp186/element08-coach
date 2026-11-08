/**
 * Library saves against a fake Supabase: the save-then-assign race of
 * 2026-11-08 ("Changed on another device" with no other device), and a draft
 * saved while a sync runs (two rows for one plan).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, mem } = vi.hoisted(() => {
  const mem = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  };
  const db = {
    rows: new Map<string, Record<string, unknown>>(),
    updates: 0,
    inserts: 0,
    clock: 0,
  };
  return { db, mem };
});

/** A tick between every request, so concurrent calls interleave. */
const tick = () => new Promise((r) => setTimeout(r, 1));

vi.mock('../supabase/client', () => {
  const now = () => `2026-11-08T12:00:${String(++db.clock).padStart(2, '0')}Z`;
  function from(table: string) {
    if (table !== 'plans') throw new Error(table);
    const q: { op: string; eq: [string, unknown][]; patch?: Record<string, unknown> } = { op: 'select', eq: [] };
    const run = async () => {
      await tick();
      const match = [...db.rows.values()].filter((r) => q.eq.every(([k, v]) => r[k] === v));
      if (q.op === 'insert') {
        db.inserts++;
        const row = { id: `row${db.inserts}`, updated_at: now(), ...q.patch };
        db.rows.set(row.id as string, row);
        return [row];
      }
      if (q.op === 'update') {
        db.updates++;
        for (const r of match) Object.assign(r, q.patch);
        return match;
      }
      return match;
    };
    const b = {
      select: () => b,
      order: () => b,
      eq: (k: string, v: unknown) => (q.eq.push([k, v]), b),
      insert: (patch: Record<string, unknown>) => ((q.op = 'insert'), (q.patch = patch), b),
      update: (patch: Record<string, unknown>) => ((q.op = 'update'), (q.patch = patch), b),
      single: async () => ({ data: (await run())[0], error: null }),
      maybeSingle: async () => ({ data: (await run())[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
        run().then((data) => ok({ data, error: null }), bad),
    };
    return b;
  }
  return {
    supabase: {
      from,
      auth: { getSession: async () => ({ data: { session: { user: { id: 'coach' } } } }) },
    },
  };
});

vi.mock('../supabase/coachData', () => ({
  subscribeToTables: () => null,
  unsubscribeChannel: () => undefined,
}));

import { initialPlan } from '../e08plan';
import { deletePlan, getSavedPlans, putLibraryPlan } from '../store';
import { getCloudPlanLink } from '../supabase/cloudPlanLinks';
import { saveToLibrary, syncLibrary } from '../supabase/planLibrary';

function savedPlan(id: string, name: string) {
  const plan = { ...initialPlan(), name };
  putLibraryPlan({ id, athleteId: null, plan, updatedAt: '' });
  return plan;
}

beforeEach(() => {
  for (const p of getSavedPlans()) deletePlan(p.id);
  mem.clear();
  db.rows.clear();
  db.updates = 0;
  db.inserts = 0;
});

describe('saveToLibrary', () => {
  it('Save, then Assign right away: no conflict, one version sent', async () => {
    const plan = savedPlan('p1', 'Pool base');
    expect((await saveToLibrary('p1', plan)).ok).toBe(true);
    const edited = { ...plan, name: 'Pool base 2' };
    putLibraryPlan({ id: 'p1', athleteId: null, plan: edited, updatedAt: '' });
    const [save, assign] = await Promise.all([saveToLibrary('p1', edited), saveToLibrary('p1', edited)]);
    expect(save).toEqual({ ok: true, cloudId: 'row1' });
    expect(assign).toEqual({ ok: true, cloudId: 'row1' });
    // One update for the edit; the second save found it already there.
    expect(db.updates).toBe(1);
    expect(JSON.parse(mem.get('element08.coach.libraryMeta')!).p1.dirty).toBe(false);
  });

  it('two different saves in a row both go through, the later one last', async () => {
    const plan = savedPlan('p2', 'A');
    await saveToLibrary('p2', plan);
    const [r1, r2] = await Promise.all([
      saveToLibrary('p2', { ...plan, name: 'B' }),
      saveToLibrary('p2', { ...plan, name: 'C' }),
    ]);
    expect(r1.ok && r2.ok).toBe(true);
    expect((db.rows.get('row1')!.title as string)).toBe('C');
  });

  it('a draft saved while a sync runs gets one row', async () => {
    const plan = savedPlan('p3', 'Draft');
    await Promise.all([syncLibrary(), saveToLibrary('p3', plan)]);
    expect(db.inserts).toBe(1);
    expect(getCloudPlanLink('p3')?.cloudPlanId).toBe('row1');
    expect(getSavedPlans().filter((p) => p.plan.name === 'Draft')).toHaveLength(1);
  });
});
