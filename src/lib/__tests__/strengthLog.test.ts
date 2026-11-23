import { describe, expect, it } from 'vitest';
import { exerciseName, fmtDuration, planText, setText, strengthOf, volumeKg } from '../strengthLog';

// Jinseul's S&C Strength A: lower, 2026-11-23, as her app attached it.
const session = {
  mode: 'dry',
  strength: {
    v: 1,
    workoutName: 'Strength A: lower',
    machine: 'bike',
    blocks: [{ kind: 'timed', sec: 1200 }],
    exercises: [
      {
        id: 'back-squat',
        name: 'Back squat',
        measure: 'reps',
        target: { kg: 55, kgHigh: 55, measure: 'reps', pct: [70, 75], reps: 6, repsHigh: 8, restSec: 150, rpe: '7-8', sets: 4 },
        sets: [
          { done: true, kg: 55, reps: 8 },
          { done: true, kg: 55, reps: 8 },
          { done: true, kg: 55, reps: 8 },
          { done: false, kg: 55, reps: 0 },
        ],
      },
      {
        id: 'copenhagen-plank',
        name: 'Copenhagen plank',
        measure: 'time',
        target: { measure: 'time', perSide: true, restSec: 60, sec: 20, sets: 3 },
        sets: [{ done: true, sec: 20 }],
      },
      { id: 'custom:sled push', name: 'Sled push', measure: 'distance', sets: [{ done: true, m: 20, kg: 40 }] },
    ],
  },
};
const words = { max: 'max', perSide: 'per side' };

describe('a strength log attached to a coach session (Philipp, 2026-11-23)', () => {
  it('is read from the session, with its blocks and machine', () => {
    const st = strengthOf(session)!;
    expect(st.workoutName).toBe('Strength A: lower');
    expect(st.exercises).toHaveLength(3);
    expect(st.blocks).toEqual([{ kind: 'timed', sec: 1200 }]);
    expect(st.machine).toBe('bike');
    expect(strengthOf({ mode: 'dry' })).toBeNull();
    expect(strengthOf({ strength: { exercises: [] } })).toBeNull();
  });

  it('writes the plan like the app does', () => {
    const [squat, plank] = strengthOf(session)!.exercises;
    expect(planText(squat.target, words)).toBe('4 × 6-8 · 55 kg · 70-75% · RPE 7-8');
    expect(planText(plank.target, words)).toBe('3 × 20 s per side');
    expect(planText(undefined, words)).toBeNull();
    expect(planText({ measure: 'reps', sets: 3, reps: 10, kg: 15, perSide: true, note: 'Moderate band or cable' }, words)).toBe(
      '3 × 10 per side · 15 kg · Moderate band or cable',
    );
  });

  it('writes each set: reps and weight, time, distance', () => {
    expect(setText({ done: true, kg: 55, reps: 8 }, 'reps')).toBe('8 × 55 kg');
    expect(setText({ done: true, kg: 22.5, reps: 10 }, 'reps')).toBe('10 × 22.5 kg');
    expect(setText({ done: true, reps: 12 }, 'reps')).toBe('12');
    expect(setText({ done: true, sec: 20 }, 'time')).toBe('20 s');
    expect(setText({ done: true, sec: 90 }, 'time')).toBe('1:30');
    expect(setText({ done: true, m: 20, kg: 40 }, 'distance')).toBe('20 m × 40 kg');
  });

  it('names an exercise from the app’s list in the coach’s language, else as typed', () => {
    expect(exerciseName({ id: 'back-squat', name: 'Back squat' }, 'de')).toBe('Kniebeuge (Langhantel)');
    expect(exerciseName({ id: 'custom:sled push', name: 'Sled push' }, 'de')).toBe('Sled push');
  });

  it('counts the kilograms of the done sets', () => {
    expect(volumeKg(strengthOf(session)!.exercises[0])).toBe(3 * 8 * 55);
    expect(fmtDuration(1200)).toBe('20:00');
  });
});
