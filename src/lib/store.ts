/**
 * Roster + saved-plans persistence. Like the exercise library, this lives in
 * localStorage (per-browser, no account) and is reactive via useSyncExternalStore
 * so every view stays in sync. Use exportRoster()/importRoster() to back the data
 * up or carry it to another machine — localStorage can be cleared by the browser.
 */
import { useSyncExternalStore } from 'react';
import { uid } from './e08plan';
import type { Athlete, CoachNote, SavedPlan } from './types';
import { emptyAthlete } from './types';

const ATHLETES_KEY = 'element08.coach.athletes';
const PLANS_KEY = 'element08.coach.plans';
const NOTES_KEY = 'element08.coach.connectedNotes';
const ROSTER_FORMAT = 'e08coach-roster';
const ROSTER_VERSION = 1;

// ── Generic reactive localStorage slice ───────────────────────────────────────

interface Slice<T> {
  get(): T[];
  set(next: T[]): void;
  subscribe(cb: () => void): () => void;
}

function makeSlice<T>(key: string, isValid: (x: unknown) => x is T): Slice<T> {
  let cache: T[] = load();
  const subs = new Set<() => void>();

  function load(): T[] {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const arr: unknown = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter(isValid) : [];
    } catch {
      return [];
    }
  }

  function set(next: T[]): void {
    cache = next;
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* storage full / blocked — keep working in-memory */
    }
    subs.forEach((s) => s());
  }

  // Reflect edits made in another tab.
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === key) {
        cache = load();
        subs.forEach((s) => s());
      }
    });
  }

  return {
    get: () => cache,
    set,
    subscribe: (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
  };
}

const isAthlete = (x: unknown): x is Athlete =>
  !!x && typeof (x as Athlete).id === 'string' && typeof (x as Athlete).name === 'string';
const isPlan = (x: unknown): x is SavedPlan =>
  !!x && typeof (x as SavedPlan).id === 'string' && !!(x as SavedPlan).plan;

const isCoachNote = (x: unknown): x is CoachNote =>
  !!x && typeof (x as CoachNote).studentId === 'string';

const athletes = makeSlice<Athlete>(ATHLETES_KEY, isAthlete);
const plans = makeSlice<SavedPlan>(PLANS_KEY, isPlan);
const coachNotes = makeSlice<CoachNote>(NOTES_KEY, isCoachNote);

// ── Coach notes on connected (cloud) athletes ──────────────────────────────────

const EMPTY_NOTE = (studentId: string): CoachNote => ({ studentId, competitions: [] });

/** The coach's local CRM notes about a connected athlete (or an empty record). */
export function useCoachNote(studentId: string): CoachNote {
  const list = useSyncExternalStore(coachNotes.subscribe, coachNotes.get, coachNotes.get);
  return list.find((n) => n.studentId === studentId) ?? EMPTY_NOTE(studentId);
}

export function updateCoachNote(studentId: string, patch: Partial<CoachNote>): void {
  const list = coachNotes.get();
  coachNotes.set(
    list.some((n) => n.studentId === studentId)
      ? list.map((n) => (n.studentId === studentId ? { ...n, ...patch } : n))
      : [...list, { ...EMPTY_NOTE(studentId), ...patch }],
  );
}

// ── Athletes ──────────────────────────────────────────────────────────────────

export function useAthletes(): Athlete[] {
  return useSyncExternalStore(athletes.subscribe, athletes.get, athletes.get);
}

export function useAthlete(id: string | null): Athlete | undefined {
  const list = useAthletes();
  return id ? list.find((a) => a.id === id) : undefined;
}

export function createAthlete(name = ''): Athlete {
  const a = emptyAthlete(uid('ath'), new Date().toISOString());
  a.name = name;
  athletes.set([...athletes.get(), a]);
  return a;
}

export function updateAthlete(id: string, patch: Partial<Athlete>): void {
  athletes.set(athletes.get().map((a) => (a.id === id ? { ...a, ...patch } : a)));
}

export function deleteAthlete(id: string): void {
  athletes.set(athletes.get().filter((a) => a.id !== id));
  // Detach (don't delete) any plans that pointed at this athlete.
  plans.set(plans.get().map((p) => (p.athleteId === id ? { ...p, athleteId: null } : p)));
}

// ── Saved plans ───────────────────────────────────────────────────────────────

export function useSavedPlans(): SavedPlan[] {
  return useSyncExternalStore(plans.subscribe, plans.get, plans.get);
}

export function useSavedPlan(id: string | null): SavedPlan | undefined {
  const list = useSavedPlans();
  return id ? list.find((p) => p.id === id) : undefined;
}

export function plansForAthlete(list: SavedPlan[], athleteId: string): SavedPlan[] {
  return list.filter((p) => p.athleteId === athleteId);
}

/** Insert or update a saved plan. Returns the stored record (with its id). */
export function upsertPlan(record: SavedPlan): SavedPlan {
  const stored: SavedPlan = { ...record, updatedAt: new Date().toISOString() };
  const existing = plans.get();
  plans.set(
    existing.some((p) => p.id === stored.id)
      ? existing.map((p) => (p.id === stored.id ? stored : p))
      : [...existing, stored],
  );
  return stored;
}

export function deletePlan(id: string): void {
  plans.set(plans.get().filter((p) => p.id !== id));
}

export function newPlanId(): string {
  return uid('plan');
}

// ── Roster backup (export / import the whole portal dataset) ───────────────────

interface RosterFile {
  format: typeof ROSTER_FORMAT;
  version: number;
  exported: string;
  athletes: Athlete[];
  plans: SavedPlan[];
  /** Coach notes on connected athletes (optional — older files won't have it). */
  connectedNotes?: CoachNote[];
}

export function exportRoster(): void {
  const file: RosterFile = {
    format: ROSTER_FORMAT,
    version: ROSTER_VERSION,
    exported: new Date().toISOString(),
    athletes: athletes.get(),
    plans: plans.get(),
    connectedNotes: coachNotes.get(),
  };
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `element08-roster-${new Date().toISOString().slice(0, 10)}.e08coach`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Replace the roster from a backup file. Returns counts, or throws on a bad file. */
export async function importRoster(file: File): Promise<{ athletes: number; plans: number }> {
  const data: unknown = JSON.parse(await file.text());
  const f = data as RosterFile;
  if (!f || f.format !== ROSTER_FORMAT || !Array.isArray(f.athletes)) {
    throw new Error('Not an ELEMENT | 08 roster file.');
  }
  const a = f.athletes.filter(isAthlete);
  const p = Array.isArray(f.plans) ? f.plans.filter(isPlan) : [];
  athletes.set(a);
  plans.set(p);
  coachNotes.set(Array.isArray(f.connectedNotes) ? f.connectedNotes.filter(isCoachNote) : []);
  return { athletes: a.length, plans: p.length };
}

// ── Cloud backup snapshot / restore (the local roster half) ───────────────────

export interface RosterSnapshot {
  athletes: Athlete[];
  plans: SavedPlan[];
  connectedNotes: CoachNote[];
}

/** Snapshot the browser-local roster for cloud backup. */
export function snapshotRoster(): RosterSnapshot {
  return { athletes: athletes.get(), plans: plans.get(), connectedNotes: coachNotes.get() };
}

/** Replace the local roster from a cloud backup (validated per slice). */
export function restoreRoster(data: Partial<RosterSnapshot> | null | undefined): void {
  if (!data || typeof data !== 'object') return;
  athletes.set(Array.isArray(data.athletes) ? data.athletes.filter(isAthlete) : []);
  plans.set(Array.isArray(data.plans) ? data.plans.filter(isPlan) : []);
  coachNotes.set(Array.isArray(data.connectedNotes) ? data.connectedNotes.filter(isCoachNote) : []);
}
