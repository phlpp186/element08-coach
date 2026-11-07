import { describe, expect, it } from 'vitest';
import { inviteExpired, mergeNoteIntoAthlete } from '../athleteLink';
import { createAthlete, getAthletes, linkAthlete, unlinkAthlete, updateCoachNote } from '../store';
import { emptyAthlete, type Athlete, type CoachNote } from '../types';

const base = (extra: Partial<Athlete> = {}): Athlete => ({ ...emptyAthlete('a1', '2026-11-01T00:00:00Z'), name: 'Lena', ...extra });
const note = (extra: Partial<CoachNote> = {}): CoachNote => ({ studentId: 's1', competitions: [], ...extra });

describe('mergeNoteIntoAthlete', () => {
  it('fills what the notebook entry is missing', () => {
    const m = mergeNoteIntoAthlete(base(), note({ contact: '+49 1', location: 'Dahab', coachingFrom: '2026-10-01' }));
    expect(m).toMatchObject({ contact: '+49 1', location: 'Dahab', coachingFrom: '2026-10-01' });
  });

  it('keeps the entry’s own values and both texts when they differ', () => {
    const m = mergeNoteIntoAthlete(
      base({ contact: 'lena@x', notes: 'Onboarded 1 Nov', intake: { goals: '60 m CWT', age: '31' } }),
      note({ contact: '+49 1', notes: 'Equalisation at 40 m', intake: { goals: '60 m CWT', blockers: 'contractions', age: '30' } }),
    );
    expect(m.contact).toBe('lena@x');
    expect(m.notes).toBe('Onboarded 1 Nov\n\nEqualisation at 40 m');
    expect(m.intake).toEqual({ goals: '60 m CWT', blockers: 'contractions', age: '31' });
  });

  it('joins competitions without doubling', () => {
    const c = { id: 'c1', name: 'Vertical Blue', date: '2027-07-01' };
    const m = mergeNoteIntoAthlete(base({ competitions: [c] }), note({ competitions: [c, { id: 'c2', name: 'Nationals', date: '2027-05-01' }] }));
    expect(m.competitions?.map((x) => x.id)).toEqual(['c1', 'c2']);
  });

  it('changes nothing without a note', () => {
    expect(mergeNoteIntoAthlete(base(), undefined)).toEqual({});
  });
});

describe('inviteExpired', () => {
  const now = Date.parse('2026-11-20T00:00:00Z');
  it('lasts 14 days like the database default', () => {
    expect(inviteExpired({ createdAt: '2026-11-07T00:00:00Z' }, now)).toBe(false);
    expect(inviteExpired({ createdAt: '2026-11-05T00:00:00Z' }, now)).toBe(true);
    expect(inviteExpired(undefined, now)).toBe(false);
  });
});

describe('linkAthlete', () => {
  it('makes one record per person and moves the connected notes into it', () => {
    const a = createAthlete('Lena');
    const b = createAthlete('Lena (old entry)');
    updateCoachNote('s7', { notes: 'from the connected page' });
    linkAthlete(b.id, 's7');
    linkAthlete(a.id, 's7');
    const after = getAthletes();
    expect(after.find((x) => x.id === a.id)?.studentId).toBe('s7');
    expect(after.find((x) => x.id === b.id)?.studentId).toBeUndefined();
    // The note moved into the first entry it was linked to; not lost, not doubled.
    expect(after.find((x) => x.id === b.id)?.notes).toBe('from the connected page');
    unlinkAthlete(a.id);
    expect(getAthletes().find((x) => x.id === a.id)?.studentId).toBeUndefined();
  });

  it('clears the pending invite once linked', () => {
    const a = createAthlete('Tom');
    linkAthlete(a.id, 's8');
    expect(getAthletes().find((x) => x.id === a.id)?.invite).toBeUndefined();
  });
});
