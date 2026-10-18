import { describe, expect, it } from 'vitest';
import {
  builderToDefinition,
  definitionToBuilder,
  isLibraryDefinition,
  stampOf,
  tombstone,
} from '../planLibrary';
import { initialPlan, newSession, type BuilderPlan } from '../e08plan';

/** A Plan as the app stores it (weeks keyed by their Monday). */
const appPlan = (over: Record<string, unknown> = {}) => ({
  id: 42,
  name: 'STA block',
  kind: 'training',
  competitionDate: null,
  startDate: '2026-10-21',
  createdAt: '2026-10-01T00:00:00Z',
  active: true,
  schemaVersion: 6,
  mode: 'dry',
  pbDepth: 40,
  phases: [
    {
      id: 'ph',
      name: 'Training',
      type: 'base',
      weeks: [
        {
          weekStart: '2026-10-19',
          focus: 'CO2',
          targetSessions: 2,
          targetMix: { co2_table: 2 },
          intensity: 6,
          notes: '',
          plannedSessions: [
            {
              id: 's1',
              dayOfWeek: 2,
              label: 'CO2 table',
              exercises: [{ id: 'e1', description: '8 × 2:00' }],
              mode: 'dry',
              sessionType: 'co2_table',
              sessionNotes: 'easy',
              templateRef: { id: 't1', name: 'CO2' },
            },
          ],
        },
        // week 2 missing on purpose: the builder keeps week 3 on its date
        {
          weekStart: '2026-11-02',
          focus: 'O2',
          targetSessions: 0,
          targetMix: {},
          intensity: 7,
          notes: 'n',
          plannedSessions: [],
        },
      ],
    },
  ],
  ...over,
});

describe('definitionToBuilder', () => {
  it('rebuilds a training plan from the app’s Plan, keeping dates', () => {
    const b = definitionToBuilder(appPlan());
    expect(b.kind).toBe('training');
    expect(b.structure).toBe('weeks');
    expect(b.startDate).toBe('2026-10-21');
    expect(b.weeks.map((w) => w.focus)).toEqual(['CO2', '', 'O2']);
    expect(b.weeks[0].sessions[0]).toMatchObject({
      id: 's1',
      dayOfWeek: 2,
      label: 'CO2 table',
      body: 'easy',
      mode: 'dry',
      sessionType: 'co2_table',
    });
    expect(b.weeks[0].sessions[0].exercises).toEqual([{ id: 'e1', description: '8 × 2:00' }]);
  });

  it('prefers the web’s own copy when the web saved last', () => {
    const own: BuilderPlan = { ...initialPlan(), name: 'Built on the web', structure: 'days' };
    const def = { ...appPlan(), library: { v: 1, editedOn: 'web', editedAt: 'x', portal: own } };
    expect(definitionToBuilder(def).structure).toBe('days');
  });

  it('lays season phases back to back', () => {
    const def = appPlan({
      kind: 'season',
      phases: [
        { id: 'a', name: 'Base', type: 'base', weeks: [{ weekStart: '2026-10-19' }, { weekStart: '2026-10-26' }] },
        { id: 'b', name: 'Taper', type: 'taper', weeks: [{ weekStart: '2026-11-02' }] },
      ],
    });
    const b = definitionToBuilder(def);
    expect(b.phases.map((p) => [p.name, p.type, p.weeks.length])).toEqual([
      ['Base', 'base', 2],
      ['Taper', 'taper', 1],
    ]);
  });
});

describe('builderToDefinition', () => {
  it('round-trips an app plan without losing what only the app knows', () => {
    const old = appPlan();
    const b = definitionToBuilder(old);
    b.weeks[0].sessions[0].label = 'CO2 table (edited)';
    const def = builderToDefinition(b, 42, old, '2026-10-18T12:00:00Z');
    const s = (def.phases as { weeks: { plannedSessions: Record<string, unknown>[]; targetMix: unknown }[] }[])[0]
      .weeks[0];
    expect(s.plannedSessions[0].label).toBe('CO2 table (edited)');
    expect(s.plannedSessions[0].templateRef).toEqual({ id: 't1', name: 'CO2' });
    expect(s.targetMix).toEqual({ co2_table: 2 });
    expect(def.pbDepth).toBe(40);
    expect(def.createdAt).toBe('2026-10-01T00:00:00Z');
    expect(def.schemaVersion).toBe(6);
    expect(def.id).toBe(42);
    expect(def.active).toBe(false);
    expect(stampOf(def)).toMatchObject({ editedOn: 'web', editedAt: '2026-10-18T12:00:00Z' });
    expect(stampOf(def)?.portal).toBe(b);
  });

  it('a session deleted on the web stays deleted', () => {
    const old = appPlan();
    const b = definitionToBuilder(old);
    b.weeks[0].sessions = [newSession(1, 'dry')];
    const def = builderToDefinition(b, 42, old, 'x');
    const ids = (def.phases as { weeks: { plannedSessions: { id: string }[] }[] }[])[0].weeks[0]
      .plannedSessions.map((s) => s.id);
    expect(ids).not.toContain('s1');
  });

  it('a plan new on the web is at schema 3 for the app to migrate', () => {
    const def = builderToDefinition({ ...initialPlan(), name: 'New' }, 7, null, 'x');
    expect(def.schemaVersion).toBe(3);
    expect(isLibraryDefinition(def)).toBe(true);
  });
});

describe('library rows', () => {
  it('leaves templates and athlete inboxes out', () => {
    expect(isLibraryDefinition({ format: 'e08template', template: {} })).toBe(false);
    expect(isLibraryDefinition({ phases: [], coachInbox: { studentId: 's', v: 1 } })).toBe(false);
    expect(isLibraryDefinition(appPlan())).toBe(true);
  });

  it('a delete keeps the plan for athletes and marks it gone', () => {
    const d = tombstone(appPlan(), 'x');
    expect(stampOf(d)?.deletedAt).toBe('x');
    expect(d.phases).toBeDefined();
  });
});
