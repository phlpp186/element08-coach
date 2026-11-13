/**
 * The mental rating on a student's report, 1 to 10: how hard the session was
 * in the head (nerves, doubts, wanting to stop), apart from the body. The
 * app's own scale ("calm to fight", Philipp 2026-11-13), so the coach reads
 * the number with the words the athlete picked it by. Labels and descriptions
 * are i18n keys; anything outside 1-10 reads as not reported.
 */
export const MENTAL_LABEL: Record<number, string> = {
  1: 'Quiet mind',
  2: 'Very calm',
  3: 'Calm',
  4: 'Settled',
  5: 'Focused',
  6: 'Working',
  7: 'Demanding',
  8: 'Fighting',
  9: 'Overwhelmed',
  10: 'Limit',
};

export const MENTAL_DESC: Record<number, string> = {
  1: 'Nothing to manage, pure enjoyment',
  2: 'Settled from the start',
  3: 'A few odd thoughts, but still fine',
  4: 'A few nerves, but remained calm',
  5: 'Staying relaxed took attention',
  6: 'Doubts came up, but I managed',
  7: 'Wanted to stop early, talked myself through',
  8: 'Inner fight most of the time, relaxation gone',
  9: 'Fear or stress took over, barely finished',
  10: 'The head ended it: stopped or turned early',
};

/** What the whole scale is, for the chip's tooltip. */
export const MENTAL_LEGEND =
  'Mental: how hard it was in the head, apart from the body. 1 = quiet mind, 10 = limit.';

export function mentalLevel(v: unknown): number | null {
  return typeof v === 'number' && v >= 1 && v <= 10 ? Math.round(v) : null;
}

/** "Mental 7/10 · Demanding" and its tooltip, in the coach's language. Null
 *  when the report carries no mental rating. */
export function mentalChip(
  v: unknown,
  t: (s: string) => string,
): { text: string; title: string } | null {
  const n = mentalLevel(v);
  if (n == null) return null;
  return {
    text: `${t('Mental')} ${n}/10 · ${t(MENTAL_LABEL[n])}`,
    title: `${t(MENTAL_DESC[n])}\n${t(MENTAL_LEGEND)}`,
  };
}
