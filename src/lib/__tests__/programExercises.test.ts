import { describe, expect, it } from 'vitest';
import {
  exerciseLabel,
  exerciseNames,
  exerciseSuggestions,
  hasMedia,
  parseReps,
  renamedItem,
  shownReps,
} from '../programExercises';

const item = { name: '', workSec: 0, reps: 10, restSec: 60 };

describe("a programme exercise the app knows (Philipp, 2026-11-22)", () => {
  it('is found by its name in any language and runs with its id', () => {
    expect(renamedItem(item, 'Barbell Squat')).toMatchObject({ name: 'Barbell Squat', exerciseId: 'back-squat' });
    expect(renamedItem(item, 'Kniebeuge (Langhantel)').exerciseId).toBe('back-squat');
    expect(renamedItem(item, 'Bench press').exerciseId).toBe('bench-press');
  });

  it('loses the id when renamed to something the app does not know', () => {
    const r = renamedItem({ ...item, exerciseId: 'back-squat' }, 'Hollow hold');
    expect('exerciseId' in r).toBe(false);
    expect(r.name).toBe('Hollow hold');
  });

  it('has its names in every language and a video flag', () => {
    expect(exerciseNames('back-squat')).toContain('Back squat');
    expect(exerciseNames('back-squat').length).toBeGreaterThan(3);
    expect(exerciseLabel('back-squat', 'de')).toBe('Kniebeuge (Langhantel)');
    expect(hasMedia('back-squat')).toBe(true);
    expect(hasMedia('calf-raise')).toBe(false);
    expect(hasMedia(undefined)).toBe(false);
  });

  it('is suggested in the coach language first, English as well', () => {
    const s = exerciseSuggestions('de').map((x) => x.name);
    expect(s[0]).toBe('Kniebeuge (Langhantel)');
    expect(s).toContain('Back squat');
    expect(new Set(s).size).toBe(s.length);
  });
});

describe('reps as a count or a range', () => {
  it('reads "10", "8-12", "8–12" and "12-8"', () => {
    expect(parseReps('10')).toEqual({ reps: 10 });
    expect(parseReps('8-12')).toEqual({ reps: 8, repsHigh: 12 });
    expect(parseReps(' 8 – 12 ')).toEqual({ reps: 8, repsHigh: 12 });
    expect(parseReps('12-8')).toEqual({ reps: 8, repsHigh: 12 });
    expect(parseReps('10-10')).toEqual({ reps: 10 });
  });

  it('is incomplete or wrong otherwise', () => {
    for (const s of ['', '8-', 'x', '0', '1000', '8-12-14']) expect(parseReps(s)).toBeNull();
  });

  it('keeps what is being typed in the field', () => {
    expect(shownReps('8-', { reps: 8 })).toBe('8-');
    expect(shownReps('8-1', { reps: 1, repsHigh: 8 })).toBe('8-1');
    expect(shownReps('', { reps: 8 })).toBe('');
    expect(shownReps('8-12', { reps: 8, repsHigh: 12 })).toBe('8-12');
    // Changed from elsewhere (undo): the stored count.
    expect(shownReps('8-12', { reps: 5 })).toBe('5');
  });
});
