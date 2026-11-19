/**
 * The unsent week on the portal: saved with the coach's account in the same
 * row the phone app writes, so a week started on one is finished on the
 * other. A removal travels too, and a failed round loses nothing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { cloud } = vi.hoisted(() => {
  const mem = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
  const cloud = {
    rows: [] as { id: string; title: string; definition: unknown }[],
    offline: false,
    n: 0,
  };
  return { cloud };
});

vi.mock('../supabase/coachData', () => ({
  createPlan: async (title: string, definition: unknown) => {
    const row = { id: `row${++cloud.n}`, title, definition };
    cloud.rows.push(row);
    return row;
  },
  updatePlan: async () => null,
  listMyPlans: async () => cloud.rows,
  assignPlan: async () => ({}),
}));
vi.mock('../supabase/client', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'coach' } } }) },
    from: () => {
      let op: 'select' | 'update' | 'delete' = 'select';
      let patch: { definition?: unknown } = {};
      let id = '';
      const run = () => {
        if (cloud.offline) return { data: null, error: { message: 'offline' } };
        const drafts = cloud.rows.filter(
          (r) => (r.definition as { kind?: string } | null)?.kind === 'weekDrafts',
        );
        if (op === 'update') {
          const row = cloud.rows.find((r) => r.id === id);
          if (row) Object.assign(row, patch);
          return { data: row ? [{ id }] : [], error: null };
        }
        if (op === 'delete') {
          cloud.rows = cloud.rows.filter((r) => r.id !== id);
          return { data: null, error: null };
        }
        return { data: drafts, error: null };
      };
      const b = {
        select: () => b,
        order: () => b,
        update: (p: { definition?: unknown }) => ((op = 'update'), (patch = p), b),
        delete: () => ((op = 'delete'), b),
        eq: (k: string, v: string) => (k === 'id' && (id = v), b),
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
          Promise.resolve(run()).then(ok, bad),
      };
      return b;
    },
  },
}));

import { addSessionItem, removeItem, setItemSession } from '../coachTemplates/week';
import { draftSetFromDefinition, stampChanges, weekDraftsDefinition } from '../coachTemplates/weekDrafts';
import { isTemplateDefinition } from '../coachTemplates/model';
import { parseTemplateRows } from '../supabase/templateLibrary';
import { setWeekDraft, syncWeekDrafts, weekDraftOf } from '../supabase/weekCloud';
import { builderToDraft, draftToBuilder } from '../weekSession';

const DAY = '2099-03-02';
const named = (student: string, label: string) => {
  const added = addSessionItem(weekDraftOf(student), DAY)!;
  setWeekDraft(
    student,
    setItemSession(added.items, added.id, (s) => ({ ...s, label })),
  );
  return added.id;
};
const cloudSet = () => draftSetFromDefinition(cloud.rows.find((r) => r.title === 'Week drafts')?.definition) ?? {};

beforeEach(() => {
  vi.useFakeTimers();
  cloud.offline = false;
});

describe('week drafts with the account', () => {
  it('saves a draft to the account, in a row no plan or template list shows', async () => {
    named('a1', 'Monday pool');
    await syncWeekDrafts();
    expect(cloudSet().a1.items.map((i) => i.session?.label)).toEqual(['Monday pool']);
    const row = cloud.rows[0];
    // Lists drop it as a template row; the template reader finds no template.
    expect(isTemplateDefinition(row.definition)).toBe(true);
    expect(parseTemplateRows(cloud.rows as never)).toEqual([]);
  });

  it('picks up a session the phone added', async () => {
    const mine = weekDraftOf('a1');
    const phone = addSessionItem(mine, DAY)!;
    const items = setItemSession(phone.items, phone.id, (s) => ({ ...s, label: 'From the phone' }));
    const row = cloud.rows.find((r) => r.title === 'Week drafts')!;
    const set = draftSetFromDefinition(row.definition)!;
    row.definition = weekDraftsDefinition({ ...set, a1: stampChanges(set.a1, items, '2098-01-01T00:00:00.000Z') });
    await syncWeekDrafts();
    expect(weekDraftOf('a1').map((i) => i.session?.label).sort()).toEqual(['From the phone', 'Monday pool']);
  });

  it('a removal here reaches the account and does not come back', async () => {
    const gone = weekDraftOf('a1').find((i) => i.session?.label === 'Monday pool')!;
    setWeekDraft('a1', removeItem(weekDraftOf('a1'), gone.id));
    await syncWeekDrafts();
    expect(cloudSet().a1.items.map((i) => i.session?.label)).toEqual(['From the phone']);
    await syncWeekDrafts();
    expect(weekDraftOf('a1').map((i) => i.session?.label)).toEqual(['From the phone']);
  });

  it('keeps the draft when the account cannot be reached', async () => {
    cloud.offline = true;
    named('a2', 'Written offline');
    await syncWeekDrafts();
    expect(weekDraftOf('a2').map((i) => i.session?.label)).toEqual(['Written offline']);
    cloud.offline = false;
    await syncWeekDrafts();
    expect(cloudSet().a2.items.map((i) => i.session?.label)).toEqual(['Written offline']);
  });

  it('leaves one row when two devices each made one', async () => {
    cloud.rows.push({ id: 'dup', title: 'Week drafts', definition: weekDraftsDefinition({}) });
    named('a3', 'Third');
    await syncWeekDrafts();
    expect(cloud.rows.filter((r) => r.title === 'Week drafts')).toHaveLength(1);
    expect(Object.keys(cloudSet()).sort()).toEqual(['a1', 'a2', 'a3']);
  });
});

describe('a draft session in the plan editor', () => {
  it('goes through the editor and back unchanged in what the athlete reads', () => {
    const added = addSessionItem([], DAY)!;
    const s = added.items[0].session!;
    const b = draftToBuilder(s);
    const back = builderToDraft(
      { ...b, label: 'Easy pool', body: 'Stay relaxed', exercises: [{ id: 'e1', description: '4 x 50 m DYN' }] },
      s,
    );
    expect(back.id).toBe(s.id);
    expect(back.label).toBe('Easy pool');
    expect(back.sessionNotes).toBe('Stay relaxed');
    expect(back.exercises.map((e) => e.description)).toEqual(['4 x 50 m DYN']);
    expect(draftToBuilder(back).label).toBe('Easy pool');
  });

  it('an untouched new session stays unnamed', () => {
    const s = addSessionItem([], DAY)!.items[0].session!;
    expect(builderToDraft(draftToBuilder(s), s).label).toBe('');
  });
});
