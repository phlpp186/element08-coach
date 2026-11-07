/**
 * Linking a notebook athlete (the "Add athlete" entry a coach onboards with:
 * profile, intro questionnaire, notes) to the same person connected on the
 * app. Pure helpers; the store and the invite check use them.
 */
import type { Athlete, CoachNote, Intake } from './types';

/** invites.expires_at defaults to now() + 14 days (migration 0001). */
export const INVITE_DAYS = 14;

export function inviteExpired(invite: { createdAt: string } | undefined, now = Date.now()): boolean {
  if (!invite) return false;
  const t = Date.parse(invite.createdAt);
  return Number.isFinite(t) && now > t + INVITE_DAYS * 86_400_000;
}

/** Keep both when they differ: a merge must never lose what a coach wrote. */
function joinText(a?: string, b?: string): string | undefined {
  const x = a?.trim();
  const y = b?.trim();
  if (!x) return y ? b : a;
  if (!y || x === y) return a;
  return `${a}\n\n${b}`;
}

const INTAKE_TEXT: (keyof Intake)[] = ['experience', 'currentTraining', 'goals', 'blockers', 'health'];
const INTAKE_SHORT: (keyof Intake)[] = ['height', 'weight', 'age'];

/** The fields of a connected athlete's notes, folded into a notebook entry. */
export function mergeNoteIntoAthlete(a: Athlete, n: CoachNote | undefined): Partial<Athlete> {
  if (!n) return {};
  const intake: Intake = { ...a.intake };
  for (const k of INTAKE_SHORT) if (!intake[k]?.trim() && n.intake?.[k]) intake[k] = n.intake[k];
  for (const k of INTAKE_TEXT) {
    const v = joinText(intake[k], n.intake?.[k]);
    if (v !== undefined) intake[k] = v;
  }
  const comps = a.competitions ?? [];
  return {
    contact: a.contact?.trim() ? a.contact : n.contact,
    location: a.location?.trim() ? a.location : n.location,
    coachingFrom: a.coachingFrom || n.coachingFrom,
    coachingTo: a.coachingTo || n.coachingTo,
    notes: joinText(a.notes, n.notes),
    ...(a.intake || n.intake ? { intake } : {}),
    competitions: [...comps, ...(n.competitions ?? []).filter((c) => !comps.some((x) => x.id === c.id))],
  };
}
