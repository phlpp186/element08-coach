import { describe, expect, it } from 'vitest';
import { matchesLibrary, planNow, weekStrip } from '../libraryInsights';
import { copyPlan, emptyDay, emptyPhase, emptyWeek, initialPlan, newSession, type BuilderPlan } from '../e08plan';

const training = (): BuilderPlan => ({
  ...initialPlan(),
  name: 'Autumn',
  startDate: '2026-10-07', // a Wednesday
  weeks: [
    { ...emptyWeek(), intensity: 4, sessions: [newSession(1, 'depth')] },
    { ...emptyWeek(), intensity: 7 },
    { ...emptyWeek(), intensity: 9 },
  ],
});

describe('weekStrip', () => {
  it('shades training weeks by intensity', () => {
    expect(weekStrip(training())).toEqual([
      { intensity: 4, phase: null },
      { intensity: 7, phase: null },
      { intensity: 9, phase: null },
    ]);
  });
  it('colours season weeks by phase', () => {
    const p: BuilderPlan = { ...initialPlan(), kind: 'season', phases: [emptyPhase('base', 2), emptyPhase('taper', 1)] };
    expect(weekStrip(p).map((w) => w.phase)).toEqual(['base', 'base', 'taper']);
  });
  it('groups a day plan by 7 days', () => {
    const p: BuilderPlan = { ...initialPlan(), structure: 'days', days: Array.from({ length: 9 }, emptyDay) };
    expect(weekStrip(p)).toHaveLength(2);
  });
});

describe('planNow', () => {
  it('says upcoming, running week n of N, or ended', () => {
    const p = training(); // Mon Oct 5 .. Sun Oct 25
    expect(planNow(p, '2026-10-01')).toEqual({ state: 'upcoming', inDays: 6 });
    expect(planNow(p, '2026-10-14')).toEqual({ state: 'running', unit: 'week', index: 2, total: 3 });
    expect(planNow(p, '2026-10-26')).toEqual({ state: 'ended', end: '2026-10-25' });
    expect(planNow({ ...p, startDate: '' }, '2026-10-14')).toEqual({ state: 'undated' });
  });
  it('counts days in a day plan', () => {
    const p: BuilderPlan = { ...initialPlan(), startDate: '2026-10-10', structure: 'days', days: Array.from({ length: 5 }, emptyDay) };
    expect(planNow(p, '2026-10-12')).toEqual({ state: 'running', unit: 'day', index: 3, total: 5 });
  });
});

describe('copyPlan', () => {
  it('copies with fresh ids and a new name, leaving the original alone', () => {
    const p = training();
    const c = copyPlan(p, 'Autumn (copy)');
    expect(c.name).toBe('Autumn (copy)');
    expect(c.weeks[0].sessions[0].id).not.toBe(p.weeks[0].sessions[0].id);
    expect(c.phases[0].id).not.toBe(p.phases[0].id);
    expect(c.days[0].id).not.toBe(p.days[0].id);
    c.weeks[0].focus = 'changed';
    expect(p.weeks[0].focus).toBe('');
  });
});

describe('matchesLibrary', () => {
  const r = { name: 'Autumn depth', kind: 'training' as const, assigned: 2, conflict: false };
  it('filters by kind, assignment, sync and search', () => {
    expect(matchesLibrary(r, 'all', 'all', '')).toBe(true);
    expect(matchesLibrary(r, 'season', 'all', '')).toBe(false);
    expect(matchesLibrary(r, 'all', 'unassigned', '')).toBe(false);
    expect(matchesLibrary(r, 'all', 'sync', '')).toBe(false);
    expect(matchesLibrary(r, 'all', 'assigned', 'DEPTH')).toBe(true);
    expect(matchesLibrary(r, 'all', 'all', 'pool')).toBe(false);
  });
});
