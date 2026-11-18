/**
 * The session template library shared with the phone app: the format reads
 * what the phone wrote (old and new), the old browser-only templates convert
 * to text templates and are never lost by a failed upload, and a template
 * dropped into the plan builder keeps its table and workout.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mem, cloud } = vi.hoisted(() => {
  const mem = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  };
  const cloud = {
    rows: new Map<string, { id: string; title: string; definition: unknown }>(),
    failCreate: new Set<string>(),
    /** Insert "succeeds" but the row cannot be read back. */
    loseRow: new Set<string>(),
    n: 0,
  };
  return { mem, cloud };
});

vi.mock('../supabase/coachData', () => ({
  createPlan: async (title: string, definition: unknown) => {
    if (cloud.failCreate.has(title)) throw new Error('offline');
    const id = `row${++cloud.n}`;
    if (!cloud.loseRow.has(title)) cloud.rows.set(id, { id, title, definition });
    return { id };
  },
  updatePlan: async (id: string, patch: { title?: string; definition?: unknown }) => {
    const row = cloud.rows.get(id);
    if (!row) return null;
    Object.assign(row, patch);
    return row;
  },
  deletePlan: async (id: string) => void cloud.rows.delete(id),
  listMyPlans: async () => [...cloud.rows.values()],
  assignPlan: async () => ({}),
}));
vi.mock('../supabase/client', () => ({
  supabase: {
    from: () => {
      let id = '';
      const b = {
        select: () => b,
        eq: (_k: string, v: string) => ((id = v), b),
        maybeSingle: async () => ({ data: cloud.rows.get(id) ?? null, error: null }),
      };
      return b;
    },
  },
}));
vi.mock('../supabase/planLibrary', () => ({
  syncLibrary: async () => {},
  useLibrary: () => ({ templates: [], status: 'idle', lastSyncAt: null }),
}));

import { buildPlanFile, copyWeek, normalizePlan, type BuilderSession } from '../e08plan';
import {
  removeSessionTemplate,
  saveSessionTemplate,
  type SessionTemplate,
} from '../library';
import { definitionToBuilder, builderToDefinition, isAppPlan } from '../planLibrary';
import { isInboxFor } from '../coachTemplates/deliver';
import {
  blankTemplate,
  templateDefinition,
  templateFromDefinition,
  validateTemplate,
  type CoachTemplate,
} from '../coachTemplates/model';
import {
  builderSessionFromTemplate,
  migratedId,
  templateFromLocal,
  templateFromSession,
} from '../coachTemplates/portal';
import { resolveTemplate } from '../coachTemplates/resolve';
import { templateTr } from '../coachTemplates/tr';
import {
  migrateLocalTemplates,
  parseTemplateRows,
  sendTemplate,
} from '../supabase/templateLibrary';

const NOW = '2026-11-18T10:00:00.000Z';
const OPTS = { author: 'Coach', t: templateTr('en') };

function mixed(): CoachTemplate {
  return {
    ...blankTemplate('dry', 'Tuesday dry + core', NOW),
    effort: 6,
    notes: 'Keep the holds relaxed.',
    blocks: [
      { id: 'a', name: '', reps: 1, exercise: { kind: 'text', text: 'Diaphragm stretch · 5 min\nEmpty lung holds' } },
      {
        id: 'b',
        name: '',
        reps: 8,
        exercise: {
          kind: 'dry',
          rows: [
            { type: 'Rest', seconds: 90 },
            { type: 'Hold', seconds: 120 },
          ],
          holdTarget: null,
          lungVol: null,
        },
      },
      {
        id: 'c',
        name: '',
        reps: 3,
        exercise: {
          kind: 'program',
          items: [
            { name: 'Plank', workSec: 45, restSec: 15 },
            { name: 'Hollow hold', workSec: 30, restSec: 30 },
          ],
        },
      },
    ],
  };
}

/** A row exactly as the phone wrote it before the shared library. */
const PHONE_V1 = {
  format: 'e08template',
  version: 1,
  template: {
    id: 'tpl-old',
    name: 'CWT build',
    type: 'depth',
    blocks: [
      {
        id: 'b1',
        name: 'Main',
        reps: 3,
        exercise: {
          kind: 'depth',
          discipline: 'CWT',
          target: { kind: 'pct', value: 80 },
          rest: { kind: 'diveTimes', factor: 3 },
        },
      },
    ],
    effort: 7,
    ask: { effort: true, eq: true, notes: false },
    notes: '',
    useCount: 2,
    createdAt: NOW,
    updatedAt: NOW,
  },
};

const local = (over: Partial<SessionTemplate> = {}): SessionTemplate => ({
  id: 'sess-1',
  name: 'Pool technique',
  label: 'Technique',
  body: 'Slow and clean.',
  mode: 'pool',
  sessionType: 'technique',
  exercises: [
    { description: 'DYN easy', dose: [{ unit: 'reps', value: '4' }] },
    { description: '  ' },
    { description: 'Turns\npractice' },
  ],
  useCount: 3,
  ...over,
});

beforeEach(() => {
  cloud.rows.clear();
  cloud.failCreate.clear();
  cloud.loseRow.clear();
});

describe('the shared format in the portal', () => {
  it('round-trips a template with all three kinds of part', () => {
    const t = mixed();
    const back = templateFromDefinition(JSON.parse(JSON.stringify(templateDefinition(t))));
    expect(back).toEqual(t);
    expect(validateTemplate(back!)).toEqual([]);
  });

  it('reads a phone template saved before the shared library, PB target included', () => {
    const [row] = parseTemplateRows([
      { id: 'r1', title: 'CWT build', definition: PHONE_V1 as never, updated_at: NOW },
    ]);
    expect(row.template).toEqual(PHONE_V1.template);
    const resolved = resolveTemplate(row.template, { CWT: 40 });
    expect(resolved[0].value).toBe(32);
  });

  it('writes a session in the app\'s own words, in the coach\'s language', () => {
    expect(templateTr('en')('deliver.reps', { n: 3, what: 'x' })).toBe('3 × x');
    expect(templateTr('en')('library.blocks', { count: 1 })).toBe('1 part');
    expect(templateTr('de')('library.blocks', { count: 2 })).toBe('2 Teile');
  });
});

describe('an old browser-only template becomes a text template', () => {
  it('keeps name, mode, notes, session type, use count and the doses', () => {
    const t = templateFromLocal(local(), NOW);
    expect(t.id).toBe('tpl-web-sess-1');
    expect(t.name).toBe('Pool technique');
    expect(t.type).toBe('pool');
    expect(t.notes).toBe('Slow and clean.');
    expect(t.sessionType).toBe('technique');
    expect(t.useCount).toBe(3);
    expect(t.blocks).toHaveLength(1);
    expect(t.blocks[0].exercise).toEqual({
      kind: 'text',
      text: 'DYN easy · 4 reps\nTurns practice',
    });
    expect(validateTemplate(t)).toEqual([]);
  });

  it('inserted into a plan it gives the session the old template gave', () => {
    const t = templateFromLocal(local(), NOW);
    const s = builderSessionFromTemplate(t, [], 2, OPTS)!;
    expect(s.dayOfWeek).toBe(2);
    expect(s.mode).toBe('pool');
    expect(s.sessionType).toBe('technique');
    expect(s.exercises.map((e) => e.description)).toEqual(['DYN easy · 4 reps', 'Turns practice']);
    expect(s.body).toContain('Slow and clean.');
  });

  it('"Save as template" keeps the session\'s effort', () => {
    const session: BuilderSession = {
      id: 's',
      dayOfWeek: 0,
      label: 'Gym',
      body: '',
      exercises: [{ id: 'e', description: 'Squat 3 x 5' }],
      mode: 'general',
      sessionType: '',
      coachTarget: 7,
    };
    const t = templateFromSession('', session, NOW);
    expect(t.name).toBe('Gym');
    expect(t.type).toBe('general');
    expect(t.effort).toBe(7);
  });
});

describe('moving the browser templates into the shared library', () => {
  const seed = (...names: string[]) => {
    // The store is a module singleton: empty it through its own API.
    for (const t of localNow()) removeSessionTemplate(t.id);
    for (const name of names) {
      saveSessionTemplate(name, {
        id: 'x',
        dayOfWeek: 0,
        label: name,
        body: '',
        exercises: [{ id: 'e', description: `${name} exercise` }],
        mode: 'dry',
        sessionType: '',
      });
    }
  };
  function localNow(): SessionTemplate[] {
    return JSON.parse(mem.get('element08.coach.sessionTemplates') ?? '[]') as SessionTemplate[];
  }

  it('uploads each one, then removes the local copy', async () => {
    seed('A', 'B');
    const before = localNow();
    const res = await migrateLocalTemplates(before, []);
    expect(res).toEqual({ moved: 2, failed: 0 });
    expect(localNow()).toEqual([]);
    const names = parseTemplateRows(
      [...cloud.rows.values()].map((r) => ({ ...r, definition: r.definition as never, updated_at: NOW })),
    ).map((r) => r.template.name);
    expect(names.sort()).toEqual(['A', 'B']);
  });

  it('keeps the local copy when the upload fails, and the others still move', async () => {
    seed('A', 'B');
    cloud.failCreate.add('A');
    const res = await migrateLocalTemplates(localNow(), []);
    expect(res).toEqual({ moved: 1, failed: 1 });
    expect(localNow().map((t) => t.name)).toEqual(['A']);
  });

  it('keeps the local copy when the cloud does not confirm the row', async () => {
    seed('A');
    cloud.loseRow.add('A');
    const res = await migrateLocalTemplates(localNow(), []);
    expect(res).toEqual({ moved: 0, failed: 1 });
    expect(localNow().map((t) => t.name)).toEqual(['A']);
  });

  it('a retry after an upload that did land makes no second copy', async () => {
    seed('A');
    const [tpl] = localNow();
    const already = {
      cloudId: 'r9',
      template: templateFromLocal(tpl, NOW),
      updatedAt: NOW,
    };
    expect(already.template.id).toBe(migratedId(tpl.id));
    const res = await migrateLocalTemplates([tpl], [already]);
    expect(res).toEqual({ moved: 1, failed: 0 });
    expect(cloud.rows.size).toBe(0);
    expect(localNow()).toEqual([]);
  });
});

describe('a template in the plan builder', () => {
  const plan = (session: BuilderSession) =>
    normalizePlan({
      name: 'P',
      mode: 'dry',
      kind: 'training',
      startDate: '2026-11-23',
      structure: 'weeks',
      weeks: [{ focus: '', intensity: 2, notes: '', sessions: [session] }],
    });

  it('text lines, the table and the workout all reach the plan the app reads', () => {
    const t = mixed();
    const s = builderSessionFromTemplate(t, [], 1, OPTS)!;
    expect(s.exercises.map((e) => e.description)).toEqual([
      'Diaphragm stretch · 5 min',
      'Empty lung holds',
      '8 × [Rest 1:30 · Hold 2:00]',
      '3 × [Plank 45s, rest 15s · Hollow hold 30s, rest 30s]',
    ]);
    expect(s.coachTarget).toBe(6);
    const wire = buildPlanFile(plan(s)).content.phases[0].weeks[0].plannedSessions[0] as unknown as Record<string, unknown>;
    expect(wire.templateRef).toEqual({ id: t.id, name: t.name });
    expect((wire.coachRun as { program: { type: string } }).program.type).toBe('training_program');
    const workout = wire.workout as { id: string; blocks: { kind: string; rounds: number }[] };
    expect(workout.id).toBe(`plan:${s.id}`);
    expect(workout.blocks).toEqual([expect.objectContaining({ kind: 'circuit', rounds: 3 })]);
  });

  it('a copied week keeps the workout under the copy\'s own session id', () => {
    const s = builderSessionFromTemplate(mixed(), [], 1, OPTS)!;
    const copy = copyWeek({ focus: '', intensity: 2, notes: '', sessions: [s] }).sessions[0];
    expect(copy.id).not.toBe(s.id);
    const wire = buildPlanFile(plan(copy)).content.phases[0].weeks[0].plannedSessions[0] as unknown as {
      workout: { id: string };
    };
    expect(wire.workout.id).toBe(`plan:${copy.id}`);
  });

  it('stays editable in the builder, and survives a save and a reload from the row', () => {
    const s = builderSessionFromTemplate(mixed(), [], 1, OPTS)!;
    const def = builderToDefinition(plan(s), 123, null, NOW);
    expect(isAppPlan(def)).toBe(false);
    // The phone saved last: no portal copy in the row.
    const fromPhone = { ...def, library: { v: 1, editedOn: 'iphone', editedAt: NOW } };
    const back = definitionToBuilder(fromPhone).weeks[0].sessions[0];
    expect(back.app?.workout?.id).toBe(`plan:${s.id}`);
    expect(back.app?.coachRun?.program).toBeTruthy();
    // A workout with no template behind it is still the app's alone.
    const wire = (def.phases as { weeks: { plannedSessions: Record<string, unknown>[] }[] }[])[0].weeks[0]
      .plannedSessions[0];
    delete wire.templateRef;
    expect(isAppPlan(def)).toBe(true);
  });

  it('an older template with a PB target waits for its number', () => {
    const t = templateFromDefinition(PHONE_V1)!;
    expect(builderSessionFromTemplate(t, resolveTemplate(t, {}), 0, OPTS)).toBeNull();
    const s = builderSessionFromTemplate(t, resolveTemplate(t, {}, { b1: 30 }), 0, OPTS)!;
    expect(s.exercises[0].description).toBe('Main: 3 × CWT 30 m, rest 3 × dive time');
  });
});

describe('send to athlete from the portal', () => {
  it('appends the session to the athlete\'s "Sessions from" plan and counts the use', async () => {
    const t = mixed();
    cloud.rows.set('tplrow', { id: 'tplrow', title: t.name, definition: templateDefinition(t) });
    const added = await sendTemplate({
      template: t,
      cloudId: 'tplrow',
      studentId: 'stu',
      pbs: {},
      overrides: {},
      dates: ['2026-11-24'],
      coachName: 'Coach',
      t: templateTr('en'),
    });
    expect(added).toBe(1);
    const inbox = [...cloud.rows.values()].find((r) => isInboxFor(r.definition, 'stu'))!;
    expect(inbox.title).toBe('Sessions from Coach');
    const session = (inbox.definition as { phases: { weeks: { weekStart: string; plannedSessions: { label: string; workout?: unknown }[] }[] }[] })
      .phases[0].weeks[0];
    expect(session.weekStart).toBe('2026-11-23');
    expect(session.plannedSessions[0].label).toBe('Tuesday dry + core');
    expect(session.plannedSessions[0].workout).toBeTruthy();
    expect(templateFromDefinition(cloud.rows.get('tplrow')!.definition)!.useCount).toBe(1);
  });

  it('refuses while a PB target has no number', async () => {
    const t = templateFromDefinition(PHONE_V1)!;
    await expect(
      sendTemplate({
        template: t,
        cloudId: null,
        studentId: 'stu',
        pbs: {},
        overrides: {},
        dates: ['2026-11-24'],
        coachName: 'Coach',
        t: templateTr('en'),
      }),
    ).rejects.toThrow();
    expect(cloud.rows.size).toBe(0);
  });
});
