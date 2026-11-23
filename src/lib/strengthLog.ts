/**
 * The strength part of a session an athlete attached to a coach's plan: the
 * app's StrengthPayload (lib/fitness/model in the app) as lines a coach
 * reads, so the weights she logged show next to what was planned (Philipp,
 * 2026-11-23: Jinseul's S&C sessions showed only the heart rate). Pure.
 */
import { exerciseLabel } from './programExercises';

export type Measure = 'reps' | 'time' | 'distance';

export interface SetLog {
  reps?: number;
  kg?: number;
  sec?: number;
  m?: number;
  done: boolean;
  note?: string;
}

export interface ExerciseTarget {
  measure?: Measure;
  sets?: number;
  reps?: number;
  repsHigh?: number;
  max?: boolean;
  sec?: number;
  m?: number;
  kg?: number;
  kgHigh?: number;
  pct?: [number, number];
  rpe?: string;
  perSide?: boolean;
  note?: string;
}

export interface ExerciseLog {
  id: string;
  name?: string;
  measure: Measure;
  target?: ExerciseTarget;
  sets: SetLog[];
}

interface Move {
  id: string;
  name?: string;
}

export type BlockLog =
  | { kind: 'circuit'; rounds: number; workSec: number; restSec: number; moves: Move[] }
  | { kind: 'amrap'; rounds: number; extraReps: number; sec: number; capSec: number; forTime?: boolean; moves: Move[] }
  | { kind: 'timed'; sec: number };

export interface StrengthLog {
  workoutName?: string;
  exercises: ExerciseLog[];
  blocks: BlockLog[];
  machine?: string;
  cardio?: { m: number; sec: number; watts?: number; rate?: number };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The session's strength log, or null when it has none worth showing. */
export function strengthOf(session: unknown): StrengthLog | null {
  const st = isObj(session) ? session.strength : null;
  if (!isObj(st)) return null;
  const exercises = (Array.isArray(st.exercises) ? st.exercises : []).filter(
    (e): e is ExerciseLog => isObj(e) && typeof e.id === 'string' && Array.isArray(e.sets),
  );
  const blocks = (Array.isArray(st.blocks) ? st.blocks : []).filter(
    (b): b is BlockLog => isObj(b) && (b.kind === 'timed' || b.kind === 'circuit' || b.kind === 'amrap'),
  );
  if (!exercises.length && !blocks.length) return null;
  const cardio = isObj(st.cardio) && num(st.cardio.m) && num(st.cardio.sec) ? (st.cardio as StrengthLog['cardio']) : undefined;
  return {
    ...(typeof st.workoutName === 'string' ? { workoutName: st.workoutName } : {}),
    exercises,
    blocks,
    ...(typeof st.machine === 'string' ? { machine: st.machine } : {}),
    ...(cardio ? { cardio } : {}),
  };
}

/** An exercise's name in the coach's language when the app knows it. */
export function exerciseName(ex: Move, lang: string): string {
  const own = ex.id.startsWith('custom:');
  if (!own) {
    const label = exerciseLabel(ex.id, lang);
    if (label !== ex.id) return label;
  }
  return ex.name?.trim() || ex.id.replace(/^custom:/, '');
}

const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

/** Seconds as "20 s", or "1:30" from a minute on. */
export function fmtDuration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)} s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const range = (lo: number, hi?: number) => (hi != null && hi > lo ? `${fmtNum(lo)}-${fmtNum(hi)}` : fmtNum(lo));

/** One logged set: "8 × 55 kg", "8", "20 s", "250 m". */
export function setText(s: SetLog, measure: Measure): string {
  const kg = num(s.kg) && s.kg > 0 ? ` × ${fmtNum(s.kg)} kg` : '';
  if (measure === 'time' && num(s.sec)) return `${fmtDuration(s.sec)}${kg}`;
  if (measure === 'distance' && num(s.m)) return `${fmtNum(s.m)} m${kg}`;
  if (num(s.reps)) return `${fmtNum(s.reps)}${kg}`;
  return kg ? kg.slice(3) : '–';
}

/** What was planned: "4 × 6-8 · 55 kg · 70-75% · RPE 7-8". `max` and
 *  `perSide` are the translated words. */
export function planText(target: ExerciseTarget | undefined, words: { max: string; perSide: string }): string | null {
  if (!target) return null;
  const parts: string[] = [];
  const per = target.perSide ? ` ${words.perSide}` : '';
  const what = target.max
    ? words.max
    : target.measure === 'time' && num(target.sec)
      ? fmtDuration(target.sec)
      : target.measure === 'distance' && num(target.m)
        ? `${fmtNum(target.m)} m`
        : num(target.reps)
          ? range(target.reps, target.repsHigh)
          : '';
  if (num(target.sets) && what) parts.push(`${target.sets} × ${what}${per}`);
  else if (what) parts.push(`${what}${per}`);
  if (num(target.kg) && target.kg > 0) parts.push(`${range(target.kg, target.kgHigh)} kg`);
  if (target.pct && num(target.pct[0])) parts.push(`${range(target.pct[0], target.pct[1])}%`);
  if (target.rpe) parts.push(`RPE ${target.rpe}`);
  // The coach's note on the exercise ("Moderate band or cable") comes last.
  if (target.note?.trim()) parts.push(target.note.trim());
  return parts.length ? parts.join(' · ') : null;
}

/** Kilograms moved: reps × kg over the done sets (0 for time or bodyweight). */
export function volumeKg(ex: ExerciseLog): number {
  let v = 0;
  for (const s of ex.sets) if (s.done && num(s.reps) && num(s.kg)) v += s.reps * s.kg;
  return Math.round(v);
}
