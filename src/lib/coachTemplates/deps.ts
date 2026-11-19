/**
 * What the shared template files need from outside their folder. model.ts,
 * resolve.ts, deliver.ts, planInsert.ts and summary.ts are byte-identical
 * copies of the phone app's (scripts/sync-shared-templates.mjs; `npm run
 * check:shared` fails on drift) and import ONLY from each other and from
 * here. The app has its own deps.ts with the same names, pointing at its own
 * modules; this one states the same shapes for the portal. The types are the
 * parts of the app's models (element08-app/src/lib/models/types.ts) these
 * files touch: keep the values equal to the app's.
 */
// (sessionParts.ts is the sixth shared file.)
export type { AthletePB } from '../supabase/athleteProfileCloud';

export type LungVolume = 'FL' | 'FRC' | 'RV';
export type Discipline = 'CWT' | 'CWTB' | 'CNF' | 'FIM' | 'VWT' | 'NLT' | 'MIX';
export type SessionTag = 'co2_table' | 'o2_table' | 'comfy' | 'pb_attempt' | 'recovery';
export type TrainingMode = 'static' | 'breathwork' | 'device';
export type BlockType = 'Rest' | 'Hold' | 'Recover' | 'Attempt' | 'Swim';

/** One row of a Free Session table, as the app's timer runs it. */
export interface TrainingBlock {
  type: BlockType;
  seconds: number;
  label?: string;
  audioCue?: string;
  meters?: number;
  endMode?: 'timed' | 'signal' | 'signalPlus';
  stepSec?: number;
  cues?: number[];
  lungVol?: LungVolume | null;
}

export interface TrainingGroup {
  cycles: number;
  blocks: TrainingBlock[];
  discipline?: string;
  lungVol?: LungVolume | null;
}

/** The fitness player's workout, as far as a template's programme uses it. */
export interface Workout {
  id: string;
  name?: string;
  /** A coach's programme, as opposed to a plan's own workout. */
  programme?: true;
  blocks: (
    | {
        kind: 'circuit';
        moves: { id: string; name?: string; sec?: number; restSec?: number }[];
        workSec: number;
        restSec: number;
        rounds: number;
        roundRestSec: number;
      }
    | {
        /** Exercises for repetitions: every round listed in turn. */
        kind: 'sets';
        items: {
          id: string;
          name?: string;
          measure: 'reps' | 'time';
          sets: number;
          reps?: number;
          sec?: number;
          restSec: number;
        }[];
        rounds?: number;
      }
  )[];
}

export interface PlannedSession {
  id: string;
  dayOfWeek: number;
  label: string;
  exercises: { id: string; description: string; completedAt?: string | null }[];
  mode?: 'depth' | 'pool' | 'dry' | 'general';
  sessionType?: string;
  coachTarget?: number | null;
  completedAt?: string | null;
  sessionNotes?: string;
  templateRef?: { id: string; name: string };
  coachRun?: { program?: unknown; route?: string };
  workout?: Workout;
}

export interface MicroCycle {
  weekStart: string;
  focus: string;
  targetSessions: number;
  targetMix: Record<string, number>;
  intensity: number;
  notes: string;
  plannedSessions: PlannedSession[];
}

export interface Plan {
  id: number;
  name: string;
  kind: 'season' | 'training';
  competitionDate: string | null;
  startDate: string | null;
  phases: { id: string; name: string; type: string; weeks: MicroCycle[] }[];
  createdAt: string;
  active: boolean;
  schemaVersion?: number;
  mode?: 'depth' | 'pool' | 'dry' | 'general';
  coachInbox?: { studentId: string; v: number };
  coachFor?: { studentId: string };
}

export const PLAN_FILE_FORMAT = 'e08plan' as const;
export const PLAN_FILE_VERSION = 1;
export const PROGRAM_FILE_VERSION_PROGRESSIVE = 2;

/** A dry table as the .e08plan training file the app imports and runs. */
export interface ProgramFile {
  format: typeof PLAN_FILE_FORMAT;
  version: 1 | typeof PROGRAM_FILE_VERSION_PROGRESSIVE;
  type: 'training_program';
  metadata: { title: string; author: string; created: string };
  content: {
    name: string;
    groups: TrainingGroup[];
    audioSettings: unknown;
    lungVol: LungVolume | null;
    trainingMode?: TrainingMode;
    sessionTag?: SessionTag | null;
  };
}

const BLOCK_TYPES: BlockType[] = ['Rest', 'Hold', 'Recover', 'Attempt', 'Swim'];

/** A table read back from a session, or a throw when it is not one. The
 *  portal's stand-in for the app's validator (planSharing/programFile.ts):
 *  the same refusals for what the shared files rely on (a training file with
 *  at least one sequence, every sequence with rows of a known type), the
 *  rows otherwise kept as they are, since the portal only hands them back. */
export function validateProgramFile(parsed: unknown): ProgramFile {
  const f = parsed as Partial<ProgramFile> | null;
  if (!f || f.format !== PLAN_FILE_FORMAT || f.type !== 'training_program') {
    throw new Error('Not a training file.');
  }
  const c = f.content;
  if (!c || typeof c.name !== 'string' || !c.name.trim()) throw new Error('No name.');
  if (!Array.isArray(c.groups) || c.groups.length === 0) throw new Error('No sequences.');
  const groups: TrainingGroup[] = c.groups.map((g) => {
    if (!g || !Array.isArray(g.blocks) || g.blocks.length === 0) throw new Error('Empty sequence.');
    return {
      ...g,
      cycles: Math.max(1, Math.min(99, Math.round(Number(g.cycles) || 1))),
      blocks: g.blocks.map((b) => {
        if (!b || !BLOCK_TYPES.includes(b.type)) throw new Error('Unknown row type.');
        return { ...b, seconds: Math.max(0, Math.min(3600, Math.round(Number(b.seconds) || 0))) };
      }),
    };
  });
  return { ...(f as ProgramFile), content: { ...c, groups } };
}

const CUE_RULES = [{ time: 30, kind: 'every', dir: 'start' }];
const cue = (enabled: boolean) => ({ enabled, rules: CUE_RULES.map((r) => ({ ...r })) });

/** The app's DEFAULT_AUDIO_SETTINGS (models/types.ts), which a sent table
 *  starts with. */
export const DEFAULT_AUDIO_SETTINGS = {
  voice: 'lynd',
  volume: 1.0,
  phaseAnnouncements: true,
  countdown: true,
  countdownFrom: 5,
  countdownRest: true,
  countdownHold: true,
  countdownRecover: false,
  cueConfigs: {
    Rest: cue(false),
    Hold: cue(true),
    Recover: cue(false),
    Attempt: cue(false),
    Swim: cue(false),
  },
  holdBeeps: false,
  beepRules: CUE_RULES.map((r) => ({ ...r })),
  beepTone: 'mid',
};

/** `dateStr` plus `days`, as YYYY-MM-DD (UTC, like the app's seasonDate). */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const mToFt = (m: number): number => m * 3.28084;
export const fmtFixed = (n: number, digits: number): string => n.toFixed(digits);
