/**
 * A week draft's session as the plan builder's editor reads it, and back.
 * The draft holds the session as the app reads it (the phone writes the same
 * draft); the editor works on the builder's session.
 */
import { toPlanned, type BuilderSession } from './e08plan';
import { toSession, type WireSession } from './planLibrary';
import type { PlannedSession } from './coachTemplates/deps';

export const draftToBuilder = (s: PlannedSession): BuilderSession => toSession(s as WireSession, 'general');

export function builderToDraft(b: BuilderSession, keep: PlannedSession): PlannedSession {
  const p = toPlanned(b, keep.dayOfWeek, b.label) as unknown as PlannedSession;
  // toPlanned names an unnamed session "Session" for a plan file; a draft
  // keeps it unnamed, so an untouched one still counts as empty.
  return { ...p, id: keep.id, label: b.label, sessionNotes: b.body.trim() || undefined };
}
