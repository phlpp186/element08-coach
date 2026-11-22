/**
 * A name field whose value comes back trimmed. The session panel rebuilds the
 * athlete's workout on every keystroke and the workout keeps names trimmed,
 * so a space typed at the end was gone before the next letter: "Barbell
 * Squat" could not be typed (Philipp, 2026-11-22). The field shows what was
 * typed while the stored name is that text trimmed, and the stored name once
 * it changed from elsewhere (undo, another session opened).
 */
export function shownName(typed: string, stored: string): string {
  return typed.trim() === stored.trim() ? typed : stored;
}
