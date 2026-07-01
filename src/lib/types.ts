/**
 * The coach's roster data model. Everything here is persisted in the browser
 * via localStorage (no backend, no accounts) and can be backed up / moved with a
 * roster export file — see src/lib/store.ts. None of this is sent anywhere; the
 * `.e08plan` a coach hands an athlete is built separately in src/lib/e08plan.ts.
 */
import type { BuilderPlan } from './e08plan';

/** One personal-best entry for a discipline. `value` is metres (depth/distance)
 *  or seconds (static); see src/lib/disciplines.ts. PBs accumulate over time so
 *  the athlete page can show a progress sparkline. */
export interface PBEntry {
  id: string;
  /** Metres or seconds, per the discipline's unit. */
  value: number;
  /** ISO date (YYYY-MM-DD) the mark was set. */
  date: string;
  location?: string;
  note?: string;
}

/** A target the coach is working an athlete toward in a discipline. */
export interface GoalEntry {
  id: string;
  discipline: string;
  /** Metres or seconds, per the discipline's unit. */
  target: number;
  targetDate?: string;
  note?: string;
}

export interface Competition {
  id: string;
  name: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  location?: string;
  /** Free text, e.g. "CWT 60m" or "podium". */
  target?: string;
}

export interface ProgressNote {
  id: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  text: string;
}

export interface Athlete {
  id: string;
  name: string;
  contact?: string;
  location?: string;
  /** ISO dates bounding the coaching engagement. */
  coachingFrom?: string;
  coachingTo?: string;
  notes?: string;
  /** discipline id → chronological PB history. */
  pbs: Record<string, PBEntry[]>;
  goals: GoalEntry[];
  competitions: Competition[];
  progress: ProgressNote[];
  createdAt: string;
}

/** The coach's private notes about a CONNECTED (cloud/app) athlete — the same
 *  CRM fields a manual roster Athlete has, keyed by the cloud student id. Kept
 *  local (per-browser) so no backend/migration is needed; backed up with the
 *  roster file. The athlete's own PBs/goals come from the app (read-only) and
 *  are NOT stored here. */
export interface CoachNote {
  /** Cloud student id (profiles.id) this note is about. */
  studentId: string;
  contact?: string;
  location?: string;
  coachingFrom?: string;
  coachingTo?: string;
  notes?: string;
  competitions: Competition[];
}

/** A plan saved into the portal (so drafts survive a refresh and can be attached
 *  to an athlete + re-downloaded any time). Stores the full builder working state. */
export interface SavedPlan {
  id: string;
  athleteId: string | null;
  plan: BuilderPlan;
  /** ISO timestamp of the last save. */
  updatedAt: string;
}

export function emptyAthlete(id: string, createdAt: string): Athlete {
  return {
    id,
    name: '',
    pbs: {},
    goals: [],
    competitions: [],
    progress: [],
    createdAt,
  };
}
